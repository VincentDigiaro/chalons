import {cityDataURL} from './city-config.js';
import {mapBombDamage} from './bomb-map-damage.js';
import {mapBuildingsVisible} from './map-view.js';
import {getRoofMode} from './roof-mode.js';
import {toLocal,toLngLat} from './walk-core.js';
import {overlaps} from './walk-collision-index.js';
import {WalkPreparation,prepareWalkGeometry,prepareBombGeometry} from './walk-preparation.js';
import {WalkRenderer} from './walk-renderer.js';
import {FPS_CONFIG} from './walk-config.js';
import {makeProgram} from './bomb-scorches.js';
import {bombGround,BOMB_CUT_GLSL} from './bomb-building-cut.js';
import {HOUSE_GLSL} from './nerval-house-materials.js';

const VS=`#version 300 es
layout(location=0) in vec3 a_position;layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;layout(location=3) in vec3 a_color;
uniform mat4 u_matrix;
out vec3 v_position;out vec2 v_uv;out vec3 v_color;out float v_light;
void main(){v_position=a_position;v_uv=a_uv;v_color=a_color;v_light=.72+.28*abs(dot(normalize(a_normal),normalize(vec3(-.4,-.6,.8))));gl_Position=u_matrix*vec4(a_position,1.);}`;
const FS=`#version 300 es
precision highp float;
uniform sampler2D u_texture;uniform int u_kind;uniform bool u_ready;uniform bool u_photos;
in vec3 v_position;in vec2 v_uv;in vec3 v_color;in float v_light;out vec4 fragColor;
float grain(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
${HOUSE_GLSL}
void main(){vec3 c=v_color;float light=.80+.20*(v_light-.72)/.28;
 if(u_kind==0)c*=v_light;
 if(u_kind==1)c=u_ready&&u_photos?texture(u_texture,v_uv).rgb:vec3(.48,.51,.43)*light;
 if(u_kind==2)c*=(.98+.03*grain(floor(v_position.xy*120.+v_position.z*83.)))*light;
 if(u_kind==3){if(!u_photos)discard;if(u_ready){vec4 t=texture(u_texture,v_uv);c=mix(c,t.rgb,t.a);}c*=light;}
 if(u_kind==4||u_kind==5)c*=(u_ready&&u_photos?texture(u_texture,v_uv).rgb:(u_kind==4?vec3(.39,.35,.29):vec3(.32,.42,.22)))*light;
 if(u_kind==10){vec2 t=fract(v_uv),a=max(fwidth(v_uv),vec2(.035)),edge=min(t,1.-t);float wire=1.-min(smoothstep(.025,.025+a.x,edge.x),smoothstep(.025,.025+a.y,edge.y));if(wire<.3)discard;c*=light;}
 if(u_kind==11)c*=(u_ready&&u_photos?texture(u_texture,v_uv).rgb:vec3(.83,.80,.73))*light;
 if(u_kind==12)c=houseGlazing(v_uv,v_color)*light;
 ${BOMB_CUT_GLSL}
 fragColor=vec4(c,1.);}`;

