import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {cutBombMesh,bombCutPlane,BOMB_CUT_MATERIAL,bombGround,buildingCutShade} from '../dist/bomb-building-cut.js';
import {prepareWalkGeometry,prepareBombGeometry,WalkPreparation} from '../dist/walk-preparation.js';
import {collisionGeometry,surfaceHeights} from '../dist/walk-physics.js';
import {blocked} from '../dist/walk-core.js';
import {nearbyCollision,movementBounds} from '../dist/walk-collision-index.js';
import {HighwindBombs} from '../dist/highwind-bombs.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {MapBombFragments} from '../dist/bomb-map-fragments.js';
import {mapBombDamage,loadMapBombDamage} from '../dist/bomb-map-damage.js';
import {saveScorches} from '../dist/bomb-scorches.js';
import {loadTerrain,terrainBaseHeight} from '../dist/terrain.js';
import {CITY,cityDataURL} from '../dist/city-config.js';
import {boxMesh,combineMeshes,drain} from './bomb-cut-fixtures.mjs';

const index={materials:[{kind:0},{kind:6}],facadeBase:20,roofBase:40},impact=[0,0,100,100],bounds=[80,-10,120,10],source=boxMesh(...bounds),original=source.vertices.slice();
const cut=(mesh,b=bounds,hits=[impact],i=index)=>drain(cutBombMesh(mesh,b,hits,i));
const signed=(v,p)=>(v[0]-p.x)*p.nx+(v[1]-p.y)*p.ny+(v[2]-p.z)*p.nz;
const xAt=(p,y,z)=>p.x-((y-p.y)*p.ny+(z-p.z)*p.nz)/p.nx;
const initialPlane=bombCutPlane(bounds,impact),wall=xAt(initialPlane,0,.5),roof=xAt(initialPlane,0,15);
const result=cut(source),cap=result.ranges.filter(([id])=>id===BOMB_CUT_MATERIAL);
assert(cap.length,'The exposed section is closed');const shades=new Set(Array.from({length:32},(_,i)=>buildingCutShade([80+i,-10,120+i,10])));assert(shades.size>28);assert([...shades].every(n=>n>=.08&&n<=.32));assert.deepEqual(source.vertices,original,'No edits to source geometry');
for(let at=0;at<result.vertices.length;at+=11)assert(signed(result.vertices.subarray(at,at+3),initialPlane)>=-.002,'Only the exterior half remains');
let capArea=0;
for(const [,first,count] of cap)for(let i=first*11;i<(first+count)*11;i+=33){
 const v=[0,11,22].map(j=>result.vertices.subarray(i+j,i+j+11));for(const p of v){assert(Math.abs(signed(p,initialPlane))<1e-4);for(const [k,n] of [initialPlane.nx,initialPlane.ny,initialPlane.nz].entries())assert(Math.abs(p[k+3]+n/Math.hypot(1,initialPlane.nz))<1e-6);assert(Math.abs(p[8]-buildingCutShade(bounds))<1e-6);assert.equal(p[8],p[9]);assert.equal(p[9],p[10]);}
 const a=v[1].map((n,k)=>n-v[0][k]),b=v[2].map((n,k)=>n-v[0][k]);capArea+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;
}
assert(Math.abs(capArea-300*Math.hypot(1,initialPlane.nz)/Math.abs(initialPlane.nx))<1e-3,'Inclined section is closed without overlapping duplicate faces');
const collision=collisionGeometry(result.vertices);assert(!blocked([90,-10],collision.segments,0),'Destroyed wall is traversable');assert(blocked([wall,0],collision.segments,0),'New wall has collision');assert(blocked([120,0],collision.segments,0),'Exterior wall survives');assert.equal(surfaceHeights([90,0],collision.surfaces).length,0);assert(surfaceHeights([roof+5,0],collision.surfaces).some(z=>z===15));
for(const z of [0,5,10]){const p=[xAt(initialPlane,0,z+.5),0],local=nearbyCollision(collision,movementBounds(p));assert(blocked(p,local.segments,z),'Spatial index retains the leaning wall at each height');assert(!blocked([p[0]-2,0],local.segments,z),'No phantom vertical wall in the destroyed space');}
assert(!blocked([wall,0],collision.segments,10),'A wall at ground height must not block empty space higher up');
const front=result.ranges.filter(([id])=>id!==BOMB_CUT_MATERIAL).flatMap(([,first,count])=>Array.from({length:count},(_,k)=>result.vertices.subarray((first+k)*11,(first+k+1)*11))).filter(p=>Math.abs(signed(p,initialPlane))<1e-4);
assert(front.length);for(const p of front)assert(Math.abs(p[6]-(p[0]-80)/40)<1e-5,'Texture UVs are interpolated at the cut');
assert.equal(cut(source,bounds,[[0,0,100,0]]),source);assert.equal(cut(source,bounds,[[1000,0,100,100]]),source);
assert.equal(cut(boxMesh(10,10,20,20),[10,10,20,20]).vertices.length,0);
const tangent=boxMesh(100,-10,120,10);assert.equal(cut(tangent,[100,-10,120,10]),tangent,'A tangent touch destroys nothing');
const road=boxMesh(0,0,5,5,{material:1});assert.deepEqual(cut(road,[0,0,5,5]).vertices,road.vertices,'Ground remains intact');
const upper=boxMesh(80,-10,120,10,{bottom:4,top:14,slope:.25}),upperCut=cut(upper);
for(const [id,first,count] of upperCut.ranges)if(id===BOMB_CUT_MATERIAL){const zs=Array.from({length:count},(_,j)=>upperCut.vertices[(first+j)*11+2]),roofZ=y=>(14+.25*(xAt(initialPlane,y,0)-80))/(1+.25*initialPlane.nz/initialPlane.nx);assert.equal(Math.min(...zs),4);assert(Math.abs(Math.max(...zs)-Math.max(roofZ(-10),roofZ(10)))<1e-4);}
const islands=combineMeshes(boxMesh(80,-30,120,-10),boxMesh(80,10,120,30)),islandCut=cut(islands,[80,-30,120,30]);
for(const [id,first,count] of islandCut.ranges)if(id===BOMB_CUT_MATERIAL)for(let at=first*11;at<(first+count)*11;at+=33){const ys=[0,11,22].map(j=>islandCut.vertices[at+j+1]);assert(ys.every(y=>y<=-10)||ys.every(y=>y>=10),'Do not seal the space between two buildings / courtyard arms');}
const diagonalBounds=[55,55,85,85],diagonalCut=cut(boxMesh(...diagonalBounds),diagonalBounds),plane=bombCutPlane(diagonalBounds,impact);assert(Math.abs(Math.atan2(plane.ny,plane.nx)-Math.PI/4)<=Math.PI/6);
for(const [id,first,count] of diagonalCut.ranges)if(id===BOMB_CUT_MATERIAL)for(let at=first*11;at<(first+count)*11;at+=11)assert(Math.abs(signed(diagonalCut.vertices.subarray(at,at+3),plane))<1e-4);
const second=[200,0,90,90],twice=cut(source,bounds,[impact,second]),incremental=cut(result,bounds,[second]);assert.deepEqual(twice,incremental,'Replayed and successive impacts produce the same fragments');
const twiceCollision=collisionGeometry(twice.vertices);assert(blocked([wall,0],twiceCollision.segments));assert(blocked([xAt(bombCutPlane(bounds,second),0,.5),0],twiceCollision.segments));assert(!blocked([120,0],twiceCollision.segments));
assert.deepEqual(cut(result),result,'The same explosion cannot erode the building twice');
// Independent variations, bounded amplitudes, and a stable seed regardless of
// mesh rebuilds, visual blast size or cumulative crater depth.
const variations=[],triangleCounts=[];
for(let i=0;i<128;i++){
 const angle=i*2*Math.PI/128,cx=Math.cos(angle)*100,cy=Math.sin(angle)*100,b=[cx-9,cy-7,cx+9,cy+7],p=bombCutPlane(b,impact),radial=[cx/100,cy/100],yaw=Math.atan2(radial[0]*p.ny-radial[1]*p.nx,radial[0]*p.nx+radial[1]*p.ny),offset=(p.x-cx)*p.nx+(p.y-cy)*p.ny;
 assert(Math.abs(yaw)<=Math.PI/6&&Math.abs(Math.atan(p.nz))<=Math.PI/10);assert(Math.abs(offset)<=Math.min(12,10,(18*Math.abs(p.nx)+14*Math.abs(p.ny))*.2)+1e-6);
 assert.deepEqual(p,bombCutPlane([...b],[0,0,500,100,77]));
 const original=boxMesh(...b),fragment=cut(original,b),repeated=cut(fragment,b);assert.deepEqual(repeated,fragment,'Repeating an impact cannot reroll or erode a tilted cut');
 assert(fragment.ranges.some(([id])=>id===BOMB_CUT_MATERIAL),'Every boundary fixture has a closed section');
 for(let at=0;at<fragment.vertices.length;at+=11)assert(signed(fragment.vertices.subarray(at,at+3),p)>=-.002);
 triangleCounts.push(fragment.vertices.length/33);variations.push([yaw,offset,Math.atan(p.nz)]);
}
for(let axis=0;axis<3;axis++){const values=variations.map(v=>v[axis]);assert(values.some(v=>v<-.1)&&values.some(v=>v>.1));assert(new Set(values.map(v=>v.toFixed(4))).size>110,'Each building receives its own variation');}
assert(Math.max(...triangleCounts)<100,'One plane per building needs no dense subdivision');
// Inclined walls must support both lean directions, with broad-phase indexing
// including the third vertex even when it is outside the longest edge bounds.
for(const lean of [-.3,.3]){
 const tri=[[0,-4,0],[lean*10,-4,10],[0,4,0]],normal=[1,0,-lean],mesh=new Float32Array(tri.flatMap(v=>[...v,...normal,0,0,1,1,1])),scene=collisionGeometry(mesh);
 for(const z of [0,4,8]){const p=[lean*(z+.5),-3],local=nearbyCollision(scene,movementBounds(p));assert(blocked(p,local.segments,z));assert(!blocked([p[0]+Math.sign(lean)*2,-3],local.segments,z));}
}
const elevatedGround=350,raised={vertices:source.vertices.map((v,i)=>i%11===2?v+elevatedGround:v),ranges:source.ranges},raisedCut=drain(cutBombMesh(raised,bounds,[impact],index,{groundHeight:()=>elevatedGround}));
assert.equal(raisedCut.vertices.length,result.vertices.length);for(let i=0;i<result.vertices.length;i++)if(i%11<3)assert(Math.abs(raisedCut.vertices[i]-result.vertices[i]-(i%11===2?elevatedGround:0))<1e-4,'Lean is anchored to local terrain, not altitude zero');
const bombs=new HighwindBombs({craters:[impact]}),node={file:'0/way-1.bin',bounds};assert(bombs.affects(node));assert(!bombs.suppresses(node),'Boundary buildings must still load and collide');

