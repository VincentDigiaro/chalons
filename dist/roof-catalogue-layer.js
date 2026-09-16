import {drapeRoofBuffer} from './terrain.js';
const VERTEX=`#version 300 es
precision highp float;
in vec3 a_position;in vec2 a_uv;in float a_material;in vec3 a_color;
uniform mat4 u_matrix;
out vec2 v_uv;flat out float v_material;flat out vec3 v_color;
void main(){v_uv=a_uv;v_material=a_material;v_color=a_color;gl_Position=u_matrix*vec4(a_position,1.0);}`;
const FRAGMENT=`#version 300 es
precision highp float;precision highp sampler2DArray;
uniform sampler2DArray u_catalogue;
in vec2 v_uv;flat in float v_material;flat in vec3 v_color;
out vec4 fragColor;
void main(){fragColor=vec4(texture(u_catalogue,vec3(v_uv,v_material)).rgb*v_color,1.0);}`;
const tilePoint=(lng,lat,n)=>[(lng+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];

/** Material catalogue on the original OSM roof triangles. Nerval has no triangles here. */
export class RoofCatalogueLayer {
 constructor({onState=()=>{},onError=()=>{}}={}){
  this.id='ign-roofs';this.type='custom';this.renderingMode='3d';
  this.enabled=true;this.buildingsVisible=true;this.onState=onState;this.onError=onError;
  this.abort=new AbortController();this.renderTiles=[];this.stats={requests:0,errors:0,draws:0,ready:0,loading:0};
 }
 request(file){this.stats.requests++;return fetch('./data/roofs/'+file,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw Error(`Toitures : HTTP ${r.status} (${file})`);return r;});}
 onAdd(map,gl){
  this.map=map;this.gl=gl;this.mobile=matchMedia('(max-width:700px)').matches;
  this.onMove=()=>{clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>this.refresh(),100);};
  this.onEnd=()=>{clearTimeout(this.moveTimer);this.refresh();};
  this.restore=()=>{this.texture=null;this.setupGL();map.triggerRepaint();};
  map.on('move',this.onMove);map.on('moveend',this.onEnd);map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  Promise.all(['index.json','mesh.bin','catalogue-index.json','surface.bin'].map(async file=>{const r=await this.request(file);return file.endsWith('.json')?r.json():r.arrayBuffer();})).then(async([index,mesh,catalogue,surface])=>{
   if(this.abort.signal.aborted)return;
   if(mesh.byteLength!==index.vertexCount*12||surface.byteLength!==index.vertexCount*12||catalogue.vertexCount!==index.vertexCount)throw Error('Géométrie de toiture incohérente');
   if(catalogue.textures.length>Math.min(64,gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)))throw Error('Catalogue de toiture trop grand');
   this.index=index;this.catalogue=catalogue;this.vertices=drapeRoofBuffer(mesh,index);this.surfaces=surface;this.n=2**index.zoom;
   this.detailSize=this.mobile?[256,256]:catalogue.textureSize;this.textureSize=catalogue.overviewSize;
   for(const t of index.tiles){const lat=Math.atan(Math.sinh(Math.PI*(1-2*(t.y+.5)/this.n)))*180/Math.PI;t.zScale=1/(40075016.68557849*Math.cos(lat*Math.PI/180));}
   this.bitmaps=await this.loadImages(catalogue.overviewTextures,this.textureSize);if(!this.bitmaps)return;
   this.setupGL();this.stats.ready=this.bitmaps.length;this.refresh();
  }).catch(e=>this.fail(e));
 }
 async loadImages(files,size){
  this.stats.loading=files.length;this.emitState();
  const results=await Promise.allSettled(files.map(async file=>{try{return await createImageBitmap(await(await this.request(file)).blob(),{imageOrientation:'none',premultiplyAlpha:'none',resizeWidth:size[0],resizeHeight:size[1],resizeQuality:'high'});}finally{this.stats.loading--;}}));
  const bitmaps=results.filter(r=>r.status==='fulfilled').map(r=>r.value),failed=results.find(r=>r.status==='rejected');
  if(failed||this.abort.signal.aborted||bitmaps.some(b=>b.width!==size[0]||b.height!==size[1])){bitmaps.forEach(b=>b.close());if(failed)throw failed.reason;if(!this.abort.signal.aborted)throw Error('Dimensions des textures incohérentes');return null;}
  return bitmaps;
 }
 async requestDetail(){
  if(this.detailRequested||Date.now()<(this.retryAfter||0))return;this.detailRequested=true;
  try{const bitmaps=await this.loadImages(this.catalogue.textures,this.detailSize);if(!bitmaps)return;this.pendingBitmaps=bitmaps;this.map.triggerRepaint();}
  catch(e){this.detailRequested=false;this.retryAfter=Date.now()+30000;this.fail(e);}finally{this.emitState();}
 }
 fail(error){if(error.name==='AbortError')return;this.stats.errors++;this.onError(error);this.emitState();}
 setupGL(){
  const gl=this.gl;if(!this.vertices||gl.isContextLost())return;
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const v=compile(gl.VERTEX_SHADER,VERTEX),f=compile(gl.FRAGMENT_SHADER,FRAGMENT);this.program=gl.createProgram();gl.attachShader(this.program,v);gl.attachShader(this.program,f);gl.linkProgram(this.program);gl.deleteShader(v);gl.deleteShader(f);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
  const attribute=(name,size,type,normalized,offset)=>{const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,normalized,12,offset);};
  attribute('a_position',3,gl.FLOAT,false,0);
  this.surfaceBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.surfaceBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.surfaces,gl.STATIC_DRAW);
  attribute('a_uv',2,gl.FLOAT,false,0);attribute('a_material',1,gl.UNSIGNED_BYTE,false,8);attribute('a_color',3,gl.UNSIGNED_BYTE,true,9);
  this.matrixLocation=gl.getUniformLocation(this.program,'u_matrix');this.catalogueLocation=gl.getUniformLocation(this.program,'u_catalogue');this.matrix=new Float32Array(16);
  gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
 }
 uploadTexture(){
  const gl=this.gl,[w,h]=this.textureSize;this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,w,h,this.bitmaps.length,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  this.bitmaps.forEach((b,i)=>gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,i,w,h,1,gl.RGBA,gl.UNSIGNED_BYTE,b));
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D_ARRAY,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(this.mobile?4:8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
 }
 isActive(){return this.enabled&&this.buildingsVisible&&this.map?.getZoom()>=14;}
 setVisible(enabled,buildingsVisible=this.buildingsVisible){this.enabled=enabled;this.buildingsVisible=buildingsVisible;this.refresh();}
 refresh(){
  if(!this.index||!this.bitmaps||this.abort.signal.aborted)return;this.renderTiles=[];
  if(this.isActive()){
   const b=this.map.getBounds(),c=this.map.getCenter(),[cx,cy]=tilePoint(c.lng,c.lat,this.n),west=tilePoint(b.getWest(),c.lat,this.n)[0],east=tilePoint(b.getEast(),c.lat,this.n)[0],north=tilePoint(c.lng,b.getNorth(),this.n)[1],south=tilePoint(c.lng,b.getSouth(),this.n)[1];
   this.renderTiles=this.index.tiles.filter(t=>t.x+1>=west&&t.x<=east&&t.y+1>=north&&t.y<=south).sort((a,b)=>(a.x+.5-cx)**2+(a.y+.5-cy)**2-(b.x+.5-cx)**2-(b.y+.5-cy)**2).slice(0,this.mobile?256:1024);
   if(this.map.getZoom()>=17)this.requestDetail();
  }
  this.emitState();this.map.triggerRepaint();
 }
 emitState(){this.onState({...this.stats,active:this.isActive(),catalogueSize:this.catalogue?.textures.length||0});}
 render(gl,options){
  this.stats.draws=0;if(!this.program||!this.bitmaps||!this.isActive())return;
  if(this.pendingBitmaps){if(this.texture)gl.deleteTexture(this.texture);this.texture=null;this.bitmaps.forEach(b=>b.close());this.bitmaps=this.pendingBitmaps;this.pendingBitmaps=null;this.textureSize=this.detailSize;}
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);if(!this.texture)this.uploadTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.texture);gl.uniform1i(this.catalogueLocation,0);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  const m=options.defaultProjectionData.mainMatrix,o=this.matrix,s=1/this.n;
  for(const t of this.renderTiles){for(let r=0;r<4;r++){o[r]=m[r]*s;o[4+r]=m[4+r]*s;o[8+r]=m[8+r]*t.zScale;o[12+r]=m[r]*t.x*s+m[4+r]*t.y*s+m[12+r];}gl.uniformMatrix4fv(this.matrixLocation,false,o);gl.drawArrays(gl.TRIANGLES,t.first,t.count);this.stats.draws++;}
  gl.bindVertexArray(null);gl.bindTexture(gl.TEXTURE_2D_ARRAY,null);
 }
 getState(){return {...this.stats,enabled:this.enabled,buildingsVisible:this.buildingsVisible,catalogueSize:this.catalogue?.textures.length||0,resolution:this.textureSize?.join(' × '),visibleRoofTiles:this.renderTiles.length,geometryBytes:(this.vertices?.byteLength||0)+(this.surfaces?.byteLength||0)};}
 onRemove(map,gl){
  this.abort.abort();clearTimeout(this.moveTimer);map.off('move',this.onMove);map.off('moveend',this.onEnd);map.getCanvas().removeEventListener('webglcontextrestored',this.restore);
  this.bitmaps?.forEach(b=>b.close());this.pendingBitmaps?.forEach(b=>b.close());if(this.texture)gl.deleteTexture(this.texture);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.surfaceBuffer)gl.deleteBuffer(this.surfaceBuffer);if(this.vao)gl.deleteVertexArray(this.vao);if(this.program)gl.deleteProgram(this.program);
 }
}
