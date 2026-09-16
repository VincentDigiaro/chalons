import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {SpatialIndex,nearbyCollision,movementBounds,WALK_COLLISION_RADIUS,overlaps} from '../dist/walk-collision-index.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {collisionGeometry,advancePlayer,GROUND_HEIGHT} from '../dist/walk-physics.js';
import {Terrain,loadTerrain,flightTerrainHeight} from '../dist/terrain.js';
import {meshCollider,trianglePositions,groundSupports,shipHitsGround} from '../dist/highwind-collision.js';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {HighwindFlight} from '../dist/highwind-flight.js';
const close=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);

// Query correctness at negative coordinates, cell edges and large primitives.
const index=new SpatialIndex(4),records=[];
for(let i=0;i<1500;i++){
 const x=(i*71%997)-500,y=(i*37%991)-500,w=i%9;
 const record={bounds:[x,y,x+w,y+w]};records.push(record);index.set(i,record.bounds,record);
}
const large={bounds:[-1000,-1000,1000,1000]};records.push(large);index.set('large',large.bounds,large);assert(index.large.size===1);
for(let i=0;i<200;i++){const b=movementBounds([i*23%1000-500,i*47%1000-500],[i%7-3,i%9-4]);assert.deepEqual(new Set(index.query(b)),new Set(records.filter(r=>overlaps(b,r.bounds))));}
index.set('large',[800,800,801,801],large);assert(!index.query([-1,-1,1,1]).includes(large));index.delete('large');assert(!index.query([800,800,801,801]).includes(large));
index.clear();assert.equal(index.cells.size,0);assert.equal(index.entries.size,0);assert.equal(index.large.size,0);

// Flash crosses 5 m in a capped frame. Include an obstacle outside the old
// 3 m radius, with a small neighbourhood around the entire intended path.
const scene={segments:[[4,-2,4,2,0,8]],surfaces:[]};
const node={bounds:[4,-2,4,2],gpu:{},collision:scene};
const renderer=Object.assign(Object.create(WalkRenderer.prototype),{nodes:new Map([['wall',node]]),collisionIndex:new SpatialIndex(),highwind:{playerCollisionScene:()=>({segments:[],surfaces:[]})}});
renderer.collisionIndex.set('wall',node.bounds,node);
for(let i=0;i<10000;i++){const far={bounds:[100+i,100,101+i,101],gpu:{},get collision(){throw Error('A distant mesh was queried');}};renderer.nodes.set(i,far);renderer.collisionIndex.set(i,far.bounds,far);}
renderer.nodes.values=()=>{throw Error('Per-frame collision code scanned all loaded nodes');};
const p=[0,0],delta=[5,0],local=renderer.collisionScene(p,delta);
assert.equal(WALK_COLLISION_RADIUS,.75);assert.equal(local.segments.length,1);assert.equal(renderer.collisionStats.nearbyNodes,1);
assert.equal(renderer.collisionScene(p).segments.length,0);
let body={position:p,feet:GROUND_HEIGHT,verticalSpeed:0,grounded:true};
body=advancePlayer(body,...delta,.05,local);assert(body.position[0]<3.77,'Flash must stop at the swept wall');assert(body.position[0]>3.6);
node.gpu=null;assert(!renderer.safeToMove(p,delta),'Do not walk into a nearby mesh that is still loading');node.gpu={};assert(renderer.safeToMove(p,delta));
renderer.collisionIndex.delete('wall');assert.equal(renderer.collisionScene(p,delta).segments.length,0);

// Nearby indexing retains thin fences, floors, ceilings and wall sliding.
const vertices=new Float32Array([[0,-2,2.4],[2,-2,2.4],[0,2,2.4]].flatMap(p=>[...p,0,0,1,0,0,1,1,1]));
const obstacles=collisionGeometry(vertices);obstacles.segments.push([1,-2,1,2,0,6]);
const subset=nearbyCollision(obstacles,movementBounds([.6,0],[.2,.2]));assert.equal(subset.surfaces.length,1);assert.equal(subset.segments.length,1);
const fullBody={position:[.6,0],feet:.022,verticalSpeed:0,grounded:true};
let a=fullBody,b=fullBody;
for(let i=0;i<120;i++){a=advancePlayer(a,.01,.003,1/60,obstacles,i===0);b=advancePlayer(b,.01,.003,1/60,nearbyCollision(obstacles,movementBounds(b.position,[.01,.003])),i===0);}
assert.deepEqual(b,a);

