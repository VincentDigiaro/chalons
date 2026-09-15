import assert from 'node:assert/strict';
import {WalkMode} from '../dist/walk-mode.js';
import {GROUND_HEIGHT,JUMP_SPEED,GRAVITY} from '../dist/walk-physics.js';
import {FPS_CONFIG} from '../dist/walk-config.js';
import {WALK_SPEED,RUN_SPEED,TURBO_SPEED} from '../dist/walk-core.js';
const delay=FPS_CONFIG.delaiEntreSautsMs;

// Exercise the real key handlers and frame update without loading graphics.
globalThis.document=new EventTarget();globalThis.window=new EventTarget();globalThis.requestAnimationFrame=()=>0;
const elements=new Map(),element=key=>{if(!elements.has(key))elements.set(key,Object.assign(new EventTarget(),{style:{},attributes:new Map(),focus(){},setPointerCapture(id){this.captured=id;},getBoundingClientRect:()=>({left:0,top:0,width:120,height:120}),setAttribute(name,value){this.attributes.set(name,value);},getAttribute(name){return this.attributes.get(name);},querySelector:selector=>element(key+' '+selector)}));return elements.get(key);};
const mode=Object.assign(Object.create(WalkMode.prototype),{phase:'playing',flash:false,touch:true,keys:new Set(),stick:[0,0],position:[0,0],yaw:0,pitch:0,feet:GROUND_HEIGHT,verticalSpeed:0,grounded:true,jumpQueued:false,events:new AbortController(),last:0,root:{querySelector:element},canvas:element('canvas'),renderer:{safeToMove:()=>true,collisionScene:()=>({segments:[],surfaces:[]}),trim(){},refresh(){},draw(){}}});
mode.bind();let now=0;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
const key=(type,code,repeat=false)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{code,repeat});document.dispatchEvent(event);};
const pointer=(target,type,id,extra={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,button:0,pointerType:'touch',isPrimary:id===1,clientX:60,clientY:20,...extra});target.dispatchEvent(event);};
const step=(ms=50)=>{const before=[...mode.position];mode.tick(now+=ms);return Math.hypot(mode.position[0]-before[0],mode.position[1]-before[1])/(ms/1000)*3.6;};
const frames=count=>{for(let i=0;i<count;i++)step();};
const speed=expected=>assert(Math.abs(step()-expected)<1e-8);
key('keydown','ArrowUp');speed(WALK_SPEED*3.6);
key('keydown','ControlLeft');speed(TURBO_SPEED*3.6);key('keyup','ControlLeft');speed(WALK_SPEED*3.6);
key('keydown','ShiftLeft');speed(RUN_SPEED*3.6);key('keydown','ControlRight');speed(TURBO_SPEED*3.6);key('keyup','ControlRight');speed(RUN_SPEED*3.6);
key('keyup','ArrowUp');speed(0);key('keyup','ShiftLeft');
const flash=element('#walk-flash'),toggle=()=>flash.dispatchEvent(new Event('click'));
// The joystick stays proportional, reaching keyboard Shift speed at its edge.
mode.stick=[0,.25];speed(RUN_SPEED*3.6*.25);
mode.stick=[0,-.5];speed(RUN_SPEED*3.6*.5);
mode.stick=[1,0];speed(RUN_SPEED*3.6);
mode.stick=[0,1];speed(RUN_SPEED*3.6);toggle();speed(TURBO_SPEED*3.6);
assert.equal(flash.getAttribute('aria-pressed'),'true');assert.match(flash.getAttribute('aria-label'),/^Désactiver/);
mode.stick=[1,1];speed(TURBO_SPEED*3.6);toggle();speed(RUN_SPEED*3.6);
assert.equal(flash.getAttribute('aria-pressed'),'false');assert.match(flash.getAttribute('aria-label'),/^Activer/);
key('keydown','ControlLeft');speed(TURBO_SPEED*3.6);key('keyup','ControlLeft');speed(RUN_SPEED*3.6);
mode.stick=[0,0];speed(0);key('keydown','ArrowUp');speed(WALK_SPEED*3.6);key('keyup','ArrowUp');
// One shared deadline for keyboard, quick re-presses and every touch contact.
mode.stick=[0,0];const jump=element('#walk-jump');
key('keydown','Space');step(0);assert.equal(mode.jumpCount,1);
if(delay>0){
 key('keyup','Space');key('keydown','Space');pointer(jump,'pointerdown',2);
 step(delay/2);assert.equal(mode.jumpCount,1,'Rapid presses and extra fingers cannot bypass the delay');
 key('keydown','Space',true);step(delay/2);assert.equal(mode.jumpCount,2,'Held keyboard/touch repeats at the configured deadline');
 step(delay);assert.equal(mode.jumpCount,3);
}else{step(1);assert.equal(mode.jumpCount,2,'Zero delay permits one jump per frame');}
key('keyup','Space');pointer(jump,'pointerup',2);const released=mode.jumpCount;step(delay+1);assert.equal(mode.jumpCount,released,'Releasing both inputs stops repeats');
for(const event of ['pointerup','pointercancel','lostpointercapture']){
 pointer(jump,'pointerdown',2);step(0);const count=mode.jumpCount;assert.equal(jump.captured,2);pointer(jump,event,2);step(delay+1);assert.equal(mode.jumpCount,count,event+' stops repetition');
}
// Pausing clears held inputs but cannot reset the cooldown for a rapid resume.
if(delay>0){key('keydown','Space');step(0);const count=mode.jumpCount;mode.pause(false);mode.resume();key('keydown','Space');step(delay/2);assert.equal(mode.jumpCount,count);key('keyup','Space');step(delay+1);}
// Three concurrent fingers: movement, held jump, and Flash without a click.
const stick=element('#walk-stick');pointer(stick,'pointerdown',1);assert.deepEqual(mode.stick,[0,1]);
pointer(jump,'pointerdown',2);pointer(flash,'pointerdown',3);assert(mode.flash,'A secondary contact toggles Flash immediately');speed(TURBO_SPEED*3.6);assert(mode.jumpInputs.has('pointer:2'));
const click=new Event('click');Object.assign(click,{detail:1});flash.dispatchEvent(click);assert(mode.flash,'The subsequent click does not toggle Flash back');
pointer(flash,'pointerup',3);assert.deepEqual(mode.stick,[0,1]);const heldCount=mode.jumpCount;step(delay+1);assert(mode.jumpCount>heldCount,'Jump keeps repeating while other controls are held');
pointer(flash,'pointerdown',3);assert(!mode.flash);speed(RUN_SPEED*3.6);pointer(flash,'pointerup',3);
// A fourth finger can look around without stealing the other contacts.
pointer(mode.canvas,'pointerdown',4,{clientX:100,clientY:100});const yaw=mode.yaw,pitch=mode.pitch;
pointer(mode.canvas,'pointermove',4,{clientX:125,clientY:110});assert(Math.abs(mode.yaw-yaw-.2)<1e-9);assert(Math.abs(mode.pitch-pitch+.08)<1e-9);
pointer(mode.canvas,'pointerup',5);pointer(mode.canvas,'pointermove',4,{clientX:150,clientY:110});assert(Math.abs(mode.yaw-yaw-.4)<1e-9,'Another contact ending must not stop looking');
pointer(mode.canvas,'pointerup',4);pointer(mode.canvas,'pointermove',4,{clientX:175,clientY:110});assert(Math.abs(mode.yaw-yaw-.4)<1e-9);
pointer(stick,'pointerdown',5,{clientX:100,clientY:60});pointer(stick,'pointerup',5);assert.deepEqual(mode.stick,[0,1],'Another contact cannot release or take over the joystick');
pointer(jump,'pointerup',2);pointer(stick,'pointerup',1);assert.deepEqual(mode.stick,[0,0]);
// Desktop dragging retains its previous sensitivity.
mode.touch=false;mode.dragLook=true;pointer(mode.canvas,'pointerdown',6,{clientX:0,clientY:0});const desktopYaw=mode.yaw;
pointer(mode.canvas,'pointermove',6,{clientX:20,clientY:0});assert(Math.abs(mode.yaw-desktopYaw-.06)<1e-9);pointer(mode.canvas,'pointerup',6);mode.touch=true;
key('keydown','Space');pointer(jump,'pointerdown',2);step();const beforePause=mode.jumpCount;
toggle();mode.pause(false);assert.equal(mode.flash,false);assert.equal(flash.getAttribute('aria-pressed'),'false');assert.equal(mode.jumpInputs.size,0);
key('keydown','Space');pointer(jump,'pointerdown',2);assert.equal(mode.jumpQueued,false,'Pause disables all jump inputs');
toggle();pointer(flash,'pointerdown',3);assert.equal(mode.flash,false,'Flash cannot be enabled while paused');
mode.resume();frames(6);assert.equal(mode.jumpCount,beforePause,'Resume does not restart a held jump');
key('keyup','Space');key('keydown','Space');step();const beforeBlur=mode.jumpCount;window.dispatchEvent(new Event('blur'));mode.resume();frames(6);assert.equal(mode.jumpCount,beforeBlur,'Focus loss clears held inputs');
// The real keyboard/mobile handlers select the SAME speed state for the jump.
mode.pause(false);mode.resume();mode.stick=[0,0];
const checkImpulse=factor=>{
 mode.clearJump();mode.nextJumpAt=0;mode.verticalSpeed=0;mode.feet=GROUND_HEIGHT;mode.grounded=true;
 key('keydown','Space');step(10);key('keyup','Space');
 assert(Math.abs(mode.verticalSpeed-(JUMP_SPEED*Math.sqrt(factor)-GRAVITY*.01))<1e-9);
};
checkImpulse(1);key('keydown','ShiftLeft');checkImpulse(1);key('keyup','ShiftLeft');
for(const code of ['ControlLeft','ControlRight']){key('keydown',code);checkImpulse(FPS_CONFIG.multiplicateurHauteurSautSpeed);key('keyup',code);checkImpulse(1);}
toggle();checkImpulse(FPS_CONFIG.multiplicateurHauteurSautSpeed);toggle();checkImpulse(1);
mode.events.abort();
console.log(JSON.stringify({controls:'passed',mobileMaxKmh:RUN_SPEED*3.6,mobileFlashKmh:TURBO_SPEED*3.6,proportionalJoystick:true,keyboardWalkPreserved:true,jumpRepeatMs:delay,releaseAndCancelStopRepeats:true,pauseAndBlurClearHeldJump:true,multitouchMovementJumpFlashLook:true,mobileLookSensitivity:.008,desktopLookPreserved:true}));
