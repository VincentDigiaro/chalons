import {cityDataURL} from './city-config.js';
import {mapBuildingsVisible} from './map-view.js';
import {drapeRoofBuffer} from './terrain.js';
import {removeBombRoofs} from './bomb-map-damage.js';
import {loadCustomReplacements,maskCustomRoofs} from './custom-model-replacements.js';
import {loadImagery} from './imagery.js';

const VERTEX=`#version 300 es
precision highp float;
in vec3 a_position;
uniform mat4 u_matrix;
out vec2 v_uv;
void main(){v_uv=a_position.xy;gl_Position=u_matrix*vec4(a_position,1.0);}`;
const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D u_photo;
uniform vec3 u_crop;
in vec2 v_uv;
out vec4 fragColor;
void main(){
  vec2 uv=v_uv*u_crop.z-u_crop.xy;
  if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0)discard;
  fragColor=vec4(texture(u_photo,uv).rgb,1.0);
}`;
const tilePoint=(lng,lat,n)=>[(lng+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];

/** A geographic roof overlay, sharing MapLibre's 3D depth buffer.
 * Each texture uses its actual WMTS tile coordinates, never a repeating pattern.
 * Ground imagery and roof imagery come from the same IGN layer and projection.
 */
export class RoofTextures {
  constructor({onState=()=>{},onError=()=>{}}={}){
    this.id='ign-roofs';this.type='custom';this.renderingMode='3d';
    this.enabled=true;this.buildingsVisible=true;this.onState=onState;this.onError=onError;
    this.cache=new Map();this.queue=[];this.active=0;this.desired=new Set();this.renderTiles=[];
    this.abort=new AbortController();this.stats={requests:0,errors:0,draws:0,ready:0};
    this.onMove=()=>{clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>this.refresh(),140);};
    this.onEnd=()=>{clearTimeout(this.moveTimer);this.refresh();};
  }
  onAdd(map,gl){
    this.map=map;this.gl=gl;
    this.mobile=matchMedia('(max-width:700px)').matches;
    this.maxCache=this.mobile?128:320;
    map.on('move',this.onMove);map.on('moveend',this.onEnd);
    this.restore=()=>{for(const item of this.cache.values())item.bitmap?.close();this.cache.clear();this.queue=[];this.setupGL();this.refresh();};
    map.getCanvas().addEventListener('webglcontextrestored',this.restore);
    Promise.all(['index.json','mesh.bin'].map(async file=>{
      const r=await fetch(cityDataURL(`roofs/${file}`),{signal:this.abort.signal});
      if(!r.ok)throw Error(`Toitures : HTTP ${r.status}`);
      return file.endsWith('.json')?r.json():r.arrayBuffer();
    })).then(async([index,mesh])=>{
      if(this.abort.signal.aborted)return;
      maskCustomRoofs(mesh,index,await loadCustomReplacements());if(this.abort.signal.aborted)return;
      this.index=index;this.vertices=new Float32Array(removeBombRoofs(drapeRoofBuffer(mesh,index),index));this.n=2**index.zoom;
      for(const tile of index.tiles){
        const lat=Math.atan(Math.sinh(Math.PI*(1-2*(tile.y+.5)/this.n)))*180/Math.PI;
        tile.zScale=maplibregl.MercatorCoordinate.fromLngLat([0,lat],1).z;
      }
      this.setupGL();this.refresh();
    }).catch(error=>{if(error.name!=='AbortError')this.onError(error);});
  }
  setupGL(){
    if(!this.vertices||this.gl.isContextLost())return;
    const gl=this.gl;
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error);}return shader;};
    const vertex=compile(gl.VERTEX_SHADER,VERTEX),fragment=compile(gl.FRAGMENT_SHADER,FRAGMENT);
    this.program=gl.createProgram();gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);gl.deleteShader(vertex);gl.deleteShader(fragment);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
    const position=gl.getAttribLocation(this.program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,12,0);
    this.matrixLocation=gl.getUniformLocation(this.program,'u_matrix');this.cropLocation=gl.getUniformLocation(this.program,'u_crop');this.photoLocation=gl.getUniformLocation(this.program,'u_photo');
    gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
    this.matrix=new Float32Array(16);
  }
  setVisible(enabled,buildingsVisible=this.buildingsVisible){this.enabled=enabled;this.buildingsVisible=buildingsVisible;this.refresh();this.map?.triggerRepaint();}
  refresh(){
    if(!this.index||this.abort.signal.aborted)return;
    this.desired=new Set();this.renderTiles=[];
    if(!this.enabled||!this.buildingsVisible||this.map.getZoom()<14){for(const job of this.queue)if(this.cache.get(job.key)===job)this.cache.delete(job.key);this.queue=[];clearTimeout(this.pumpTimer);this.emitState();return;}
    const b=this.map.getBounds(),c=this.map.getCenter(),n=this.n;
    const west=tilePoint(b.getWest(),c.lat,n)[0],east=tilePoint(b.getEast(),c.lat,n)[0];
    const north=tilePoint(c.lng,b.getNorth(),n)[1],south=tilePoint(c.lng,b.getSouth(),n)[1];
    const [cx,cy]=tilePoint(c.lng,c.lat,n);
    const tiles=this.index.tiles.filter(t=>t.x+1>=west&&t.x<=east&&t.y+1>=north&&t.y<=south).sort((a,b)=>(a.x+.5-cx)**2+(a.y+.5-cy)**2-(b.x+.5-cx)**2-(b.y+.5-cy)**2).slice(0,this.mobile?48:128);
    const factor=this.map.getZoom()>=18.5?4:this.map.getZoom()>=17?2:1;
    const details=[];
    for(const tile of tiles){
      const key=`${this.index.zoom}/${tile.x}/${tile.y}`;
      this.desired.add(key);this.ensure(key,this.index.zoom,tile.x,tile.y);
      const entry={tile,key,details:[]};this.renderTiles.push(entry);
      if(factor>1)for(let dy=0;dy<factor;dy++)for(let dx=0;dx<factor;dx++){
        const x=tile.x+dx/factor,y=tile.y+dy/factor;
        if(x+1/factor<west||x>east||y+1/factor<north||y>south)continue;
        details.push({entry,dx,dy,factor,distance:(x+.5/factor-cx)**2+(y+.5/factor-cy)**2});
      }
    }
    for(const d of details.sort((a,b)=>a.distance-b.distance).slice(0,this.mobile?64:160)){
      const z=this.index.zoom+Math.log2(d.factor),x=d.entry.tile.x*d.factor+d.dx,y=d.entry.tile.y*d.factor+d.dy,key=`${z}/${x}/${y}`;
      d.entry.details.push({key,dx:d.dx,dy:d.dy,factor:d.factor});this.desired.add(key);this.ensure(key,z,x,y);
    }
    this.queue=this.queue.filter(job=>{if(this.desired.has(job.key))return true;if(this.cache.get(job.key)===job)this.cache.delete(job.key);return false;});
    this.evict();this.pump();this.emitState();this.map.triggerRepaint();
  }
  ensure(key,z,x,y){
    let item=this.cache.get(key);
    if(item){item.used=performance.now();if(item.state!=='error'||Date.now()<item.retryAfter)return;}
    item={key,z,x,y,state:'queued',used:performance.now()};this.cache.set(key,item);this.queue.push(item);
  }
  pump(){
    clearTimeout(this.pumpTimer);
    if(this.abort.signal.aborted||!this.queue.length||this.active>=4)return;
    // At most ten new roof image requests per second; bounded concurrency.
    const delay=Math.max(0,100-(performance.now()-(this.lastRequest||0)));
    this.pumpTimer=setTimeout(()=>{
      const item=this.queue.shift();if(!item)return;
      if(!this.desired.has(item.key)){this.cache.delete(item.key);this.pump();return;}
      this.active++;this.lastRequest=performance.now();item.state='loading';this.stats.requests++;
      loadImagery(item.z,item.x,item.y,{signal:this.abort.signal}).then(({data})=>{
        return createImageBitmap(new Blob([data],{type:'image/jpeg'}),{imageOrientation:'none',premultiplyAlpha:'none'});
      }).then(bitmap=>{
        if(this.abort.signal.aborted||!this.cache.has(item.key)){bitmap.close();return;}
        item.bitmap=bitmap;item.state='decoded';this.map.triggerRepaint();
      }).catch(error=>{
        if(error.name==='AbortError')return;
        item.state='error';item.retryAfter=Date.now()+30000;this.stats.errors++;
      }).finally(()=>{this.active--;this.evict();this.emitState();this.pump();});
      this.pump();
    },delay);
  }
  evict(){
    const stale=[...this.cache.values()].filter(t=>!this.desired.has(t.key)&&t.state!=='loading').sort((a,b)=>a.used-b.used);
    while(this.cache.size>this.maxCache&&stale.length){const t=stale.shift();if(t.texture)this.gl.deleteTexture(t.texture);t.bitmap?.close();this.cache.delete(t.key);}
  }
  emitState(){
    let ready=0,loading=0,errors=0;
    for(const key of this.desired){const t=this.cache.get(key);if(t?.state==='ready'||t?.state==='decoded')ready++;else if(t?.state==='error')errors++;else loading++;}
    this.stats.ready=ready;this.onState({ready,loading,errors,active:this.enabled&&this.buildingsVisible&&this.map.getZoom()>=14});
  }
  texture(key){
    const item=this.cache.get(key);if(!item)return null;
    if(item.state==='decoded'){
      const gl=this.gl;item.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,item.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,item.bitmap);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      item.bitmap.close();delete item.bitmap;item.state='ready';
    }
    return item.texture;
  }
  render(gl,options){
    this.stats.draws=0;
    if(!this.program||!this.enabled||!this.buildingsVisible||this.map.getZoom()<14||!mapBuildingsVisible(this.map))return;
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(this.photoLocation,0);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    const m=options.defaultProjectionData.mainMatrix,s=1/this.n,out=this.matrix;
    for(const entry of this.renderTiles){
      const t=entry.tile,x=t.x*s,y=t.y*s;
      for(let row=0;row<4;row++){out[row]=m[row]*s;out[4+row]=m[4+row]*s;out[8+row]=m[8+row]*t.zScale;out[12+row]=m[row]*x+m[4+row]*y+m[12+row];}
      gl.uniformMatrix4fv(this.matrixLocation,false,out);
      const draw=(key,dx,dy,factor)=>{const texture=this.texture(key);if(!texture)return;gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform3f(this.cropLocation,dx,dy,factor);gl.drawArrays(gl.TRIANGLES,t.first,t.count);this.stats.draws++;};
      draw(entry.key,0,0,1);
      for(const detail of entry.details)draw(detail.key,detail.dx,detail.dy,detail.factor);
    }
    gl.bindVertexArray(null);gl.bindTexture(gl.TEXTURE_2D,null);
  }
  getState(){return {...this.stats,enabled:this.enabled,buildingsVisible:this.buildingsVisible,cachedTextures:[...this.cache.values()].filter(t=>t.texture).length,cacheLimit:this.maxCache,visibleRoofTiles:this.renderTiles.length};}
  onRemove(map,gl){
    this.abort.abort();clearTimeout(this.moveTimer);clearTimeout(this.pumpTimer);
    map.off('move',this.onMove);map.off('moveend',this.onEnd);map.getCanvas().removeEventListener('webglcontextrestored',this.restore);
    for(const item of this.cache.values()){item.bitmap?.close();if(item.texture)gl.deleteTexture(item.texture);}
    this.cache.clear();if(this.buffer)gl.deleteBuffer(this.buffer);if(this.vao)gl.deleteVertexArray(this.vao);if(this.program)gl.deleteProgram(this.program);
  }
}
