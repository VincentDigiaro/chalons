import assert from 'node:assert/strict';
import {WalkMode} from '../dist/walk-mode.js';
import {HighwindFlight,chaseCamera} from '../dist/highwind-flight.js';
import {HighwindUI} from '../dist/highwind-ui.js';
import {OrcaMissiles} from '../dist/orca-missiles.js';
import {meshCollider} from '../dist/highwind-collision.js';

const noop=()=>{},near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function rig(){
 globalThis.document=Object.assign(new EventTarget(),{exitPointerLock(){this.pointerLockElement=null;this.dispatchEvent(new Event('pointerlockchange'));}});globalThis.window=new EventTarget();globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=noop;
 const elements=new Map(),el=k=>{if(!elements.has(k))elements.set(k,Object.assign(new EventTarget(),{style:{},textContent:'',focus:noop,setAttribute:noop,setPointerCapture:noop,getBoundingClientRect:()=>({left:0,top:0,width:120,height:120})}));return elements.get(k);};
 const ship={shipId:'orca',enabled:true,config:{vitesseNormaleKmh:300,vitesseMaxKmh:600},pose:{longueurMetres:9.454,distanceCameraMetres:18,angleCameraDegres:15,angleDegres:31,pitch:0,position:{x:0,y:0,z:100}},residency:{data:{collider:meshCollider(new Float32Array([-.1,0,0,.1,0,0,0,.1,0]))}},animate:noop,updateBounds:noop,contactDistance:()=>Infinity};
 const bombs=new OrcaMissiles({groundHeight:()=>0,missileConfig:{nombreMissiles:-1,dureeRechargeSecondes:.1},random:()=>.5});
 const mode=Object.assign(Object.create(WalkMode.prototype),{root:{querySelector:el,classList:{toggle:noop},insertAdjacentHTML:noop},canvas:el('canvas'),events:new AbortController(),phase:'playing',touch:false,keys:new Set(),stick:[0,0],position:[0,0],feet:100,yaw:0,pitch:0,last:0,lock:noop,updateStreet:noop,updatePositionReadout:noop,
  renderer:{highwind:ship,bombs,flightGroundHeight:()=>0,bombAudio:{unlock:noop,pause:noop,resume:noop},trim:noop,refresh:noop,draw:noop},music:{pause:noop,resume:noop},piss:{update:noop,getVisualState:()=>null}});
 mode.flight=new HighwindFlight(ship);mode.flight.mode='flying';mode.bind();mode.highwindUI=new HighwindUI(mode);document.pointerLockElement=mode.canvas;
 let now=0;
 const tick=(frames=1)=>{for(let i=0;i<frames;i++)mode.tick(now+=20);};
 const event=(target,type,properties={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,properties);target.dispatchEvent(e);return e;};
 const pointer=(target,type,button=0,extra={})=>event(target,type,{pointerId:1,pointerType:'mouse',button,clientX:60,clientY:20,...extra});
 const press=button=>{pointer(mode.canvas,'pointerdown',button);pointer(mode.canvas,'mousedown',button);};
 const release=button=>{pointer(mode.canvas,'pointerup',button);pointer(document,'pointerup',button);pointer(document,'mouseup',button);};
 const mouse=(x,y)=>event(document,'mousemove',{movementX:x,movementY:y});
 const key=(type,repeat=false)=>event(document,type,{code:'KeyB',repeat});
 return {mode,ship,bombs,el,tick,event,pointer,press,release,mouse,key};
}

// Real event handlers and frame loop: a press emits one salvo despite the
// compatibility mouse event, and holding repeats with the same cadence as B.
let r=rig();r.press(0);assert.equal(r.bombs.salvos,1);assert(!r.mode.mouseOrbit);r.tick(16);const held=r.bombs.salvos;assert(held>=3);r.release(0);r.tick(16);assert.equal(r.bombs.salvos,held);assert.equal(r.mode.bombInputs.size,0);r.mode.events.abort();
r=rig();r.key('keydown');r.tick(16);assert.equal(r.bombs.salvos,held,'Mouse and B use the same held-fire cadence');r.key('keyup');r.mode.events.abort();

// Right orbit is temporary, does not reset the zoom on press, and never fires.
r=rig();r.event(r.mode.canvas,'wheel',{deltaY:150,deltaMode:0});r.tick(80);const start=r.mode.flight.camera(),zoom=r.mode.flight.zoomDistance,pose=structuredClone(r.ship.pose);
r.press(2);assert.deepEqual(r.mode.flight.camera(),start);r.mouse(180,55);r.tick(2);assert(r.mode.mouseOrbit);assert.notEqual(r.mode.flight.camera().yaw,start.yaw);assert.deepEqual(r.ship.pose,pose);assert.equal(r.bombs.salvos,0);
r.release(2);assert(!r.mode.mouseOrbit);assert.deepEqual(r.mode.flight.cameraOffset,{yaw:0,pitch:0});r.tick(200);near(r.mode.flight.camera().yaw,start.yaw);near(r.mode.flight.camera().pitch,start.pitch);near(r.mode.flight.cameraDistance,zoom);assert.equal(r.bombs.salvos,0);r.mode.events.abort();

