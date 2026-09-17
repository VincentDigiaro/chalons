import {BombAudio} from './highwind-bombs.js';
import {ORCA_MISSILE_CONFIG,missileImpactConfig} from './walk-config.js';

// Restore the original Highwind explosion from the pre-bombh.wav version.
// Render it once so impacts retain the shared propagation, pause and voice limits.
export function createMissileExplosionBuffer(context){
 const OfflineAudio=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 const rate=context.sampleRate,c=new OfflineAudio(1,Math.ceil(rate*2.9),rate),gain=c.createGain();
 // BombAudio applies a gain of .8 at the listener; preserve the original volume.
 gain.gain.setValueAtTime(.001/.8,0);gain.gain.exponentialRampToValueAtTime(.38/.8,.025);gain.gain.exponentialRampToValueAtTime(.001/.8,2.8);gain.connect(c.destination);
 const buffer=c.createBuffer(1,Math.ceil(rate*3),rate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 const noise=c.createBufferSource(),filter=c.createBiquadFilter(),bass=c.createOscillator();
 noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(1600,0);filter.frequency.exponentialRampToValueAtTime(90,2.8);noise.connect(filter).connect(gain);
 bass.frequency.setValueAtTime(80,0);bass.frequency.exponentialRampToValueAtTime(24,1.6);bass.connect(gain);
 noise.start(0);bass.start(0);noise.stop(2.9);bass.stop(2.9);
 return c.startRendering();
}

// A launch thump followed by a sustained rocket roar and a receding jet whistle.
// Generated once and mixed through the same pause, distance and voice limits.
export function createMissileLaunchBuffer(context){
 const rate=22050,buffer=context.createBuffer(1,Math.ceil(rate*1.45),rate),data=buffer.getChannelData(0);
 let seed=0x477dc2,low=0,phase=0,peak=0;
 for(let i=0;i<data.length;i++){
  const t=i/rate;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  const noise=(seed>>>0)/2147483648-1;low+=(noise-low)*.16;
  phase+=2*Math.PI*(210+680*Math.exp(-t*2.3))/rate;
  const envelope=(1-Math.exp(-t*70))*Math.exp(-t*2.2)*Math.min(1,(1.45-t)/.18);
  data[i]=((low*2.6+(noise-low)*.16)*(1+.13*Math.sin(t*65))+.11*Math.sin(phase))*envelope+.45*Math.sin(t*2*Math.PI*64)*Math.exp(-t*24);
  peak=Math.max(peak,Math.abs(data[i]));
 }
 for(let i=0;i<data.length;i++)data[i]*=.9/(peak||1);
 return buffer;
}
export class MissileAudio extends BombAudio{
 constructor({config=missileImpactConfig(ORCA_MISSILE_CONFIG),...options}={}){super({...options,config,fetchAudio:null});}
 loadSample(){
  if(!this.context||this.sampleReady)return this.sampleReady;
  const context=this.context;
  return this.sampleReady=Promise.resolve().then(()=>!this.disposed?createMissileExplosionBuffer(context):null).then(buffer=>{if(this.disposed)return;this.buffer=buffer;this.flush();}).catch(error=>{this.error=error.message;});
 }
 launch(){
  const c=this.context;if(!c||c.state==='closed'||this.disposed||this.paused||this.config.limites.sonsSimultanes===0)return;
  try{this.launchBuffer??=createMissileLaunchBuffer(c);this.playSound({at:c.currentTime,distance:0,pan:0,duration:this.launchBuffer.duration},this.launchBuffer);this.launches=(this.launches||0)+1;}catch{}
 }
 getState(){return {...super.getState(),file:null,explosionType:'original-highwind',launchType:'rocket',launches:this.launches||0,launchDurationSeconds:this.launchBuffer?.duration||0};}
}
