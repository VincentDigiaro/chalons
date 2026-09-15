import {PISS_DRAIN_SECONDS} from './walk-piss-effect.js';
const AUDIO_FILES=['./data/audio/a_a2005-flowing-water-345171.wav','./data/audio/DUKE AHH MUCH BETTER.mp3'];

export class WalkPissAction{
 constructor(mode){
  this.mode=mode;this.stage='idle';this.run=0;this.abort=new AbortController();
 }
 eligible(){return !this.disposed&&!this.mode.touch&&this.mode.phase==='playing'&&!this.mode.flight?.active;}
 update(){
  if(['loading','water'].includes(this.stage)&&!this.eligible())this.reset();
  if(this.stage==='reply'&&!this.eligible())this.waterDuration=0;
 }
 start(){
  if(this.stage!=='idle'||!this.eligible())return false;
  this.stage='loading';this.error=null;const run=++this.run;this.update();
  try{
   // Unlock Web Audio during the key press; the second sound follows the first
   // through onended, using the file's actual duration rather than a timer.
   this.context??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();
   const resumed=this.context.resume();
   this.loading??=Promise.all(AUDIO_FILES.map(async file=>{
    const response=await fetch(new URL(file,import.meta.url),{signal:this.abort.signal});
    if(!response.ok)throw Error('Audio '+response.status);
    return this.context.decodeAudioData(await response.arrayBuffer());
   })).catch(error=>{this.loading=null;throw error;});
   Promise.all([resumed,this.loading]).then(([,buffers])=>{
    if(run!==this.run||this.disposed)return;
    this.update();if(run!==this.run)return;
    this.play(buffers[0],'water',run,()=>{
     this.update();if(run!==this.run)return;
     this.play(buffers[1],'reply',run,()=>{this.reset();this.update();});
    });
   }).catch(error=>this.fail(error,run));
  }catch(error){this.fail(error,run);}
  return true;
 }
 play(buffer,stage,run,ended){
  try{
   const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);
   this.source=source;this.stage=stage;
   source.onended=()=>{source.disconnect();if(this.source===source)this.source=null;if(run===this.run&&!this.disposed)ended();};
   source.start();
   if(stage==='water'){this.startedAt=this.context.currentTime;this.waterDuration=buffer.duration;}
   this.update();
  }catch(error){this.fail(error,run);}
 }
 reset(){
  ++this.run;
  if(this.source){this.source.onended=null;try{this.source.stop();}catch{}this.source.disconnect();this.source=null;}
  this.stage='idle';this.waterDuration=0;
 }
 fail(error,run){if(run!==this.run||this.disposed)return;this.error=error.message;this.reset();this.update();console.warn('Action piss :',error.message);}
 dispose(){this.disposed=true;this.reset();this.abort.abort();this.context?.close().catch(()=>{});this.update();}
 getVisualState(){
  if(!['water','reply'].includes(this.stage)||!this.waterDuration||!this.eligible()||this.context.state==='suspended')return null;
  const time=Math.max(0,this.context.currentTime-this.startedAt);
  if(time>=this.waterDuration+PISS_DRAIN_SECONDS)return null;
  const {position,feet,yaw,pitch}=this.mode;return {position,feet,yaw,pitch,time,duration:this.waterDuration};
 }
 getState(){return {stage:this.stage,available:this.stage==='idle'&&this.eligible(),error:this.error||null};}
}
