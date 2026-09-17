import assert from 'node:assert/strict';
import {HighwindFlight,advanceFlight,flightInputs} from '../dist/highwind-flight.js';
import {FPS_CONFIG,validateShipConfig} from '../dist/walk-config.js';
import {meshCollider,shipHitsGround} from '../dist/highwind-collision.js';
const near=(a,b,e=1e-6)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const idle={forward:0,strafe:0,lift:0,turn:0,boost:false};
const collider=meshCollider(new Float32Array([-.2,-.5,-.1,.2,-.5,-.1,0,.5,-.1]));
const ground={flightGroundHeight:()=>0};
function create(id,extra={}){
 const ship={shipId:id,config:{...FPS_CONFIG[id],inertie:0,vitesseMonteeKmh:36,vitesseDescenteKmh:72,...extra},pose:{longueurMetres:10,angleDegres:0,pitch:0,roll:0,position:{x:0,y:0,z:1000}},residency:{data:{collider}},updateBounds(){}};
 const flight=new HighwindFlight(ship);flight.mode='flying';return flight;
}
function run(flight,input,seconds=1,fps=60){for(let i=0;i<seconds*fps;i++)flight.tick(1/fps,input,ground);}
for(const id of ['highwind','orca']){
 for(const key of ['vitesseMonteeKmh','vitesseDescenteKmh']){
  for(const value of [null,undefined,-1,'36',NaN,Infinity])assert.throws(()=>validateShipConfig({...FPS_CONFIG[id],[key]:value},id),new RegExp(id+'\\.'+key));
  for(const value of [0,36,7200])assert.equal(validateShipConfig({...FPS_CONFIG[id],[key]:value},id)[key],value);
 }
 for(const fps of [20,30,60,120,240])for(const boost of [false,true])for(const lift of [-1,1]){
  const flight=create(id);run(flight,{...idle,lift,boost},1,fps);near(flight.ship.pose.position.z,1000+(lift>0?10:-20));near(flight.ship.pose.position.x,0);near(flight.ship.pose.position.y,0);
  if(id==='orca'){assert.equal(flight.ship.pose.pitch,0);assert.equal(flight.ship.pose.roll,0);}else assert(flight.ship.pose.pitch*lift>0,'Highwind keeps its vertical tilt');
  assert.equal(flight.getState().vitesseMonteeKmh,36);assert.equal(flight.getState().vitesseDescenteKmh,72);
 }
 for(const mobile of [false,true])for(const lift of [-1,1]){
  const flight=create(id),input=mobile?flightInputs(new Set(),[0,0],[0,-lift],true):flightInputs(new Set([lift>0?'Space':'ControlLeft']));run(flight,input);near(flight.ship.pose.position.z,1000+(lift>0?10:-20));
 }
 // Independent tuning and a disabled direction do not affect horizontal speed.
 for(const boost of [false,true]){
  const flight=create(id,{vitesseMonteeKmh:0,vitesseDescenteKmh:0});run(flight,{...idle,lift:1,boost});near(flight.ship.pose.position.z,1000);run(flight,{...idle,lift:-1,boost});near(flight.ship.pose.position.z,1000);
  run(flight,{...idle,forward:1,boost});near(flight.ship.pose.position.y,(boost?flight.ship.config.vitesseMaxKmh:flight.ship.config.vitesseNormaleKmh)/3.6);
  const combined=create(id);run(combined,{...idle,forward:1,lift:1,boost});near(combined.ship.pose.position.z,1000+10/Math.sqrt(2));near(combined.ship.pose.position.y,(boost?combined.ship.config.vitesseMaxKmh:combined.ship.config.vitesseNormaleKmh)/3.6/Math.sqrt(2));
 }
 // Collision substeps must follow the configured vertical speed, even above cruise.
 const descending=create(id,{vitesseDescenteKmh:7200});descending.ship.pose.position.z=15;descending.tick(.05,{...idle,lift:-1},ground);
 assert.equal(descending.status,'Obstacle');assert(!shipHitsGround(collider,descending.ship.pose,ground.flightGroundHeight));assert(descending.ship.pose.position.z<4,'Descend to ground instead of rejecting the entire long step');
 // Old configs still use the previous half-speed rule, including boost.
 const legacy=create(id);delete legacy.ship.config.vitesseMonteeKmh;delete legacy.ship.config.vitesseDescenteKmh;run(legacy,{...idle,lift:1,boost:true});near(legacy.ship.pose.position.z,1000+legacy.ship.config.vitesseMaxKmh/3.6/2);
}
const pose=create('orca').ship.pose;
for(const forward of [-1,0,1])for(const strafe of [-1,0,1]){
 const base=advanceFlight(pose,{...idle,forward,strafe},.05,90,undefined,'orca');
 for(const lift of [-1,1]){const tilted=advanceFlight(pose,{...idle,forward,strafe,lift},.05,90,undefined,'orca');near(tilted.pitch,base.pitch);near(tilted.roll,base.roll);}
}
console.log(JSON.stringify({verticalFlight:'passed',independentClimbAndDescent:true,independentOfBoost:true,orcaNoLiftTilt:true,orcaMovementTiltRetained:true,highwindTiltRetained:true,groundCollision:true,keyboardAndMobile:true,frameRates:[20,30,60,120,240]}));
