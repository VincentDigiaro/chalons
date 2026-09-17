import assert from 'node:assert/strict';
import {HighwindBombs,MAX_BLASTS,MAX_RENDERED_BOMBS} from '../dist/highwind-bombs.js';
import {HighwindBombEffects} from '../dist/highwind-bomb-effects.js';
import {BOMB_DEFAULTS} from '../dist/walk-config.js';

const ship={enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:0,position:{x:0,y:0,z:40}}};
for(const hz of [30,60,120]){
 const impacts=[],bombs=new HighwindBombs({config:{...BOMB_DEFAULTS,dureeRechargeSecondes:.1},onImpact:b=>impacts.push(b.id)}),times=[];
 for(let frame=0;frame<hz*12;frame++){
  if(bombs.drop(ship)){times.push(bombs.time);assert(!bombs.drop(ship),'A second input cannot spend another bomb before reloading');}
  bombs.tick(1/hz);assert(bombs.blasts.length<=MAX_BLASTS);
 }
 assert.equal(times.length,120,'Continuous 0.1 s firing must not stall when three explosions are active');
 for(let i=1;i<times.length;i++)assert(Math.abs(times[i]-times[i-1]-.1)<1e-8);
 for(let i=0;i<hz*5;i++)bombs.tick(1/hz);assert.equal(impacts.length,120,'Every released bomb must impact, including those outside the visual budget');assert.equal(new Set(impacts).size,120);
}
const bombs=new HighwindBombs({config:{...BOMB_DEFAULTS,dureeRechargeSecondes:2.5}});assert(bombs.drop(ship));
for(let i=0;i<10;i++)bombs.tick(.1);const before=bombs.getState();bombs.tick(0);assert.deepEqual(bombs.getState(),before,'Pause freezes reload');
for(let i=0;i<15;i++)bombs.tick(.1);assert(bombs.drop(ship));assert(!bombs.ready);assert(Math.abs(bombs.getState().reloadSeconds-2.5)<1e-9,'Every new drop starts a full individual reload');
for(let i=0;i<100;i++)bombs.tick(.1);assert(bombs.drop(ship));assert(!bombs.drop(ship),'Idle time never accumulates a stock of loaded bombs');
const noop=()=>{},gl=new Proxy({},{get:()=>noop}),uniforms=new Proxy({},{get:(_o,key)=>key}),falling=Array.from({length:100},(_,i)=>({position:[i,0,20],velocity:[0,0,0],heading:0,age:0,scale:1}));
for(const mobile of [true,false]){
 const effects=new HighwindBombEffects(gl,{mobile});Object.assign(effects,{program:{},meshProgram:{},u:uniforms,mu:uniforms});
 effects.draw({time:0,blasts:[],bombs:falling},new Float32Array(16),{position:[0,0],height:30,yaw:0,pitch:0});
 assert.equal(effects.draws,(mobile?16:MAX_RENDERED_BOMBS)+1);assert.equal(falling.length,100,'Rendering does not remove simulated bombs');assert(effects.particles<=800);
}
console.log(JSON.stringify({individualBombReload:'passed',cooldownSeconds:.1,continuousDrops:120,frameRates:[30,60,120],everyBombImpacts:true,noStoredCharges:true,pausedReload:true,boundedRendering:true}));