// The original map layers hide affected assets. Render the surviving walk
// meshes here, so map and gameplay replay exactly the same cuts and UVs.
export class MapBombFragments {
 constructor(){this.id='bomb-building-fragments';this.type='custom';this.renderingMode='3d';this.visible=true;this.photos=true;}
 onAdd(map,gl){
  this.map=map;this.gl=gl;this.index=mapBombDamage.index;this.nodes=new Map();this.textures=new Map();this.textureQueue=[];this.textureActive=0;this.errors=0;this.active=0;this.disposed=false;
  this.preparation=new WalkPreparation({budget:()=>FPS_CONFIG.preparation.budgetParImageMs});this.setup();
  this.move=()=>this.refresh();map.on('moveend',this.move);
  this.restore=()=>{for(const node of this.nodes.values())node.controller.abort();this.nodes.clear();for(const t of this.textures.values())t.controller.abort();this.textures.clear();this.textureQueue=[];this.setup();this.refresh();};
  map.getCanvas().addEventListener('webglcontextrestored',this.restore);this.refresh();
 }
 setup(){
  const gl=this.gl;this.program=makeProgram(gl,VS,FS);this.uniforms=Object.fromEntries(['u_matrix','u_texture','u_kind','u_ready','u_photos'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  this.anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');this.fallback=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.fallback);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 }
 refresh(){
  if(this.disposed||!this.index)return;
  const b=this.map.getBounds(),sw=toLocal([b.getWest(),b.getSouth()]),ne=toLocal([b.getEast(),b.getNorth()]),bounds=[...sw,...ne];
  const wanted=new Map((this.visible?mapBombDamage.fragments:[]).filter(n=>overlaps(n.bounds,bounds)).map(n=>[n.file,n]));
  for(const [file,n] of this.nodes)if(!wanted.has(file)){n.controller.abort();this.drop(n.gpu);this.nodes.delete(file);}
  for(const [file,n] of wanted)if(!this.nodes.has(file))this.nodes.set(file,{...n,controller:new AbortController()});
  this.pump();
  const used=new Set();for(const n of this.nodes.values())for(const [id] of n.ranges||[]){const key=this.material(id).texture;if(key)used.add(key);}
  for(const [key,t] of this.textures)if(!used.has(key)){t.controller.abort();if(t.gpu)this.gl.deleteTexture(t.gpu);this.textures.delete(key);}
 }
 pump(){
  if(this.disposed)return;
  for(const node of this.nodes.values()){
   if(this.active>=FPS_CONFIG.chargementsGeometrieSimultanes)break;
   if(node.loading||node.gpu||node.failed)continue;node.loading=true;this.active++;
   fetch(cityDataURL('walk/'+node.file),{signal:node.controller.signal}).then(r=>{if(!r.ok)throw Error('Fragment bâtiment HTTP '+r.status);return r.arrayBuffer();}).then(buffer=>this.preparation.add(node,this.prepare(node,buffer))).catch(error=>{if(error.name!=='AbortError'){node.failed=true;this.errors++;console.error(error);}}).finally(()=>{node.loading=false;this.active--;this.pump();this.map.triggerRepaint();});
  }
 }
 *prepare(node,buffer){
  const source=yield* prepareWalkGeometry(buffer,this.index,getRoofMode());
  const cut=yield* prepareBombGeometry(source,node,mapBombDamage.craters,this.index);
  const hasFacades=cut.ranges.some(([id])=>typeof id==='number'&&id>=this.index.facadeBase&&id<this.index.roofBase);
  node.ranges=cut.ranges.filter(([id])=>!bombGround(id,this.index)&&!(hasFacades&&id===this.index.facadeBase-1));
  node.gpu=yield* this.uploadGeometry(cut.vertices);for(const [id] of node.ranges)this.texture(id);
 }
 setVisible(buildings,photos){this.visible=buildings;this.photos=photos;this.refresh();this.map?.triggerRepaint();}
 render(gl,options){
  if(this.disposed||!this.visible||!mapBuildingsVisible(this.map))return;
  const origin=maplibregl.MercatorCoordinate.fromLngLat(toLngLat([0,0])),k=origin.meterInMercatorCoordinateUnits(),m=options.defaultProjectionData.mainMatrix,o=new Float32Array(16);
  for(let r=0;r<4;r++){o[r]=m[r]*k;o[4+r]=-m[4+r]*k;o[8+r]=m[8+r]*k;o[12+r]=m[r]*origin.x+m[4+r]*origin.y+m[12+r];}
  gl.useProgram(this.program);gl.uniformMatrix4fv(this.uniforms.u_matrix,false,o);gl.uniform1i(this.uniforms.u_texture,0);gl.uniform1i(this.uniforms.u_photos,this.photos?1:0);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  for(const node of this.nodes.values())if(node.gpu){gl.bindVertexArray(node.gpu.vao);for(const [id,first,count] of node.ranges){const material=this.material(id),texture=this.texture(id);gl.uniform1i(this.uniforms.u_kind,material.kind);gl.uniform1i(this.uniforms.u_ready,texture?.gpu?1:0);gl.bindTexture(gl.TEXTURE_2D,texture?.gpu||this.fallback);gl.drawArrays(gl.TRIANGLES,first,count);}}
  gl.bindVertexArray(null);
  if(this.textureActive||this.textureQueue.length||this.preparation.pending)this.map.triggerRepaint();
 }
 getState(){return {fragments:this.nodes?.size||0,loaded:[...(this.nodes?.values()||[])].filter(n=>n.gpu).length,errors:this.errors||0};}
 onRemove(map,gl){this.disposed=true;map.off('moveend',this.move);map.getCanvas().removeEventListener('webglcontextrestored',this.restore);this.preparation.dispose();for(const n of this.nodes.values()){n.controller.abort();this.drop(n.gpu);}for(const t of this.textures.values()){t.controller.abort();if(t.gpu)gl.deleteTexture(t.gpu);}gl.deleteTexture(this.fallback);gl.deleteProgram(this.program);}
}
// Share texture loading and budgeted uploads with gameplay, including city URLs,
// mirrored materials and GPU cleanup on cancellation.
for(const name of ['drop','material','texture','pumpTextures','uploadTexture','uploadGeometry'])MapBombFragments.prototype[name]=WalkRenderer.prototype[name];
