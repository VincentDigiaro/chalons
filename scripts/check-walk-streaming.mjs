// Exercise the actual asynchronous loader against local assets; no browser or network.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {SPAWN,EYE_HEIGHT,LOAD_RADIUS,GROUND_LOAD_RADIUS,nodeLoadRadius,inRange,nearDistance,farDistance,tileAt,tileBounds} from '../dist/walk-core.js';
import {localImageryURL as imageryURL} from '../dist/imagery.js';

globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
const allocations=new Set(),drawCalls=[],uniforms={},enabled=new Set();let handle=0,constant=1,boundVAO,depthBias=[0,0];
const gl=new Proxy({}, {get(target,key){
 if(key in target)return target[key];
 if(/^[A-Z_0-9]+$/.test(key))return target[key]=constant++;
 if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
 if(key==='getExtension')return ()=>null;
 if(key==='getUniformLocation')return (program,name)=>name;
 if(key==='uniform1i')return (name,value)=>{uniforms[name]=value;};
 if(key==='bindVertexArray')return vao=>{boundVAO=vao;};
 if(key==='enable')return cap=>enabled.add(cap);
 if(key==='disable')return cap=>enabled.delete(cap);
 if(key==='polygonOffset')return (factor,units)=>{depthBias=[factor,units];};
 if(key==='drawArrays')return (mode,first,count)=>drawCalls.push({vao:boundVAO,first,count,kind:uniforms.u_kind,ready:uniforms.u_ready,bias:enabled.has(gl.POLYGON_OFFSET_FILL)?depthBias:[0,0]});
 if(key.startsWith('create'))return ()=>{const id=++handle;allocations.add(id);return id;};
 if(key.startsWith('delete'))return id=>allocations.delete(id);
 return ()=>{};
}});
const index=JSON.parse(await fs.readFile('dist/data/walk/index.json','utf8')),bounds=new Map(index.nodes.map(n=>[n[0],n.slice(1)]));
let position=[...SPAWN],requests=0,remoteRequests=0,missingImages=0,recoveredURL,indexAttempts=0,failedBuilding,buildingAttempts=0;const notices=[];
globalThis.fetch=async(url,{signal}={})=>{
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(/^https?:/.test(String(url))){remoteRequests++;return new Response('',{status:503});}
 const relative=String(url).replace('./','');
 if(relative==='data/walk/index.json'&&++indexAttempts===1)return new Response('',{status:503});
 // Even missing local images must not put a warning over the promenade.
 if(relative.startsWith('data/imagery/ign/')){if(String(url)===recoveredURL)return new Response(await fs.readFile('.cache/ign/centre-sample.jpg'),{headers:{'content-type':'image/jpeg'}});missingImages++;return new Response('',{status:503});}
 if(relative.startsWith('data/walk/')&&relative.endsWith('.bin')){const file=relative.slice('data/walk/'.length);assert(inRange(bounds.get(file),position,nodeLoadRadius(file)),'An asset was requested beyond its category loading radius');requests++;failedBuilding??=relative;if(relative===failedBuilding&&++buildingAttempts===1)throw TypeError('Failed to fetch');}
 const buffer=await fs.readFile(path.join('dist',relative));if(signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(buffer);
};
globalThis.createImageBitmap=async()=>({width:512,height:256,close(){}});
const renderer=new WalkRenderer({clientWidth:800,clientHeight:600,getContext:()=>gl},{onStatus:message=>notices.push(message)});
await renderer.load(position);
assert.equal(indexAttempts,2);assert.equal(buildingAttempts,2);assert(renderer.nodes.get(failedBuilding.slice('data/walk/'.length)).gpu,'The failed nearby file must recover before entry');
renderer.draw(position,EYE_HEIGHT+.022,0,0);assert(renderer.draws>0);assert.equal(renderer.getState().outsideRadius,0);
const initialAssets=renderer.getState().loadedAssets;assert(initialAssets>100);
function renderedBuildings(){return [...renderer.nodes.values()].filter(n=>n.gpu&&drawCalls.some(c=>c.vao===n.gpu.vao)).map(n=>n.file).sort();}
drawCalls.length=0;renderer.draw(position,EYE_HEIGHT+.022,0,0);
const forward=renderer.getState(),forwardFiles=renderedBuildings(),forwardCalls=drawCalls.length;
assert.equal(renderer.base,undefined,'The removed overlapping background plane must stay removed');
const groundVAOs=new Set([...renderer.ground.values()].map(t=>t.gpu.vao));
const placeholders=drawCalls.filter(c=>c.ready===0&&c.kind===1);
assert(placeholders.length>0,'Missing ground photos must have a visible placeholder');
assert(placeholders.every(c=>groundVAOs.has(c.vao)),'Only ground tiles may use this placeholder');
assert(!drawCalls.some(c=>c.ready===0&&c.kind===11),'Keep the separate missing facade behaviour');
assert(placeholders.every(c=>c.bias[0]===1&&c.bias[1]===4),'Fallback ground must stay behind roads');
assert(placeholders.every(c=>drawCalls.filter(d=>d.vao===c.vao).length===1),'Only one draw per ground tile');
const hasFacades=n=>n.ranges.some(([id])=>typeof id==='number'&&id>=index.facadeBase&&id<index.roofBase);
const backedNodes=[...renderer.nodes.values()].filter(n=>n.gpu&&hasFacades(n)&&n.ranges.some(([id])=>id===index.facadeBase-1));
assert(backedNodes.length>0);
for(const n of backedNodes){
 const backing=n.ranges.find(([id])=>id===index.facadeBase-1);assert(backing);
 assert(!drawCalls.some(c=>c.vao===n.gpu.vao&&c.first===backing[1]),'A textured building still draws its solid wall backing');
 assert(n.collision.segments.length>0,'Hiding the backing must preserve building collisions');
}
assert(drawCalls.some(c=>c.kind===2),'Detailed solid surfaces such as real walls and kerbs must remain visible');
assert.equal(forward.visibleAssets,forwardFiles.length);assert.equal(forward.culledAssets,0);
assert.equal(forward.visibleAssets+forward.culledAssets,forward.loadedAssets);
assert.equal(forward.frustumCulling,false);
const beforeTurn=[...renderer.nodes.keys()],collisionBefore=renderer.collisionScene(position);
drawCalls.length=0;renderer.draw(position,EYE_HEIGHT+.022,Math.PI,0);
const backwardFiles=renderedBuildings();assert(backwardFiles.length>0);
assert.deepEqual(backwardFiles,forwardFiles,'Turning must keep every loaded mesh in the render submissions');
assert.deepEqual([...renderer.nodes.keys()],beforeTurn,'Turning must not unload buildings');
assert.deepEqual(renderer.collisionScene(position),collisionBefore,'Offscreen collision geometry must remain available');
renderer.canvas.clientWidth=390;renderer.canvas.clientHeight=844;
drawCalls.length=0;renderer.draw(position,EYE_HEIGHT+.022,0,0);assert.deepEqual(renderedBuildings(),forwardFiles,'Portrait must retain all loaded buildings');
renderer.draw(position,25,0,-.8);assert(renderer.getState().visibleAssets>0,'Flight camera should still render buildings below it');
renderer.canvas.clientWidth=800;renderer.canvas.clientHeight=600;
// Ground tile coverage must grow with the radius, including the new outer ring.
const [tx,ty]=tileAt(position,18);let expectedGround=0,outerGround=0,boundaryGround=0;
const tile=tileBounds(18,tx,ty),reach=Math.ceil(GROUND_LOAD_RADIUS/Math.min(tile[2]-tile[0],tile[3]-tile[1]))+1;
for(let x=tx-reach;x<=tx+reach;x++)for(let y=ty-reach;y<=ty+reach;y++)if(nearDistance(tileBounds(18,x,y),position)<GROUND_LOAD_RADIUS){
 const key=`ign/18/${x}/${y}`,bounds=tileBounds(18,x,y);
 expectedGround++;assert(renderer.ground.has(key));if(farDistance(bounds,position)>300)outerGround++;
 if(!inRange(bounds,position,GROUND_LOAD_RADIUS)){boundaryGround++;assert(!renderer.textures.has(key),'No photo requests beyond the streaming radius');}
}
assert.equal(renderer.ground.size,expectedGround);assert(outerGround>0);assert(boundaryGround>0);
renderer.trim(position);assert.equal(renderer.ground.size,expectedGround,'Boundary placeholders survive between refreshes');
await new Promise(resolve=>setTimeout(resolve,30));
const retryImage=[...renderer.textures.values()].find(t=>t.key.startsWith('ign/')&&t.failed);assert(retryImage,'The missing-image scenario was not exercised');
const retryTile=renderer.ground.get(retryImage.key),retryVAO=retryTile.gpu.vao,retryPosition=[(retryTile.bounds[0]+retryTile.bounds[2])/2,(retryTile.bounds[1]+retryTile.bounds[3])/2];
drawCalls.length=0;renderer.draw(retryPosition,80,0,-Math.PI/2);
assert.equal(drawCalls.filter(c=>c.vao===retryVAO&&c.ready===0).length,1,'Failed photo retains one placeholder');
recoveredURL=imageryURL(...retryImage.key.split('/').slice(1).map(Number));retryImage.retryAt=0;
renderer.texture(retryImage.key);await new Promise(resolve=>setTimeout(resolve,50));
assert(retryImage.gpu,'An image must recover silently when its local file becomes available');assert.equal(retryImage.attempts,2);
drawCalls.length=0;renderer.draw(retryPosition,80,0,-Math.PI/2);
const recoveredDraws=drawCalls.filter(c=>c.vao===retryVAO);assert.equal(recoveredDraws.length,1);assert.equal(recoveredDraws[0].ready,1);
assert.deepEqual(recoveredDraws[0].bias,[1,4],'The photo uses the same geometry and depth bias as its placeholder');
position=[SPAWN[0]+500,SPAWN[1]];
const evictedHandles=[...renderer.nodes.values()].filter(n=>n.gpu&&!inRange(n.bounds,position,nodeLoadRadius(n.file))).flatMap(n=>[n.gpu.vao,n.gpu.buffer]);
renderer.trim(position);assert(evictedHandles.every(h=>!allocations.has(h)),'Moving away must release the old GPU resources');renderer.refresh(position);
assert.equal(renderer.collisionIndex.entries.size,renderer.nodes.size,'Collision indexing follows node residency');
assert([...renderer.nodes.values()].every(n=>inRange(n.bounds,position,nodeLoadRadius(n.file))),'A distant asset was retained');
await new Promise(resolve=>setTimeout(resolve,500));renderer.draw(position,EYE_HEIGHT+.022,0,0);
assert.equal(renderer.getState().outsideRadius,0);
renderer.dispose();await new Promise(resolve=>setTimeout(resolve,50));assert.equal(allocations.size,0,'GPU objects leaked after leaving pedestrian mode');
assert.equal(renderer.collisionIndex.entries.size,0);assert.equal(renderer.collisionIndex.cells.size,0);
assert(missingImages>0);assert(remoteRequests>0);assert.deepEqual(notices,[]);console.log(JSON.stringify({streaming:'passed',initialAssets,buildingRequests:requests,radius:LOAD_RADIUS,visibleAssets:forward.visibleAssets,culledAssets:forward.culledAssets,forwardDrawCalls:forwardCalls,outerGroundTiles:outerGround,outsideRequests:0,ignOutage:'local fallback attempted',missingImages:'playable without banners',silentRecovery:true,gpuResourcesAfterExit:allocations.size}));
