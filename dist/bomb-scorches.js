import {CITY} from './city-config.js';
import {toLngLat,GROUND_LOAD_RADIUS} from './walk-core.js';
import {terrainHeight,terrainBaseHeight} from './terrain.js';
import {terrainWaterMask} from './terrain-water.js';
import {setTerrainImpacts,terrainCraterRevision,terrainCraterField,terrainCraterStamp,finishGeometry} from './terrain-craters.js';
import {BackgroundPreparation} from './walk-preparation.js';
import {normalizeBombImpact,bombImpactCraterRadius} from './bomb-impact.js';
import {WEAPON_IMPACT_CONFIG,validateBombConfig} from './walk-config.js';

const returnKey='highwind-scorches-map-return:'+CITY.id;
const cleanMarks=marks=>Array.isArray(marks)?marks.map(normalizeBombImpact).filter(Boolean):[];
function beginSession(){
 // Retire the old cross-game save without touching any other preferences.
 try{globalThis.localStorage?.removeItem('highwind-scorches-v1:'+CITY.id);}catch{}
 try{
  // The Carte button reloads the document. Consume its handoff exactly once:
  // a subsequent refresh/restart starts intact, even with a walk-return hash.
  const storage=globalThis.sessionStorage,raw=storage?.getItem(returnKey);storage?.removeItem(returnKey);
  return globalThis.location?.hash?.startsWith('#walk-return=')?cleanMarks(JSON.parse(raw||'[]')):[];
 }catch{return [];}
}
let sessionMarks=beginSession();
setTerrainImpacts(sessionMarks);
export function readScorches(){return cleanMarks(sessionMarks);}
export function saveScorches(marks){sessionMarks=cleanMarks(marks);setTerrainImpacts(sessionMarks);}
export function preserveScorchesForMap(){try{globalThis.sessionStorage?.setItem(returnKey,JSON.stringify(sessionMarks));}catch{}}

