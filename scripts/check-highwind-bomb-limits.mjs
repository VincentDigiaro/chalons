import assert from 'node:assert/strict';
import {BOMB_DEFAULTS,BOMB_LIMIT_DEFAULTS,BOMB_PARTICLE_DEFAULTS,validateBombConfig} from '../dist/walk-config.js';
import {HighwindBombs,BombAudio} from '../dist/highwind-bombs.js';
import {HighwindBombEffects} from '../dist/highwind-bomb-effects.js';
import {BombLights} from '../dist/bomb-lights.js';

for(const section of ['limites','particules','simulation']){
 for(const bad of [null,[],2,'1'])assert.throws(()=>validateBombConfig({[section]:bad}),new RegExp(section));
 assert.throws(()=>validateBombConfig({[section]:{typo:1}}),/typo/);
 assert(Object.isFrozen(validateBombConfig({})[section]));
}
for(const key of Object.keys(BOMB_LIMIT_DEFAULTS)){
 for(const value of [-1,0,1,1024])assert.equal(validateBombConfig({limites:{[key]:value}}).limites[key],value);
 for(const value of [-2,.5,Infinity,null,'8',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateBombConfig({limites:{[key]:value}}),new RegExp(key));
}
for(const key of Object.keys(BOMB_PARTICLE_DEFAULTS)){
 for(const value of [0,1,1024])assert.equal(validateBombConfig({particules:{[key]:value}}).particules[key],value);
 for(const value of [-1,.5,Infinity,null])assert.throws(()=>validateBombConfig({particules:{[key]:value}}),new RegExp(key));
}
const noop=()=>{},uniforms=new Proxy({},{get:(_o,k)=>k}),gl=new Proxy({getParameter:()=>16384,createTexture:()=>({})},{get:(o,k)=>o[k]??noop});
const camera={position:[0,0],height:50,yaw:0,pitch:0},falling=Array.from({length:120},(_,id)=>({id,position:[id,0,40],velocity:[0,0,-10],heading:0,scale:1,age:1}));
function audioContext(){const parameter=()=>({setValueAtTime:noop,linearRampToValueAtTime:noop,cancelScheduledValues:noop,setTargetAtTime:noop}),node=()=>({gain:parameter(),pan:parameter(),connect:noop,disconnect:noop,start:noop,stop:noop});return {state:'running',currentTime:0,destination:{},createGain:node,createBufferSource:node,createStereoPanner:node};}
for(const limit of [0,2,12,-1]){
 const config=validateBombConfig({...BOMB_DEFAULTS,dureeRechargeSecondes:0,limites:Object.fromEntries(Object.keys(BOMB_LIMIT_DEFAULTS).map(k=>[k,limit]))}),impacts=[],bombs=new HighwindBombs({config,onImpact:b=>impacts.push(b)});
 for(let i=0;i<25;i++)assert(bombs.drop({enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:0,position:{x:i*20,y:0,z:0}}}));
 bombs.tick(.01);assert.equal(impacts.length,25);assert.equal(bombs.craters.length,25);assert.equal(bombs.blasts.length,limit<0?25:Math.min(25,limit));
 for(const mobile of [false,true]){
  const effect=new HighwindBombEffects(gl,{mobile,config});Object.assign(effect,{program:{},meshProgram:{},u:uniforms,mu:uniforms});
  effect.draw({time:.5,bombs:falling,blasts:impacts},new Float32Array(16),camera);
  assert.equal(effect.visibleBombs,limit<0?120:Math.min(120,limit));assert.equal(effect.particles,limit<0?effect.sprites.length:Math.min(limit,effect.sprites.length));
  if(limit===-1){assert(effect.particles>800,'Unlimited particles must grow past the old hidden 800-sprite buffer');assert(effect.vertices.length>=effect.particles*60);}
 }
 const lighting=new BombLights(gl,{config});lighting.apply({time:.5,blasts:impacts},uniforms);assert.equal(lighting.count,limit<0?25:Math.min(25,limit));
 const audio=new BombAudio({config,fetchAudio:null});audio.context=audioContext();audio.buffer={duration:8};
 for(let i=0;i<180;i++)audio.impact(3430);assert.equal(audio.pending.length,limit<0?180:Math.min(180,limit),'Queue capacity follows config, including beyond 128');audio.context.currentTime=10;audio.flush();assert.equal(audio.booms.size,limit<0?180:Math.min(180,limit),'Voice capacity follows config, including beyond eight');
}
const asymmetric=validateBombConfig({limites:{bombesVisiblesOrdinateur:45,bombesVisiblesMobile:23,particulesVisibles:-1},particules:{groupesFumeeOrdinateur:0,groupesFumeeMobile:0,etincellesOrdinateur:0,etincellesMobile:0,particulesParTrainee:7}});
for(const mobile of [false,true]){const effect=new HighwindBombEffects(gl,{config:asymmetric,mobile});Object.assign(effect,{program:{},meshProgram:{},u:uniforms,mu:uniforms});effect.draw({time:1,bombs:falling,blasts:[]},new Float32Array(16),camera);assert.equal(effect.visibleBombs,mobile?23:45);assert.equal(effect.particles,(mobile?23:45)*7);}
for(const cap of [.05,.2,-1]){const b=new HighwindBombs({config:{simulation:{rattrapageMaximumSecondes:cap}}});b.tick(.5);assert(Math.abs(b.time-(cap<0?.5:cap))<1e-8);}
console.log(JSON.stringify({bombLimits:'passed',zeroFiniteUnlimited:true,allImpactsKeepDamage:true,particlesAbove800:true,lightsAboveOne:true,audioAboveEightAnd128:true,desktopMobileIndependent:true,simulationCatchUpConfigurable:true}));
