import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {HighwindFlight,flightInputs} from '../dist/highwind-flight.js';
import {meshCollider,shipHitsGround} from '../dist/highwind-collision.js';
import {GROUND_HEIGHT} from '../dist/walk-physics.js';
import {FPS_CONFIG,validateShipConfig} from '../dist/walk-config.js';

const configured=JSON.parse(await fs.readFile('fps-config.json')).highwind,configuredMax=configured.vitesseMaxKmh;
const collider=meshCollider(new Float32Array([-.2,-.5,-.1,.2,-.5,-.1,0,.5,-.1]));
const idle={forward:0,strafe:0,lift:0,turn:0};
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function create(max=configuredMax,timing={dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18},normal=max){
 const ship={config:{vitesseNormaleKmh:normal,vitesseMaxKmh:max,...timing},pose:{longueurMetres:10,angleDegres:0,pitch:0,position:{x:0,y:0,z:1000}},residency:{data:{collider}},updateBounds(){}};
 const flight=new HighwindFlight(ship);flight.mode='flying';return flight;
}
function run(flight,input,seconds,fps=100){for(let i=0;i<Math.round(seconds*fps);i++)flight.tick(1/fps,input);}
const keyboard=flightInputs(new Set(['ArrowUp'])),mobile=flightInputs(new Set(),[0,1],[0,0],true);
assert.deepEqual({...keyboard,boost:true},mobile);
const mobileFlight=create(800,undefined,400);run(mobileFlight,mobile,1);near(mobileFlight.speedKmh,800);assert(mobileFlight.boost);
mobileFlight.resetMovement();run(mobileFlight,mobile,1);near(mobileFlight.speedKmh,800);
// Changing cruise speed uses the configured duration and remains stable at any FPS.
const accelerated={...keyboard,boost:true},timing={dureeAccelerationSecondes:.5,dureeFreinageSecondes:.8};
for(const fps of [20,30,60,120,240]){
 const flight=create(930,timing,270);run(flight,keyboard,1,fps);near(flight.speedKmh,270);
 let previousSpeed=flight.speedKmh,before=flight.ship.pose.position.y;
 for(let i=0;i<fps;i++){
  flight.tick(1/fps,accelerated);
  assert(flight.speedKmh>=previousSpeed-1e-7&&flight.speedKmh<=930+1e-7);
  if(i===0)assert(flight.speedKmh>270&&flight.speedKmh<400,'Shift must not jump to the maximum');
  near(flight.speedLimitKmh,270+660*Math.min(1,(i+1)/fps/.5));previousSpeed=flight.speedKmh;
 }
 near(flight.ship.pose.position.y-before,(600*.5+930*.5)/3.6);
 before=flight.ship.pose.position.y;
 for(let i=0;i<fps;i++){
  flight.tick(1/fps,keyboard);
  assert(flight.speedKmh<=previousSpeed+1e-7&&flight.speedKmh>=270-1e-7);
  if(i===0)assert(flight.speedKmh>800&&flight.speedKmh<930,'Releasing Shift must retain momentum');
  near(flight.speedLimitKmh,930-660*Math.min(1,(i+1)/fps/.8));previousSpeed=flight.speedKmh;
 }
 near(flight.ship.pose.position.y-before,(600*.8+270*.2)/3.6);
}
// Rapid toggles resume from the current speed, including a partially completed ramp.
const toggled=create(930,timing,270);run(toggled,keyboard,1);run(toggled,accelerated,.2);
const interrupted=toggled.speedLimitKmh;toggled.tick(.01,keyboard);
assert(toggled.speedLimitKmh<interrupted&&toggled.speedLimitKmh>interrupted-10);
const slowing=toggled.speedLimitKmh;toggled.tick(.01,accelerated);
assert(toggled.speedLimitKmh>slowing&&toggled.speedLimitKmh<slowing+15);
toggled.resetMovement();assert.equal(toggled.speedLimitKmh,null);run(toggled,mobile,.5);near(toggled.speedLimitKmh,930);near(toggled.movement.forward,1);
// Zero-duration settings intentionally keep an immediate transition.
const instant=create(930,{dureeAccelerationSecondes:0,dureeFreinageSecondes:0},270);
instant.tick(.01,keyboard);near(instant.speedKmh,270);instant.tick(.01,accelerated);near(instant.speedKmh,930);instant.tick(.01,keyboard);near(instant.speedKmh,270);
// Independent speeds (not a fixed multiplier), including diagonals and lift.
for(const keys of [['ShiftLeft'],['ShiftRight'],['ShiftLeft','ShiftRight']])for(const direction of [['KeyW'],['KeyS'],['KeyD'],['KeyW','KeyD'],['Space'],['KeyW','Space']]){
 const normal=create(930,undefined,270),fast=create(930,undefined,270),regular=flightInputs(new Set(direction)),boosted=flightInputs(new Set([...direction,...keys]));
 run(normal,regular,1);run(fast,boosted,1);
 for(const axis of ['x','y','z'])near(fast.ship.pose.position[axis]-(axis==='z'?1000:0),930/270*(normal.ship.pose.position[axis]-(axis==='z'?1000:0)),1e-6);
 near(fast.speedKmh,normal.speedKmh*930/270,1e-6);assert.equal(fast.getState().maxSpeedKmh,930);assert.equal(fast.ship.config.vitesseMaxKmh,930);
 const before={...fast.ship.pose.position};fast.tick(.02,regular);const after=fast.ship.pose.position;
 const releasingSpeed=Math.hypot(after.x-before.x,after.y-before.y,2*(after.z-before.z))/.02*3.6;assert(releasingSpeed>270&&releasingSpeed<930,'Releasing Shift slows progressively');assert(!fast.boost);run(fast,regular,.3);near(fast.speedLimitKmh,270);
 fast.tick(.02,boosted);fast.resetMovement();assert(!fast.boost);assert.equal(fast.maxSpeedKmh,270);
}
for(const fps of [20,30,60,120,240])for(const max of new Set([200,400,configuredMax]))for(const [forward,strafe] of [[1,0],[-1,0],[0,1],[0,-1],[1,1]]){
 const flight=create(max),input={...idle,forward,strafe},speed=max/3.6;
 let previousSpeed=0;
 for(let i=0;i<fps;i++){
  flight.tick(1/fps,input);
  assert(flight.speedKmh>=previousSpeed-1e-7&&flight.speedKmh<=max+1e-7,'Smooth acceleration stays below the configured cap');
  if(i===0)assert(flight.speedKmh>0&&flight.speedKmh<max*.1,'Initial motion is small, not an instant start');
  previousSpeed=flight.speedKmh;
 }
 near(flight.speedKmh,max);
 near(Math.hypot(flight.ship.pose.position.x,flight.ship.pose.position.y),speed*.85);
 const before={...flight.ship.pose.position};
 for(let i=0;i<Math.ceil(fps*.25);i++){
  flight.tick(1/fps,idle);
  assert(flight.speedKmh>=0&&flight.speedKmh<=previousSpeed+1e-7,'Release slows progressively');
  if(i===0)assert(flight.speedKmh>0&&flight.speedKmh<max,'Release retains a little momentum');
  previousSpeed=flight.speedKmh;
 }
 near(Math.hypot(flight.ship.pose.position.x-before.x,flight.ship.pose.position.y-before.y),speed*.09);
 assert.equal(flight.speedKmh,0);
 const stopped=structuredClone(flight.ship.pose);run(flight,idle,1,fps);
 assert.deepEqual(flight.ship.pose,stopped,'No residual drift after stopping');
 assert.equal(flight.ship.config.vitesseMaxKmh,max);
}
// Partial joystick travel remains proportional, including after changing direction.
const partial=create();run(partial,flightInputs(new Set(),[.3,.4],[0,0],true),1);
near(partial.speedKmh,configuredMax*.5);near(partial.ship.pose.position.x/partial.ship.pose.position.y,.75);
const reversed=create();run(reversed,keyboard,1);const beforeReverse=reversed.ship.pose.position.y;
reversed.tick(.05,{...idle,forward:-1});assert(reversed.ship.pose.position.y>beforeReverse,'Reversal first brakes the existing motion');
run(reversed,{...idle,forward:-1},.7);near(reversed.speedKmh,configuredMax);assert(reversed.movement.forward<0);

