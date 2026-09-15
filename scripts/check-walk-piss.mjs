import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {WalkPissAction} from '../dist/walk-piss.js';
import {WalkMode} from '../dist/walk-mode.js';
import {EYE_HEIGHT,viewProjection} from '../dist/walk-core.js';
import {pissTrajectory,pissPressure,PISS_DRAIN_SECONDS,WalkPissEffect} from '../dist/walk-piss-effect.js';

// Real FPS input/frame handlers, with an audio clock whose end we control.
globalThis.document=new EventTarget();globalThis.window=new EventTarget();
globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};
let sources=[],fetches=0,resumeError=false,decodeError=false,pendingDecode=null;
class AudioContext{
 constructor(){this.destination={};this.currentTime=0;this.state='running';}
 resume(){return resumeError?Promise.reject(Error('Autoplay blocked')):Promise.resolve();}
 decodeAudioData(){return pendingDecode||(decodeError?Promise.reject(Error('Invalid audio')):Promise.resolve({id:fetches,duration:8}));}
 createBufferSource(){const source={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;},end(){this.onended?.();}};sources.push(source);return source;}
 close(){this.closed=true;return Promise.resolve();}
}
globalThis.AudioContext=AudioContext;
globalThis.fetch=async url=>{fetches++;assert.match(url.pathname,/data\/audio\//);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let mode,action,elements,now=0,boards=0;
function setup(touch=false){
 mode?.events.abort();action?.dispose();sources=[];boards=0;
 elements=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,Object.assign(new EventTarget(),{style:{},focus(){},setPointerCapture(){},setAttribute(){},insertAdjacentHTML(){throw Error('The action must not add mobile UI');},querySelector:selector=>element(key+' '+selector)}));return elements.get(key);};
 mode=Object.assign(Object.create(WalkMode.prototype),{phase:'playing',touch,position:[0,0],yaw:0,pitch:0,feet:.022,verticalSpeed:0,grounded:true,keys:new Set(),stick:[0,0],events:new AbortController(),last:0,root:{querySelector:element},canvas:element('canvas'),renderer:{safeToMove:()=>true,collisionScene:()=>({segments:[],surfaces:[]}),trim(){},refresh(){},draw(){},dispose(){}}});
 mode.bind();action=mode.piss=new WalkPissAction(mode);mode.interactHighwind=()=>boards++;
}
const key=(repeat=false,code='KeyP')=>{const e=new Event('keydown',{cancelable:true});Object.assign(e,{code,repeat});document.dispatchEvent(e);};
const move=(x,y=0)=>{mode.position=[x,y];mode.tick(now+=16);};
const face=angle=>{mode.yaw=angle*Math.PI/180;action.update();};

setup();
for(const [x,y] of [[0,0],[-401.38,1532.74],[500,1500],[-2000,-2000]]){
 move(x,y);for(const angle of [0,61.57,180,270,720,-360]){face(angle);assert(action.eligible(),'Available at any position/orientation');}
}
key(false,'KeyE');await flush();assert.equal(sources.length,0,'E no longer starts the audio action');
key(true);await flush();assert.equal(sources.length,0,'Held P cannot start');
key();key();await flush();assert.equal(sources.length,1);assert.equal(action.stage,'water');assert.equal(boards,0);
action.context.currentTime=.4;assert.equal(action.getVisualState().time,.4,'The visual uses the audio clock');
action.context.state='suspended';assert.equal(action.getVisualState(),null,'No stream while audio is suspended');action.context.state='running';
let rendered;mode.renderer.draw=(...args)=>rendered=args[4];move(0);assert.equal(rendered.time,.4,'The actual FPS frame passes the stream to the renderer');
const water=sources[0];move(1400,-900);face(180);assert(!water.stopped);assert.equal(action.stage,'water');
assert.deepEqual(action.getVisualState().position,[1400,-900]);assert.equal(action.getVisualState().yaw,Math.PI);
action.context.currentTime=7.65;assert.equal(action.getVisualState().duration,8);assert(Math.abs(pissPressure(action.getVisualState().time,8)-.5)<1e-10,'Pressure falls with the audio clock');
action.context.currentTime=8;assert.equal(action.getVisualState().time,8,'Already emitted water keeps falling at the audio boundary');
await flush();assert.equal(sources.length,1,'Only the actual end event advances the sequence');
water.end();assert.equal(action.stage,'reply');assert.equal(sources.length,2);const reply=sources[1];assert.notEqual(reply.buffer,water.buffer);
assert.equal(action.getVisualState().time,8,'Starting the reply must not restart the visual clock');
action.context.currentTime=8.2;assert.equal(action.getVisualState().time,8.2,'The last drops drain during the beginning of the reply');
action.context.currentTime=8+PISS_DRAIN_SECONDS;assert.equal(action.getVisualState(),null,'No emission or particles remain after draining');
move(500,-500);key();assert.equal(action.stage,'reply');assert(!reply.stopped);assert.equal(sources.length,2,'P cannot restart before the reply ends');
reply.end();assert.equal(action.stage,'idle');key();await flush();assert.equal(sources.length,3);
const interrupted=sources[2],lateEnded=interrupted.onended;mode.pause(false);assert(interrupted.stopped);assert.equal(action.stage,'idle');
assert.equal(action.getVisualState(),null,'Pause removes the visual immediately');
lateEnded();assert.equal(sources.length,3,'A late ended callback cannot launch the reply after cancellation');
key();assert.equal(sources.length,3,'P is ignored during pause');mode.resume();key();await flush();assert.equal(sources.length,4);assert.equal(fetches,2,'Decoded files are reused');