// Cell means reduce a sharp summit and remain continuous at tile boundaries.
const metadata={version:1,width:3,height:3,bounds:[4.3815,48.9475,4.3825,48.9485],referenceAltitude:0,encoding:'int16-le-centimetres'};
const grid=new Terrain(metadata,new Int16Array([0,0,0,0,10000,0,0,0,0]).buffer);
close(grid.height(grid.w+grid.dx,grid.n-grid.dy),100);close(grid.flightHeight(grid.w+grid.dx,grid.n-grid.dy),25);
const cache=grid.flightAverages;close(grid.flightHeight(-1e9,1e9),25);assert.equal(cache,grid.flightAverages,'Averages are cached');
const slope=new Terrain(metadata,new Int16Array([0,2000,8000,1000,3000,9000,2000,4000,10000]).buffer);
for(const x of [slope.w+slope.dx*.5,slope.w+slope.dx,slope.w+slope.dx*1.5])close(slope.flightHeight(x-1e-7,slope.n-slope.dy),slope.flightHeight(x+1e-7,slope.n-slope.dy),1e-5);
const single=new Terrain({...metadata,width:2,height:2},new Int16Array([0,100,200,300]).buffer);close(single.flightHeight(0,0),1.5);

await loadTerrain({fetchBuffer:async url=>{const b=await fs.readFile('dist/'+url.replace('./',''));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
const shipIndex=JSON.parse(await fs.readFile('dist/data/highwind/index.json')),buffer=await fs.readFile('dist/data/highwind/mesh.bin');
const collider=meshCollider(trianglePositions(new Float32Array(buffer.buffer,buffer.byteOffset,buffer.length/4),shipIndex.ranges)),supports=groundSupports(collider);
assert(supports.length>8&&supports.length<=32);assert.equal(supports,groundSupports(collider));
const average=p=>flightTerrainHeight(p[0],p[1])+.022;
// After preparation, flight may read only the small support array: make any
// later access to the original triangles fail, including when close to land.
Object.defineProperty(collider,'triangles',{get(){throw Error('Detailed hull geometry used during flight');}});
for(const angleDegres of [0,37,90,180])for(const pitch of [-.17,0,.17]){
 const pose={longueurMetres:150,angleDegres,pitch,position:{x:-130,y:-173,z:100}};let queries=0;
 assert(!shipHitsGround(collider,pose,p=>{queries++;return average(p);}));assert(queries<=32);assert(shipHitsGround(collider,{...pose,position:{...pose.position,z:-50}},average));
}
const config={vitesseMaxKmh:800,dureeAccelerationSecondes:.5,dureeFreinageSecondes:.8};
const ship={config,pose:{longueurMetres:150,angleDegres:110,pitch:0,position:{x:-130,y:-173,z:60}},residency:{data:{collider}},updateBounds(){}};
const flight=new HighwindFlight(ship);flight.mode='flying';
const flightRenderer={flightGroundHeight:average,groundHeight(){throw Error('Precise pedestrian terrain sampled in flight');},groundMaxHeight(){throw Error('Precise terrain maximum scanned in flight');}};
for(let i=0;i<240;i++)flight.tick(1/60,{forward:0,strafe:0,turn:0,lift:-1},flightRenderer);
assert.equal(flight.status,'Obstacle');assert(!shipHitsGround(collider,ship.pose,average));
const z=ship.pose.position.z;for(let i=0;i<12;i++)flight.tick(1/60,{forward:0,strafe:0,turn:0,lift:1},flightRenderer);assert(ship.pose.position.z>z);

// A distant ship must not build or transform its walking triangles.
const distant=Object.assign(Object.create(FPSHighwind.prototype),{pose:ship.pose,bounds:{horizontal:[1000,1000,1200,1200]},residency:{data:{collider}}});
assert.deepEqual(distant.playerCollisionScene([-1,-1,1,1]),{segments:[],surfaces:[]});assert.equal(distant.residency.data.walking,undefined);
console.log(JSON.stringify({collisionPerformance:'passed',footRadius:WALK_COLLISION_RADIUS,loadedNodesSkipped:10000,flashWallAt4Metres:true,averagedTerrain:true,continuousTransitions:true,shipSupports:supports.length,noDetailedFlightQueries:true,takeoff:true}));
