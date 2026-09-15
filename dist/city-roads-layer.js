// A bounded, shared-material tile cache; geometry uses the same metre frame and
// binary packets as the pedestrian renderer. No OSM requests in the browser.
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec3 a_color;
uniform mat4 u_matrix;
out vec2 v_uv;out vec3 v_color;out float v_light;
void main(){gl_Position=u_matrix*vec4(a_position,1.);v_uv=a_uv;v_color=a_color;v_light=.80+.20*abs(dot(normalize(a_normal),normalize(vec3(-.4,-.6,.8))));}`;
const FS=`#version 300 es
precision highp float;
uniform sampler2D u_texture;uniform bool u_textured;
in vec2 v_uv;in vec3 v_color;in float v_light;out vec4 fragColor;
void main(){vec3 c=v_color;if(u_textured)c*=texture(u_texture,v_uv).rgb;fragColor=vec4(c*v_light,1.);}`;
export class CityRoadsLayer{
 constructor(){this.id='city-roads-3d';this.type='custom';this.renderingMode='3d';this.cache=new Map();this.pending=new Set();this.failed=new Set();this.textures=[];this.abort=new AbortController();this.stats={loaded:false,draws:0,errors:0,gpuBytes:0};}
 onAdd(map,gl){
  this.map=map;this.gl=gl;this.restore=()=>{this.cache.clear();this.textures=[];this.setup();map.triggerRepaint();};map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  Promise.all([fetch('./data/city-roads/index.json',{signal:this.abort.signal}).then(r=>{if(!r.ok)throw Error('Road index HTTP '+r.status);return r.json();}),...['ground-asphalt-v1.webp','ground-pavers-v1.webp'].map(name=>fetch('./data/nerval/'+name,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw Error('Road texture HTTP '+r.status);return r.blob();}).then(createImageBitmap))]).then(([index,...bitmaps])=>{
   if(this.abort.signal.aborted){bitmaps.forEach(b=>b.close());return;}
   this.index=index;this.bitmaps=bitmaps;this.origin=maplibregl.MercatorCoordinate.fromLngLat(index.origin);this.metres=this.origin.meterInMercatorCoordinateUnits();this.setup();this.stats.loaded=true;map.triggerRepaint();
  }).catch(e=>{if(e.name!=='AbortError'){this.stats.errors++;console.error('Routes:',e);}});
 }
 setup(){
  const gl=this.gl;if(!this.index||gl.isContextLost())return;
  const compile=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  this.program=gl.createProgram();for(const [kind,source] of [[gl.VERTEX_SHADER,VS],[gl.FRAGMENT_SHADER,FS]]){const s=compile(kind,source);gl.attachShader(this.program,s);gl.deleteShader(s);}gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['u_matrix','u_texture','u_textured'].map(k=>[k,gl.getUniformLocation(this.program,k)]));this.matrix=new Float32Array(16);
 }
 drop(node){this.gl.deleteBuffer(node.buffer);this.gl.deleteVertexArray(node.vao);}
 texture(i){
  const gl=this.gl;if(this.textures[i])return this.textures[i];
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.bitmaps[i]);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  const ext=gl.getExtension('EXT_texture_filter_anisotropic');if(ext)gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return this.textures[i]=texture;
 }
 render(gl,options){
  this.stats.draws=0;if(!this.stats.loaded||gl.isContextLost())return;
  if(this.map.getZoom()<14.5){for(const n of this.cache.values())this.drop(n);this.cache.clear();this.stats.gpuBytes=0;return;}
  const bounds=this.map.getBounds(),origin=this.index.origin,scale=this.index.scale;
  const w=(bounds.getWest()-origin[0])*scale[0]-128,e=(bounds.getEast()-origin[0])*scale[0]+128,s=(bounds.getSouth()-origin[1])*scale[1]-128,n=(bounds.getNorth()-origin[1])*scale[1]+128;
  const center=this.map.getCenter(),cx=(center.lng-origin[0])*scale[0],cy=(center.lat-origin[1])*scale[1];
  const wanted=this.index.nodes.filter(([,a,b,c,d])=>c>=w&&a<=e&&d>=s&&b<=n).sort((a,b)=>Math.hypot((a[1]+a[3])/2-cx,(a[2]+a[4])/2-cy)-Math.hypot((b[1]+b[3])/2-cx,(b[2]+b[4])/2-cy)).slice(0,384);
  const keys=new Set(wanted.map(r=>r[0]));for(const [key,node] of this.cache)if(!keys.has(key)){this.drop(node);this.cache.delete(key);}
  for(const [file] of wanted){
   if(this.pending.size>=6)break;if(this.cache.has(file)||this.pending.has(file)||this.failed.has(file))continue;
   this.pending.add(file);fetch('./data/city-roads/'+file,{signal:this.abort.signal}).then(r=>{if(!r.ok)throw Error('Road tile HTTP '+r.status);return r.arrayBuffer();}).then(raw=>{
    if(this.abort.signal.aborted||gl.isContextLost())return;
    const size=new DataView(raw).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,size))),data=new Float32Array(raw,4+size);
    // Reproject the city-wide metre grid to Mercator before uploading. A
    // tangent plane alone drifts several metres at the extraction's edges.
    for(let i=0;i<data.length;i+=11){const coordinate=maplibregl.MercatorCoordinate.fromLngLat([origin[0]+data[i]/scale[0],origin[1]+data[i+1]/scale[1]]);data[i]=(coordinate.x-this.origin.x)/this.metres;data[i+1]=(this.origin.y-coordinate.y)/this.metres;}
    const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(const [at,count,offset] of [[0,3,0],[1,3,12],[2,2,24],[3,3,32]]){gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,count,gl.FLOAT,false,44,offset);}gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);this.cache.set(file,{vao,buffer,ranges:header.ranges,bytes:data.byteLength});
   }).catch(error=>{if(error.name!=='AbortError'){this.failed.add(file);this.stats.errors++;console.warn('Routes:',error);}}).finally(()=>{this.pending.delete(file);if(!this.abort.signal.aborted)this.map.triggerRepaint();});
  }
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(this.uniforms.u_texture,0);
  const m=options.defaultProjectionData.mainMatrix,o=this.matrix,k=this.metres,{x,y}=this.origin;
  for(let row=0;row<4;row++){o[row]=m[row]*k;o[4+row]=-m[4+row]*k;o[8+row]=m[8+row]*k;o[12+row]=m[row]*x+m[4+row]*y+m[12+row];}gl.uniformMatrix4fv(this.uniforms.u_matrix,false,o);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  this.stats.gpuBytes=0;for(const node of this.cache.values()){this.stats.gpuBytes+=node.bytes;gl.bindVertexArray(node.vao);for(const [mat,first,count] of node.ranges){gl.uniform1i(this.uniforms.u_textured,mat<4?1:0);if(mat<4)gl.bindTexture(gl.TEXTURE_2D,this.texture(mat===2?1:0));gl.drawArrays(gl.TRIANGLES,first,count);this.stats.draws++;}}
  gl.bindVertexArray(null);gl.bindTexture(gl.TEXTURE_2D,null);
 }
 getState(){return {...this.stats,loadedSectors:this.cache.size,loading:this.pending.size,totalSectors:this.index?.nodes.length,ways:this.index?.stats.ways};}
 onRemove(map,gl){this.abort.abort();map.getCanvas().removeEventListener('webglcontextrestored',this.restore);for(const node of this.cache.values())this.drop(node);this.bitmaps?.forEach(b=>b.close());this.textures.forEach(t=>gl.deleteTexture(t));if(this.program)gl.deleteProgram(this.program);}
}
