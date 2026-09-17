import {shipIdFromSearch} from './ship-selection.js';
// Standard MIDI files cannot be played by <audio>. This small Web Audio synth
// plays the supplied score, including its tempo map, programs and sustain pedal.
export function parseMidi(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);let at=0;
 const text=n=>{const s=String.fromCharCode(...bytes.subarray(at,at+n));at+=n;return s;},u32=()=>{const n=view.getUint32(at);at+=4;return n;},u16=()=>{const n=view.getUint16(at);at+=2;return n;},variable=()=>{let n=0,b,count=0;do{if(++count>4||at>=bytes.length)throw Error('MIDI invalide');b=bytes[at++];n=(n<<7)|(b&127);}while(b&128);return n;};
 if(text(4)!=='MThd')throw Error('En-tête MIDI invalide');const length=u32(),format=u16(),tracks=u16(),division=u16();if(format>1||division&32768||!division)throw Error('Format MIDI non pris en charge');at+=length-6;
 const events=[];
 for(let t=0;t<tracks;t++){
  if(text(4)!=='MTrk')throw Error('Piste MIDI invalide');const size=u32(),end=at+size;if(end>bytes.length)throw Error('Piste MIDI tronquée');let tick=0,running=0;
  while(at<end){tick+=variable();let status=bytes[at++];if(status<128){at--;status=running;}else if(status<240)running=status;
   if(status===255){const type=bytes[at++],n=variable();if(type===81&&n===3)events.push({tick,tempo:(bytes[at]<<16)|(bytes[at+1]<<8)|bytes[at+2]});at+=n;continue;}
   if(status===240||status===247){const n=variable();at+=n;running=0;continue;}
   if(status<128||status>=240)throw Error('Événement MIDI invalide');const kind=status>>4,ch=status&15,a=bytes[at++],b=kind===12||kind===13?0:bytes[at++];events.push({tick,kind,ch,a,b});
  }
 }
 events.sort((a,b)=>a.tick-b.tick);let tick=0,seconds=0,tempo=500000;const programs=Array(16).fill(0),volume=Array(16).fill(100),expression=Array(16).fill(127),pan=Array(16).fill(64),sustain=Array(16).fill(false),active=new Map(),notes=[];
 const finish=(key,time,force=false)=>{const stack=active.get(key);if(!stack?.length)return;const note=stack.find(n=>!n.released)||stack[0];if(sustain[note.channel]&&!force){note.released=true;return;}note.duration=Math.max(.035,time-note.time);notes.push(note);stack.splice(stack.indexOf(note),1);if(!stack.length)active.delete(key);};
 for(const e of events){seconds+=(e.tick-tick)*tempo/division/1e6;tick=e.tick;if(e.tempo){tempo=e.tempo;continue;}const {ch,a,b,kind}=e,key=ch+':'+a;
  if(kind===12)programs[ch]=a;
  if(kind===11){if(a===7)volume[ch]=b;if(a===11)expression[ch]=b;if(a===10)pan[ch]=b;if(a===64){sustain[ch]=b>=64;if(!sustain[ch])for(const [k,stack] of [...active])for(const note of [...stack])if(note.channel===ch&&note.released)finish(k,seconds,true);}if(a===123)for(const [k,stack] of [...active])for(const note of [...stack])if(note.channel===ch)finish(k,seconds,true);}
  if(kind===9&&b){const note={time:seconds,note:a,channel:ch,program:programs[ch],velocity:b/127*volume[ch]/127*expression[ch]/127,pan:(pan[ch]-64)/64};if(!active.has(key))active.set(key,[]);active.get(key).push(note);}
  if(kind===8||kind===9&&!b)finish(key,seconds);
 }
 for(const [key,stack] of [...active])for(const note of [...stack])finish(key,seconds+.2,true);
 notes.sort((a,b)=>a.time-b.time);return {notes,duration:Math.max(seconds,...notes.map(n=>n.time+n.duration))+.5};
}
function synthVoice(ctx,master,note,time){
  const gain=ctx.createGain(),pan=ctx.createStereoPanner(),osc=ctx.createOscillator(),drum=note.channel===9;
  const family=Math.floor(note.program/8);osc.type=drum?'triangle':[5,6,7,10].includes(family)?'sawtooth':[8,9].includes(family)?'square':'triangle';osc.frequency.setValueAtTime(drum?note.note<40?85:note.note<48?180:480:440*2**((note.note-69)/12),time);
  const duration=drum?.12:Math.min(note.duration,12),peak=note.velocity*(drum?.12:.10),attack=[5,6].includes(family)?.035:.009;
  if(drum)osc.frequency.exponentialRampToValueAtTime(40,time+duration);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(peak,time+Math.min(attack,duration/2));gain.gain.setValueAtTime(peak*.72,time+duration);gain.gain.linearRampToValueAtTime(0,time+duration+.12);pan.pan.value=Math.max(-1,Math.min(1,note.pan));osc.connect(gain);gain.connect(pan);pan.connect(master);osc.start(time);osc.stop(time+duration+.13);
}
// Render the entire supplied score once. Native buffer playback then continues
// without JS timers, even when scene loading or input processing stalls a frame.
export async function renderMidi(score,{signal}={}){
 const Context=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext,ctx=new Context(2,Math.ceil(score.duration*22050),22050),master=ctx.createGain(),compressor=ctx.createDynamicsCompressor();master.gain.value=.24;master.connect(compressor);compressor.connect(ctx.destination);
 for(let i=0;i<score.notes.length;i++){if(signal?.aborted)throw new DOMException('Aborted','AbortError');synthVoice(ctx,master,score.notes[i],score.notes[i].time);if(i%256===255)await new Promise(resolve=>setTimeout(resolve,0));}
 return ctx.startRendering();
}
export const HIGHWIND_FADE_SECONDS=2;
export class HighwindMusic{
 constructor({shipId='highwind'}={}){this.shipId=shipId;this.abort=new AbortController();this.generation=0;this.wanted=false;this.paused=false;}
 async prepare(){
  const options={signal:this.abort.signal};
  if(this.shipId==='orca'){this.audioInfo={file:'act-on-instinct.mp3',title:'Act On Instinct'};const response=await fetch('./data/orca/'+this.audioInfo.file,options);if(!response.ok)throw Error('Audio '+response.status);return this.context.decodeAudioData(await response.arrayBuffer());}
  const manifest=await fetch('./data/highwind/audio.json',options);if(!manifest.ok)throw Error('Musique '+manifest.status);this.audioInfo=await manifest.json();
  const response=await fetch('./data/highwind/'+this.audioInfo.file,options);if(!response.ok)throw Error('Audio '+response.status);return this.context.decodeAudioData(await response.arrayBuffer());
 }
 preload(){
  if(this.abort.signal.aborted)return Promise.resolve(null);
  if(this.loading)return this.loading;
  // Fetch and decode silently; only boarding may resume audio and start a source.
  try{this.context??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();
   this.loading=this.prepare().then(buffer=>{if(this.abort.signal.aborted)return null;this.buffer=buffer;this.error=null;return buffer;}).catch(error=>{this.loading=null;if(!this.abort.signal.aborted)this.error=error.message;return null;});return this.loading;
  }catch(error){this.error=error.message;return Promise.resolve(null);}
 }
 start(){
  if(this.wanted||this.abort.signal.aborted)return this.starting;
  this.wanted=true;this.paused=false;const generation=++this.generation;
  // Resume is invoked synchronously inside the user's boarding gesture.
  try{this.context??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();const resumed=this.context.resume();
   this.starting=(async()=>{const [,buffer]=await Promise.all([resumed,this.preload()]);if(!this.wanted||generation!==this.generation)return;if(!buffer)throw Error(this.error||'Audio indisponible');
    // Reboarding during the fade preserves the current musical phrase.
    if(this.source)this.cancelFade(true);
    else{this.source=this.context.createBufferSource();this.gain=this.context.createGain();this.gain.gain.value=this.paused?0:1;this.source.buffer=buffer;this.source.loop=true;this.source.connect(this.gain);this.gain.connect(this.context.destination);this.origin=this.context.currentTime;this.source.start();}
    this.error=null;if(this.paused)await this.context.suspend();
   })().catch(error=>{if(!this.abort.signal.aborted&&generation===this.generation){this.error=error.message;this.wanted=false;console.warn('Musique '+this.shipId+' :',error.message);}});return this.starting;
  }catch(error){this.error=error.message;this.wanted=false;return Promise.resolve();}
 }
 cancelFade(restore=false){
  const fade=this.fade,now=this.context?.currentTime||0;
  if(fade)clearTimeout(fade.timer);
  this.fade=null;
  if(!this.gain)return;
  const volume=fade?fade.volume*Math.max(0,Math.min(1,(fade.end-now)/HIGHWIND_FADE_SECONDS)):this.gain.gain.value;
  this.gain.gain.cancelScheduledValues(now);this.gain.gain.setValueAtTime(volume,now);
  if(restore)this.gain.gain.linearRampToValueAtTime(1,now+.08);
 }
 finishSource(){
  this.cancelFade();
  if(this.source){try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}
  this.gain?.disconnect();this.gain=null;
 }
 fadeOut(action){
  if(this.fade){if(action==='stop')this.fade.action='stop';return;}
  if(!this.source||this.context.state!=='running'){
   if(action==='stop')this.finishSource();else this.context?.suspend().catch(()=>{});
   return;
  }
  const now=this.context.currentTime,param=this.gain.gain,volume=param.value;
  param.cancelScheduledValues(now);param.setValueAtTime(volume,now);param.linearRampToValueAtTime(0,now+HIGHWIND_FADE_SECONDS);
  const fade=this.fade={action,volume,end:now+HIGHWIND_FADE_SECONDS,timer:null};
  // Web Audio performs the fade on its own clock. This timer only releases
  // the silent source or pauses its playhead; it never drives the volume.
  const finish=()=>{
   if(this.fade!==fade)return;
   const remaining=fade.end-this.context.currentTime;
   if(this.context.state==='running'&&remaining>.005){fade.timer=setTimeout(finish,Math.ceil(remaining*1000));return;}
   this.fade=null;
   if(fade.action==='stop')this.finishSource();
   if(this.paused)this.context.suspend().catch(()=>{});
  };
  fade.timer=setTimeout(finish,HIGHWIND_FADE_SECONDS*1000);
 }
 pause(){this.paused=true;this.fadeOut('pause');}
 resume(){this.paused=false;if(this.wanted){this.cancelFade(true);this.context?.resume().catch(()=>{});}}
 stop(){this.wanted=false;this.generation++;this.fadeOut('stop');}
 // Navigation/context teardown cannot leave audio or a cleanup timer alive.
 dispose(){this.wanted=false;this.generation++;this.finishSource();this.abort.abort();this.context?.close().catch(()=>{});}
 getState(){return {ship:this.shipId,title:this.audioInfo?.title||null,playing:!!this.source&&this.wanted&&!this.paused&&this.context?.state==='running',fadingOut:!!this.fade,preparing:!!this.loading&&!this.buffer,preloaded:!!this.buffer,file:this.audioInfo?.file||null,durationSeconds:this.buffer?.duration||0,elapsed:this.source?this.context.currentTime-this.origin:0,error:this.error||null};}
}
// Shared by the page's early preload and FPS mode; reuse the decoded track.
const preloadedMusic=new Map();
export function preloadHighwindMusic(search=globalThis.location?.search||''){
 const shipId=shipIdFromSearch(search);if(!shipId)return null;
 let music=preloadedMusic.get(shipId);if(!music||music.abort.signal.aborted){music=new HighwindMusic({shipId});preloadedMusic.set(shipId,music);}
 music.preload();return music;
}