// Multi-button mouse chords use mousedown/up for the second button. Releasing
// either action must not cancel or restart the other one, in either order.
for(const first of [0,2]){
 r=rig();r.press(first);r.pointer(r.mode.canvas,'mousedown',2-first);assert(r.mode.mouseOrbit);assert(r.mode.bombInputs.has('mouse-left'));r.mouse(100,30);r.tick(7);
 const fired=r.bombs.salvos;
 if(first===0){r.pointer(document,'mouseup',2);assert(!r.mode.mouseOrbit);assert(r.mode.bombInputs.has('mouse-left'));r.tick(7);assert(r.bombs.salvos>fired);r.release(0);}
 else{r.pointer(document,'mouseup',0);assert(r.mode.mouseOrbit);assert(!r.mode.bombInputs.has('mouse-left'));r.tick(7);assert.equal(r.bombs.salvos,fired);r.release(2);}
 r.tick(200);const expected=chaseCamera(r.ship.pose);near(r.mode.flight.camera().yaw,expected.yaw);near(r.mode.flight.camera().pitch,expected.pitch);assert(!r.mode.bombInputs.size);r.mode.events.abort();
}

// Keyboard and mouse triggers remain independent when held together.
r=rig();r.press(0);r.key('keydown');r.release(0);assert(r.mode.bombInputs.has('keyboard'));r.tick(8);assert(r.bombs.salvos>1);r.key('keyup');const count=r.bombs.salvos;r.tick(8);assert.equal(r.bombs.salvos,count);r.mode.events.abort();

// Cancellation, loss of capture, pause and focus loss cannot leave autofire on.
for(const type of ['pointercancel','lostpointercapture','blur']){
 r=rig();r.press(0);r.press(2);r.mouse(40,20);r.event(type==='blur'?window:r.mode.canvas,type,{pointerId:1,button:0});
 assert(!r.mode.bombInputs.size);const stopped=r.bombs.salvos;r.tick(10);assert.equal(r.bombs.salvos,stopped);r.mode.events.abort();
}
r=rig();r.mode.pause(false);const paused=r.bombs.salvos;r.press(0);assert.equal(r.mode.phase,'playing');r.tick(8);assert.equal(r.bombs.salvos,paused,'Clicking the canvas to resume must not fire');r.release(0);r.press(0);assert.equal(r.bombs.salvos,paused+1);r.release(0);r.mode.events.abort();

// Pointer-lock fallback: normal canvas drags still orbit and return; touch
// gestures continue to operate the camera without triggering missiles.
r=rig();document.pointerLockElement=null;r.mode.dragLook=true;const fallback=r.mode.flight.camera();r.press(2);r.pointer(r.mode.canvas,'pointermove',2,{clientX:140,clientY:50});assert.notEqual(r.mode.flight.camera().yaw,fallback.yaw);r.release(2);r.tick(200);near(r.mode.flight.camera().yaw,fallback.yaw);assert.equal(r.bombs.salvos,0);
r.press(0);r.tick(7);assert(r.bombs.salvos>=2);r.release(0);r.mode.events.abort();
r=rig();document.pointerLockElement=null;r.mode.touch=true;r.pointer(r.mode.canvas,'pointerdown',0,{pointerType:'touch'});r.pointer(r.mode.canvas,'mousedown',0,{sourceCapabilities:{firesTouchEvents:true}});r.pointer(r.mode.canvas,'pointermove',0,{pointerType:'touch',clientX:100,clientY:50});r.tick(7);assert.equal(r.bombs.salvos,0);r.pointer(r.mode.canvas,'pointerup',0,{pointerType:'touch'});r.mode.events.abort();

// Empty magazines and missing ground targets retain the weapon's own gating.
for(const unavailable of ['empty','no-target']){
 r=rig();if(unavailable==='empty')r.bombs.remainingBombs=0;else r.ship.pose.pitch=1.2;r.press(0);assert.equal(r.bombs.salvos,0);r.release(0);r.mode.events.abort();
}
console.log(JSON.stringify({orcaControls:'passed',leftClickAndBHoldFire:true,rightOrbitReturns:true,zoomPreserved:true,mixedButtonsIndependent:true,pauseCancelBlurStop:true,resumeClickDoesNotFire:true,pointerLockAndDragFallback:true,touchCameraPreserved:true}));
