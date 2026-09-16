import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {movement,WALK_SPEED,RUN_SPEED,TURBO_SPEED,EYE_HEIGHT,PLAYER_HEIGHT,PLAYER_RADIUS,stepPlayer} from '../dist/walk-core.js';
import {GROUND_HEIGHT,JUMP_SPEED,GRAVITY,collisionGeometry,advancePlayer} from '../dist/walk-physics.js';
import {FPS_CONFIG} from '../dist/walk-config.js';

const empty={segments:[],surfaces:[]},body=(position=[0,0],feet=GROUND_HEIGHT)=>({position,feet,verticalSpeed:0,grounded:true});
const flat=(x0,y0,x1,y1,z)=>collisionGeometry(new Float32Array([[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y0,z],[x1,y1,z],[x0,y1,z]].flatMap(p=>[...p,0,0,1,0,0,1,1,1]))).surfaces;
const close=(a,b,epsilon=1e-6)=>assert(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);
assert(EYE_HEIGHT>0&&EYE_HEIGHT<PLAYER_HEIGHT);close(PLAYER_HEIGHT,1.65);
const expectedPeak=JUMP_SPEED**2/(2*GRAVITY);
const speedHeightMultiplier=FPS_CONFIG.multiplicateurHauteurSautSpeed;
close(Math.hypot(...movement(0,1,0,.05)),WALK_SPEED*.05);close(Math.hypot(...movement(0,1,0,.05,true)),RUN_SPEED*.05);
close(Math.hypot(...movement(0,1,1,.05)),Math.hypot(...movement(0,1,0,.05)));
close(Math.hypot(...movement(0,1,0,.05,false,true))/.05*3.6,TURBO_SPEED*3.6);
close(Math.hypot(...movement(0,1,1,.05,true,true))/.05*3.6,TURBO_SPEED*3.6);
for(const fps of [20,30,60,120]){
 let position=[0,0];for(let i=0;i<fps;i++){const delta=movement(.7,1,0,1/fps,false,true);position=position.map((p,j)=>p+delta[j]);}
 close(Math.hypot(...position)*3.6,TURBO_SPEED*3.6);
}
const peaks=[],speedPeaks=[];
for(const fps of [20,30,60,120]){
 let s=body(),peak=0;
 for(let i=0;i<fps*2;i++){s=advancePlayer(s,0,0,1/fps,empty,i===0);peak=Math.max(peak,s.feet-GROUND_HEIGHT);if(i===Math.floor(fps*.2)){const ordinary=advancePlayer(s,0,0,1/fps,empty),again=advancePlayer(s,0,0,1/fps,empty,true);assert(again.verticalSpeed>ordinary.verticalSpeed,'A fresh press restarts ascent in the air');}}
 assert(Math.abs(peak-expectedPeak)<.01);close(s.feet,GROUND_HEIGHT);assert(s.grounded);close(s.verticalSpeed,0);peaks.push(peak);
 let fast=body(),fastPeak=0;
 const flightSeconds=Math.max(3,2*JUMP_SPEED*Math.sqrt(speedHeightMultiplier)/GRAVITY+1);
 for(let i=0;i<fps*flightSeconds;i++){fast=advancePlayer(fast,0,0,1/fps,empty,i===0,true);fastPeak=Math.max(fastPeak,fast.feet-GROUND_HEIGHT);}
 assert(Math.abs(fastPeak-speedHeightMultiplier*expectedPeak)<.01,'Speed jump reaches the configured height multiplier');
 close(fast.feet,GROUND_HEIGHT);assert(fast.grounded);speedPeaks.push(fastPeak);
 const descending={...body([0,0],5),grounded:false,verticalSpeed:-2};
 const restarted=advancePlayer(descending,0,0,1/fps,empty,true,true);
 close(restarted.verticalSpeed,JUMP_SPEED*Math.sqrt(speedHeightMultiplier)-GRAVITY/fps);
 const normalAgain=advancePlayer(restarted,0,0,1/fps,empty,true,false);
 close(normalAgain.verticalSpeed,JUMP_SPEED-GRAVITY/fps);
}
// Repeated presses work beyond a double jump and can arrest a falling player.
for(const fps of [20,30,60,120]){
 let flying=body();
 for(let i=0;i<fps*3;i++){
  flying=advancePlayer(flying,0,0,1/fps,empty,i%Math.round(fps*.3)===0);
  assert(flying.verticalSpeed<=JUMP_SPEED,'Jump speed is reset rather than accumulated');
 }
 assert(flying.feet>6&&!flying.grounded,'Repeated shorter jumps allow continued flight');
 for(let i=0;i<fps*5;i++)flying=advancePlayer(flying,0,0,1/fps,empty);
 close(flying.feet,GROUND_HEIGHT);assert(flying.grounded,'Releasing jump allows a normal landing');
 const falling={...body([0,0],4),grounded:false,verticalSpeed:-8};
 assert(advancePlayer(falling,0,0,1/fps,empty,true).verticalSpeed>0);
}
const tallWall={segments:[[1,-10,1,10,0,6]],surfaces:[]};let s=body();
for(let i=0;i<90;i++)s=advancePlayer(s,...movement(Math.PI/2,1,0,1/60,true),1/60,tallWall,i===0);
assert(s.position[0]<1-PLAYER_RADIUS+.001,'Jump must not bypass a building wall');
let turbo=body();for(let i=0;i<40;i++)turbo=advancePlayer(turbo,...movement(Math.PI/2,1,0,.05,false,true),.05,tallWall,i===0);
assert(turbo.position[0]<1-PLAYER_RADIUS+.001,'360 km/h must not tunnel through a wall');
const platform={segments:[[1,-2,1,2,0,.6]],surfaces:flat(1,-2,4,2,.6)};s=body();
for(let i=0;i<120;i++)s=advancePlayer(s,...movement(Math.PI/2,i<45?1:0,0,1/60),1/60,platform,i===0);
assert(s.position[0]>1.5);close(s.feet,.6);assert(s.grounded,'Land on top of an obstacle within the shorter jump height');
const ceiling={segments:[],surfaces:flat(-2,-2,2,2,2.5)};s=body();let highest=0;
for(let i=0;i<90;i++){s=advancePlayer(s,0,0,1/60,ceiling,i===0);highest=Math.max(highest,s.feet);}
assert(highest<=2.5-PLAYER_HEIGHT+.001,'Head must stop at a ceiling');assert(s.grounded);
for(let i=0;i<120;i++){s=advancePlayer(s,0,0,1/60,ceiling,i%6===0);assert(s.feet+PLAYER_HEIGHT<=2.501,'Air jumps must not cross ceilings');}
for(let i=0;i<120;i++){s=advancePlayer(s,0,0,1/60,ceiling,i%6===0,true);assert(s.feet+PLAYER_HEIGHT<=2.501,'Speed jumps must not cross ceilings');}

