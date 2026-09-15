import {ModelResidency} from './custom-model-residency.js';
import {ATTILA_GROUND_GLSL} from './attila-ground-materials.js';
import {GROUND_GLSL} from './nerval-ground-materials.js';
import {HOUSE_GLSL} from './nerval-house-materials.js';
const VERTEX=`#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in vec3 a_color;
uniform mat4 u_matrix;
out vec2 v_uv;
out vec3 v_color;
out float v_light;
out vec3 v_position;
void main(){
 gl_Position=u_matrix*vec4(a_position,1.0);v_uv=a_uv;v_color=a_color;v_position=a_position;
 v_light=.72+.28*abs(dot(normalize(a_normal),normalize(vec3(-.4,-.6,.8))));
}`;
const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform int u_material;
uniform bool u_photos;
uniform int u_kind;
in vec2 v_uv;
in vec3 v_color;
in float v_light;
in vec3 v_position;
out vec4 fragColor;
float grain(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
${GROUND_GLSL}
${HOUSE_GLSL}
${ATTILA_GROUND_GLSL}
void main(){
 if(u_kind==11){fragColor=vec4((u_photos?texture(u_texture,v_uv).rgb:vec3(.83,.80,.73))*v_color,1.);return;}
 if(u_kind>=2){
  float light=.80+.20*(v_light-.72)/.28;
  vec3 c=v_color;
  if(u_kind==2)c*=(.98+.03*grain(floor(v_position.xy*120.+v_position.z*83.)))*(.88+.12*smoothstep(0.,.5,v_position.z));
  if(u_kind==3){if(!u_photos)discard;vec4 p=texture(u_texture,v_uv);c=mix(c,p.rgb,p.a);}
  if(u_kind==4)c=u_photos?texture(u_texture,v_uv).rgb*v_color:vec3(.39,.35,.29);
  if(u_kind==5)c=u_photos?texture(u_texture,v_uv).rgb*v_color:vec3(.32,.42,.22);
  if(u_kind>=6){float fade=1.-smoothstep(.4,1.8,length(fwidth(v_position.xy))*30.);float n=mix(.5,grain(floor(v_position.xy*30.)),fade);c*=.975+.05*n;if(u_kind==8)c*=.94+.12*grain(floor(v_position.xy*4.));}
  if(u_kind==9){vec2 t=vec2(v_uv.x+mod(floor(v_uv.y),2.)*.5,v_uv.y);vec2 cell=fract(t);float edge=min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y));float aa=max(fwidth(t.x),fwidth(t.y));float joint=1.-smoothstep(.018-aa,.035+aa,edge);c*=.92+.12*grain(floor(t));c=mix(c,c*.72,joint*.65);}
  if(u_kind==10){vec2 t=fract(v_uv);vec2 a=max(fwidth(v_uv),vec2(.035));vec2 edge=min(t,1.-t);float wire=1.-min(smoothstep(.025,.025+a.x,edge.x),smoothstep(.025,.025+a.y,edge.y));if(wire<.3)discard;}
  if(u_kind>=6&&u_kind<=9&&u_photos&&detailedGround(v_position))c=groundAlbedo(u_kind,v_position,v_uv,v_color);
  if(u_kind==12)c=houseGlazing(v_uv,v_color);
  if(u_kind>=14&&u_kind<=16&&u_photos)c=attilaGround(u_kind,v_uv,v_color);
  fragColor=vec4(c*light,1.0);return;
 }
 if(u_material>0 && u_photos){vec4 p=texture(u_texture,v_uv);if(p.a<.55)discard;fragColor=vec4(p.rgb,1.0);}
 else {if(u_material>1)discard;fragColor=vec4((u_material==1?vec3(.39,.35,.29):v_color)*v_light,1.0);}
}`;

/** Small, static ENU model of the street; all GPU resources are bounded.
 * The impasse uses modeled openings; upstream houses use the city catalogue.
 * Local metres avoid float32 jitter at close zooms; MapLibre supplies depth.
 */
export class NervalLayer {
 constructor({onReady=()=>{},onError=()=>{},id='nerval-detail',basePath='./data/nerval',label='Rue Gérard-de-Nerval',bounds}={}){
  this.id=id;this.basePath=basePath;this.label=label;this.type='custom';this.renderingMode='3d';this.onReady=onReady;this.onError=onError;
  this.bounds=bounds;this.visible=true;this.photos=true;this.stats={loaded:false,draws:0,errors:0};
 }
 onAdd(map,gl){
  this.map=map;this.gl=gl;
  this.restore=()=>{this.releaseGPU();if(this.vertices)this.setupGL();map.triggerRepaint();};
  map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  this.residency=new ModelResidency({bounds:this.bounds,load:signal=>this.loadData(signal),disposeData:data=>data.bitmaps.forEach(b=>b.close()),onLoad:data=>{
   Object.assign(this,data);this.textureObjects=[];this.origin=maplibregl.MercatorCoordinate.fromLngLat(data.index.origin);this.metres=this.origin.meterInMercatorCoordinateUnits();this.setupGL();this.stats.loaded=true;this.onReady(data.index);map.triggerRepaint();
  },onUnload:()=>{this.releaseGPU();this.index=null;this.vertices=null;this.bitmaps=null;this.stats.loaded=false;this.stats.draws=0;map.triggerRepaint();},onError:error=>{this.stats.errors++;this.onError(error);}});
  this.updateResidency=()=>this.residency.update(map.getCenter(),this.visible);
  map.on('move',this.updateResidency);this.updateResidency();
 }
 async loadData(signal){
  const request=async file=>{const r=await fetch(`${this.basePath}/${file}`,{signal});if(!r.ok)throw Error(`${this.label} : HTTP ${r.status}`);return r;};
  const [index,buffer]=await Promise.all([request('index.json').then(r=>r.json()),request('mesh.bin').then(r=>r.arrayBuffer())]);
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const images=await Promise.allSettled(index.textures.map(async file=>createImageBitmap(await(await request(file)).blob(),{imageOrientation:'none',premultiplyAlpha:'none'})));
  const bitmaps=images.filter(r=>r.status==='fulfilled').map(r=>r.value),failed=images.find(r=>r.status==='rejected');
  if(failed||signal.aborted){bitmaps.forEach(b=>b.close());throw failed?.reason||new DOMException('Cancelled','AbortError');}
  if(buffer.byteLength!==index.vertexCount*44){bitmaps.forEach(b=>b.close());throw Error('Invalid custom model geometry');}
  return {index,vertices:new Float32Array(buffer),bitmaps};
 }
 releaseGPU(){const gl=this.gl;this.textureObjects?.forEach(t=>gl.deleteTexture(t));if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);this.textureObjects=[];this.vao=null;this.buffer=null;this.program=null;}
 setupGL(){
  if(!this.vertices||this.gl.isContextLost())return;
  const gl=this.gl,compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,VERTEX),fs=compile(gl.FRAGMENT_SHADER,FRAGMENT);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
  for(const [name,size,offset] of [['a_position',3,0],['a_normal',3,12],['a_uv',2,24],['a_color',3,32]]){const a=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,44,offset);}
  this.uniforms=Object.fromEntries(['u_matrix','u_texture','u_material','u_photos','u_kind'].map(n=>[n,gl.getUniformLocation(this.program,n)]));this.matrix=new Float32Array(16);gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
 }
 setVisible(buildings,photos){this.visible=buildings;this.photos=photos;this.updateResidency?.();this.map?.triggerRepaint();}
 render(gl,options){
  this.stats.draws=0;
  if(!this.stats.loaded||!this.visible||this.map.getZoom()<14)return;
  const b=this.map.getBounds(),[w,s,e,n]=this.index.bounds;if(b.getEast()<w||b.getWest()>e||b.getNorth()<s||b.getSouth()>n)return;
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);
  for(let i=0;i<this.bitmaps.length;i++)if(!this.textureObjects[i]){const t=gl.createTexture();this.textureObjects[i]=t;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.bitmaps[i]);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);const wrap=this.index.materials.some(m=>m.texture===i&&m.mirror)?gl.MIRRORED_REPEAT:this.index.materials.some(m=>m.texture===i&&m.repeat)?gl.REPEAT:gl.CLAMP_TO_EDGE;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap);const anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');if(anisotropy)gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));}
  const m=options.defaultProjectionData.mainMatrix,o=this.matrix,k=this.metres,{x,y}=this.origin;
  for(let row=0;row<4;row++){o[row]=m[row]*k;o[4+row]=-m[4+row]*k;o[8+row]=m[8+row]*k;o[12+row]=m[row]*x+m[4+row]*y+m[12+row];}
  gl.uniformMatrix4fv(this.uniforms.u_matrix,false,o);gl.uniform1i(this.uniforms.u_texture,0);gl.uniform1i(this.uniforms.u_photos,this.photos?1:0);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  for(const range of this.index.ranges){const material=this.index.materials[range.material];gl.uniform1i(this.uniforms.u_material,range.material);gl.uniform1i(this.uniforms.u_kind,material.kind);if(material.texture!==undefined)gl.bindTexture(gl.TEXTURE_2D,this.textureObjects[material.texture]);gl.drawArrays(gl.TRIANGLES,range.first,range.count);this.stats.draws++;}
  gl.bindVertexArray(null);gl.bindTexture(gl.TEXTURE_2D,null);
 }
 getState(){return {...this.stats,visible:this.visible,photos:this.photos,...this.index?.stats,...this.residency?.getState()};}
 pick(point){
  if(!this.stats.draws||!this.visible)return null;
  const m=this.matrix,canvas=this.map.getCanvas(),project=p=>{const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];if(q[3]<=0)return null;return [(q[0]/q[3]+1)*canvas.clientWidth/2,(1-q[1]/q[3])*canvas.clientHeight/2,q[2]/q[3]];};
  let nearest=Infinity,part=null;
  for(const triangle of this.index.pickTriangles){const [a,b,c]=triangle.points.map(project);if(!a||!b||!c)continue;
   const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<.001)continue;
   const u=((b[1]-c[1])*(point.x-c[0])+(c[0]-b[0])*(point.y-c[1]))/det,v=((c[1]-a[1])*(point.x-c[0])+(a[0]-c[0])*(point.y-c[1]))/det,w=1-u-v;
   if(u<0||v<0||w<0)continue;const depth=u*a[2]+v*b[2]+w*c[2];if(depth<nearest){nearest=depth;part=triangle.part;}
  }
  return part;
 }
 onRemove(map,gl){map.off('move',this.updateResidency);this.residency?.dispose();this.releaseGPU();map.getCanvas().removeEventListener('webglcontextrestored',this.restore);}
}
