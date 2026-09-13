const VERTEX=`#version 300 es
precision highp float;
precision highp int;
in vec4 a_endpoints;
in vec4 a_vertical;
in vec4 a_material;
in uint a_building;
uniform mat4 u_matrix;
out vec2 v_uv;
flat out vec3 v_material;
flat out uint v_building;
void main(){
 const vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(1,1),vec2(0,0),vec2(1,1),vec2(0,1));
 vec2 q=corners[gl_VertexID];
 gl_Position=u_matrix*vec4(mix(a_endpoints.xy,a_endpoints.zw,q.x),mix(a_vertical.x,a_vertical.y,q.y),1.0);
 v_uv=q*a_vertical.zw;v_material=a_material.xyz;v_building=a_building;
}`;
const FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray u_catalogue;
uniform uint u_selected;
uniform bool u_hasSelected;
in vec2 v_uv;
flat in vec3 v_material;
flat in uint v_building;
out vec4 fragColor;
void main(){
 vec3 c=texture(u_catalogue,vec3(v_uv.x,1.0-v_uv.y,v_material.x)).rgb;
 c*=v_material.y*v_material.z;
 if(u_hasSelected&&v_building==u_selected)c=mix(c,vec3(.93,.67,.39),.48);
 fragColor=vec4(c,1.0);
}`;
export function facadeHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

/** Original catalogue textures on previously plain OSM walls only. Geographic
 * cells contain instanced wall quads, never roof geometry or detailed models.
 * Visibility and selection follow the existing map layers and feature states.
 */
export class FacadeLayer {
 constructor({onError=()=>{}}={}){
  this.id='catalogue-facades';this.type='custom';this.renderingMode='3d';this.onError=onError;
  this.abort=new AbortController();this.cache=new Map();this.desired=new Set();
  this.queue=[];this.active=0;this.tiles=[];this.selected=null;
  this.stats={loaded:false,errors:0,draws:0,visibleFacades:0,requests:0};
 }
 onAdd(map,gl){
  this.map=map;this.gl=gl;this.mobile=matchMedia('(max-width:700px)').matches;
  this.maxTiles=this.mobile?64:144;this.maxCache=this.mobile?96:192;this.maxBytes=(this.mobile?6:12)*1024*1024;
  this.onMove=()=>{clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>this.refresh(),100);};
  this.onEnd=()=>{clearTimeout(this.moveTimer);this.refresh();};
  this.onStyle=()=>{const active=this.isActive();if(active!==this.lastActive){this.lastActive=active;this.refresh();}};
  this.onClick=e=>{const f=map.queryRenderedFeatures(e.point,{layers:['buildings-3d','buildings-flat']})[0];this.selected=f?.properties.osm_id||null;map.triggerRepaint();};
  map.on('move',this.onMove);map.on('moveend',this.onEnd);map.on('styledata',this.onStyle);map.on('click',this.onClick);
  this.restore=()=>{try{this.texture=null;for(const tile of this.cache.values()){tile.buffer=null;tile.vao=null;}this.setupGL();this.map.triggerRepaint();}catch(error){this.fail(error);}};
  map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  this.request('index.json').then(r=>r.json()).then(async index=>{
   this.index=index;this.n=2**index.zoom;if(index.textures.length>32)throw Error('Catalogue de façades trop grand');
   const results=await Promise.allSettled(index.overviewTextures.map(async file=>createImageBitmap(await(await this.request(file)).blob(),{imageOrientation:'none',premultiplyAlpha:'none'})));
   this.bitmaps=results.filter(r=>r.status==='fulfilled').map(r=>r.value);const failed=results.find(r=>r.status==='rejected');
   if(failed||this.abort.signal.aborted){this.bitmaps.forEach(b=>b.close());this.bitmaps=[];if(failed)throw failed.reason;return;}
   this.textureSize=index.overviewSize;this.stats.resolution='128 × 64';
   if(this.bitmaps.some(b=>b.width!==this.textureSize[0]||b.height!==this.textureSize[1]))throw Error('Dimensions des façades incohérentes');
   this.setupGL();this.stats.loaded=true;this.refresh();
  }).catch(error=>this.fail(error));
 }
 async requestDetail(){
  if(this.detailRequested||this.abort.signal.aborted)return;this.detailRequested=true;
  const results=await Promise.allSettled(this.index.textures.map(async file=>createImageBitmap(await(await this.request(file)).blob(),{imageOrientation:'none',premultiplyAlpha:'none'})));
  const bitmaps=results.filter(r=>r.status==='fulfilled').map(r=>r.value),failed=results.find(r=>r.status==='rejected');
  if(failed||this.abort.signal.aborted||bitmaps.some(b=>b.width!==this.index.textureSize[0]||b.height!==this.index.textureSize[1])){bitmaps.forEach(b=>b.close());if(failed)this.fail(failed.reason);return;}
  this.pendingBitmaps=bitmaps;this.map.triggerRepaint();
 }
 request(file){return fetch(`./data/facades/${file}`,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw Error(`Façades : HTTP ${r.status} (${file})`);return r;});}
 fail(error){if(error.name==='AbortError')return;this.stats.errors++;this.onError(error);}
 setupGL(){
  const gl=this.gl;if(!this.index||!this.bitmaps?.length||gl.isContextLost())return;
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message);}return shader;};
  const vertex=compile(gl.VERTEX_SHADER,VERTEX),fragment=compile(gl.FRAGMENT_SHADER,FRAGMENT),program=gl.createProgram();
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error(message);}
  this.program=program;this.uniforms=Object.fromEntries(['u_matrix','u_catalogue','u_selected','u_hasSelected'].map(k=>[k,gl.getUniformLocation(program,k)]));
  this.attributes=Object.fromEntries(['a_endpoints','a_vertical','a_material','a_building'].map(k=>[k,gl.getAttribLocation(program,k)]));this.matrix=new Float32Array(16);
 }
 isActive(){return this.map.getLayer('buildings-3d')&&this.map.getLayoutProperty('buildings-3d','visibility')!=='none'&&this.map.getLayoutProperty('ign-ground','visibility')!=='none'&&this.map.getPitch()>=1&&this.map.getZoom()>=14;}
 refresh(){
  if(!this.index||!this.stats.loaded||this.abort.signal.aborted)return;
  this.tiles=[];this.desired=new Set();
  if(this.isActive()){
   if(this.map.getZoom()>=17)this.requestDetail();
   const b=this.map.getBounds(),center=this.map.getCenter(),cos=Math.cos(center.lat*Math.PI/180);
   const distance=t=>(((t.bounds[0]+t.bounds[2])*.5-center.lng)*cos)**2+((t.bounds[1]+t.bounds[3])*.5-center.lat)**2;
   this.tiles=this.index.chunks.filter(t=>t.bounds[0]<=b.getEast()&&t.bounds[2]>=b.getWest()&&t.bounds[1]<=b.getNorth()&&t.bounds[3]>=b.getSouth()).sort((a,b)=>distance(a)-distance(b)).slice(0,this.maxTiles);
   for(const tile of this.tiles){this.desired.add(tile.file);let cached=this.cache.get(tile.file);if(!cached){cached={tile,status:'queued',touched:performance.now(),retryAfter:0};this.cache.set(tile.file,cached);}cached.touched=performance.now();}
  }
  this.queue=[...this.desired].map(key=>this.cache.get(key)).filter(t=>t.status==='queued'||(t.status==='error'&&t.attempts<2&&performance.now()>t.retryAfter));
  this.evict();this.pump();this.map.triggerRepaint();
 }
 pump(){
  while(this.active<4&&this.queue.length&&!this.abort.signal.aborted){
   const entry=this.queue.shift();if(!this.desired.has(entry.tile.file)||entry.status==='loading')continue;
   entry.status='loading';entry.attempts=(entry.attempts||0)+1;this.active++;this.stats.requests++;
   this.request(entry.tile.file).then(r=>r.arrayBuffer()).then(bytes=>{if(bytes.byteLength!==entry.tile.count*this.index.stride)throw Error('Géométrie de façade tronquée');entry.bytes=bytes;entry.status='ready';})
    .catch(error=>{entry.status='error';entry.retryAfter=performance.now()+10000;this.fail(error);})
    .finally(()=>{this.active--;if(this.abort.signal.aborted)return;this.evict();this.pump();this.map.triggerRepaint();});
  }
 }
 evict(){
  let bytes=[...this.cache.values()].reduce((a,t)=>a+(t.bytes?.byteLength||0),0);
  for(const entry of [...this.cache.values()].filter(t=>!this.desired.has(t.tile.file)&&t.status!=='loading').sort((a,b)=>a.touched-b.touched)){
   if(this.cache.size<=this.maxCache&&bytes<=this.maxBytes&&entry.status!=='queued')break;
   bytes-=entry.bytes?.byteLength||0;this.release(entry);this.cache.delete(entry.tile.file);
  }
 }
 release(entry){if(entry.vao)this.gl.deleteVertexArray(entry.vao);if(entry.buffer)this.gl.deleteBuffer(entry.buffer);entry.bytes=null;entry.vao=null;entry.buffer=null;}
 uploadTexture(){
  const gl=this.gl,[width,height]=this.textureSize;this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,width,height,this.bitmaps.length,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  this.bitmaps.forEach((bitmap,i)=>gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,width,height,1,gl.RGBA,gl.UNSIGNED_BYTE,bitmap));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');if(anisotropy)gl.texParameterf(gl.TEXTURE_2D_ARRAY,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(this.mobile?4:8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
 }
 uploadGeometry(entry){
  const gl=this.gl;entry.vao=gl.createVertexArray();gl.bindVertexArray(entry.vao);entry.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,entry.buffer);gl.bufferData(gl.ARRAY_BUFFER,entry.bytes,gl.STATIC_DRAW);
  for(const [name,offset] of [['a_endpoints',0],['a_vertical',16],['a_material',32]]){const a=this.attributes[name];gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,52,offset);gl.vertexAttribDivisor(a,1);}
  const a=this.attributes.a_building;gl.enableVertexAttribArray(a);gl.vertexAttribIPointer(a,1,gl.UNSIGNED_INT,52,48);gl.vertexAttribDivisor(a,1);
 }
 render(gl,options){
  this.stats.draws=0;this.stats.visibleFacades=0;if(!this.stats.loaded||!this.program||!this.isActive())return;
  if(this.pendingBitmaps){if(this.texture)gl.deleteTexture(this.texture);this.texture=null;this.bitmaps.forEach(b=>b.close());this.bitmaps=this.pendingBitmaps;this.pendingBitmaps=null;this.textureSize=this.index.textureSize;this.stats.resolution='512 × 256';}
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);if(!this.texture)this.uploadTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.texture);
  const selected=this.selected&&this.map.getFeatureState({source:'buildings',id:this.selected}).selected;
  gl.uniform1i(this.uniforms.u_catalogue,0);gl.uniform1ui(this.uniforms.u_selected,this.selected?facadeHash(this.selected):0);gl.uniform1i(this.uniforms.u_hasSelected,selected?1:0);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  const m=options.defaultProjectionData.mainMatrix,o=this.matrix;
  for(const tile of this.tiles){
   const entry=this.cache.get(tile.file);if(entry?.status!=='ready')continue;if(!entry.vao)this.uploadGeometry(entry);else gl.bindVertexArray(entry.vao);
   for(let row=0;row<4;row++){o[row]=m[row]/this.n;o[4+row]=m[4+row]/this.n;o[8+row]=m[8+row]*tile.zScale;o[12+row]=m[row]*tile.x/this.n+m[4+row]*tile.y/this.n+m[12+row];}
   gl.uniformMatrix4fv(this.uniforms.u_matrix,false,o);gl.drawArraysInstanced(gl.TRIANGLES,0,6,tile.count);this.stats.draws++;this.stats.visibleFacades+=tile.count;
  }
  gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindTexture(gl.TEXTURE_2D_ARRAY,null);
 }
 getState(){return {...this.stats,active:!!this.map&&!!this.isActive(),cacheTiles:this.cache.size,geometryBytes:[...this.cache.values()].reduce((a,t)=>a+(t.bytes?.byteLength||0),0),loading:this.active,queued:this.queue.length,catalogueSize:this.index?.textures.length||0,texturedBuildings:this.index?.stats.texturedBuildings||0,totalFacades:this.index?.stats.facades||0,excludedNerval:this.index?.stats.excludedNerval||0};}
 onRemove(map,gl){
  this.abort.abort();clearTimeout(this.moveTimer);map.off('move',this.onMove);map.off('moveend',this.onEnd);map.off('styledata',this.onStyle);map.off('click',this.onClick);map.getCanvas().removeEventListener('webglcontextrestored',this.restore);
  for(const entry of this.cache.values())this.release(entry);this.cache.clear();this.bitmaps?.forEach(b=>b.close());this.pendingBitmaps?.forEach(b=>b.close());if(this.texture)gl.deleteTexture(this.texture);if(this.program)gl.deleteProgram(this.program);
 }
}

export function installFacadeCatalogue(map){
 const layer=new FacadeLayer({onError:error=>console.error('Facade catalogue:',error)});map.addLayer(layer);
 const context=document.modelContext;
 if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'read_facade_state',description:'Lire le catalogue de façades approximatives, sa couverture et son chargement.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>layer.getState()},{signal:layer.abort.signal})).catch(()=>{});}catch{}}
 return layer;
}
