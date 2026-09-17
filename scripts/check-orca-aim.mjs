import assert from 'node:assert/strict';
import {boxMesh,combineMeshes,drain} from './bomb-cut-fixtures.mjs';
globalThis.location={search:'?ship=orca',hash:''};
const {orcaSurfaceAim,OrcaMissiles}=await import('../dist/orca-missiles.js');
const {ORCA_MISSILE_DEFAULTS,validateMissileConfig}=await import('../dist/walk-config.js');
const {WalkRenderer}=await import('../dist/walk-renderer.js');
const {SpatialIndex}=await import('../dist/walk-collision-index.js');
const {SurfaceReticle}=await import('../dist/orca-missile-effects.js');
const settings=validateMissileConfig(ORCA_MISSILE_DEFAULTS),pose={position:{x:0,y:0,z:100},longueurMetres:9.454,angleDegres:0,pitch:0};
const near=(a,b)=>assert(Math.abs(a-b)<1e-3,`${a} != ${b}`);
const renderer=Object.assign(Object.create(WalkRenderer.prototype),{position:[0,0],nodes:new Map(),collisionIndex:new SpatialIndex(),textures:new Map(),index:{materials:[{kind:2},{kind:11,texture:'facade.webp'}],facadeBase:10,roofBase:20}});
const raycast=(...args)=>renderer.raycastAim(...args);
function install(key,mesh){
 const bounds=[Infinity,Infinity,-Infinity,-Infinity],zBounds=[Infinity,-Infinity];
 for(let i=0;i<mesh.vertices.length;i+=11){for(let a=0;a<2;a++){bounds[a]=Math.min(bounds[a],mesh.vertices[i+a]);bounds[a+2]=Math.max(bounds[a+2],mesh.vertices[i+a]);}zBounds[0]=Math.min(zBounds[0],mesh.vertices[i+2]);zBounds[1]=Math.max(zBounds[1],mesh.vertices[i+2]);}
 const node={file:key,bounds,ranges:mesh.ranges,gpu:{xyBounds:bounds,zBounds},aimMesh:drain(renderer.prepareAimMesh(mesh))};
 renderer.nodes.set(key,node);renderer.collisionIndex.set(key,bounds,node);return node;
}
const aim=(p=pose)=>orcaSurfaceAim(p,()=>0,settings,raycast);
const clear=()=>{renderer.nodes.clear();renderer.collisionIndex.clear();};
install('0/wall.bin',boxMesh(-20,80,20,100,{top:100}));
const wall=aim();near(wall.position[1],80);assert(wall.position[2]>50);assert.deepEqual(wall.normal,[0,-1,0]);
// The first visible face wins, regardless of object insertion order.
install('0/near.bin',boxMesh(-20,40,20,60,{top:100}));near(aim().position[1],40);
clear();install('0/roof.bin',boxMesh(-40,-20,40,180,{top:60}));
const roof=aim();near(roof.position[2],60);assert.deepEqual(roof.normal,[0,0,1]);assert(roof.position[1]>60&&roof.position[1]<90);
clear();install('0/slope.bin',boxMesh(-40,-20,40,180,{top:52,slope:.2}));const slope=aim();near(slope.position[2],60);assert(slope.normal[0]<0&&slope.normal[2]>.9);
// A bounding box spanning an opening must never act as an invisible wall.
clear();install('0/opening.bin',combineMeshes(boxMesh(-30,80,-5,100,{top:100}),boxMesh(5,80,30,100,{top:100}),boxMesh(-5,80,5,100,{bottom:85,top:100})));
near(aim().position[2],0);assert.equal(aim().normal,null);
clear();install('0/tower.bin',boxMesh(-20,80,20,100,{top:250}));
assert(orcaSurfaceAim({...pose,pitch:.8},()=>0,settings,raycast).position[2]>100,'A building can be aimed at even when the ray misses the ground');
assert.equal(orcaSurfaceAim(pose,()=>0,{...settings,porteeViseurMetres:30},raycast),null);
// Meshes without their displayed texture are not yet targetable.
clear();const textured=install('0/textured.bin',boxMesh(-20,80,20,100,{top:100,material:1}));near(aim().position[2],0);
renderer.textures.set('facade.webp',{gpu:{}});near(aim().position[1],80);
textured.gpu=null;near(aim().position[2],0);renderer.collisionIndex.delete(textured.file);near(aim().position[2],0);
clear();install('0/wall.bin',boxMesh(-20,80,20,100,{top:100}));
let queried=0;const query=renderer.nearbyNodes.bind(renderer);renderer.nearbyNodes=b=>{queried++;return query(b);};
for(let i=0;i<10000;i++)renderer.collisionIndex.set('far-'+i,[5000+i,5000,5001+i,5001],{get gpu(){throw Error('Aiming scanned distant geometry');}});
near(aim().position[1],80);assert(queried<5);
// Missiles keep the selected elevation, even after moving the nose away.
let seed=7;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296),impacts=[];
const missiles=new OrcaMissiles({missileConfig:settings,groundHeight:()=>0,raycast,random,onImpact:b=>impacts.push(b)}),ship={shipId:'orca',enabled:true,residency:{data:{}},pose};
assert(missiles.drop(ship));const target=[...missiles.target];assert(target[2]>50);
missiles.updateAim({...ship,pose:{...pose,angleDegres:90}});assert.deepEqual(missiles.bombs[0].target,target);
for(let i=0;i<1200&&missiles.bombs.length;i++)missiles.tick(1/120);
assert.equal(impacts.length,2);for(const impact of impacts)for(let i=0;i<3;i++)near(impact.position[i],target[i]);
missiles.updateAim(ship,false);assert.equal(missiles.target,null);assert.equal(missiles.targetNormal,null);
// The real preparation/damage pipeline installs aiming data with its GPU mesh.
clear();renderer.gl=new Proxy({},{get:()=>()=>({})});renderer.bombs={craters:[]};renderer.texture=()=>null;renderer.index.customModelMaterialBase=0;
const source=boxMesh(-20,80,20,100,{top:100});let header=JSON.stringify({customModel:true,ranges:source.ranges});header+=' '.repeat((4-header.length%4)%4);
const packed=Buffer.alloc(4+header.length+source.vertices.byteLength);packed.writeUInt32LE(header.length);packed.write(header,4);Buffer.from(source.vertices.buffer).copy(packed,4+header.length);
const prepared={file:'0/prepared.bin',bounds:[-20,80,20,100],controller:new AbortController()};
drain(renderer.prepareNode(prepared,packed.buffer.slice(packed.byteOffset,packed.byteOffset+packed.byteLength)));renderer.nodes.set(prepared.file,prepared);
assert(prepared.gpu&&prepared.aimMesh);near(aim().position[1],80);
renderer.bombs.craters.push([0,90,40,40,0,0]);drain(renderer.updateBombGeometry(prepared));
assert.equal(prepared.bombImpactCount,1);near(aim().position[2],0);assert.equal(prepared.aimMesh.vertices.length,0,'Destroyed triangles must disappear from aiming too');
// Check the actual vertices submitted by the reticle for walls and roofs.
let vertices;
const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,bufferData:(_target,data)=>vertices=data},{get:(o,k)=>o[k]??(()=>({}))});
const reticle=new SurfaceReticle(gl,()=>0),camera={position:[0,-20],height:110},matrix=new Float32Array(16);
for(const hit of [wall,roof,slope]){
 reticle.draw(hit.position,matrix,camera,hit.normal);assert(reticle.visible);
 for(let at=0;at<vertices.length;at+=3){const offset=hit.normal.reduce((sum,n,i)=>sum+n*(vertices[at+i]-hit.position[i]),0);near(offset,.08);}
}
reticle.draw([0,100,0],matrix,camera);for(let at=2;at<vertices.length;at+=3)near(vertices[at],.16);
reticle.draw(null,matrix,camera);assert.equal(reticle.visible,false);reticle.dispose();missiles.dispose();
console.log(JSON.stringify({orcaAim:'passed',facades:true,roofs:true,slopes:true,openings:true,closestVisibleSurface:true,rangeLimit:true,unloadedGeometryIgnored:true,indexedQueries:queried,buildingImpactElevation:true,surfaceAlignedReticle:true,preparedAndDestroyedGeometry:true}));
