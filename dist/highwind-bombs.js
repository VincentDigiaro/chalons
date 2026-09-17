import {nearDistance,farDistance} from './walk-core.js';
import {shipMatrix,transform} from './highwind-math.js';
import {SpatialIndex} from './walk-collision-index.js';
import {WEAPON_IMPACT_CONFIG,validateBombConfig} from './walk-config.js';
import {normalizeBombImpact,bombImpactBounds} from './bomb-impact.js';
import {bombRotation,bombBottomOffset} from './bomb-orientation.js';
import {trimBombItems} from './bomb-limits.js';
import {CraterField} from './terrain-craters.js';

export const BOMB_CONFIG=WEAPON_IMPACT_CONFIG;
export const BLAST_RADIUS=BOMB_CONFIG.rayonExplosionMetres,BLAST_SECONDS=8,BOMB_COOLDOWN=BOMB_CONFIG.dureeRechargeSecondes;
export const BOMB_MODEL_LENGTH=7;
// Rendering budgets never gate firing or discard a bomb's physical impact.
export const MAX_RENDERED_BOMBS=BOMB_CONFIG.limites.bombesVisiblesOrdinateur,MAX_BLASTS=BOMB_CONFIG.limites.explosionsSimultanees;
const GRAVITY=18;

// Gameplay uses simulation time: pause freezes the fall, blast and reload alike.
export class HighwindBombs {
 constructor({groundHeight=()=>0,onImpact=()=>{},onDrop=()=>{},craters=[],config=BOMB_CONFIG,remainingBombs}={}){this.config=validateBombConfig(config);this.remainingBombs=this.config.nombreBombes===-1?-1:Math.min(this.config.nombreBombes,Number.isSafeInteger(remainingBombs)&&remainingBombs>=0?remainingBombs:this.config.nombreBombes);this.groundHeight=groundHeight;this.onImpact=onImpact;this.onDrop=onDrop;this.bombs=[];this.blasts=[];this.time=0;this.readyAt=0;this.sequence=0;this.revision=1;this.dropped=0;this.impacts=0;this.craters=[];this.damage=new SpatialIndex(200);this.excavation=new CraterField();for(const p of craters)this.addCrater(p);}
 addCrater(value){const p=normalizeBombImpact(value);if(!p)return;const id=this.craters.length;this.craters.push(p);this.damage.set(id,bombImpactBounds(p),p);this.excavation.add(p);this.revision++;}
 craterDepthAt(position){
  const base=this.config.rayonCreusementMetres*this.config.profondeurCratereRatio*2,attenuation=this.config.attenuationCreusementRepete;
  if(!base||!attenuation)return base;
  // Attenuate once, at detonation, from actual excavation at the impact point.
  // The recorded depth is final: replay/streaming must never attenuate it again.
  const previous=Math.max(0,-this.excavation.offset(position[0],position[1]));
  return base/(1+attenuation*(previous/base));
 }
 get ready(){return this.remainingBombs!==0&&this.time+1e-9>=this.readyAt;}
 drop(ship,velocity=[0,0,0]){
  if(ship?.shipId==='orca'||!this.ready||!ship?.enabled||!ship.residency?.data)return false;
  const pose=ship.pose,p=transform(shipMatrix(pose),[0,0,-.105]),scale=this.config.tailleMetres/BOMB_MODEL_LENGTH,heading=pose.angleDegres*Math.PI/180;
  const inherited=velocity.map((v,i)=>Number.isFinite(v)?v*(i===2?.3:.65):0),rotation=bombRotation(inherited,heading);
  // The tail clears the underside before release, even with a pitched ship.
  p[2]-=4.5*scale;p[2]=Math.max(this.groundHeight(p)-bombBottomOffset(rotation,scale),p[2]);
  this.bombs.push({id:++this.sequence,position:p,scale,velocity:inherited,rotation,age:0,heading});
  this.readyAt=this.time+this.config.dureeRechargeSecondes;this.dropped++;if(this.remainingBombs>0)this.remainingBombs--;this.onDrop(this.remainingBombs);return true;
 }
 tick(seconds){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  // Bound catch-up after a stalled tab, with swept substeps over changing terrain.
  const catchUp=this.config.simulation.rattrapageMaximumSecondes,dt=catchUp<0?seconds:Math.min(seconds,catchUp),steps=Math.ceil(dt/.016),h=dt/steps;
  for(let step=0;step<steps;step++){
   this.time+=h;
   this.blasts=this.blasts.filter(b=>this.time-b.started<BLAST_SECONDS);
   for(let i=this.bombs.length-1;i>=0;i--){
    const bomb=this.bombs[i],a=[...bomb.position];bomb.age+=h;
    for(let k=0;k<3;k++)bomb.position[k]+=bomb.velocity[k]*h;
    bomb.position[2]-=GRAVITY*h*h/2;bomb.velocity[2]-=GRAVITY*h;bomb.rotation=bombRotation(bomb.velocity,bomb.heading);
    const bottom=bombBottomOffset(bomb.rotation,bomb.scale);
    if(bomb.position[2]+bottom<=this.groundHeight(bomb.position)){
     // Bisect the swept segment instead of snapping to the frame's far endpoint.
     let lo=0,hi=1;for(let j=0;j<10;j++){const t=(lo+hi)/2,p=a.map((v,k)=>v+(bomb.position[k]-v)*t);if(p[2]+bottom>this.groundHeight(p))lo=t;else hi=t;}
     const p=a.map((v,k)=>v+(bomb.position[k]-v)*hi);p[2]=this.groundHeight(p);
     const blast={id:bomb.id,position:p,started:this.time,radius:this.config.rayonExplosionMetres,damageRadius:this.config.rayonDestructionBatimentsMetres,craterRadius:this.config.rayonCreusementMetres,craterDepth:this.craterDepthAt(p)};this.blasts.push(blast);trimBombItems(this.blasts,this.config.limites.explosionsSimultanees);this.bombs.splice(i,1);this.addCrater([...p.slice(0,2),blast.radius,blast.damageRadius,blast.craterDepth,blast.craterRadius]);this.impacts++;this.onImpact(blast);
    }
   }
  }
 }
 affects(node){
  if(!node?.bounds)return false;
  // Permanent, indexed damage. New and reloaded assets use the same craters.
  if(node.bombRevision!==this.revision){node.bombRevision=this.revision;const hits=this.damage.query(node.bounds).filter(p=>p[3]>0&&nearDistance(node.bounds,p)<p[3]-1e-5);node.bombAffected=hits.length>0;node.bombSuppressed=hits.some(p=>farDistance(node.bounds,p)<=p[3]);}
  return !!node.bombAffected;
 }
 suppresses(node){return this.affects(node)&&!!node.bombSuppressed;}
 cameraEffect(camera,reducedMotion=false){
  if(reducedMotion)return {camera,flash:0};
  let shake=0,flash=0;for(const b of this.blasts){const age=this.time-b.started,d=Math.hypot(camera.position[0]-b.position[0],camera.position[1]-b.position[1],camera.height-b.position[2]),falloff=Math.max(0,1-d/(b.radius*8));shake+=Math.exp(-age*3)*falloff*.018;flash=Math.max(flash,Math.max(0,1-age/.4)*falloff*.24);}
  shake=Math.min(.018,shake);return {camera:{...camera,yaw:camera.yaw+Math.sin(this.time*61)*shake,pitch:camera.pitch+Math.sin(this.time*79)*shake*.6},flash};
 }
 getState(){return {craterDepthRatio:this.config.profondeurCratereRatio,craterDepthMetres:this.config.rayonCreusementMetres*this.config.profondeurCratereRatio*2,craterRadiusMetres:this.config.rayonCreusementMetres,radiusMetres:this.config.rayonExplosionMetres,destructionRadiusMetres:this.config.rayonDestructionBatimentsMetres,bombSizeMetres:this.config.tailleMetres,cooldownSeconds:this.config.dureeRechargeSecondes,initialBombs:this.config.nombreBombes,remainingBombs:this.remainingBombs,durationSeconds:BLAST_SECONDS,permanentDamage:true,craters:this.craters.length,ready:this.ready,reloadSeconds:Math.max(0,this.readyAt-this.time),dropped:this.dropped,impacts:this.impacts,bombs:this.bombs.map(b=>({position:[...b.position],velocity:[...b.velocity],direction:b.rotation.slice(6).map(n=>-n),age:b.age})),explosions:this.blasts.map(b=>({position:[...b.position],age:this.time-b.started,radius:b.radius,damageRadius:b.damageRadius,craterRadius:b.craterRadius,craterDepth:b.craterDepth}))};}
 dispose(){this.bombs.length=0;this.blasts.length=0;this.damage.clear();this.excavation=new CraterField();this.revision++;}
}

