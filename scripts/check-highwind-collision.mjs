import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {meshCollider,trianglePositions,shipHitsGround,trianglesIntersect,walkingGeometry} from '../dist/highwind-collision.js';
import {HighwindFlight,flightInputs,advanceFlight,deckExitPosition,HIGHWIND_DECK} from '../dist/highwind-flight.js';
import {inversePoint} from '../dist/highwind-math.js';
import {advancePlayer,surfaceHeights,GROUND_HEIGHT} from '../dist/walk-physics.js';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
export const cube=(x=0,y=0,z=0,w=2,d=4,h=2)=>{
 const p=[[-w/2,-d/2,-h/2],[w/2,-d/2,-h/2],[w/2,d/2,-h/2],[-w/2,d/2,-h/2],[-w/2,-d/2,h/2],[w/2,-d/2,h/2],[w/2,d/2,h/2],[-w/2,d/2,h/2]].map(p=>p.map((n,i)=>n+[x,y,z][i]));
 return new Float32Array([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].flatMap(t=>t.flatMap(i=>p[i])));
};
const roof=meshCollider(cube(0,0,4,6,10,8)),hull=meshCollider(cube(0,0,0,.4,1,.2)),pose={longueurMetres:10,angleDegres:0,pitch:0,position:{x:0,y:0,z:30}},scene={blocks:[roof],ready:true,...walkingGeometry(roof,{longueurMetres:1,angleDegres:0,pitch:0,position:{x:0,y:0,z:0}})};
assert(!shipHitsGround(hull,pose));
assert(!shipHitsGround(hull,{...pose,position:{x:0,y:0,z:4}}),'A ship inside a building remains free above the ground');
assert(shipHitsGround(hull,{...pose,position:{x:0,y:0,z:GROUND_HEIGHT+1-.01}}));
assert(!shipHitsGround(hull,{...pose,position:{x:0,y:0,z:GROUND_HEIGHT+1+.01}}));
assert(!trianglesIntersect([[0,0,0],[1,0,0],[0,1,0]],[[2,2,0],[3,2,0],[2,3,0]]));assert(trianglesIntersect([[0,0,0],[1,0,0],[0,1,0]],[[.2,.2,-1],[.2,.2,1],[.8,.2,0]]));
const small={enabled:true,config:{vitesseMaxKmh:400,dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18},pose,index:{bounds:[[-.2,-.5,-.1],[.2,.5,.1]]},residency:{data:{collider:hull}},contactDistance:()=>39.9,updateBounds(){}};
const flight=new HighwindFlight(small),input=flightInputs(new Set());assert.equal(flight.interact({}),'board');
let sceneQueries=0,ready=false;const renderer={vehicleScene(){sceneQueries++;return {...scene,ready};}};
small.pose={...pose,position:{x:0,y:-30,z:4}};
for(let i=0;i<45;i++){
 const movement=flightInputs(new Set(['KeyW'])),before=small.pose.position.y,expected=advanceFlight(small.pose,movement,.02,400);
 flight.tick(.02,movement,renderer);
 assert(small.pose.position.y>before,'Accelerate and fly through the building');
 if(i>=15)assert(Math.abs(small.pose.position.y-expected.position.y)<1e-8,'Full speed is retained after acceleration');
 assert.equal(flight.status,'');
}
assert(small.pose.position.y>30);assert.equal(sceneQueries,0,'Flight must not wait for or query terrain and buildings');
small.pose={...pose,position:{x:0,y:0,z:GROUND_HEIGHT+1.002}};const landedZ=small.pose.position.z;
for(let i=0;i<30;i++)flight.tick(.02,flightInputs(new Set(['ControlLeft'])),renderer);
assert(small.pose.position.z>=landedZ-.005);assert(!shipHitsGround(hull,small.pose),'Manual descent cannot cross the ground');
flight.tick(.02,flightInputs(new Set(['Space'])),renderer);assert(small.pose.position.z>landedZ,'Take off from the ground');
flight.mode='foot';small.contactDistance=()=>40.1;assert.equal(flight.interact({}),false);
const index=JSON.parse(await fs.readFile('dist/data/highwind/index.json')),b=await fs.readFile('dist/data/highwind/mesh.bin'),v=new Float32Array(b.buffer,b.byteOffset,b.length/4),real=meshCollider(trianglePositions(v,index.ranges)),realPose={longueurMetres:237,angleDegres:0,pitch:0,position:{x:0,y:0,z:100}},standing=[];
const boardingShip=Object.assign(Object.create(FPSHighwind.prototype),{pose:realPose,index,residency:{data:{vertices:v,collider:real}}});
const footRenderer=Object.assign(Object.create(WalkRenderer.prototype),{highwind:boardingShip,nodes:new Map()});
const walking=boardingShip.playerCollisionScene();
for(const position of [[0,50],[0,0],[-34,-12],[34,-12],[0,-50],[-32,-70],[32,-70]]){
 const height=Math.max(...surfaceHeights(position,walking.surfaces));if(!Number.isFinite(height))continue;let player={position,feet:height+1,verticalSpeed:0,grounded:false};for(let i=0;i<180;i++)player=advancePlayer(player,0,0,.016,footRenderer.collisionScene(player.position));assert(player.grounded);assert(Math.abs(player.feet-height)<.01,`Standing at ${position}`);standing.push({position,height});
 for(let i=0;i<30;i++)player=advancePlayer(player,.005,0,.016,footRenderer.collisionScene(player.position));assert(player.feet>height-1,'Small steps remain on structure');
}
assert(standing.length>=5,'Multiple parts must support the player');assert(new Set(standing.map(p=>Math.round(p.height))).size>=3);
for(const p of standing){const distance=boardingShip.contactDistance({position:p.position,feet:p.height});assert(Number.isFinite(distance)&&distance<1.5,'Degenerate model triangles must not invalidate boarding on a deck');}
for(const pitch of [-Math.PI/18,0,Math.PI/18])for(const angleDegres of [0,37,90,180]){
 const testPose={...realPose,pitch,angleDegres};assert(!shipHitsGround(real,testPose));
 assert(shipHitsGround(real,{...testPose,position:{x:0,y:0,z:0}}),'The rotated hull must still respect the ground');
}
let deckCases=0;
boardingShip.enabled=true;boardingShip.config={vitesseMaxKmh:400,dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18};
for(const longueurMetres of [150,237])for(const pitch of [-Math.PI/18,0,Math.PI/18])for(const angleDegres of [0,37,90,180,359]){
 boardingShip.pose={...realPose,longueurMetres,pitch,angleDegres,position:{x:-127,y:-136,z:100}};
 const before=structuredClone(boardingShip.pose),exit=deckExitPosition(boardingShip);
 assert(exit,`Lower deck exit at length ${longueurMetres}, pitch ${pitch}, yaw ${angleDegres}`);
 const local=inversePoint(boardingShip.pose,[...exit.position,exit.feet]);
 const expectedYaw=angleDegres*Math.PI/180+Math.PI;assert(Math.abs(exit.yaw-expectedYaw)<1e-10,'Exit looks towards the tail');assert.equal(exit.pitch,.12-pitch,'View follows the tail even when the ship is tilted');
 assert(Math.abs(local[2]-HIGHWIND_DECK[2])<.001,'Exit on the lower deck, never the hull roof');
 assert(Math.abs(local[0])<.016&&Math.abs(local[1])<.055,'Inside the circled promenade opening');
 const shipScene=boardingShip.playerCollisionScene(),ceiling=surfaceHeights(exit.position,shipScene.surfaces).filter(z=>z>exit.feet+.1);
 assert(Math.min(...ceiling)-exit.feet>1.7,'Full standing headroom');
 const deckFlight=new HighwindFlight(boardingShip);deckFlight.mode='flying';deckFlight.speedKmh=400;deckFlight.mouseTurn=20;
 const player={};assert.equal(deckFlight.interact(player),'exit');assert(!deckFlight.active);
 assert.deepEqual(boardingShip.pose,before,'E must not move, lower, turn or level the ship');
 assert.equal(deckFlight.speedKmh,0);assert.equal(deckFlight.mouseTurn,0);
 for(let i=0;i<120;i++){deckFlight.tick(.016,input,renderer);Object.assign(player,advancePlayer(player,0,0,.016,footRenderer.collisionScene(player.position)));}
 assert(player.grounded,'Exit remains supported after two seconds');assert(Math.abs(player.feet-exit.feet)<.01);
 assert.deepEqual(boardingShip.pose,before,'Ship stays frozen while on deck');
 assert.equal(deckFlight.interact(player),'board','Reboard directly from the lower deck');deckCases++;
}
console.log(JSON.stringify({highwindCollision:'passed',groundOnly:true,buildingsAndTerrainDoNotBlockFlight:true,noWorldQueriesDuringFlight:true,manualDescentStopsAtGround:true,meshTriangles:real.triangles.length/9,boardMetres:40,deckCases,standing}));