// Exercise the renderer's real update/streaming paths with budgeted uploads.
const gl=new Proxy({createVertexArray:()=>({}),createBuffer:()=>({})},{get:(o,k)=>o[k]??(()=>{})}),preparation=new WalkPreparation({budget:()=>0});
const renderer=Object.assign(Object.create(WalkRenderer.prototype),{gl,index,bombs,preparation,errors:0,textures:new Map(),texture:()=>null,collisionIndex:{entries:new Map(),set(){}}});
Object.assign(node,{mesh:{...source,collision:collisionGeometry(source.vertices)},bombImpactCount:0,controller:new AbortController(),gpu:{}});node.collision=node.mesh.collision;
renderer.ensureBombDamage(node);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(renderer.errors,0);assert.equal(node.bombImpactCount,1);assert(blocked([wall,0],node.collision.segments));assert(!blocked([90,-10],node.collision.segments));
preparation.dispose();

// Reload from the original binary (not the surviving CPU mesh), and let another
// impact arrive while loading: the installed GPU and collision stay in sync.
const header=new TextEncoder().encode(JSON.stringify({ranges:source.ranges})),padded=Math.ceil(header.length/4)*4,packet=new ArrayBuffer(4+padded+source.vertices.byteLength);new DataView(packet).setUint32(0,padded,true);new Uint8Array(packet,4,padded).fill(32);new Uint8Array(packet,4,header.length).set(header);new Float32Array(packet,4+padded).set(source.vertices);
renderer.roofMode='catalogue';const incoming={file:'0/way-1.bin',bounds,controller:new AbortController()};drain(renderer.prepareNode(incoming,packet.slice(0)));assert.deepEqual(incoming.mesh.vertices,result.vertices,'Streaming reconstructs the identical surviving mesh');
const duringLoad={file:incoming.file,bounds,controller:new AbortController()},job=renderer.prepareNode(duringLoad,packet.slice(0));job.next();bombs.addCrater(second);drain(job);assert.equal(duringLoad.bombImpactCount,2);assert.deepEqual(duringLoad.mesh.vertices,twice.vertices,'Impacts during loading are not lost');
const savedFetch=globalThis.fetch;saveScorches([impact]);globalThis.fetch=async()=>({ok:true,json:async()=>({...index,nodes:[['0/way-1.bin',...bounds],['0/way-2.bin',10,10,20,20],['0/way-3.bin',101,0,120,10],['roads/0.bin',...bounds]]})});
await loadMapBombDamage();globalThis.fetch=savedFetch;assert.deepEqual(mapBombDamage.ids,['way/1','way/2']);assert.deepEqual(mapBombDamage.fragments.map(n=>n.file),['0/way-1.bin'],'Only boundary originals are replaced by fragments');
const mapLayer=new MapBombFragments();mapLayer.index=index;mapLayer.texture=()=>null;mapLayer.uploadGeometry=function*(vertices){return {vertices};};const mapNode={file:incoming.file,bounds};drain(mapLayer.prepare(mapNode,packet.slice(0)));assert.deepEqual(mapNode.gpu.vertices,result.vertices,'Map and gameplay use identical surviving triangles');
saveScorches([]);

