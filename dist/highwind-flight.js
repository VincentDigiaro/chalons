import {shipMatrix,transform,inversePoint} from './highwind-math.js';
import {GROUND_HEIGHT,surfaceHeights} from './walk-physics.js';
import {blocked,PLAYER_RADIUS} from './walk-core.js';
import {nearbyCollision,movementBounds} from './walk-collision-index.js';
import {shipHitsGround} from './highwind-collision.js';
import {highwindBoardingDistance} from './fps-highwind.js';

const clamp=n=>Math.max(-1,Math.min(1,n));
const MAX_TURN_DEGREES_PER_SECOND=180;
const MOUSE_TURN_RESPONSE=24;
const flightSpeed=(config,maximum)=>maximum?(config?.vitesseMaxKmh??config?.vitesseNormaleKmh??400):(config?.vitesseNormaleKmh??config?.vitesseMaxKmh??400);
const verticalSpeed=(config,lift,horizontalKmh)=>(lift<0?config?.vitesseDescenteKmh:config?.vitesseMonteeKmh)??horizontalKmh*.5;
export function flightInputs(keys,left=[0,0],right=[0,0],mobile=false){
 const has=(...c)=>Number(c.some(k=>keys.has(k)));
 return {forward:clamp(has('KeyW','KeyZ','ArrowUp')-has('KeyS','ArrowDown')+left[1]),strafe:clamp(has('KeyD')-has('KeyA','KeyQ')+left[0]),turn:clamp(has('ArrowRight','KeyC')-has('ArrowLeft','KeyX')+right[0])*(mobile?3:1),lift:clamp(has('Space','PageUp')-has('ControlLeft','ControlRight','PageDown')+(mobile?-right[1]:right[1])),boost:mobile||!!has('ShiftLeft','ShiftRight')};
}
export function advanceFlight(pose,input,dt,maxKmh,movement=input,shipId=null,verticalKmh=verticalSpeed(pose,movement.lift,maxKmh)){
 const next={...pose,position:{...pose.position}},h=Math.max(0,Math.min(dt,.05)),n=Math.max(1,Math.hypot(movement.forward,movement.strafe,movement.lift)),speed=maxKmh/3.6/n;
 next.angleDegres=(pose.angleDegres+input.turn*32*h)%360;
 const a=next.angleDegres*Math.PI/180;
 next.position.x+=(Math.sin(a)*movement.forward+Math.cos(a)*movement.strafe)*speed*h;
 next.position.y+=(Math.cos(a)*movement.forward-Math.sin(a)*movement.strafe)*speed*h;
 next.position.z+=movement.lift*verticalKmh/3.6/n*h;
 const target=shipId==='orca'?-movement.forward*18*Math.PI/180:input.lift*Math.PI/18;next.pitch=(pose.pitch||0)+(target-(pose.pitch||0))*(1-Math.exp(-8*h));if(Math.abs(next.pitch)<.00001)next.pitch=0;
 if(shipId==='orca'){const bank=movement.strafe*24*Math.PI/180;next.roll=(pose.roll||0)+(bank-(pose.roll||0))*(1-Math.exp(-8*h));if(Math.abs(next.roll)<.00001)next.roll=0;}
 return next;
}
export function followHeading(current,target,dt){const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));return current+delta*(1-Math.exp(-4.5*Math.max(0,Math.min(dt,.1))));}
const initialCameraDistance=pose=>pose?.distanceCameraMetres??(pose?.longueurMetres??100)*Math.hypot(.95,.35);
const initialCameraAngle=pose=>pose.angleCameraDegres===undefined?Math.atan2(.35,.95):pose.angleCameraDegres*Math.PI/180;
const MAX_CAMERA_ANGLE=89*Math.PI/180;
export function chaseCamera(pose,orbit={yaw:0,pitch:0},heading=pose.angleDegres*Math.PI/180,distance=initialCameraDistance(pose)){
 const a=heading+orbit.yaw,e=Math.max(-MAX_CAMERA_ANGLE,Math.min(MAX_CAMERA_ANGLE,initialCameraAngle(pose)+orbit.pitch));
 // Older configurations retain their original framing until a distance is set.
 const r=distance,d=r*Math.cos(e),h=r*Math.sin(e);
 return {position:[pose.position.x-Math.sin(a)*d,pose.position.y-Math.cos(a)*d],height:pose.position.z+h,yaw:a,pitch:-e};
}

