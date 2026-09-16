import {loadTerrain,terrainHeight,terrainMaxHeight,flightTerrainHeight,terrainState,drapeVertices,terrainTile,subdivideRoads} from './terrain.js';
import {SpatialIndex,nearbyCollision,movementBounds,WALK_COLLISION_RADIUS} from './walk-collision-index.js';
import {ATTILA_GROUND_GLSL} from './attila-ground-materials.js';
import {excludeReplacedWalkNodes} from './walk-replacements.js';
import {SceneSky,SKY_GLSL} from './scene-sky.js';
import {loadImagery} from './imagery.js';
import {getRoofMode} from './roof-mode.js';
import {applyRoofMode} from './roof-walk-mode.js';
import {LOAD_RADIUS,BUILDING_LOAD_RADIUS,GROUND_LOAD_RADIUS,ROAD_LOAD_RADIUS,FOG_START,FOG_END,nodeLoadRadius,FPS_FOV,inRange,nearDistance,segmentDistance,tileAt,tileBounds,viewProjection} from './walk-core.js';
import {collisionGeometry} from './walk-physics.js';
import {GROUND_GLSL} from './nerval-ground-materials.js';
import {HOUSE_GLSL} from './nerval-house-materials.js';
import {fetchWalkBuffer} from './walk-loading.js';
import {FPS_CONFIG} from './walk-config.js';
import {FPSHighwind} from './fps-highwind.js';
import {IDENTITY} from './highwind-math.js';
import {WalkPissEffect} from './walk-piss-effect.js';
import {HighwindShadow,HIGHWIND_SHADOW_GLSL} from './highwind-shadow.js';

const VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec3 a_color;
uniform mat4 u_matrix;
uniform mat4 u_model;
uniform vec2 u_player;
out vec3 v_position;out vec2 v_uv;out vec3 v_color;out float v_light;
void main(){vec4 world=u_model*vec4(a_position,1.);vec3 normal=normalize(mat3(u_model)*a_normal);v_position=world.xyz;v_uv=a_uv;v_color=a_color;v_light=.72+.28*abs(dot(normal,normalize(vec3(-.4,-.6,.8))));gl_Position=u_matrix*vec4(world.xy-u_player,world.z,1.);}`;
const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform bool u_ready;
uniform int u_kind;
uniform float u_load_radius;
uniform vec2 u_fog;
uniform vec2 u_visibility_center;
in vec3 v_position;in vec2 v_uv;in vec3 v_color;in float v_light;
out vec4 fragColor;
${SKY_GLSL}
${HIGHWIND_SHADOW_GLSL}
float grain(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
${GROUND_GLSL}
${HOUSE_GLSL}
${ATTILA_GROUND_GLSL}
void main(){
 float visibilityDistance=length(v_position.xy-u_visibility_center);if(visibilityDistance>u_load_radius)discard;
 vec3 c=v_color;float light=.80+.20*(v_light-.72)/.28;
 if(u_kind==0)c*=v_light;
 // Match the removed solid ground's original colour and lighting, on the
 // photo tile itself while it is waiting for its image.
 if(u_kind==1){if(u_ready){vec4 t=texture(u_texture,v_uv);if(t.a<.55)discard;c=t.rgb;}else c=vec3(.48,.51,.43)*v_light;}
 if(u_kind==2)c*=(.98+.03*grain(floor(v_position.xy*120.+v_position.z*83.)))*(.88+.12*smoothstep(0.,.5,v_position.z))*light;
 if(u_kind==3&&u_ready){vec4 t=texture(u_texture,v_uv);c=mix(c,t.rgb,t.a)*light;}
 if(u_kind==4||u_kind==5)c*=(u_ready?texture(u_texture,v_uv).rgb:(u_kind==4?vec3(.48,.42,.35):vec3(.32,.42,.22)))*light;
 if(u_kind>=6&&u_kind<=10){float fade=1.-smoothstep(.4,1.8,length(fwidth(v_position.xy))*30.);float n=mix(.5,grain(floor(v_position.xy*30.)),fade);c*=.975+.05*n;if(u_kind==8)c*=.94+.12*grain(floor(v_position.xy*4.));
  if(u_kind==9){vec2 t=vec2(v_uv.x+mod(floor(v_uv.y),2.)*.5,v_uv.y);vec2 cell=fract(t);float edge=min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y));float aa=max(fwidth(t.x),fwidth(t.y));float joint=1.-smoothstep(.018-aa,.035+aa,edge);c*=.92+.12*grain(floor(t));c=mix(c,c*.72,joint*.65);}
  if(u_kind==10){vec2 t=fract(v_uv);vec2 a=max(fwidth(v_uv),vec2(.035));vec2 edge=min(t,1.-t);float wire=1.-min(smoothstep(.025,.025+a.x,edge.x),smoothstep(.025,.025+a.y,edge.y));if(wire<.3)discard;}
  c*=light;}
 if(u_kind>=6&&u_kind<=9&&u_ready&&detailedGround(v_position))c=groundAlbedo(u_kind,v_position,v_uv,v_color)*light;
 if(u_kind==11)c*=u_ready?texture(u_texture,v_uv).rgb:vec3(.83,.80,.73);
 if(u_kind==12)c=houseGlazing(v_uv,v_color)*light;
 if(u_kind>=14&&u_kind<=16)c=(u_ready?attilaGround(u_kind,v_uv,v_color):v_color)*light;
 if(u_kind==17){vec4 t=texture(u_texture,v_uv);if(t.a<.5)discard;c*=t.rgb*v_light;}
 // Apply the projected model silhouette to the actual receiving surfaces.
 if(u_kind!=17)c*=1.-.42*highwindShadow(v_position);
 // The fog travels with the player/ship, including when its camera orbits or zooms.
 c=mix(c,sceneSkyColor(gl_FragCoord.y),smoothstep(u_fog.x,u_fog.y,visibilityDistance));fragColor=vec4(c,1.);
}`;

