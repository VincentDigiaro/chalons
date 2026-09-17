import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BombAudio,HighwindBombs,BOMB_SOUND_SPEED,BLAST_SECONDS} from '../dist/highwind-bombs.js';
import {WalkMode} from '../dist/walk-mode.js';
const parameter=()=>({events:[],setValueAtTime(value,time){this.events.push({value,time});},linearRampToValueAtTime(value,time){this.events.push({value,time});},cancelScheduledValues(){},setTargetAtTime(value,time,smoothing){this.events.push({value,time,smoothing});}});
class Context {
 constructor(){this.state='suspended';this.currentTime=12;this.destination={};this.nodes=[];this.decodeCalls=0;}
 resume(){this.state='running';return Promise.resolve();}
 suspend(){this.state='suspended';return Promise.resolve();}
 close(){this.state='closed';return Promise.resolve();}
 async decodeAudioData(bytes){assert(bytes.byteLength>44);this.decodeCalls++;return {duration:8};}
 node(kind){const node={kind,gain:parameter(),pan:parameter(),connections:[],connect(next){this.connections.push(next);return next;},disconnect(){this.disconnected=true;this.connections=[];},start(time,offset,duration){Object.assign(this,{started:time,offset,duration});},stop(time){this.stopped=time;}};this.nodes.push(node);return node;}
 createGain(){return this.node('gain');}
 createBufferSource(){return this.node('sample');}
 createStereoPanner(){return this.node('pan');}
 createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return {numberOfChannels:channels,length,sampleRate,duration:length/sampleRate,getChannelData:()=>data};}
}
const wav=await fs.readFile('dist/data/audio/bombh.wav'),original=await fs.readFile('assets/audio/bombh.wav');assert.equal(wav.readUInt32LE(40)/wav.readUInt32LE(28),BLAST_SECONDS);assert(wav.subarray(44,10000).equals(original.subarray(44,10000)),'The explosion comes from the supplied sample, not synthesized noise');assert.equal(wav.readInt16LE(wav.length-2),0,'The clip fades to silence at the animation length');
let fetches=0;const fetchAudio=async url=>{assert(url.pathname.endsWith('/data/audio/bombh.wav'));fetches++;return {ok:true,arrayBuffer:async()=>wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength)};};
globalThis.AudioContext=Context;
const audio=new BombAudio({fetchAudio}),camera={position:[0,0],height:0,yaw:0};audio.impact();assert.equal(audio.context,undefined);audio.unlock();await audio.sampleReady;const c=audio.context;assert(audio.buffer);assert.equal(fetches,1);assert.equal(c.decodeCalls,1);
// The removed whistle cannot create an oscillator or a water-drop sound.
audio.update([{id:1,position:[5,0,50],velocity:[0,0,-10],age:1}],camera);assert.equal(c.nodes.length,0);
audio.impact([0,0,BOMB_SOUND_SPEED]);assert.equal(audio.pending.length,1);assert.equal(audio.pending[0].at,13,'Vertical separation also delays sound');assert.equal(c.nodes.length,0);c.currentTime=12.5;audio.update([],camera);assert.equal(c.nodes.length,0,'No sound before propagation reaches the listener');c.currentTime=13;audio.update([],camera);assert.equal(audio.pending.length,0);assert.equal(audio.booms.size,1);
const first=[...audio.booms][0];assert.equal(first.source.started,13);assert.equal(first.source.offset,0);assert.equal(first.source.duration,8);assert.equal(first.source.stopped,21);assert.equal(first.source.loop,false);assert.equal(first.gain.gain.events.at(-1).value,0);assert.equal(first.gain.gain.events.at(-1).time,21);
const distantVolume=first.gain.gain.events[0].value;audio.impact(0);const near=[...audio.booms].at(-1);assert(near.gain.gain.events[0].value>distantVolume);assert.equal(near.source.buffer,first.source.buffer);assert.equal(c.decodeCalls,1);
audio.impact([BOMB_SOUND_SPEED,0,0]);assert.equal(audio.pending[0].pan,1);audio.pause();c.currentTime=14;audio.update([],camera);assert.equal(audio.pending.length,1);audio.resume();audio.update([],camera);assert.equal(audio.pending.length,0);
// Playback resumes at the right offset if a loading/frame delay missed onset.
audio.pending.push({at:12,distance:0,pan:0,duration:8});c.currentTime=15;audio.flush();const late=[...audio.booms].at(-1);assert.equal(late.source.offset,3);assert.equal(late.source.duration,5);assert.equal(late.source.stopped,20);
first.source.onended();assert(first.source.disconnected&&first.gain.disconnected&&first.pan.disconnected);
for(let i=0;i<50;i++)audio.impact(3430);assert.equal(audio.pending.length,50,'Pending propagation must not take the eight active voices');c.currentTime+=10;audio.update([],camera);assert.equal(audio.pending.length,0);assert(audio.booms.size<=8);assert.equal(fetches,1);
audio.dispose();assert.equal(c.state,'closed');assert.equal(audio.pending.length,0);assert.equal(audio.booms.size,0);assert.equal(audio.context,null);
const broken=new BombAudio({fetchAudio:async()=>({ok:false,status:404})});broken.unlock();await broken.sampleReady;assert.equal(broken.getState().error,'Son explosion 404');assert.doesNotThrow(()=>broken.impact());broken.dispose();
// Launch feedback is immediate even before the explosion sample or resume is ready.
const launcher=new BombAudio({fetchAudio:null});launcher.launch();assert.equal(launcher.context,undefined);launcher.unlock();launcher.context.state='suspended';launcher.launch();
const shot=[...launcher.booms][0],clip=shot.source.buffer,pcm=clip.getChannelData(0);
assert.equal(shot.source.started,launcher.context.currentTime);assert.equal(clip.duration,.38);assert.equal(clip.numberOfChannels,1);assert(pcm.every(Number.isFinite));assert(Math.max(...pcm.map(Math.abs))<=.881);assert(pcm.some(v=>Math.abs(v)>.5));assert.equal(Math.abs(pcm[0]),0);assert.equal(Math.abs(pcm.at(-1)),0);
launcher.context.state='running';launcher.launch();assert.equal([...launcher.booms].at(-1).source.buffer,clip,'Each shot reuses the launcher clip');assert.equal(launcher.context.decodeCalls,0,'Launch feedback never waits for network decoding');
shot.source.onended();assert(shot.source.disconnected);assert(shot.gain.disconnected);assert(!launcher.booms.has(shot));
launcher.pause();const pausedCount=launcher.booms.size;launcher.launch();assert.equal(launcher.booms.size,pausedCount);launcher.resume();
for(let i=0;i<40;i++)launcher.launch();assert.equal(launcher.booms.size,launcher.config.limites.sonsSimultanes);launcher.dispose();assert.equal(launcher.launchBuffer,null);assert.doesNotThrow(()=>launcher.launch());
// The same successful-drop callback handles first press and held-B repetition.
const firing=new BombAudio({fetchAudio:null}),ship={enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:0,position:{x:0,y:0,z:90}}};
const bombs=new HighwindBombs({config:{nombreBombes:3,dureeRechargeSecondes:.1},onDrop:()=>firing.launch()}),mode=Object.assign(Object.create(WalkMode.prototype),{phase:'playing',flight:{active:true},bombInputs:new Set(),renderer:{highwind:ship,bombs,bombAudio:firing}});
const shots=()=>firing.context.nodes.filter(n=>n.kind==='sample').length;
mode.holdBomb('keyboard');assert.equal(shots(),1);mode.dropBomb();mode.repeatBomb();assert.equal(shots(),1,'No launch sound during reload');bombs.tick(.1);mode.repeatBomb();assert.equal(shots(),2);mode.releaseBomb('keyboard');bombs.tick(.1);mode.repeatBomb();assert.equal(shots(),2,'Releasing B stops the launch sound');mode.holdBomb('keyboard');assert.equal(shots(),3);bombs.tick(.1);mode.repeatBomb();mode.dropBomb();assert.equal(shots(),3,'An empty stock stays silent');mode.phase='paused';mode.dropBomb();mode.repeatBomb();assert.equal(shots(),3);firing.dispose();
delete globalThis.AudioContext;const unsupported=new BombAudio({fetchAudio:null});assert.doesNotThrow(()=>{unsupported.unlock();unsupported.launch();unsupported.impact();unsupported.update([],camera);unsupported.pause();unsupported.resume();unsupported.dispose();});
console.log(JSON.stringify({bombAudio:'passed',launcherSeconds:.38,firstShotImmediate:true,heldBMatchesSuccessfulDrops:true,suppliedWav:true,durationSeconds:8,propagationMetresPerSecond:BOMB_SOUND_SPEED,threeDimensionalDistance:true,distanceAttenuation:true,sharedDecodedBuffer:true,boundedPlayback:true,pauseResumeAndCleanup:true,syntheticWhistleRemoved:true}));
