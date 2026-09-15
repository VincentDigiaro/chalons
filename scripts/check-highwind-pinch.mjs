import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {WalkMode} from '../dist/walk-mode.js';
import {HighwindFlight} from '../dist/highwind-flight.js';
import {HighwindUI} from '../dist/highwind-ui.js';

globalThis.document=Object.assign(new EventTarget(),{pointerLockElement:null});globalThis.window=new EventTarget();globalThis.requestAnimationFrame=()=>0;
const elements=new Map(),element=key=>{if(!elements.has(key)){const captured=new Set();elements.set(key,Object.assign(new EventTarget(),{style:{},textContent:'',focus(){},setAttribute(){},setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id),getBoundingClientRect:()=>({left:0,top:0,width:120,height:120})}));}return elements.get(key);};
const ship={enabled:true,config:{vitesseMaxKmh:400},pose:{longueurMetres:150,distanceCameraMetres:200,angleDegres:0,pitch:0,position:{x:0,y:0,z:100}},animate(){},contactDistance:()=>0};
const mode=Object.assign(Object.create(WalkMode.prototype),{phase:'playing',touch:true,keys:new Set(),stick:[0,0],flightStick:[0,0],position:[0,0],feet:0,yaw:0,pitch:0,last:0,events:new AbortController(),canvas:element('canvas'),root:{classList:{toggle(){}},querySelector:element,insertAdjacentHTML(){}},updateStreet(){},updatePositionReadout(){},renderer:{highwind:ship,trim(){},refresh(){},draw(){}}});
mode.flight=new HighwindFlight(ship);mode.flight.mode='flying';mode.bind();mode.highwindUI=new HighwindUI(mode);
let clock=0;const tick=()=>mode.tick(clock+=20),near=(a,b,msg)=>assert(Math.abs(a-b)<1e-7,msg||`${a} != ${b}`);
const pointer=(target,type,id,x=100,y=100,pointerType='touch')=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,clientX:x,clientY:y,pointerType,button:0});target.dispatchEvent(e);return e;};
const p=(type,id,x,y)=>pointer(mode.canvas,type,id,x,y),pose=structuredClone(ship.pose),initial=mode.flight.zoomDistance;

assert(p('pointerdown',10,100,100).defaultPrevented);p('pointermove',10,120,110);near(mode.flight.orbit.yaw,.16);near(mode.flight.orbit.pitch,.08);tick();near(mode.flight.orbit.yaw,.16,'Hold orbit while a finger remains on the canvas');
p('pointerdown',11,320,110);const orbit={...mode.flight.orbit};p('pointermove',11,420,110);near(mode.flight.zoomDistance,initial*2/3,'Spreading fingers zooms in proportionally');tick();assert(mode.flight.cameraDistance<initial&&mode.flight.cameraDistance>mode.flight.zoomDistance,'The camera zoom is smooth');assert.deepEqual(mode.flight.orbit,orbit,'Pinching does not rotate the camera');assert.deepEqual(ship.pose,pose,'Pinching does not move or steer the ship');
p('pointermove',11,320,110);near(mode.flight.zoomDistance,initial,'Pinching back restores distance');
p('pointermove',10,140,110);p('pointermove',11,340,110);near(mode.flight.zoomDistance,initial,'Translating both fingers keeps zoom');assert.deepEqual(mode.flight.orbit,orbit);
p('pointerdown',12,200,100);p('pointermove',12,900,200);near(mode.flight.zoomDistance,initial,'A third finger cannot take over the gesture');p('pointerup',12);assert.equal(mode.flightTouch.points.size,2);
p('pointerup',10);p('lostpointercapture',10);p('pointermove',11,350,110);near(mode.flight.orbit.yaw,orbit.yaw+.08,'Lifting the first finger resumes one-finger orbit without a jump');near(mode.flight.zoomDistance,initial);p('pointercancel',11);assert(!mode.flightTouch.active);
const atRelease=mode.flight.orbit.yaw;for(let i=0;i<80;i++)tick();assert(Math.abs(mode.flight.orbit.yaw)<Math.abs(atRelease),'The camera returns behind the ship only when the gesture ends');

// Both joystick contacts are separate from the two camera contacts.
pointer(element('#walk-stick'),'pointerdown',1,60,20);pointer(element('#highwind-look-stick'),'pointerdown',2,80,80);const sticks=[...mode.stick,...mode.flightStick];
p('pointerdown',20,100,100);p('pointerdown',21,200,100);p('pointermove',21,250,100);assert.deepEqual([...mode.stick,...mode.flightStick],sticks);pointer(element('#walk-stick'),'pointerup',1);assert.equal(mode.flightTouch.points.size,2,'Releasing a joystick does not end the pinch');p('lostpointercapture',21);p('pointermove',20,110,100);assert(mode.flightTouch.active);p('pointercancel',20);pointer(element('#highwind-look-stick'),'pointerup',2);

// Existing camera distance limits, crossing fingers, and invalid samples.
mode.flight.zoomDistance=initial;p('pointerdown',30,100,100);p('pointerdown',31,200,100);p('pointermove',31,1000000,100);near(mode.flight.zoomDistance,90,'Do not pass through the ship');p('pointermove',31,109,100);near(mode.flight.zoomDistance,90*Math.exp(.9));
for(let i=0;i<20;i++){p('pointermove',31,1000000,100);p('pointermove',31,109,100);}assert(mode.flight.zoomDistance>=90&&mode.flight.zoomDistance<=600);
const valid=mode.flight.zoomDistance;p('pointermove',31,100,100);p('pointermove',31,NaN,100);p('pointermove',31,101,100);near(mode.flight.zoomDistance,valid);assert(Number.isFinite(mode.flight.zoomDistance));
mode.pause(false);assert.equal(mode.flightTouch.points.size,0);assert(!mode.canvas.hasPointerCapture(30));p('pointermove',31,900,100);near(mode.flight.zoomDistance,valid);mode.resume();p('pointermove',31,1200,100);near(mode.flight.zoomDistance,valid,'Resume never reuses a stale pinch');
p('pointerdown',40,100,100);p('pointerdown',41,200,100);window.dispatchEvent(new Event('blur'));assert.equal(mode.flightTouch.points.size,0);mode.resume();
mode.flight.mode='foot';const beforeFoot=mode.flight.zoomDistance;p('pointerdown',50,100,100);p('pointerdown',51,300,100);p('pointermove',51,500,100);near(mode.flight.zoomDistance,beforeFoot,'Foot view never receives airship zoom');p('pointerup',50);p('pointerup',51);
mode.events.abort();
const result={passed:true,spreadZoomsIn:true,pinchZoomsOut:true,smoothCamera:true,oneFingerOrbitPreserved:true,noGestureTransitionJump:true,thirdFingerIgnored:true,joysticksIndependent:true,shipPoseUnchanged:true,pauseAndBlurClearContacts:true,footViewUnchanged:true};
await fs.mkdir('artifacts/parc14-highwind-release',{recursive:true});await fs.writeFile('artifacts/parc14-highwind-release/pinch-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