export function makeProgram(gl,vertex,fragment){
 const program=gl.createProgram();
 for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);gl.deleteProgram(program);throw Error(error);}gl.attachShader(program,shader);gl.deleteShader(shader);}
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const error=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error(error);}return program;
}
// One deterministic, seamless 128² texture per renderer, shared by all impacts.
// Its mipmaps filter the small gravel at distance; nothing is generated per frame.
export function* prepareCraterSoilPixels(){
 const size=128,data=new Uint8Array(size*size*4),mix=(a,b,t)=>a+(b-a)*t;
 const hash=(x,y)=>{let n=Math.imul(x+73,374761393)^Math.imul(y+29,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const noise=(x,y,step)=>{const period=size/step,ix=Math.floor(x/step),iy=Math.floor(y/step),fx=x/step-ix,fy=y/step-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return mix(mix(hash(ix%period,iy%period),hash((ix+1)%period,iy%period),sx),mix(hash(ix%period,(iy+1)%period),hash((ix+1)%period,(iy+1)%period),sx),sy);};
 for(let y=0;y<size;y++){for(let x=0;x<size;x++){
  const broad=noise(x,y,32),clods=noise(x,y,8),grit=noise(x,y,2),grain=hash(x,y),t=.45*broad+.4*clods+.15*grit,pebble=Math.max(0,(grit-.63)*3),at=(y*size+x)*4;
  for(let c=0;c<3;c++)data[at+c]=Math.round(mix(mix([66,49,33][c],[163,135,94][c],t),[153,145,128][c],pebble)+(grain-.5)*19);
  data[at+3]=255;
 }yield;}
 return {size,data};
}
export const craterSoilPixels=()=>finishGeometry(prepareCraterSoilPixels());
const VS=`#version 300 es
layout(location=0) in vec3 a_position;layout(location=1) in vec2 a_uv;layout(location=2) in vec2 a_surface;
uniform mat4 u_matrix;uniform vec2 u_origin;out vec2 v_uv;out vec2 v_world;out vec2 v_surface;
void main(){v_uv=a_uv;v_world=a_position.xy;v_surface=a_surface;gl_Position=u_matrix*vec4(a_position.xy-u_origin,a_position.z,1.);}`;
const FS=`#version 300 es
precision highp float;in vec2 v_uv;in vec2 v_world;in vec2 v_surface;
uniform vec2 u_center;uniform vec2 u_fog;uniform vec2 u_scorch;uniform vec2 u_soil;uniform float u_scorchRatio;uniform float u_craterRatio;uniform sampler2D u_soilTexture;out vec4 fragColor;
void main(){
 float r=length(v_uv);vec3 grain=texture(u_soilTexture,v_world/u_soil.y).rgb;
 float edge=.96+(grain.r-.42)*.22;
 float craterR=r/max(.0001,u_craterRatio),soilOpacity=u_soil.x*step(.0001,u_craterRatio);
 float earth=(1.-smoothstep(edge-.12,edge,craterR))*soilOpacity;
 float burn=(1.-smoothstep(edge*(1.-max(.0001,u_scorch.y)),edge,r/max(.0001,u_scorchRatio)))*u_scorch.x*step(.0001,u_scorchRatio);
 // Charcoal at the bottom; exposed soil and pale rubble remain legible on slopes.
 float centre=1.-smoothstep(.12,.82,craterR),charcoal=burn*mix(1.,.08+.52*centre,soilOpacity);
 float rim=smoothstep(.35,.85,craterR);
 vec3 soil=grain*(.78+.30*rim)*v_surface.y;
 soil=mix(soil,vec3(.035,.029,.023),charcoal);
 float ash=burn*mix(1.,.22,soilOpacity),alpha=earth+ash*(1.-earth);
 vec3 color=(soil*earth+vec3(.025,.022,.02)*ash*(1.-earth))/max(.0001,alpha);
 alpha*=v_surface.x*(1.-smoothstep(u_fog.x,u_fog.y,length(v_world-u_center)));
 if(alpha<.008)discard;fragColor=vec4(color,min(1.,alpha));
}`;

// Terrain-following decals, prepared only once locally and culled with the scene.
// Coordinates survive streaming and map transitions within the current game.
export class BombScorches {
 constructor(gl,{marks=readScorches(),height=terrainHeight,config=WEAPON_IMPACT_CONFIG.noircissement,soil=WEAPON_IMPACT_CONFIG.terre,preparation,onReady=()=>{}}={}){this.gl=gl;this.marks=marks.map(normalizeBombImpact).filter(Boolean);this.height=height;const validated=validateBombConfig({noircissement:config,terre:soil});this.config=validated.noircissement;this.soil=validated.terre;this.cache=new Map();this.pending=new Map();this.preparation=preparation||new BackgroundPreparation();this.ownsPreparation=!preparation;this.onReady=onReady;this.draws=0;this.errors=0;}
 add(position,visualRadius=100,damageRadius=100,craterDepth,craterRadius){const value=[...position.slice(0,2),visualRadius,damageRadius];if(craterDepth!==undefined||craterRadius!==undefined)value.push(craterDepth??(craterRadius??visualRadius)*.2);if(craterRadius!==undefined)value.push(craterRadius);const mark=normalizeBombImpact(value);if(!mark)return;this.marks.push(mark);saveScorches(this.marks);}
 setup(pixels=craterSoilPixels()){const gl=this.gl;this.program=makeProgram(gl,VS,FS);this.uniforms=Object.fromEntries(['u_matrix','u_origin','u_center','u_fog','u_scorch','u_soil','u_scorchRatio','u_craterRatio','u_soilTexture'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  const {size,data}=pixels;this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);this.textureBytes=(size*size*4-1)/3*4;
 }
 radius(p){return Math.max(this.soil.opacite?bombImpactCraterRadius(p):0,this.config.opacite?p[2]*this.config.tailleRatio:0);}
 bounds(p){const r=this.radius(p);return [p[0]-r,p[1]-r,p[0]+r,p[1]+r];}
 geometry(p){return finishGeometry(this.prepareGeometry(p));}
 *prepareGeometry(p,field=terrainCraterField()){
  const gl=this.gl,data=[],radius=this.radius(p),steps=radius?20:0,grid=[];
  const height=this.height===terrainHeight?(x,y)=>terrainBaseHeight(x,y)+field.offset(x,y):this.height;
  for(let y=0;y<=steps&&steps;y++){for(let x=0;x<=steps;x++){
   const u=x/steps*2-1,v=y/steps*2-1,px=p[0]+u*radius,py=p[1]+v*radius,gx=height(px+.5,py)-height(px-.5,py),gy=height(px,py+.5)-height(px,py-.5),light=.52+.48*Math.max(0,(.4*gx+.6*gy+.8)/(Math.hypot(gx,gy,1)*Math.sqrt(1.16)));
   grid.push([px,py,height(px,py)+.32,u*radius/p[2],v*radius/p[2],terrainWaterMask().weight(px,py),light]);
  }yield;}
  for(let y=0;y<steps;y++){for(let x=0;x<steps;x++)for(const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]])data.push(...grid[(y+dy)*(steps+1)+x+dx]);yield;}
  const vao=gl.createVertexArray(),buffer=gl.createBuffer(),vertices=new Float32Array(data);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,28,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,28,20);gl.bindVertexArray(null);return {vao,buffer,count:data.length/7,bytes:vertices.byteLength};
 }
 release(gpu){if(gpu){this.gl.deleteBuffer(gpu.buffer);this.gl.deleteVertexArray(gpu.vao);}}
 ensureGeometry(i,p,revision){
  const gpu=this.cache.get(i);if(gpu?.revision===revision||this.pending.has(i))return gpu;
  const bounds=this.bounds(p),field=terrainCraterField(),stamp=terrainCraterStamp(bounds,field);
  if(gpu?.stamp===stamp){gpu.revision=revision;return gpu;}
  const node={bounds,controller:new AbortController()},owner=this;this.pending.set(i,node);
  this.preparation.add(node,(function*(){
   if(!owner.program){const pixels=yield* prepareCraterSoilPixels();if(!owner.program)owner.setup(pixels);yield;}
   const next=yield* owner.prepareGeometry(p,field);next.revision=revision;next.stamp=stamp;
   owner.release(owner.cache.get(i));owner.cache.set(i,next);owner.pending.delete(i);owner.onReady();
  })()).catch(error=>{if(error.name!=='AbortError'){this.errors++;console.error('Trace explosion :',error);}}).finally(()=>{if(this.pending.get(i)===node)this.pending.delete(i);});
  return gpu;
 }
 draw(matrix,origin,center=origin,{radius=GROUND_LOAD_RADIUS,fog=[600,900],visible=()=>true}={}){
  this.draws=0;const gl=this.gl,wanted=new Set(),seen=new Set(),draws=[],revision=terrainCraterRevision();
  if(this.soil.opacite||this.config.tailleRatio&&this.config.opacite)for(let i=0;i<this.marks.length;i++){
   const p=this.marks[i],key=[...p.slice(0,3),bombImpactCraterRadius(p)].join(',');if(seen.has(key))continue;seen.add(key);
   if(Math.hypot(p[0]-center[0],p[1]-center[1])>radius+this.radius(p))continue;wanted.add(i);if(!visible(this.bounds(p)))continue;
   const gpu=this.ensureGeometry(i,p,revision);if(gpu)draws.push({p,gpu});
  }
  for(const [i,gpu]of this.cache)if(!wanted.has(i)){this.release(gpu);this.cache.delete(i);}
  for(const [i,node]of this.pending)if(!wanted.has(i)){node.controller.abort();this.pending.delete(i);}
  // Rendering only reuses complete buffers; expensive sampling and uploads run
  // later under the background budget. Keep old traces until replacements exist.
  if(!this.program||!draws.length)return;
  gl.useProgram(this.program);gl.uniform2fv(this.uniforms.u_scorch,[this.config.opacite,this.config.douceurBord]);
  gl.uniform2fv(this.uniforms.u_soil,[this.soil.opacite,this.soil.tailleMotifMetres]);gl.uniform1f(this.uniforms.u_scorchRatio,this.config.tailleRatio);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.uniform1i(this.uniforms.u_soilTexture,0);
  gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.u_matrix,false,matrix);gl.uniform2fv(this.uniforms.u_origin,origin);gl.uniform2fv(this.uniforms.u_center,center);gl.uniform2fv(this.uniforms.u_fog,fog);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-1,-2);
  for(const {p,gpu}of draws){gl.uniform1f(this.uniforms.u_craterRatio,bombImpactCraterRadius(p)/p[2]);gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,0,gpu.count);this.draws++;}
  gl.bindVertexArray(null);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(0,0);
 }
 getState(){return {marks:this.marks.length,draws:this.draws,pending:this.pending.size,errors:this.errors,...this.config,terre:this.soil,textureBytes:this.textureBytes||0,gpuBytes:(this.textureBytes||0)+[...this.cache.values()].reduce((sum,g)=>sum+g.bytes,0)};}
 dispose(){const gl=this.gl;for(const node of this.pending.values())node.controller.abort();this.pending.clear();if(this.ownsPreparation)this.preparation.dispose();for(const g of this.cache.values())this.release(g);this.cache.clear();if(this.program)gl.deleteProgram(this.program);if(this.texture)gl.deleteTexture(this.texture);this.program=null;this.texture=null;this.textureBytes=0;}
}