setup();let finishDecode;pendingDecode=new Promise(resolve=>finishDecode=resolve);
key();await flush();assert.equal(action.stage,'loading');assert.equal(action.getVisualState(),null,'No visual before audio starts');move(2000,1000);face(270);assert.equal(action.stage,'loading');finishDecode({});await flush();assert.equal(sources.length,1,'Movement during loading does not cancel playback');pendingDecode=null;
mode.position=[-2000,1000];sources[0].end();assert.equal(sources.length,2,'Moving before the end event still allows the reply');
mode.pause(false);assert(!sources[1].stopped);sources[1].end();assert.equal(action.stage,'idle');

setup(true);key();await flush();assert.equal(sources.length,0,'P is disabled on mobile, even with an attached keyboard');assert(!action.start());assert(!action.getState().available);assert.equal(action.button,undefined);
setup();mode.flight={active:true};assert(!action.start());mode.flight={active:false,contact:true,updateContact(){}};
key(false,'KeyE');assert.equal(boards,1,'E keeps its existing vehicle interaction');assert.equal(sources.length,0);

const warn=console.warn;console.warn=()=>{};
try{
 setup();resumeError=true;key();await flush();assert.equal(action.stage,'idle');assert.match(action.getState().error,/Autoplay/);resumeError=false;
 key();await flush();assert.equal(action.stage,'water','A rejected audio start can be retried');
 setup();decodeError=true;key();await flush();assert.equal(action.stage,'idle');assert.equal(action.loading,null);decodeError=false;
 key();await flush();assert.equal(action.stage,'water','Failed downloads/decodes can be retried');
}finally{console.warn=warn;resumeError=false;decodeError=false;}
const source=sources[0];action.dispose();assert(source.stopped);assert(action.context.closed);assert(!action.start());
assert.equal(action.getVisualState(),null);
setup();pendingDecode=new Promise(resolve=>finishDecode=resolve);key();await flush();window.dispatchEvent(new Event('pagehide'));finishDecode({});await flush();assert.equal(sources.length,0,'Navigation prevents pending audio from starting');pendingDecode=null;mode.events.abort();
const pose={position:[0,0],feet:.022,yaw:0,pitch:0,time:1};
const jet=pissTrajectory(pose);assert(jet.impact);assert(Math.abs(jet.impact.point[2]-.025)<1e-8);assert(jet.impact.point[1]>1.5&&jet.impact.point[1]<3,'A short gravity-driven arc lands in front of the player');
assert(pissTrajectory({...pose,time:.05}).points.length<jet.points.length,'The jet grows from the source when the sound starts');
assert.equal(pissTrajectory({...pose,feet:40}).impact,null,'No floating ground splashes while jumping high');
let previousPeak=0;
for(const pitch of [0,.2,.4,.75,1.1,1.45]){
 const aimed=pissTrajectory({...pose,pitch,time:2}),peak=Math.max(...aimed.points.map(p=>p.point[2]));
 assert(peak>previousPeak,'Raising the gaze keeps raising the jet, including beyond the old pitch cap');previousPeak=peak;
 assert.deepEqual(aimed.points[0].point,jet.points[0].point,'The jet still originates at the waist');
 assert(aimed.impact,'Even a high arc lands within the simulated flight time');
 const matrix=viewProjection([0,0,EYE_HEIGHT+pose.feet],0,pitch,16/9);
 assert(aimed.points.some(({point})=>{
  const v=[...point,1],clip=[0,1,2,3].map(row=>v.reduce((sum,n,column)=>sum+n*matrix[column*4+row],0));
  return clip[3]>0&&Math.abs(clip[0])<clip[3]&&Math.abs(clip[1])<clip[3]&&Math.abs(clip[2])<clip[3];
 }),'The raised stream stays visible in the corresponding upward camera view');
}
assert(previousPeak>1.65,'Looking high lifts the arc above eye height');
const downward=pissTrajectory({...pose,pitch:-.6});assert(downward.points[1].point[2]<downward.points[0].point[2]);assert(downward.impact.point[1]<jet.impact.point[1],'Looking down lowers and shortens the jet');
const wall=pissTrajectory(pose,{surfaces:[],segments:[[-1,1,1,1,0,2]]});assert(Math.abs(wall.impact.point[1]-1)<1e-8);assert(wall.impact.normal[1]<0,'Wall splashes face back out of the wall');
const floor={p:[[-5,-5,.3],[5,-5,.3],[0,5,.3]],det:100,bounds:[-5,-5,5,5]};
assert(Math.abs(pissTrajectory(pose,{surfaces:[floor],segments:[]}).impact.point[2]-.3)<1e-8,'Raised surfaces receive the stream');
const turned=pissTrajectory({...pose,yaw:Math.PI/2,position:[1200,-1900]});assert(Math.abs(turned.impact.point[0]-1200-jet.impact.point[1])<1e-8);assert(Math.abs(turned.impact.point[1]+1900+jet.impact.point[0])<1e-8,'The arc follows translation and rotation');
assert.equal(pissPressure(7,8),1);assert.equal(pissPressure(8,8),0);assert.equal(pissPressure(8.1,8),0);
const ending=[7.3,7.5,7.7,7.9,8,8.2].map(time=>pissTrajectory({...pose,time,duration:8}));
for(let i=1;i<ending.length;i++)assert(ending[i].impact.point[1]<=ending[i-1].impact.point[1]+1e-8,'After airborne water arrives, the impact moves closer as pressure falls');
assert(ending.at(-1).impact.point[1]<ending[0].impact.point[1]*.6,'The weakened jet loses most of its reach');
assert(ending.at(-1).points[0].point[2]<pose.feet+.82,'The tail detaches from the source and falls');
assert(ending[3].points[0].pressure<.06,'The stream thins before the audio ends');
const parcelA=pissTrajectory({...pose,time:7.8,duration:8}).points[10],parcelB=pissTrajectory({...pose,time:7.89,duration:8}).points[15];
assert(Math.abs(parcelA.pressure-parcelB.pressure)<1e-10,'A parcel keeps its launch pressure');
assert(Math.abs((parcelA.point[1]-.22)/parcelA.time-(parcelB.point[1]-.22)/parcelB.time)<1e-10,'Airborne liquid keeps forward momentum as source pressure drops');
assert(parcelB.point[2]<parcelA.point[2],'Previously emitted drops continue falling');
assert.equal(pissTrajectory({...pose,time:8.6,duration:8}).points.length,0,'The last ground-level drops have landed');
assert.equal(pissTrajectory({...pose,feet:40,time:8+PISS_DRAIN_SECONDS,duration:8}).points.length,0,'Airborne tails have a bounded lifetime');
for(const duration of [.2,3,19]){assert.equal(pissPressure(duration,duration),0);assert(pissPressure(duration-.05,duration)<1,'The decline follows the actual recording duration');}
let handle=0,constant=0,vertices,depthMask=true,draws=0;const allocations=new Set();
const gl=new Proxy({}, {get(target,key){
 if(key in target)return target[key];if(/^[A-Z_0-9]+$/.test(key))return target[key]=++constant;
 if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
 if(key.startsWith('create'))return ()=>{allocations.add(++handle);return handle;};if(key.startsWith('delete'))return id=>allocations.delete(id);
 if(key==='bufferSubData')return (target,offset,data)=>vertices=data;
 if(key==='depthMask')return value=>depthMask=value;
 if(key==='drawArrays')return ()=>{assert(!depthMask,'Transparent liquid must not overwrite the scene depth');draws++;};return ()=>{};
}});
const effect=new WalkPissEffect(gl);effect.draw(pose,{surfaces:[],segments:[]},new Float32Array(16),1.572);assert(draws);assert(vertices.every(Number.isFinite));assert(depthMask,'Restore depth writes for the next scene frame');
// Reproduce the visible cut in first person, including the steepest downward
// look and a camera far from the map origin. The added end must be offscreen.
for(const pitch of [-1.45,-1.2,-.9,-.6,-.3,0,.8,1.45])for(const aspect of [16/9,9/16]){
 const aimed={...pose,position:[1200,-900],yaw:.73,pitch,time:2},height=EYE_HEIGHT+aimed.feet,matrix=viewProjection([0,0,height],aimed.yaw,pitch,aspect);
 effect.draw(aimed,{surfaces:[],segments:[]},matrix,height);assert(effect.count<=effect.vertices.length);assert(vertices.every(Number.isFinite));
 for(const offset of [0,7]){
  const v=[...vertices.slice(offset,offset+3),1],clip=[0,1,2,3].map(row=>v.reduce((sum,n,col)=>sum+n*matrix[col*4+row],0));
  assert(clip[3]<=0||clip[1]<-clip[3],'Both edges of the emitting end stay below or behind the camera');
 }
 const origin=pissTrajectory(aimed).points[0].point;
 assert(Math.abs((vertices[14]+vertices[35])/2-(origin[0]-aimed.position[0]))<1e-5);
 assert(Math.abs((vertices[15]+vertices[36])/2-(origin[1]-aimed.position[1]))<1e-5,'The extension joins the original arc without moving its origin');
}
effect.draw({...pose,time:8.1,duration:8},{surfaces:[],segments:[]},new Float32Array(16),1.572);
assert(vertices[1]>=.2,'No new connection to the player after emission has stopped');
for(const time of [7.3,7.7,7.99,8,8.2,8.4]){effect.draw({...pose,time,duration:8},{surfaces:[],segments:[]},new Float32Array(16),1.572);assert(vertices.every(Number.isFinite),'Finite geometry throughout pressure loss');assert(effect.count<=effect.vertices.length);}
const drainedDraws=draws;effect.draw({...pose,time:8.6,duration:8},{surfaces:[],segments:[]},new Float32Array(16),1.572);assert.equal(draws,drainedDraws,'No remaining visual draw after the tail lands');
effect.dispose();assert.equal(allocations.size,0,'Dispose all effect GPU resources');
assert.deepEqual(await fs.readFile('dist/data/audio/a_a2005-flowing-water-345171.wav'),await fs.readFile('assets/a_a2005-flowing-water-345171.wav'),'The water audio remains identical to the supplied file');
// The Duke source is a WAV; its served MP3 is an existing encoded version.
const duke=await fs.readFile('dist/data/audio/DUKE AHH MUCH BETTER.mp3');assert(duke.length>1000);assert(duke.toString('ascii',0,3)==='ID3'||(duke[0]===255&&(duke[1]&224)===224),'Valid MP3 header');
console.log(JSON.stringify({piss:'passed',keyboard:'P',desktopOnly:true,noMobileButton:true,anyPositionAndOrientation:true,movementDoesNotCancel:true,sequenceUsesActualAudioEnd:true,replayLock:true,pauseAndNavigationCleanup:true,audioFailureRetry:true,existingEInteraction:true,waterCopyMatches:true,dukeMP3Present:true,visualAudioClock:true,streamCollision:true,gpuCleanup:true}));
