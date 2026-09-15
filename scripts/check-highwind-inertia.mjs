import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {HighwindFlight,flightInputs} from '../dist/highwind-flight.js';
import {meshCollider,shipHitsGround} from '../dist/highwind-collision.js';
import {GROUND_HEIGHT} from '../dist/walk-physics.js';

const configured=JSON.parse(await fs.readFile('fps-config.json')).highwind,configuredMax=configured.vitesseMaxKmh;
const collider=meshCollider(new Float32Array([-.2,-.5,-.1,.2,-.5,-.1,0,.5,-.1]));
const idle={forward:0,strafe:0,lift:0,turn:0};
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function create(max=configuredMax,timing={dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18}){
 const ship={config:{vitesseMaxKmh:max,...timing},pose:{longueurMetres:10,angleDegres:0,pitch:0,position:{x:0,y:0,z:1000}},residency:{data:{collider}},updateBounds(){}};
 const flight=new HighwindFlight(ship);flight.mode='flying';return flight;
}
function run(flight,input,seconds,fps=100){for(let i=0;i<Math.round(seconds*fps);i++)flight.tick(1/fps,input);}
const keyboard=flightInputs(new Set(['ArrowUp'])),mobile=flightInputs(new Set(),[0,1],[0,0],true);
assert.deepEqual(keyboard,mobile);
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
const cap=create();run(cap,keyboard,1);cap.ship.config.vitesseMaxKmh=200;
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
console.log(JSON.stringify({highwindInertia:'passed',accelerationSeconds:.3,brakingSeconds:.18,configuredMaxKmh:configuredMax,frameRates:[20,30,60,120,240],analogStick:true,diagonalCap:true,groundContactStopsMomentum:true}));