// Real city assets, roof styles and terrain: all vertices are finite and every
// range still addresses its own triangles after clipping and reconstruction.
const read=async url=>{const b=await fs.readFile('dist/'+url.replace(/^\.\//,''));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
await loadTerrain({fetchBuffer:read});const cityIndex=JSON.parse(await fs.readFile('dist/'+cityDataURL('walk/index.json').slice(2))),generic=cityIndex.nodes.filter(n=>/^\d+\//.test(n[0])),details=cityIndex.nodes.filter(n=>/^(detail|attila|buirette|camp127|parc14)\//.test(n[0]));let checked=0,capped=0,maxMs=0;
for(const record of [...generic.filter((_,i)=>i%Math.max(1,Math.floor(generic.length/30))===0).slice(0,30),...details.filter((_,i)=>i%Math.max(1,Math.floor(details.length/20))===0).slice(0,20)])for(const mode of ['aerial','catalogue']){
 const [file,...b]=record,n={file,bounds:b},mesh=drain(prepareWalkGeometry(await read(cityDataURL('walk/'+file)),cityIndex,mode)),x=(b[0]+b[2])/2,y=(b[1]+b[3])/2;
 const hit=[x-100,y,100,100],plane=bombCutPlane(b,hit,terrainBaseHeight(x,y)),start=performance.now(),actual=drain(prepareBombGeometry(mesh,n,[hit],cityIndex));maxMs=Math.max(maxMs,performance.now()-start);
 assert([...actual.vertices].every(Number.isFinite),file);for(const [id,first,count] of actual.ranges){assert(first>=0&&count%3===0&&(first+count)*11<=actual.vertices.length,file);if(!bombGround(id,cityIndex))for(let at=first*11;at<(first+count)*11;at+=11)assert(signed(actual.vertices.subarray(at,at+3),plane)>=-.01,file+': geometry left behind the cut');}
 if(actual.ranges.some(([id])=>id===BOMB_CUT_MATERIAL))capped++;checked++;
}
console.log(JSON.stringify({buildingCuts:'passed',city:CITY.id,realAssetCases:checked,capped,maxUnbudgetedCutMs:+maxMs.toFixed(2),capArea,uvs:true,collisions:true,streamingReplay:true,multipleImpacts:true,variedBuildings:variations.length,maxBoxTriangles:Math.max(...triangleCounts),inclinedFaces:true}));