// Full combined inputs retain their previous proportions and vertical half-speed.
for(const input of [{...idle,forward:1,strafe:1,lift:1},{...idle,forward:1,lift:-1},{...idle,strafe:-1,lift:1}]){
 const flight=create();run(flight,input,1);const before={...flight.ship.pose.position};flight.tick(.02,input);
 const n=Math.hypot(input.forward,input.strafe,input.lift),scale=configuredMax/3.6*.02/n;
 near(flight.ship.pose.position.x-before.x,input.strafe*scale);near(flight.ship.pose.position.y-before.y,input.forward*scale);near(flight.ship.pose.position.z-before.z,input.lift*scale*.5);
}
const cap=create();run(cap,keyboard,1);cap.ship.config.vitesseNormaleKmh=200;cap.ship.config.vitesseMaxKmh=200;
run(cap,idle,.3);
for(const input of [{...idle,strafe:1,lift:1},idle,{...idle,forward:-1,strafe:1,lift:-1}]){
 for(let i=0;i<100;i++){const before={...cap.ship.pose.position};cap.tick(.01,input);const after=cap.ship.pose.position;
  assert(Math.hypot(after.x-before.x,after.y-before.y,2*(after.z-before.z))/.01*3.6<=200+1e-7,'Changing controls or config cannot overshoot the speed limit');
 }
}
// Orbit does not erase translation momentum; explicit resets do.
const orbit=create();run(orbit,keyboard,1);orbit.look(40,10,.008,true);near(orbit.movement.forward,1);
orbit.resetMovement();const resetPose=structuredClone(orbit.ship.pose);run(orbit,idle,1);assert.deepEqual(orbit.ship.pose,resetPose);
// Touching the flat ground while coasting cancels stored horizontal motion.
const grounded=create();run(grounded,keyboard,1);grounded.ship.pose.position.z=GROUND_HEIGHT+1.001;
grounded.tick(.02,{...idle,lift:-1});assert.equal(grounded.status,'Obstacle');assert(!shipHitsGround(collider,grounded.ship.pose));
assert.deepEqual(grounded.movement,{forward:0,strafe:0});const landed={...grounded.ship.pose.position};
grounded.tick(.02,{...idle,lift:1});near(grounded.ship.pose.position.x,landed.x);near(grounded.ship.pose.position.y,landed.y);assert(grounded.ship.pose.position.z>landed.z);
// One multiplier per ship controls starting, coasting, reversal and boost ramps.
for(const id of ['highwind','orca']){
 for(const inertie of [-1,null,'1',Infinity,NaN,undefined])assert.throws(()=>validateShipConfig({...FPS_CONFIG[id],inertie},id),new RegExp(id+'\\.inertie'));
 for(const inertie of [0,.2,1,2])assert.equal(validateShipConfig({...FPS_CONFIG[id],inertie},id).inertie,inertie);
}
for(const fps of [20,30,60,120,240])for(const inertie of [0,.2,1,2])for(const direction of [{...idle,forward:1},{...idle,forward:-1},{...idle,strafe:1}]){
 const flight=create(90,{...timing,inertie}),speed=90/3.6;run(flight,direction,2,fps);
 near(flight.speedKmh,90);near(Math.hypot(flight.ship.pose.position.x,flight.ship.pose.position.y),speed*(2-.5*timing.dureeAccelerationSecondes*inertie));
 const before={...flight.ship.pose.position};run(flight,idle,2,fps);
 near(Math.hypot(flight.ship.pose.position.x-before.x,flight.ship.pose.position.y-before.y),speed*timing.dureeFreinageSecondes*inertie/2);assert.equal(flight.speedKmh,0);assert.equal(flight.getState().inertie,inertie);
 const stopped=structuredClone(flight.ship.pose);run(flight,idle,.5,fps);assert.deepEqual(flight.ship.pose,stopped);
}
const legacy=create(800,timing,300),explicit=create(800,{...timing,inertie:1},300);
for(const input of [keyboard,accelerated,idle,{...idle,strafe:1},{...idle,forward:-1},idle]){run(legacy,input,.6);run(explicit,input,.6);assert.deepEqual(explicit.ship.pose,legacy.ship.pose);assert.deepEqual(explicit.getState(),legacy.getState());}
for(const inertie of [0,.2,1,2]){
 const flight=create(800,{...timing,inertie},300);run(flight,keyboard,2);flight.tick(.01,accelerated);near(flight.speedLimitKmh,300+500*(inertie?Math.min(1,.01/(.5*inertie)):1));
 run(flight,accelerated,2);flight.tick(.01,keyboard);near(flight.speedLimitKmh,800-500*(inertie?Math.min(1,.01/(.8*inertie)):1));
 const reverse=create(90,{...timing,inertie});run(reverse,keyboard,2);reverse.tick(.01,{...idle,forward:-1});near(reverse.movement.forward,1-2*(inertie?Math.min(1,.01/inertie):1));
}
console.log(JSON.stringify({highwindInertia:'passed',independentShipMultiplier:true,originalHighwindUnchanged:true,orcaMultiplier:.2,zeroInertia:true,accelerationSeconds:.3,brakingSeconds:.18,configuredMaxKmh:configuredMax,frameRates:[20,30,60,120,240],analogStick:true,diagonalCap:true,groundContactStopsMomentum:true}));