export class MapBombScorches {
 constructor(){this.id='bomb-scorches';this.type='custom';this.renderingMode='3d';}
 onAdd(map,gl){this.map=map;this.gl=gl;this.scorches=new BombScorches(gl,{onReady:()=>map.triggerRepaint()});this.restore=()=>{this.scorches.dispose();this.scorches=new BombScorches(gl,{onReady:()=>map.triggerRepaint()});map.triggerRepaint();};map.getCanvas().addEventListener('webglcontextrestored',this.restore);}
 render(gl,options){
  if(!this.scorches.marks.length)return;const m=options.defaultProjectionData.mainMatrix,origin=maplibregl.MercatorCoordinate.fromLngLat(toLngLat([0,0])),scale=origin.meterInMercatorCoordinateUnits(),matrix=new Float32Array(16);
  for(let r=0;r<4;r++){matrix[r]=m[r]*scale;matrix[4+r]=-m[4+r]*scale;matrix[8+r]=m[8+r]*scale;matrix[12+r]=m[r]*origin.x+m[4+r]*origin.y+m[12+r];}
  const c=this.map.getCenter(),center=[(c.lng-CITY.origin[0])*CITY.scale[0],(c.lat-CITY.origin[1])*CITY.scale[1]];
  this.scorches.draw(matrix,[0,0],center,{radius:20000,fog:[20000,22000]});
 }
 onRemove(map){map.getCanvas().removeEventListener('webglcontextrestored',this.restore);this.scorches.dispose();}
}