// Spatial buckets keep the large airship's terrain queries bounded during flight.
export function terrainGrid(scene){
 const grid=new Map(),size=16,put=(b,item)=>{for(let x=Math.floor(b[0]/size);x<=Math.floor(b[2]/size);x++)for(let y=Math.floor(b[1]/size);y<=Math.floor(b[3]/size);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(item);}};
 for(const s of scene.surfaces)put(s.bounds,s);
 return {scene,at:(x,y)=>grid.get(Math.floor(x/size)+','+Math.floor(y/size))||[]};
}
function heightAt(x,y,s){
 if(x<s.bounds[0]||x>s.bounds[2]||y<s.bounds[1]||y>s.bounds[3])return null;
 const [a,b,c]=s.p,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/s.det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/s.det;
 return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?u*a[2]+v*b[2]+(1-u-v)*c[2]:null;
}
export function hullSupport(pose,probes,grid){
 const m=shipMatrix({...pose,position:{...pose.position,z:0}}),cells=new Map(probes.map(p=>[Math.round(p.x*40)+','+Math.round(p.y*40),p]));let required=-Infinity;
 for(const p of probes){
  const low=transform(m,[p.x,p.y,p.bottom]),high=transform(m,[p.x,p.y,p.top]);let floor=GROUND_HEIGHT;
  for(const s of grid.at(low[0],low[1])){const z=heightAt(low[0],low[1],s);if(z!==null&&z<=pose.position.z+Math.max(low[2],high[2])+1)floor=Math.max(floor,z);}
  required=Math.max(required,floor-Math.min(low[2],high[2]));
 }
 // Include narrow walls/posts and roof corners between hull samples.
 const consider=(x,y,z)=>{const q=inversePoint(pose,[x,y,z]),p=cells.get(Math.round(q[0]*40)+','+Math.round(q[1]*40));if(!p||q[2]>p.top+.005)return;const low=transform(m,[p.x,p.y,p.bottom]);required=Math.max(required,z-low[2]);};
 for(const s of grid.scene.segments){consider(s[0],s[1],s[5]);consider(s[2],s[3],s[5]);consider((s[0]+s[2])/2,(s[1]+s[3])/2,s[5]);}
 return required;
}
// Canonical lower promenade deck, below the central hull (the circled opening).
export const HIGHWIND_DECK=[.0004,.045,-.060096997767686844];
function orcaExitPosition(ship,scene){
 const pose=ship.pose,matrix=shipMatrix(pose),deck=ship.index?.deckExit??[0,.06,.04],step=PLAYER_RADIUS/pose.longueurMetres,candidates=[];
 // The cockpit arches can block the nominal exit, especially while banking.
 // Search nearby hull surfaces at the player's actual width, closest first.
 // Sample their current world height instead of requiring the old deck height.
 for(let y=-8;y<=8;y++)for(let x=-6;x<=6;x++)candidates.push([x,y]);
 candidates.sort((a,b)=>a[0]*a[0]+a[1]*a[1]-b[0]*b[0]-b[1]*b[1]);
 for(const [x,y] of candidates){
  const point=transform(matrix,[deck[0]+x*step,deck[1]+y*step,deck[2]]),position=point.slice(0,2),local=nearbyCollision(scene,movementBounds(position)),heights=surfaceHeights(position,local.surfaces);
  if(!heights.length)continue;const feet=Math.max(...heights)+.002;
  if(!blocked(position,local.segments,feet))return {position,feet,verticalSpeed:0,grounded:true,yaw:pose.angleDegres*Math.PI/180+Math.PI,pitch:.12-(pose.pitch||0)};
 }
 return null;
}
export function deckExitPosition(ship){
 const scene=ship.playerCollisionScene?.();if(!scene)return null;const pose=ship.pose,matrix=shipMatrix(pose);
 if(ship.shipId==='orca')return orcaExitPosition(ship,scene);
 const deck=ship.index?.deckExit??HIGHWIND_DECK;
 for(const [x,y] of [[deck[0],deck[1]],[.0105,-.01],[-.0097,-.01],[.0105,.012],[-.0097,.012]]){
  const point=transform(matrix,[x,y,deck[2]]),position=point.slice(0,2),heights=surfaceHeights(position,scene.surfaces).filter(z=>Math.abs(z-point[2])<.15);
  if(!heights.length)continue;const feet=Math.max(...heights)+.002;
  if(!blocked(position,scene.segments,feet))return {position,feet,verticalSpeed:0,grounded:true,yaw:pose.angleDegres*Math.PI/180+Math.PI,pitch:.12-(pose.pitch||0)};
 }
 return null;
}
export class HighwindFlight{
 constructor(ship){this.ship=ship;this.mode='foot';this.resetMovement();this.contact=false;this.status='';this.mouseTurn=0;this.mouseTurnSpeed=0;this.orbit={yaw:0,pitch:0};this.cameraOffset={yaw:0,pitch:0};this.cameraYaw=ship.pose?.angleDegres*Math.PI/180||0;this.cameraDistance=this.zoomDistance=this.defaultCameraDistance=initialCameraDistance(ship.pose);}
 get active(){return this.mode!=='foot';}
 get maxSpeedKmh(){return flightSpeed(this.ship.config,this.boost);}
 // 1 preserves the original response; 0 makes translation changes immediate.
 get inertia(){return this.ship.config.inertie??1;}
 updateContact(player){this.distanceToShip=this.ship.enabled?this.ship.contactDistance(player):Infinity;this.contact=Number.isFinite(this.distanceToShip)&&this.distanceToShip<highwindBoardingDistance(this.ship.config);}
 resetMouseTurn(){this.mouseTurn=0;this.mouseTurnSpeed=0;}
 resetMovement(){this.movement={forward:0,strafe:0};this.speedKmh=0;this.boost=false;this.speedLimitKmh=null;this.speedLimitTarget=null;this.speedLimitRate=0;}
 advanceSpeedLimit(target,dt){
  // Starting from rest keeps the existing movement ramp, including on mobile.
  const previous=this.speedLimitKmh??target;this.speedLimitKmh=previous;
  if(this.speedLimitTarget!==target){
   this.speedLimitTarget=target;
   const response=(target>previous?this.ship.config.dureeAccelerationSecondes:this.ship.config.dureeFreinageSecondes)*this.inertia;
   this.speedLimitRate=response>0?Math.abs(target-previous)/response:Infinity;
  }
  const delta=target-previous;
  if(Math.abs(delta)<1e-9){this.speedLimitKmh=target;return target;}
  const duration=Math.abs(delta)/this.speedLimitRate,fraction=Math.min(1,dt/duration);
  this.speedLimitKmh=previous+delta*fraction;
  // Integrate the speed ramp over this collision step, including its endpoint.
  const average=dt<duration?fraction*.5:1-duration/(2*dt);
  return previous+delta*average;
 }
 advanceMovement(target,dt){
  const previous=this.movement,df=target.forward-previous.forward,ds=target.strafe-previous.strafe,distance=Math.hypot(df,ds);
  if(distance<1e-12){this.movement={forward:target.forward,strafe:target.strafe};return target;}
  const response=(target.forward===0&&target.strafe===0?this.ship.config.dureeFreinageSecondes:this.ship.config.dureeAccelerationSecondes)*this.inertia;
  const duration=distance*response,fraction=Math.min(1,dt/duration);
  this.movement={forward:previous.forward+df*fraction,strafe:previous.strafe+ds*fraction};
  // Average the ramp over this collision step, including any time at the target.
  // This reaches the configured top speed exactly and fully stops after braking.
  const average=dt<duration?fraction*.5:1-duration/(2*dt);
  return {forward:previous.forward+df*average,strafe:previous.strafe+ds*average,lift:target.lift};
 }
 look(dx,dy,sensitivity,orbit){if(orbit){this.resetMouseTurn();this.orbit.yaw+=dx*sensitivity;const base=initialCameraAngle(this.ship.pose);this.orbit.pitch=Math.max(Math.max(-.5,-MAX_CAMERA_ANGLE-base),Math.min(Math.min(1.05,MAX_CAMERA_ANGLE-base),this.orbit.pitch+dy*sensitivity));}else if(this.mode==='flying')this.mouseTurn+=dx*sensitivity*180/Math.PI;}
 zoom(delta){if(!this.active||!Number.isFinite(delta))return;const p=this.ship.pose,base=initialCameraDistance(p),min=Math.min(base,Math.max(12,p.longueurMetres*.6)),max=Math.max(base,p.longueurMetres*4);this.zoomDistance=Math.max(min,Math.min(max,this.zoomDistance*Math.exp(Math.max(-600,Math.min(600,delta))*.0015)));}
 // Restore the startup framing relative to the ship at its current position.
 // Leave the remembered offset intact until release, so a cancelled drag can return to it.
 resetCameraView(){if(!this.active)return;this.resetMouseTurn();this.cameraYaw=this.ship.pose.angleDegres*Math.PI/180;this.orbit={yaw:0,pitch:0};this.cameraDistance=this.zoomDistance=this.defaultCameraDistance;}
 // Remember the visible angle relative to the ship, including any heading lag.
 rememberCamera(){if(!this.active)return;this.cameraYaw+=this.orbit.yaw;this.orbit.yaw=0;const offset=this.cameraYaw-this.ship.pose.angleDegres*Math.PI/180;this.cameraOffset={yaw:Math.atan2(Math.sin(offset),Math.cos(offset)),pitch:this.orbit.pitch};}
 updateCamera(dt,orbitActive=false){if(!this.active)return;const h=Math.max(0,Math.min(dt,.1));this.cameraDistance+=(this.zoomDistance-this.cameraDistance)*(1-Math.exp(-12*h));if(orbitActive)return;this.cameraYaw=followHeading(this.cameraYaw+this.orbit.yaw,this.ship.pose.angleDegres*Math.PI/180+this.cameraOffset.yaw,dt);this.orbit.yaw=0;this.orbit.pitch=this.cameraOffset.pitch+(this.orbit.pitch-this.cameraOffset.pitch)*Math.exp(-4.5*h);}
 camera(){return chaseCamera(this.ship.pose,this.orbit,this.cameraYaw,this.cameraDistance);}
 interact(player){
  if(this.mode==='flying'){const exit=deckExitPosition(this.ship);if(!exit){this.status='Pont indisponible';return false;}Object.assign(player,exit);this.mode='foot';this.resetMovement();this.resetMouseTurn();this.status='';this.updateContact(player);return 'exit';}
  this.updateContact(player);if(!this.contact)return false;this.mode='flying';this.resetMovement();this.resetMouseTurn();this.orbit={yaw:0,pitch:0};this.cameraOffset={yaw:0,pitch:0};this.cameraYaw=this.ship.pose.angleDegres*Math.PI/180;return 'board';
 }
 tick(dt,input,renderer){
  const ship=this.ship;if(!this.active||!ship.residency?.data)return null;
  this.status='';const old=ship.pose,collider=ship.residency.data.collider,hits=pose=>shipHitsGround(collider,pose,renderer?.flightGroundHeight),seconds=Math.max(0,Math.min(dt,.05));
  if(seconds===0)return null;
  {
   // Mouse events describe this frame's target speed, never a heading debt.
   // Discard excess input before smoothing, and ease back to zero when idle.
   const max=flightSpeed(ship.config,input.boost),keyboardRate=input.turn*32,keyboardTurn=keyboardRate*seconds;
   const limitMouse=rate=>Math.max(-MAX_TURN_DEGREES_PER_SECOND-keyboardRate,Math.min(MAX_TURN_DEGREES_PER_SECOND-keyboardRate,rate));
   const targetRate=limitMouse(this.mouseTurn/seconds),previousRate=limitMouse(this.mouseTurnSpeed),decay=Math.exp(-MOUSE_TURN_RESPONSE*seconds);
   this.mouseTurn=0;this.mouseTurnSpeed=targetRate+(previousRate-targetRate)*decay;
   // Integrate the smoothed speed over the frame to keep the feel stable at any FPS.
   const turn=targetRate*seconds+(previousRate-targetRate)*(1-decay)/MOUSE_TURN_RESPONSE;
   if(targetRate===0&&Math.abs(this.mouseTurnSpeed)<.1)this.mouseTurnSpeed=0;
   const n=Math.max(1,Math.hypot(input.forward,input.strafe,input.lift)),target={forward:input.forward/n,strafe:input.strafe/n,lift:input.lift/n};
   // Coasting still needs collision substeps after the stick or keys are released.
   const motion=Math.min(1,Math.max(Math.hypot(this.movement.forward,this.movement.strafe,target.lift),Math.hypot(target.forward,target.strafe,target.lift)));
   const horizontalLimit=Math.max(max,this.speedLimitKmh??max),verticalLimit=verticalSpeed(ship.config,target.lift,horizontalLimit);
   const tipTravel=Math.abs(keyboardTurn+turn)*Math.PI/180*old.longueurMetres*.55,travel=Math.max(horizontalLimit,target.lift?verticalLimit:0)/3.6*seconds*motion;
   const steps=Math.max(1,Math.ceil(Math.max(travel,tipTravel)/.75)),h=seconds/steps;
   for(let i=0;i<steps;i++){
    const before=ship.pose,stepSpeed=this.advanceSpeedLimit(max,h),next=advanceFlight(before,input,h,stepSpeed,this.advanceMovement(target,h),ship.shipId,verticalSpeed(ship.config,target.lift,stepSpeed));next.angleDegres+=turn/steps;
    // Lift off level first if pitching would push the stern into its support.
    let blocked=hits(next);if(blocked&&input.lift>0){next.pitch=before.pitch;if(ship.shipId==='orca')next.roll=before.roll||0;blocked=hits(next);}
    if(!blocked)ship.pose=next;
    else{this.resetMovement();this.status='Obstacle';break;}
   }
   this.boost=!!input.boost;this.speedKmh=dt>0?Math.hypot(...['x','y','z'].map(k=>ship.pose.position[k]-old.position[k]))/Math.min(dt,.05)*3.6:0;
  }
  ship.updateBounds();return null;
 }
 getState(){return {mode:this.mode,contact:this.contact,distanceToShipMetres:Number.isFinite(this.distanceToShip)?this.distanceToShip:null,boardingDistanceMetres:highwindBoardingDistance(this.ship.config),speedKmh:this.speedKmh,maxSpeedKmh:this.maxSpeedKmh,vitesseMonteeKmh:verticalSpeed(this.ship.config,1,this.maxSpeedKmh),vitesseDescenteKmh:verticalSpeed(this.ship.config,-1,this.maxSpeedKmh),inertie:this.inertia,boost:this.boost,status:this.status,cameraYaw:this.cameraYaw+this.orbit.yaw,cameraDistanceMetres:this.cameraDistance};}
}
