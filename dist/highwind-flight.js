import {shipMatrix,transform,inversePoint} from './highwind-math.js';
import {GROUND_HEIGHT,surfaceHeights} from './walk-physics.js';
import {blocked} from './walk-core.js';
import {shipHitsGround} from './highwind-collision.js';
import {highwindBoardingDistance} from './fps-highwind.js';

const clamp=n=>Math.max(-1,Math.min(1,n));
const MAX_TURN_DEGREES_PER_SECOND=180;
const MOUSE_TURN_RESPONSE=24;
export function flightInputs(keys,left=[0,0],right=[0,0],mobile=false){
 const has=(...c)=>Number(c.some(k=>keys.has(k)));
 return {forward:clamp(has('KeyW','KeyZ','ArrowUp')-has('KeyS','ArrowDown')+left[1]),strafe:clamp(has('KeyD')-has('KeyA','KeyQ')+left[0]),turn:clamp(has('ArrowRight','KeyC')-has('ArrowLeft','KeyX')+right[0])*(mobile?3:1),lift:clamp(has('Space','PageUp')-has('ControlLeft','ControlRight','PageDown')+(mobile?-right[1]:right[1]))};
}
export function advanceFlight(pose,input,dt,maxKmh,movement=input){
 const next={...pose,position:{...pose.position}},h=Math.max(0,Math.min(dt,.05)),n=Math.max(1,Math.hypot(movement.forward,movement.strafe,movement.lift)),speed=maxKmh/3.6/n;
 next.angleDegres=(pose.angleDegres+input.turn*32*h)%360;
 const a=next.angleDegres*Math.PI/180;
 next.position.x+=(Math.sin(a)*movement.forward+Math.cos(a)*movement.strafe)*speed*h;
 next.position.y+=(Math.cos(a)*movement.forward-Math.sin(a)*movement.strafe)*speed*h;
 next.position.z+=movement.lift*speed*h*.5;
 const target=input.lift*Math.PI/18;next.pitch=(pose.pitch||0)+(target-(pose.pitch||0))*(1-Math.exp(-8*h));if(Math.abs(next.pitch)<.00001)next.pitch=0;
 return next;
}
export function followHeading(current,target,dt){const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));return current+delta*(1-Math.exp(-4.5*Math.max(0,Math.min(dt,.1))));}
const initialCameraDistance=pose=>pose.distanceCameraMetres??pose.longueurMetres*Math.hypot(.95,.35);
export function chaseCamera(pose,orbit={yaw:0,pitch:0},heading=pose.angleDegres*Math.PI/180,distance=initialCameraDistance(pose)){
 const a=heading+orbit.yaw,e=Math.atan2(.35,.95)+orbit.pitch;
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
export function deckExitPosition(ship){
 const scene=ship.playerCollisionScene?.();if(!scene)return null;const pose=ship.pose,matrix=shipMatrix(pose);
 for(const [x,y] of [[HIGHWIND_DECK[0],HIGHWIND_DECK[1]],[.0105,-.01],[-.0097,-.01],[.0105,.012],[-.0097,.012]]){
  const point=transform(matrix,[x,y,HIGHWIND_DECK[2]]),position=point.slice(0,2),heights=surfaceHeights(position,scene.surfaces).filter(z=>Math.abs(z-point[2])<.15);
  if(!heights.length)continue;const feet=Math.max(...heights)+.002;
  if(!blocked(position,scene.segments,feet))return {position,feet,verticalSpeed:0,grounded:true,yaw:pose.angleDegres*Math.PI/180+Math.PI,pitch:.12-(pose.pitch||0)};
 }
 return null;
}
export class HighwindFlight{
 constructor(ship){this.ship=ship;this.mode='foot';this.resetMovement();this.contact=false;this.status='';this.mouseTurn=0;this.mouseTurnSpeed=0;this.orbit={yaw:0,pitch:0};this.cameraYaw=ship.pose?.angleDegres*Math.PI/180||0;this.cameraDistance=this.zoomDistance=initialCameraDistance(ship.pose);}
 get active(){return this.mode!=='foot';}
 updateContact(player){this.distanceToShip=this.ship.enabled?this.ship.contactDistance(player):Infinity;this.contact=Number.isFinite(this.distanceToShip)&&this.distanceToShip<highwindBoardingDistance(this.ship.config);}
 resetMouseTurn(){this.mouseTurn=0;this.mouseTurnSpeed=0;}
 resetMovement(){this.movement={forward:0,strafe:0};this.speedKmh=0;}
 advanceMovement(target,dt){
  const previous=this.movement,df=target.forward-previous.forward,ds=target.strafe-previous.strafe,distance=Math.hypot(df,ds);
  if(distance<1e-12){this.movement={forward:target.forward,strafe:target.strafe};return target;}
  const response=target.forward===0&&target.strafe===0?this.ship.config.dureeFreinageSecondes:this.ship.config.dureeAccelerationSecondes;
  const duration=distance*response,fraction=Math.min(1,dt/duration);
  this.movement={forward:previous.forward+df*fraction,strafe:previous.strafe+ds*fraction};
  // Average the ramp over this collision step, including any time at the target.
  // This reaches the configured top speed exactly and fully stops after braking.
  const average=dt<duration?fraction*.5:1-duration/(2*dt);
  return {forward:previous.forward+df*average,strafe:previous.strafe+ds*average,lift:target.lift};
 }
 look(dx,dy,sensitivity,orbit){if(orbit){this.resetMouseTurn();this.orbit.yaw+=dx*sensitivity;this.orbit.pitch=Math.max(-.5,Math.min(1.05,this.orbit.pitch+dy*sensitivity));}else if(this.mode==='flying')this.mouseTurn+=dx*sensitivity*180/Math.PI;}
 zoom(delta){if(!this.active||!Number.isFinite(delta))return;const p=this.ship.pose,base=initialCameraDistance(p),min=Math.min(base,Math.max(12,p.longueurMetres*.6)),max=Math.max(base,p.longueurMetres*4);this.zoomDistance=Math.max(min,Math.min(max,this.zoomDistance*Math.exp(Math.max(-600,Math.min(600,delta))*.0015)));}
 updateCamera(dt,orbitActive=false){if(!this.active)return;const h=Math.max(0,Math.min(dt,.1));this.cameraDistance+=(this.zoomDistance-this.cameraDistance)*(1-Math.exp(-12*h));if(orbitActive)return;this.cameraYaw=followHeading(this.cameraYaw+this.orbit.yaw,this.ship.pose.angleDegres*Math.PI/180,dt);this.orbit.yaw=0;this.orbit.pitch*=Math.exp(-4.5*h);}
 camera(){return chaseCamera(this.ship.pose,this.orbit,this.cameraYaw,this.cameraDistance);}
 interact(player){
  if(this.mode==='flying'){const exit=deckExitPosition(this.ship);if(!exit){this.status='Pont indisponible';return false;}Object.assign(player,exit);this.mode='foot';this.resetMovement();this.resetMouseTurn();this.status='';this.updateContact(player);return 'exit';}
  this.updateContact(player);if(!this.contact)return false;this.mode='flying';this.resetMovement();this.resetMouseTurn();this.orbit={yaw:0,pitch:0};this.cameraYaw=this.ship.pose.angleDegres*Math.PI/180;return 'board';
 }
 tick(dt,input,renderer){
  const ship=this.ship;if(!this.active||!ship.residency?.data)return null;
  this.status='';const old=ship.pose,collider=ship.residency.data.collider,hits=pose=>shipHitsGround(collider,pose,renderer?.flightGroundHeight),seconds=Math.max(0,Math.min(dt,.05));
  if(seconds===0)return null;
  {
   // Mouse events describe this frame's target speed, never a heading debt.
   // Discard excess input before smoothing, and ease back to zero when idle.
   const max=ship.config.vitesseMaxKmh??400,keyboardRate=input.turn*32,keyboardTurn=keyboardRate*seconds;
   const limitMouse=rate=>Math.max(-MAX_TURN_DEGREES_PER_SECOND-keyboardRate,Math.min(MAX_TURN_DEGREES_PER_SECOND-keyboardRate,rate));
   const targetRate=limitMouse(this.mouseTurn/seconds),previousRate=limitMouse(this.mouseTurnSpeed),decay=Math.exp(-MOUSE_TURN_RESPONSE*seconds);
   this.mouseTurn=0;this.mouseTurnSpeed=targetRate+(previousRate-targetRate)*decay;
   // Integrate the smoothed speed over the frame to keep the feel stable at any FPS.
   const turn=targetRate*seconds+(previousRate-targetRate)*(1-decay)/MOUSE_TURN_RESPONSE;
   if(targetRate===0&&Math.abs(this.mouseTurnSpeed)<.1)this.mouseTurnSpeed=0;
   const n=Math.max(1,Math.hypot(input.forward,input.strafe,input.lift)),target={forward:input.forward/n,strafe:input.strafe/n,lift:input.lift/n};
   // Coasting still needs collision substeps after the stick or keys are released.
   const motion=Math.min(1,Math.max(Math.hypot(this.movement.forward,this.movement.strafe,target.lift),Math.hypot(target.forward,target.strafe,target.lift)));
   const tipTravel=Math.abs(keyboardTurn+turn)*Math.PI/180*old.longueurMetres*.55,travel=max/3.6*seconds*motion;
   const steps=Math.max(1,Math.ceil(Math.max(travel,tipTravel)/.75)),h=seconds/steps;
   for(let i=0;i<steps;i++){
    const before=ship.pose,next=advanceFlight(before,input,h,max,this.advanceMovement(target,h));next.angleDegres+=turn/steps;
    // Lift off level first if pitching would push the stern into its support.
    let blocked=hits(next);if(blocked&&input.lift>0){next.pitch=before.pitch;blocked=hits(next);}
    if(!blocked)ship.pose=next;
    else{this.resetMovement();this.status='Obstacle';break;}
   }
   this.speedKmh=dt>0?Math.hypot(...['x','y','z'].map(k=>ship.pose.position[k]-old.position[k]))/Math.min(dt,.05)*3.6:0;
  }
  ship.updateBounds();return null;
 }
 getState(){return {mode:this.mode,contact:this.contact,distanceToShipMetres:Number.isFinite(this.distanceToShip)?this.distanceToShip:null,boardingDistanceMetres:highwindBoardingDistance(this.ship.config),speedKmh:this.speedKmh,maxSpeedKmh:this.ship.config?.vitesseMaxKmh??400,status:this.status,cameraYaw:this.cameraYaw+this.orbit.yaw,cameraDistanceMetres:this.cameraDistance};}
}
