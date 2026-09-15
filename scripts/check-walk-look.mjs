import assert from 'node:assert/strict';
import {WalkMode} from '../dist/walk-mode.js';
import {viewProjection} from '../dist/walk-core.js';

let mode;
function setup(){
 mode?.events.abort();
 globalThis.document=Object.assign(new EventTarget(),{pointerLockElement:null});
 globalThis.window=new EventTarget();
 const elements=new Map(),element=key=>{
  if(!elements.has(key))elements.set(key,Object.assign(new EventTarget(),{focus(){},setAttribute(){},setPointerCapture(){},style:{}}));
  return elements.get(key);
 };
 mode=Object.assign(Object.create(WalkMode.prototype),{phase:'playing',touch:false,keys:new Set(),stick:[0,0],yaw:0,pitch:0,events:new AbortController(),canvas:element('canvas'),root:{querySelector:element}});
 mode.bind();return mode;
}
function emit(target,type,properties={}){const event=new Event(type,{cancelable:true});Object.assign(event,properties);target.dispatchEvent(event);}
const pointer=(type,x,y=0)=>emit(mode.canvas,type,{pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y});
const mouse=(dx,dy=0)=>emit(document,'mousemove',{movementX:dx,movementY:dy});
const grant=()=>{document.pointerLockElement=mode.canvas;emit(document,'pointerlockchange');};
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);

// A drag must not survive a capture transition and apply absolute cursor
// coordinates on top of the relative mouse movement for the same gesture.
setup();mode.dragLook=true;pointer('pointerdown',100);pointer('pointermove',110);
grant();const capturedYaw=mode.yaw;
pointer('pointermove',800,450);mouse(2,1);
near(mode.yaw-capturedYaw,.0044);near(mode.pitch,-.0022);
assert.equal(mode.dragLook,false,'Successful capture leaves fallback drag mode');

// Pausing during a drag must discard its old screen position.
setup();mode.dragLook=true;pointer('pointerdown',100);pointer('pointermove',110);
const pausedYaw=mode.yaw;mode.pause(false);pointer('pointermove',600);mode.resume();
pointer('pointermove',1000);near(mode.yaw,pausedYaw);
pointer('pointerdown',1000);pointer('pointermove',1010);near(mode.yaw-pausedYaw,.03);

// Normal locked input is direct, supports fast turns, and crosses north without
// a discontinuity in the view matrix. There is no pedestrian smoothing queue.
setup();grant();mode.yaw=359*Math.PI/180;
let previous=viewProjection([0,0,2],mode.yaw,0,1.6);
for(let i=0;i<200;i++){
 const before=mode.yaw;mouse(2);near(mode.yaw-before,.0044);
 const next=viewProjection([0,0,2],mode.yaw,0,1.6);
 assert(Math.max(...next.map((n,j)=>Math.abs(n-previous[j])))<.02,'A continuous turn produces a continuous camera matrix');previous=next;
}
const fastYaw=mode.yaw;mouse(300);near(mode.yaw-fastYaw,.66);
const validPose=[mode.yaw,mode.pitch];mouse(NaN,1);mouse(1,Infinity);assert.deepEqual([mode.yaw,mode.pitch],validPose);

// Raw input is preferred. If unavailable, retry regular capture exactly once;
// a successful fallback must still be exclusive with the drag event stream.
for(const legacy of [false,true]){
 setup();let calls=0;
 mode.canvas.requestPointerLock=options=>{calls++;assert.deepEqual(options,{unadjustedMovement:true});grant();return legacy?undefined:Promise.resolve();};
 await mode.lock();assert.equal(calls,1);mouse(10);near(mode.yaw,.022);
}
setup();const requests=[];
mode.canvas.requestPointerLock=options=>{
 requests.push(options);
 if(options?.unadjustedMovement){emit(document,'pointerlockerror');return Promise.reject(new DOMException('Raw input unavailable','NotSupportedError'));}
 grant();return Promise.resolve();
};
await mode.lock();assert.deepEqual(requests,[{unadjustedMovement:true},undefined]);assert.equal(mode.dragLook,false);mouse(10);near(mode.yaw,.022);
for(const synchronous of [false,true]){
 setup();let calls=0;
 mode.canvas.requestPointerLock=()=>{calls++;const error=new DOMException('Capture denied','NotAllowedError');if(synchronous)throw error;return Promise.reject(error);};
 await mode.lock();assert.equal(calls,1);assert(mode.dragLook,'Denied capture retains usable drag controls');
 pointer('pointerdown',100);pointer('pointermove',110);near(mode.yaw,.03);
}
setup();let resolve,calls=0;
mode.canvas.requestPointerLock=()=>{calls++;return new Promise(done=>{resolve=done;});};
const pending=mode.lock();mode.lock();assert.equal(calls,1,'Repeated clicks do not start overlapping capture requests');grant();resolve();await pending;
document.pointerLockElement=null;emit(document,'pointerlockchange');assert.equal(mode.phase,'paused','Escape still pauses after capture');
setup();await mode.lock();assert(mode.dragLook,'Browsers without pointer lock retain drag controls');
mode.events.abort();
console.log(JSON.stringify({walkLook:'passed',rawMouseInput:true,unsupportedFallback:true,noDuplicateRotation:true,pauseClearsDrag:true,continuousHeadingWrap:true,fastMousePreserved:true,invalidSamplesIgnored:true}));