export class WalkRenderer {
 constructor(canvas){
  this.roofMode=getRoofMode();this.canvas=canvas;this.nodes=new Map();this.collisionIndex=new SpatialIndex();this.textures=new Map();this.ground=new Map();this.queue=[];this.active=0;this.textureQueue=[];this.textureActive=0;this.errors=0;this.disposed=false;
  this.gl=canvas.getContext('webgl2',{alpha:false,antialias:!matchMedia('(pointer:coarse)').matches,powerPreference:'high-performance'});
  if(!this.gl)throw Error('Le mode promenade nécessite WebGL 2.');
  this.abort=new AbortController();this.setup();this.highwind=new FPSHighwind(this,FPS_CONFIG.highwind);
 }
 setup(){
  const gl=this.gl,compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
  this.program=gl.createProgram();for(const [kind,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]){const s=compile(kind,source);gl.attachShader(this.program,s);gl.deleteShader(s);}gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['u_matrix','u_model','u_player','u_visibility_center','u_texture','u_ready','u_kind','u_load_radius','u_highwind_depth','u_highwind_shadow_ready','u_highwind_shadow_matrix','u_highwind_shadow_origin','u_highwind_shadow_texel','u_highwind_shadow_bias','u_fog','u_sky_horizon','u_sky_band'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  this.sky=new SceneSky(gl);
  this.highwindShadow=new HighwindShadow(gl);
  this.anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
  this.fallback=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.fallback);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 }
 async load(position,{onProgress=()=>{}}={}){
  onProgress({loaded:0,total:0});
  const options={signal:this.abort.signal,cache:'no-store',onRetry:()=>onProgress({loaded:0,total:0,retrying:true})};
  const [buffer,replacements]=await Promise.all([fetchWalkBuffer('./data/walk/index.json',options),fetchWalkBuffer('./data/custom-models.json',options)]);
  const decode=buffer=>JSON.parse(new TextDecoder().decode(buffer));
  await loadTerrain({signal:this.abort.signal,fetchBuffer:fetchWalkBuffer});
  if(this.disposed)return;
  if(this.highwind.pose&&!this.highwind.terrainPlaced){const p=this.highwind.pose.position;p.z+=terrainHeight(p.x,p.y);this.highwind.terrainPlaced=true;}
  if(this.highwind.enabled)flightTerrainHeight(...position);
  this.index=excludeReplacedWalkNodes(decode(buffer),decode(replacements));this.refresh(position);
  // Initial scene must be complete around the player before walking is enabled.
  await new Promise((resolve,reject)=>{const check=()=>{
   if(this.disposed)return reject(new Error('Chargement interrompu.'));
   const near=[...this.nodes.values()].filter(n=>nearDistance(n.bounds,position)<100);
   if(near.some(n=>n.failed))return reject(new Error('Une partie de la rue n’a pas pu charger. Réessayez.'));
   // Distant textures keep streaming after entry; only the nearby scene gates it.
   const needed=new Set(near.flatMap(n=>(n.ranges||[]).map(([id])=>this.material(id).texture)).filter(Boolean));
   const localTextures=[...this.textures.values()].filter(t=>needed.has(t.key)&&!t.key.startsWith('ign/'));
   const loaded=near.filter(n=>n.gpu).length;
   onProgress({loaded,total:near.length,retrying:near.some(n=>n.retrying)});
   if(loaded===near.length&&localTextures.every(t=>t.gpu||t.failed))return resolve();
   setTimeout(check,80);
  };check();});
 }
 geometry(vertices){const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);for(const [a,size,offset] of [[0,3,0],[1,3,12],[2,2,24],[3,3,32]]){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,44,offset);}gl.bindVertexArray(null);let bottom=Infinity,top=-Infinity;for(let i=2;i<vertices.length;i+=11){bottom=Math.min(bottom,vertices[i]);top=Math.max(top,vertices[i]);}return {vao,buffer,count:vertices.length/11,bytes:vertices.byteLength,zBounds:[bottom,top]};}
 drop(gpu){if(gpu){this.gl.deleteVertexArray(gpu.vao);this.gl.deleteBuffer(gpu.buffer);}}
 trim(position){this.position=[...position];for(const [key,node] of this.nodes)if(!inRange(node.bounds,position,nodeLoadRadius(node.file))){node.controller.abort();this.drop(node.gpu);this.nodes.delete(key);this.collisionIndex?.delete(key);}for(const [key,tile] of this.ground)if(nearDistance(tile.bounds,position)>=GROUND_LOAD_RADIUS){this.drop(tile.gpu);this.ground.delete(key);}}
 refresh(position){
  if(!this.index||this.disposed)return;this.position=[...position];
  this.highwind.refresh(position);
  const wanted=new Set();
  for(const record of this.index.nodes){const bounds=record.slice(1);if(!inRange(bounds,position,nodeLoadRadius(record[0])))continue;wanted.add(record[0]);if(!this.nodes.has(record[0])){const node={file:record[0],bounds,controller:new AbortController()};this.nodes.set(record[0],node);this.collisionIndex.set(record[0],bounds,node);}}
  for(const [key,node] of this.nodes)if(!wanted.has(key)){node.controller.abort();this.drop(node.gpu);this.nodes.delete(key);this.collisionIndex?.delete(key);}
  this.queue=[...this.nodes.values()].filter(n=>!n.gpu&&!n.loading&&!n.failed).sort((a,b)=>nearDistance(a.bounds,position)-nearDistance(b.bounds,position));this.pump();
  const [tx,ty]=tileAt(position,18),groundWanted=new Set(),tile=tileBounds(18,tx,ty),reach=Math.ceil(GROUND_LOAD_RADIUS/Math.min(tile[2]-tile[0],tile[3]-tile[1]))+1;
  for(let x=tx-reach;x<=tx+reach;x++)for(let y=ty-reach;y<=ty+reach;y++){
   const b=tileBounds(18,x,y);if(nearDistance(b,position)>=GROUND_LOAD_RADIUS)continue;const key=`ign/18/${x}/${y}`;groundWanted.add(key);
   if(!this.ground.has(key)){const v=terrainTile(b);this.ground.set(key,{bounds:b,gpu:this.geometry(v)});}
   // Boundary tiles fill the horizon without requesting photos beyond the
   // streaming radius. Their outer fragments are clipped by the shader.
   if(inRange(b,position,GROUND_LOAD_RADIUS))this.texture(key);
  }
  for(const [key,tile] of this.ground)if(!groundWanted.has(key)){this.drop(tile.gpu);this.ground.delete(key);}
  this.pruneTextures();
 }
 pump(){while(this.active<FPS_CONFIG.chargementsGeometrieSimultanes&&this.queue.length&&!this.disposed){const node=this.queue.shift();if(node.controller.signal.aborted)continue;node.loading=true;this.active++;
  fetchWalkBuffer('./data/walk/'+node.file,{signal:node.controller.signal,onRetry:()=>{node.retrying=true;this.retries=(this.retries||0)+1;}}).then(buffer=>{node.retrying=false;if(node.controller.signal.aborted||this.disposed)return;const length=new DataView(buffer).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));let vertices=new Float32Array(buffer,4+length);node.ranges=header.cityRoads?header.ranges.map(([id,first,count])=>[id+this.index.cityRoadMaterialBase,first,count]):applyRoofMode(header,vertices,this.index,this.roofMode);if(header.cityRoads){const road=subdivideRoads(vertices,node.ranges);vertices=road.vertices;node.ranges=road.ranges;}drapeVertices(vertices);node.collision=collisionGeometry(vertices);node.segments=node.collision.segments;node.gpu=this.geometry(vertices);if(!this.collisionIndex.entries.has(node.file))this.collisionIndex.set(node.file,node.bounds,node);for(const [material] of node.ranges)this.texture(material);
  }).catch(error=>{if(error.name!=='AbortError'){this.errors++;node.failed=true;console.warn('Promenade :',error.message);}}).finally(()=>{this.active--;node.loading=false;this.pump();});
 }}
 material(id){return typeof id==='string'?{kind:1,texture:id}:this.index.materials[id];}
 texture(id){
  const material=this.material(id),key=material.texture;if(!key)return null;
  let entry=this.textures.get(key);
  if(entry){
   if(!entry.failed||entry.attempts>=3||Date.now()<entry.retryAt)return entry;
   entry.failed=false;entry.timedOut=false;entry.controller=new AbortController();
  }else{entry={key,repeat:material.repeat,mirror:material.mirror,attempts:0,controller:new AbortController()};this.textures.set(key,entry);}
  if(key.startsWith('ign/'))this.textureQueue.push(entry);else this.textureQueue.unshift(entry);this.pumpTextures();return entry;
 }
 pumpTextures(){while(this.textureActive<FPS_CONFIG.chargementsTexturesSimultanes&&this.textureQueue.length&&!this.disposed){const entry=this.textureQueue.shift();if(entry.controller.signal.aborted)continue;this.textureActive++;entry.attempts++;const aerial=entry.key.startsWith('ign/'),url='./data/walk/'+entry.key;
  const timeout=setTimeout(()=>{entry.timedOut=true;entry.controller.abort();},10000);
  const request=aerial?loadImagery(...entry.key.split('/').slice(1).map(Number),{signal:entry.controller.signal}).then(({data})=>new Response(data,{headers:{'content-type':'image/jpeg'}})):fetch(url,{signal:entry.controller.signal});
  request.then(async r=>{if(!r.ok)throw Error(`Texture ${r.status}`);const bitmap=await createImageBitmap(await r.blob(),{imageOrientation:'none',premultiplyAlpha:'none'});if(this.disposed||entry.controller.signal.aborted){bitmap.close();return;}const gl=this.gl,t=gl.createTexture();entry.gpu=t;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);bitmap.close();gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,entry.mirror?gl.MIRRORED_REPEAT:entry.repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,entry.mirror?gl.MIRRORED_REPEAT:entry.repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);if(this.anisotropy)gl.texParameterf(gl.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }).catch(error=>{if(error.name!=='AbortError'||entry.timedOut){entry.failed=true;entry.retryAt=Date.now()+30000*entry.attempts;this.errors++;}}).finally(()=>{clearTimeout(timeout);this.textureActive--;this.pumpTextures();});
 }}
 pruneTextures(){const used=new Set([...this.ground.keys(),...this.highwind.textureKeys()]);for(const n of this.nodes.values())for(const [id] of n.ranges||[]){const key=this.material(id).texture;if(key)used.add(key);}for(const [key,t] of this.textures)if(!used.has(key)){t.controller.abort();if(t.gpu)this.gl.deleteTexture(t.gpu);this.textures.delete(key);}this.textureQueue=this.textureQueue.filter(t=>!t.controller.signal.aborted);}
 groundHeight(position){return terrainHeight(...position)+.022;}
 groundMaxHeight(bounds){return terrainMaxHeight(bounds)+.022;}
 flightGroundHeight(position){return flightTerrainHeight(position[0],position[1])+.022;}
 nearbyNodes(bounds){
  if(!this.collisionIndex){this.collisionIndex=new SpatialIndex();for(const [key,node] of this.nodes)this.collisionIndex.set(key,node.bounds,node);}
  return this.collisionIndex.query(bounds);
 }
 collisions(position){return this.collisionScene(position).segments;}
 collisionScene(position,delta=[0,0],radius=WALK_COLLISION_RADIUS){
  const bounds=movementBounds(position,delta,radius),nodes=this.nearbyNodes(bounds),scene={groundHeight:this.groundHeight,segments:[],surfaces:[]};
  for(const node of nodes)if(node.gpu){const local=nearbyCollision(node.collision,bounds);scene.segments.push(...local.segments);scene.surfaces.push(...local.surfaces);}
  const ship=this.highwind.playerCollisionScene(bounds);scene.segments.push(...ship.segments);scene.surfaces.push(...ship.surfaces);
  this.collisionStats={radius,travel:Math.hypot(...delta),nearbyNodes:nodes.length,segments:scene.segments.length,surfaces:scene.surfaces.length};
  return scene;
 }
 safeToMove(position,delta=[0,0]){return !this.nearbyNodes(movementBounds(position,delta,12)).some(n=>!n.gpu);}
 vehicleScene(position,radius){const nodes=[...this.nodes.values()].filter(n=>nearDistance(n.bounds,position)<radius);return {ready:nodes.every(n=>n.gpu),segments:nodes.flatMap(n=>n.collision?.segments||[]),surfaces:nodes.flatMap(n=>n.collision?.surfaces||[])};}
 draw(position,height,yaw,pitch,piss=null,visibilityPosition=position){
  if(this.disposed)return;const gl=this.gl,ratio=Math.min(devicePixelRatio||1,matchMedia('(pointer:coarse)').matches?1.5:2),width=Math.round(this.canvas.clientWidth*ratio),heightPx=Math.round(this.canvas.clientHeight*ratio);if(this.canvas.width!==width||this.canvas.height!==heightPx){this.canvas.width=width;this.canvas.height=heightPx;}this.highwindShadow.render(this.highwind,this);gl.viewport(0,0,width,heightPx);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);this.sky.draw(heightPx,pitch,FPS_FOV,yaw);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.useProgram(this.program);this.sky.apply(this.uniforms,heightPx,pitch);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(this.uniforms.u_texture,0);gl.uniform2f(this.uniforms.u_player,...position);gl.uniform2f(this.uniforms.u_visibility_center,...visibilityPosition);
  // Project nearby XY coordinates to avoid cancellation several kilometres
  // from the city origin. World positions still drive materials and culling.
  const centerOffset=Math.hypot(position[0]-visibilityPosition[0],position[1]-visibilityPosition[1]);
  const projection=viewProjection([0,0,height],yaw,pitch,width/heightPx,undefined,centerOffset);
  gl.uniformMatrix4fv(this.uniforms.u_matrix,false,projection);
  gl.uniform2f(this.uniforms.u_fog,FOG_START,FOG_END);
  this.highwindShadow.apply(this.uniforms);
  const draw=(gpu,id,first=0,count=gpu.count,model=IDENTITY,groundFallback=false,radius=LOAD_RADIUS)=>{const material=this.material(id),t=groundFallback?this.textures.get(material.texture):this.texture(id);if(material.texture&&!t?.gpu&&!groundFallback)return false;gl.uniform1f(this.uniforms.u_load_radius,radius);gl.uniformMatrix4fv(this.uniforms.u_model,false,model);gl.uniform1i(this.uniforms.u_kind,material.kind);gl.uniform1i(this.uniforms.u_ready,t?.gpu?1:0);gl.bindTexture(gl.TEXTURE_2D,t?.gpu||this.fallback);gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,first,count);return true;};
  // Separate the aerial underlay from roads even when depth precision drops
  // at altitude. Bias only the photo pass, preserving mesh heights, collisions
  // and normal occlusion between roads, buildings and the Highwind.
  gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,4);
  for(const [id,tile] of this.ground)if(nearDistance(tile.bounds,visibilityPosition)<GROUND_LOAD_RADIUS)draw(tile.gpu,id,0,tile.gpu.count,IDENTITY,true,GROUND_LOAD_RADIUS);
  gl.disable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(0,0);
  // Submit every loaded object in range, regardless of the camera direction.
  let draws=0,visible=0;
  for(const node of this.nodes.values())if(node.gpu&&inRange(node.bounds,visibilityPosition,nodeLoadRadius(node.file))){
   // Generic catalogue facades already provide the complete exterior wall.
   // Keep the original mesh for collisions, but never draw its solid backing.
   const hasFacades=node.ranges.some(([id])=>typeof id==='number'&&id>=this.index.facadeBase&&id<this.index.roofBase);
   visible++;for(const [material,first,count] of node.ranges){if(hasFacades&&material===this.index.facadeBase-1)continue;if(draw(node.gpu,material,first,count,IDENTITY,false,nodeLoadRadius(node.file)))draws++;}
  }
  this.draws=draws+this.highwind.draw(draw);this.visibleAssets=visible;this.culledAssets=0;gl.bindVertexArray(null);
  if(piss){this.pissEffect??=new WalkPissEffect(gl);this.pissEffect.draw(piss,this.collisionScene(position,[0,0],3),projection,height);}
 }
 getState(){return {collisions:this.collisionStats,terrain:terrainState(),sky:this.sky.getState(),highwind:{...this.highwind.getState(),shadow:this.highwindShadow.getState()},roofs:this.roofMode,radius:LOAD_RADIUS,radii:{buildings:BUILDING_LOAD_RADIUS,ground:GROUND_LOAD_RADIUS,roads:ROAD_LOAD_RADIUS},fog:{start:FOG_START,end:FOG_END},frustumCulling:false,visibleAssets:this.visibleAssets||0,culledAssets:0,loadedAssets:[...this.nodes.values()].filter(n=>n.gpu).length,loading:this.active+this.queue.length,gpuBytes:[...this.nodes.values(),...this.ground.values()].reduce((n,t)=>n+(t.gpu?.bytes||0),0)+(this.highwind.residency?.data?.gpu?.bytes||0)+this.highwindShadow.getState().gpuBytes,draws:this.draws||0,errors:this.errors,outsideRadius:[...this.nodes.values()].filter(n=>!inRange(n.bounds,this.position,nodeLoadRadius(n.file))).length};}
 dispose(){this.disposed=true;this.abort.abort();this.pissEffect?.dispose();this.highwindShadow.dispose();this.highwind.dispose();for(const node of this.nodes.values()){node.controller.abort();this.drop(node.gpu);}for(const t of this.textures.values()){t.controller.abort();if(t.gpu)this.gl.deleteTexture(t.gpu);}for(const tile of this.ground.values())this.drop(tile.gpu);this.gl.deleteTexture(this.fallback);this.gl.deleteProgram(this.program);this.sky.dispose();this.nodes.clear();this.collisionIndex?.clear();this.textures.clear();this.ground.clear();}
}