// Reproduce the user's fence using its actual published model geometry.
const survey=JSON.parse(await fs.readFile('dist/data/nerval/survey.json','utf8')),p=survey.parts.find(p=>p.id===112),index=JSON.parse(await fs.readFile('dist/data/walk/index.json','utf8'));
const world=(x,y)=>p.center.map((c,i)=>c+p.u[i]*x+p.v[i]*y),local=q=>[(q[0]-p.center[0])*p.u[0]+(q[1]-p.center[1])*p.u[1],(q[0]-p.center[0])*p.v[0]+(q[1]-p.center[1])*p.v[1]],scene={segments:[],surfaces:[]};
for(const [file] of index.nodes.filter(n=>n[0].startsWith('detail/'))){const raw=await fs.readFile('dist/data/walk/'+file),offset=4+raw.readUInt32LE(0),vertices=new Float32Array(raw.buffer,raw.byteOffset+offset,(raw.length-offset)/4),c=collisionGeometry(vertices);scene.segments.push(...c.segments);scene.surfaces.push(...c.surfaces);}
const yaw=Math.atan2(p.v[0],p.v[1]);
const cross=jump=>{let s=body(world(0,-12.5)),peak=0;for(let i=0;i<180;i++){s=advancePlayer(s,...movement(yaw,i<55?1:0,0,1/60),1/60,scene,jump&&i<=45&&i%15===0);peak=Math.max(peak,s.feet);}return {...s,local:local(s.position),peak};};
const stopped=cross(false),jumped=cross(true);
assert(stopped.local[1]<-11,'Fence must block ordinary walking');
assert(jumped.local[1]>-10,'Jump must cross the exact fence from the screenshot');assert(jumped.grounded,'Land in the garden');assert(jumped.feet<.1,'Return to garden ground');
const result={checks:'passed',walkSpeed:WALK_SPEED,runSpeed:RUN_SPEED,controlSpeedKmh:TURBO_SPEED*3.6,turboWallCollision:true,jumpHeight:JUMP_SPEED**2/(2*GRAVITY),speedJumpHeight:speedHeightMultiplier*expectedPeak,speedJumpMeasuredPeaks:speedPeaks,actualFence:{withoutJump:stopped.local,withJump:jumped.local,landingHeight:jumped.feet},frameRates:[20,30,60,120],buildingCollision:true,platformLanding:true,ceilingCollision:true,airJumps:true,eyeHeight:EYE_HEIGHT,playerHeight:PLAYER_HEIGHT};
await fs.mkdir('artifacts/walk',{recursive:true});await fs.writeFile('artifacts/walk/jump-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
