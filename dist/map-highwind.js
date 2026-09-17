import {SHIP_CONFIG,SHIP_ID,shipModel} from './walk-config.js';
import {cityHighwindConfig} from './city-config.js';
import {toLngLat} from './walk-core.js';
import {terrainHeight} from './terrain.js';
import {shipMatrix} from './highwind-math.js';
import {shipLabel} from './ship-selection.js';

const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;layout(location=1) in vec3 a_normal;layout(location=2) in vec2 a_uv;layout(location=3) in vec3 a_color;
uniform mat4 u_matrix;uniform mat4 u_model;out vec2 v_uv;out vec3 v_color;out float v_light;
void main(){gl_Position=u_matrix*u_model*vec4(a_position,1.);v_uv=a_uv;v_color=a_color;v_light=.78+.22*max(0.,dot(normalize(mat3(u_model)*a_normal),normalize(vec3(-.4,-.6,.8))));}`;
const FS=`#version 300 es
precision highp float;uniform sampler2D u_texture;in vec2 v_uv;in vec3 v_color;in float v_light;out vec4 fragColor;
void main(){vec4 c=texture(u_texture,v_uv);if(c.a<.1)discard;fragColor=vec4(c.rgb*v_color*v_light,c.a);}`;

// Separate map renderer: no pedestrian collision preparation, no pitch filter.
export class MapHighwind{
 constructor({pose=null}={}){const config=cityHighwindConfig(SHIP_CONFIG);this.shipId=SHIP_ID;this.label=shipLabel(SHIP_ID);this.id='map-highwind';this.type='custom';this.renderingMode='3d';this.enabled=SHIP_ID!==null&&!!config?.present;this.pose=this.enabled?{...config,position:{...config.position},pitch:0,...pose}:null;if(this.pose&&!pose)this.pose.position.z+=terrainHeight(this.pose.position.x,this.pose.position.y);this.abort=new AbortController();this.textures=[];this.draws=0;}
 onAdd(map,gl){
  this.map=map;this.gl=gl;this.restore=()=>{this.textures=[];this.program=null;this.setup();map.triggerRepaint();};map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  if(!this.enabled)return;
  this.loading=this.load().catch(e=>{if(!this.abort.signal.aborted){this.error=e.message;console.error(this.label+' carte :',e);}});
 }
 async load(){
  const variant=shipModel(this.shipId,this.pose.modele),base='./data/'+variant.basePath;
  const read=async file=>{const r=await fetch(base+file,{signal:this.abort.signal});if(!r.ok)throw Error(this.label+' HTTP '+r.status);return r;};
  this.index=await(await read('index.json')).json();
  const buffer=await(await read(this.index.mesh)).arrayBuffer();if(buffer.byteLength!==this.index.vertexCount*44)throw Error('Géométrie '+this.label+' invalide');this.vertices=new Float32Array(buffer);
  this.bitmaps=[];
  await Promise.all(this.index.materials.map(async(m,i)=>{const r=await read(variant.textures[m.texture]??m.texture),bitmap=await createImageBitmap(await r.blob(),{imageOrientation:'none',premultiplyAlpha:'none'});if(this.abort.signal.aborted){bitmap.close();return;}this.bitmaps[i]=bitmap;}));
  if(this.abort.signal.aborted)return;this.setup();this.map.triggerRepaint();
 }
 setup(){
  const gl=this.gl;if(!this.vertices||!this.index.materials.every((_,i)=>this.bitmaps?.[i])||gl.isContextLost())return;
  const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  this.program=gl.createProgram();for(const [kind,source] of [[gl.VERTEX_SHADER,VS],[gl.FRAGMENT_SHADER,FS]]){const s=shader(kind,source);gl.attachShader(this.program,s);gl.deleteShader(s);}gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['u_matrix','u_model','u_texture'].map(n=>[n,gl.getUniformLocation(this.program,n)]));this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
  for(const [i,size,offset] of [[0,3,0],[1,3,12],[2,2,24],[3,3,32]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,44,offset);}gl.bindVertexArray(null);
  this.textures=this.bitmaps.map(bitmap=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});
  this.origin=maplibregl.MercatorCoordinate.fromLngLat(toLngLat([this.pose.position.x,this.pose.position.y]));this.metres=this.origin.meterInMercatorCoordinateUnits();this.matrix=new Float32Array(16);
 }
 render(gl,options){
  this.draws=0;if(!this.enabled||!this.program||gl.isContextLost())return;
  const m=options.defaultProjectionData.mainMatrix,o=this.matrix,k=this.metres,{x,y}=this.origin;for(let r=0;r<4;r++){o[r]=m[r]*k;o[4+r]=-m[4+r]*k;o[8+r]=m[8+r]*k;o[12+r]=m[r]*x+m[4+r]*y+m[12+r];}
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(this.uniforms.u_texture,0);gl.uniformMatrix4fv(this.uniforms.u_matrix,false,o);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  // The map displays a fixed ship, without continuously redrawing the city.
  gl.uniformMatrix4fv(this.uniforms.u_model,false,shipMatrix({...this.pose,position:{x:0,y:0,z:this.pose.position.z}}));
  for(const range of this.index.ranges){gl.bindTexture(gl.TEXTURE_2D,this.textures[range.material]);gl.drawArrays(gl.TRIANGLES,range.first,range.count);this.draws++;}
  gl.bindVertexArray(null);gl.bindTexture(gl.TEXTURE_2D,null);
 }
 getState(){return {ship:this.shipId,label:this.label,present:this.enabled,loaded:!!this.program,draws:this.draws,pose:this.pose,error:this.error||null};}
 onRemove(map,gl){this.abort.abort();map.getCanvas().removeEventListener('webglcontextrestored',this.restore);for(const t of this.textures)gl.deleteTexture(t);this.bitmaps?.forEach(b=>b?.close());if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);}
}
