import assert from 'node:assert/strict';
import {HighwindBombs} from '../dist/highwind-bombs.js';
import {HighwindBombEffects} from '../dist/highwind-bomb-effects.js';
import {bombRotation,bombBottomOffset} from '../dist/bomb-orientation.js';
import {BOMB_DEFAULTS} from '../dist/walk-config.js';
import {WalkMode} from '../dist/walk-mode.js';
import {HighwindUI} from '../dist/highwind-ui.js';

const noop=()=>{};
function rig(stock=6,cooldown=.1,simulation={}){
 globalThis.document=new EventTarget();globalThis.window=new EventTarget();globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=noop;
 const elements=new Map(),el=k=>{if(!elements.has(k))elements.set(k,Object.assign(new EventTarget(),{style:{},textContent:'',attributes:{},focus:noop,setAttribute(k,v){this.attributes[k]=v;},setPointerCapture:noop,getBoundingClientRect:()=>({left:0,top:0,width:120,height:120})}));return elements.get(k);};
 const ship={enabled:true,residency:{data:{}},animate:noop,pose:{longueurMetres:150,angleDegres:0,position:{x:0,y:0,z:90}}};
 const bombs=new HighwindBombs({config:{...BOMB_DEFAULTS,nombreBombes:stock,dureeRechargeSecondes:cooldown,simulation}}),root={querySelector:el,insertAdjacentHTML:noop,classList:{toggle:noop}};
 const mode=Object.assign(Object.create(WalkMode.prototype),{root,canvas:el('canvas'),events:new AbortController(),phase:'playing',keys:new Set(),stick:[0,0],touch:true,last:0,position:[0,0],feet:90,yaw:0,pitch:0,lock:noop,
  renderer:{highwind:ship,bombs,bombAudio:{unlock:noop,pause:noop,resume:noop},trim:noop,refresh:noop,draw:noop},flight:{active:true,ship,tick:noop,updateCamera:noop,resetMouseTurn:noop,resetMovement:noop,camera:()=>({position:[0,0],height:90,yaw:0,pitch:0})},music:{pause:noop,resume:noop},piss:{update:noop,getVisualState:()=>null}});
 mode.bind();mode.highwindUI=new HighwindUI(mode);mode.highwindUI.update();let now=0;
 const advance=(frames,hz=60)=>{for(let i=0;i<frames;i++){now+=1000/hz;mode.tick(now);}};
 const key=(type,repeat=false)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{code:'KeyB',repeat});document.dispatchEvent(e);};
 const pointer=(type,id=7)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerType:'touch',button:0,pointerId:id});el('#highwind-bomb').dispatchEvent(e);};
 return {mode,bombs,el,key,pointer,advance};
}
let r=rig();r.key('keydown');assert.equal(r.bombs.dropped,1);r.advance(15);assert.equal(r.bombs.dropped,3,'Holding B uses the real frame loop without keyboard repeat events');r.key('keyup');r.advance(20);assert.equal(r.bombs.dropped,3,'Releasing B stops immediately');
r.pointer('pointerdown');r.advance(12);assert.equal(r.bombs.dropped,6);assert.equal(r.bombs.remainingBombs,0);assert.equal(r.el('#highwind-bomb span').textContent,'0');assert(r.el('#highwind-bomb').disabled);r.advance(120);assert.equal(r.bombs.dropped,6,'An empty stock cannot go negative');r.pointer('pointerup');r.mode.events.abort();
r=rig(-1);assert.equal(r.el('#highwind-bomb span').textContent,'∞');r.key('keydown');r.advance(2);assert(!r.el('#highwind-bomb').disabled,'Reloading must leave the touch target enabled');r.pointer('pointerdown');r.key('keyup');r.advance(10);assert.equal(r.bombs.dropped,3,'A touch held during cooldown fires as soon as it is ready');r.pointer('pointercancel');r.advance(20);assert.equal(r.bombs.dropped,3);
r.pointer('pointerdown');r.pointer('lostpointercapture');const stopped=r.bombs.dropped;r.advance(12);assert.equal(r.bombs.dropped,stopped);
r.key('keydown');window.dispatchEvent(new Event('blur'));assert.equal(r.mode.phase,'paused');assert.equal(r.mode.bombInputs.size,0);r.advance(60);r.mode.resume();const paused=r.bombs.dropped;r.key('keydown',true);r.advance(30);assert.equal(r.bombs.dropped,paused,'Resume/OS repeat never re-arms the trigger');r.key('keyup');r.key('keydown');r.advance(60);assert(r.bombs.dropped>paused);assert.equal(r.bombs.remainingBombs,-1);r.key('keyup');r.mode.events.abort();
r=rig(0);r.key('keydown');r.advance(60);assert.equal(r.bombs.dropped,0);r.mode.events.abort();
r=rig(3,0);r.key('keydown');assert.equal(r.bombs.dropped,1);r.advance(2);assert.equal(r.bombs.dropped,3,'Zero reload fires once per animation frame while held');r.advance(60);assert.equal(r.bombs.dropped,3);r.mode.events.abort();
r=rig(10,0,{largagesParImageSansRecharge:3});r.key('keydown');assert.equal(r.bombs.dropped,1);r.advance(1);assert.equal(r.bombs.dropped,4);r.advance(1);assert.equal(r.bombs.dropped,7);r.advance(1);assert.equal(r.bombs.dropped,10,'Configured zero-reload rate is used by the real frame loop');r.advance(3);assert.equal(r.bombs.dropped,10);r.mode.events.abort();
// Any velocity, including upward flight and a stationary release, yields an
// orthonormal matrix with the model's nose aimed along the actual trajectory.
const close=(a,b)=>assert(Math.abs(a-b)<1e-8);
for(const velocity of [[40,10,0],[-20,80,-12],[0,0,-8],[0,0,8],[0,0,0],[1e-6,1e-6,-20]]){
 const rotation=bombRotation(velocity,.8),speed=Math.hypot(...velocity),direction=speed?velocity.map(v=>v/speed):[0,0,-1];
 for(let i=0;i<3;i++)close(-rotation[6+i],direction[i]);
 for(let i=0;i<3;i++){close(Math.hypot(...rotation.slice(i*3,i*3+3)),1);for(let j=i+1;j<3;j++)close(rotation.slice(i*3,i*3+3).reduce((sum,v,k)=>sum+v*rotation[j*3+k],0),0);}
 assert(Number.isFinite(bombBottomOffset(rotation,2)));
}
const flight=new HighwindBombs({config:BOMB_DEFAULTS});flight.drop({enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:40,position:{x:0,y:0,z:1000}}},[100,40,0]);const start=flight.bombs[0].rotation.slice();for(let i=0;i<100;i++)flight.tick(.01);const bomb=flight.bombs[0];assert(bomb.rotation[8]>start[8],'Gravity continuously tilts the nose down');for(let i=0;i<3;i++)close(-bomb.rotation[6+i],bomb.velocity[i]/Math.hypot(...bomb.velocity));
let submitted;const gl=new Proxy({uniformMatrix3fv:(_name,_transpose,data)=>submitted=[...data]},{get:(o,k)=>o[k]??noop}),uniforms=new Proxy({},{get:(_o,k)=>k}),effects=new HighwindBombEffects(gl);Object.assign(effects,{program:{},meshProgram:{},u:uniforms,mu:uniforms});effects.draw(flight,new Float32Array(16),{position:[0,0],height:1000,yaw:0,pitch:0});assert.deepEqual(submitted,bomb.rotation,'The actual mesh draw uses the evolving orientation');
console.log(JSON.stringify({holdBomb:'passed',keyboardAndTouch:true,releaseCancelBlurStop:true,finiteAndInfiniteStock:true,zeroCooldownBounded:true,trajectoryOrientation:true,rotatingMeshAndTrail:true}));