export const BOMB_SOUND_SPEED=343;
export const BOMB_EXPLOSION_SOUND='./data/audio/bombh.wav';
// A short launcher pressure pulse, with a mechanical click and a low barrel
// resonance. Built once locally so the first shot never waits for a download.
function createLaunchBuffer(context){
 const rate=22050,buffer=context.createBuffer(1,Math.ceil(rate*.38),rate),data=buffer.getChannelData(0);
 let seed=0x71b04d,low=0,phase=0,peak=0;
 for(let i=0;i<data.length;i++){
  const t=i/rate;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
  const noise=(seed>>>0)/2147483648-1;low+=(noise-low)*.28;
  phase+=2*Math.PI*(58+115*Math.exp(-t/.022))/rate;
  const body=(Math.sin(phase)+.22*Math.sin(phase*1.83))*Math.exp(-t/.055);
  const air=low*1.5*Math.exp(-t/.032),click=(noise-low)*.45*Math.exp(-t/.003);
  data[i]=(body+air+click)*(1-Math.exp(-t/.001))*Math.min(1,(data.length-1-i)/(rate*.04));
  peak=Math.max(peak,Math.abs(data[i]));
 }
 for(let i=0;i<data.length;i++)data[i]*=.88/(peak||1);
 return buffer;
}
// The supplied explosion clip is shared by every voice. Game pause freezes the
// audio clock, including pending distance delays; closing the scene cancels all.
export class BombAudio {
 constructor({fetchAudio=globalThis.fetch?.bind(globalThis),config=BOMB_CONFIG}={}){
  this.config=validateBombConfig(config);
  this.pending=[];this.booms=new Set();this.listener=null;this.disposed=false;
  this.bytes=fetchAudio?Promise.resolve().then(()=>fetchAudio(new URL(BOMB_EXPLOSION_SOUND,import.meta.url))).then(r=>{if(!r.ok)throw Error('Son explosion '+r.status);return r.arrayBuffer();}).catch(error=>{this.error=error.message;return null;}):Promise.resolve(null);
 }
 unlock(){try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio||this.disposed)return;this.context??=new Audio();this.paused=false;this.context.resume().catch(()=>{});this.loadSample();}catch{}}
 loadSample(){
  if(!this.context||this.sampleReady)return this.sampleReady;
  const context=this.context;
  return this.sampleReady=this.bytes.then(bytes=>bytes&&!this.disposed?context.decodeAudioData(bytes):null).then(buffer=>{if(this.disposed)return;this.buffer=buffer;this.flush();}).catch(error=>{this.error=error.message;});
 }
 update(_bombs,camera){this.listener={position:[...camera.position,camera.height],yaw:camera.yaw};this.flush();}
 launch(){
  const c=this.context;if(!c||c.state==='closed'||this.disposed||this.paused||this.config.limites.sonsSimultanes===0)return;
  try{
   this.launchBuffer??=createLaunchBuffer(c);
   // Scheduling while resume() settles also covers the very first B press.
   this.playSound({at:c.currentTime,distance:0,pan:0,duration:this.launchBuffer.duration},this.launchBuffer);
  }catch{/* Audio must never interrupt a successful launch. */}
 }
 impact(position=0,duration=BLAST_SECONDS){
  const c=this.context;if(!c||c.state!=='running'||this.disposed)return;
  const delta=Array.isArray(position)&&this.listener?position.map((p,k)=>p-this.listener.position[k]):null;
  const distance=delta?Math.hypot(...delta):typeof position==='number'?Math.max(0,position):0;
  const pan=delta&&distance>0?(delta[0]*Math.cos(this.listener.yaw)-delta[1]*Math.sin(this.listener.yaw))/distance:0;
  const event={at:c.currentTime+distance/BOMB_SOUND_SPEED,distance,pan:Math.max(-1,Math.min(1,pan)),duration};
  if(this.buffer&&event.at<=c.currentTime+.02){this.playSound(event);return;}
  this.pending.push(event);
  // Pending propagation does not occupy a playback voice or block nearer sounds.
  trimBombItems(this.pending,this.config.limites.sonsEnAttente);this.flush();
 }
 flush(){
  const c=this.context;if(!c||c.state!=='running'||!this.buffer||this.disposed)return;
  const now=c.currentTime,due=this.pending.filter(event=>event.at<=now+.02);this.pending=this.pending.filter(event=>event.at>now+.02);
  for(const event of due.sort((a,b)=>a.at-b.at))this.playSound(event);
 }
 playSound(event,buffer=this.buffer){
  const c=this.context,start=Math.max(c.currentTime,event.at),offset=Math.max(0,c.currentTime-event.at),duration=Math.min(event.duration,buffer.duration)-offset;
  const limit=this.config.limites.sonsSimultanes;if(duration<=0||limit===0)return;
  try{
   while(limit>0&&this.booms.size>=limit)this.booms.values().next().value.stop();
   const source=c.createBufferSource(),gain=c.createGain(),pan=c.createStereoPanner?.(),volume=.8/(1+event.distance/220),end=start+duration;
   source.buffer=buffer;source.loop=false;gain.gain.setValueAtTime(volume,start);gain.gain.setValueAtTime(volume,Math.max(start,end-.12));gain.gain.linearRampToValueAtTime(0,end);
   source.connect(gain);gain.connect(pan||c.destination);pan?.connect(c.destination);pan?.pan.setValueAtTime(event.pan,start);
   const voice={source,gain,pan,stop:()=>{const now=c.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(0,now,.008);source.stop(now+.03);this.booms.delete(voice);}};
   this.booms.add(voice);source.onended=()=>{source.disconnect();gain.disconnect();pan?.disconnect();this.booms.delete(voice);};source.start(start,offset,duration);source.stop(end);
  }catch{/* Audio must never interrupt gameplay. */}
 }
 pause(){this.paused=true;this.context?.suspend().catch(()=>{});}
 resume(){this.paused=false;this.context?.resume().catch(()=>{});}
 getState(){return {loaded:!!this.buffer,file:'bombh.wav',durationSeconds:this.buffer?.duration||0,pending:this.pending.length,voices:this.booms.size,error:this.error||null};}
 dispose(){this.disposed=true;this.pending.length=0;this.booms.clear();this.context?.close().catch(()=>{});this.context=null;this.buffer=null;this.launchBuffer=null;}
}
