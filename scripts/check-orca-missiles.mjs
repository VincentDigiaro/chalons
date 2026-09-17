import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {OrcaMissiles as RuntimeOrcaMissiles,orcaGroundAim,turnMissile} from '../dist/orca-missiles.js';
import {HighwindBombs} from '../dist/highwind-bombs.js';
import {advanceFlight} from '../dist/highwind-flight.js';
import {shipMatrix,transform,inversePoint} from '../dist/highwind-math.js';
import {ORCA_MISSILE_DEFAULTS,validateMissileConfig} from '../dist/walk-config.js';
import {missileMesh} from '../dist/orca-missile-effects.js';
import {createMissileLaunchBuffer,MissileAudio} from '../dist/orca-missile-audio.js';
const near=(a,b,e=1e-4)=>assert(Math.abs(a-b)<e,`${a} ≠ ${b}`);
// User tuning in fps-config.json must not silently change these physics fixtures.
class OrcaMissiles extends RuntimeOrcaMissiles{
 constructor(options={}){super({...options,missileConfig:{...ORCA_MISSILE_DEFAULTS,...options.missileConfig}});}
}
const pose={position:{x:0,y:0,z:100},longueurMetres:9.454,angleDegres:0,pitch:0};
const input={forward:0,strafe:0,lift:0,turn:0};
for(const [control,field,sign] of [['forward','pitch',-1],['strafe','roll',1]])for(const direction of [-1,1]){
 let ship=pose;for(let i=0;i<120;i++)ship=advanceFlight(ship,{...input,[control]:direction},1/60,300,undefined,'orca');
 assert(ship[field]*sign*direction>.3);
 const highwind=advanceFlight(pose,{...input,[control]:direction},1/60,300,undefined,'highwind');assert.equal(highwind.pitch,0);assert.equal(highwind.roll,undefined);
 for(let i=0;i<120;i++)ship=advanceFlight(ship,input,1/60,300,undefined,'orca');near(ship[field],0);
}
for(const roll of [-.4,0,.4])for(const pitch of [-.4,0,.4])for(const angleDegres of [0,70,220]){const p={...pose,roll,pitch,angleDegres},v=[.2,.3,-.1],local=inversePoint(p,transform(shipMatrix(p),v));local.forEach((n,i)=>near(n,v[i]));}
const aim=orcaGroundAim(pose,()=>0);near(aim[0],0);near(aim[2],0);assert(aim[1]>185&&aim[1]<195);
const turned=orcaGroundAim({...pose,angleDegres:90},()=>0);near(turned[0],aim[1]);near(turned[1],0);
assert(orcaGroundAim(pose,p=>p[1]>40?60:0)[1]<100);
assert.equal(orcaGroundAim({...pose,pitch:1.2},()=>0),null);
near(Math.hypot(...turnMissile([0,1,0],[0,-1,0],.1)),1);
for(const bad of [{missilesParSalve:0},{nombreMissiles:-2},{trainee:{dureeSecondes:0}},{trainee:{maximumParticules:1e9}},{explosion:null},{vitesseMps:0},{vitesseMps:-1},{vitesseMps:'120'},{vitesseMps:null},{vitesseMps:Infinity},{angleConeDepartDegres:-1},{angleConeDepartDegres:181},{distanceDispersionMetres:-1},{dureeAccelerationSecondes:-1},{vitesseRotationDegresParSeconde:0},{angleViseeDegres:90}])assert.throws(()=>validateMissileConfig(bad),/orca.missiles/);
assert.equal(validateMissileConfig({explosion:{rayonExplosionMetres:5}}).explosion.rayonDestructionBatimentsMetres,12);
assert.equal(validateMissileConfig({vitesseMaxMps:83}).vitesseMps,83);
assert.equal(validateMissileConfig({vitesseMps:47,vitesseMaxMps:83}).vitesseMps,47);
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
// Check the actual velocity, including moving ships at arbitrary attitudes.
const coneMinimum=Math.cos(22.5*Math.PI/180);
for(const angleDegres of [0,90,219])for(const pitch of [-.3,0,.3])for(const roll of [-.4,0,.4]){
 const attitude={...pose,angleDegres,pitch,roll},matrix=shipMatrix(attitude),forward=[matrix[4],matrix[5],matrix[6]].map(v=>v/attitude.longueurMetres);
 const ship={shipId:'orca',enabled:true,residency:{data:{}},pose:attitude};
 for(const seed of [1,3,8,13,50]){
  const missiles=new OrcaMissiles({random:random(seed)});assert(missiles.drop(ship,[500,-500,300]));
  for(const missile of missiles.bombs){near(Math.hypot(...missile.velocity),28);const dot=missile.velocity.reduce((n,v,i)=>n+v/28*forward[i],0);assert(dot>=coneMinimum-1e-6,`Outside cone: ${dot}`);}
 }
}
for(const edge of [0,1]){const missiles=new OrcaMissiles({random:()=>edge});assert(missiles.drop({shipId:'orca',enabled:true,residency:{data:{}},pose}));near(missiles.bombs[0].direction[1],edge?coneMinimum:1);}
for(const fps of [30,60,120])for(const vitesseMps of [10,60,240]){
 const missiles=new OrcaMissiles({random:random(7),missileConfig:{vitesseMps,angleConeDepartDegres:0}});
 assert(missiles.drop({shipId:'orca',enabled:true,residency:{data:{}},pose}));const initial=Math.min(28,vitesseMps);near(Math.hypot(...missiles.bombs[0].velocity),initial);
 for(let i=0;i<fps/5;i++)missiles.tick(1/fps);
 const missile=missiles.bombs[0];near(missile.speed,vitesseMps-(vitesseMps-initial)*Math.exp(-Math.log(20)*.2));near(Math.hypot(...missile.velocity),missile.speed);assert(missile.speed<=vitesseMps);assert.equal(missiles.getState().vitesseMps,vitesseMps);
}
for(const angleConeDepartDegres of [0,15,90,180]){const missiles=new OrcaMissiles({random:()=>1,missileConfig:{angleConeDepartDegres}});assert(missiles.drop({shipId:'orca',enabled:true,residency:{data:{}},pose}));near(missiles.bombs[0].direction[1],Math.cos(angleConeDepartDegres*Math.PI/360));}
for(const dureeAccelerationSecondes of [.5,2]){const missiles=new OrcaMissiles({missileConfig:{dureeAccelerationSecondes,distanceDispersionMetres:200,angleConeDepartDegres:0}});assert(missiles.drop({shipId:'orca',enabled:true,residency:{data:{}},pose}));for(let i=0;i<60;i++)missiles.tick(1/60);near(missiles.bombs[0].speed,120-92*Math.exp(-Math.log(20)/dureeAccelerationSecondes));}
for(const vitesseMps of [40,120])for(const distanceDispersionMetres of [0,20,80]){
 const missiles=new OrcaMissiles({missileConfig:{vitesseMps,distanceDispersionMetres,dureeAccelerationSecondes:0,angleConeDepartDegres:0}});assert(missiles.drop({shipId:'orca',enabled:true,residency:{data:{}},pose}));
 const missile=missiles.bombs[0],initial=[...missile.direction];near(missile.speed,vitesseMps);
 while(missile.distanceTravelled<distanceDispersionMetres){missiles.tick(1/120);assert.deepEqual(missile.direction,initial,'No turn before configured travelled distance');}
 assert(missile.distanceTravelled<=distanceDispersionMetres+vitesseMps/120+1e-5);missiles.tick(1/120);assert(missile.direction[2]<0,'Guidance starts toward the saved ground target');
}
for(const vitesseRotationDegresParSeconde of [60,360]){
 const missiles=new OrcaMissiles({missileConfig:{distanceDispersionMetres:0,angleConeDepartDegres:0,vitesseRotationDegresParSeconde}});assert(missiles.drop({shipId:'orca',enabled:true,residency:{data:{}},pose}));missiles.tick(1/120);near(Math.acos(missiles.bombs[0].direction[1])*180/Math.PI,vitesseRotationDegresParSeconde/120);
}
for(const fps of [30,60,120])for(const seed of [1,5,42,2718]){
 const ship={shipId:'orca',enabled:true,residency:{data:{}},pose:structuredClone(pose)},impacts=[];
 const missiles=new OrcaMissiles({random:random(seed),onImpact:b=>impacts.push(b)});assert(missiles.drop(ship));assert.equal(missiles.bombs.length,2);assert(!missiles.drop(ship));
 assert(Math.hypot(...missiles.bombs[0].direction.map((v,i)=>v-missiles.bombs[1].direction[i]))>1e-5);
 const target=[...missiles.bombs[0].target];ship.pose.angleDegres=90;ship.pose.position.x+=50;missiles.updateAim(ship);assert.notDeepEqual(missiles.target,target);assert.deepEqual(missiles.bombs[0].target,target);
 const frozen=JSON.stringify(missiles.getState());missiles.tick(0);assert.equal(JSON.stringify(missiles.getState()),frozen);
 for(let i=0;i<fps*8&&missiles.bombs.length;i++)missiles.tick(1/fps);
 assert.equal(missiles.impacts,2,`Convergence ${seed}/${fps}`);assert.equal(missiles.expired,0);
 for(const impact of impacts)assert(Math.hypot(...impact.position.map((v,i)=>v-target[i]))<2,`Target error ${Math.hypot(...impact.position.map((v,i)=>v-target[i]))} ${seed}/${fps}`);
 assert(missiles.trails.length>100,'Long trails persist after impact');assert(missiles.trails.length<=3000);
 for(let i=0;i<fps*9;i++)missiles.tick(1/fps);assert.equal(missiles.trails.length,0);
 assert(missiles.drop(ship));assert.deepEqual(missiles.bombs[0].target,missiles.target);missiles.updateAim(ship,false);assert.equal(missiles.target,null);missiles.dispose();
}
const ship={shipId:'orca',enabled:true,residency:{data:{}},pose};
assert(!new HighwindBombs().drop(ship));assert(new HighwindBombs().drop({...ship,shipId:'highwind'}));
const limited=new OrcaMissiles({missileConfig:{nombreMissiles:3,missilesSimultanes:2,trainee:{maximumParticules:15}}});assert(limited.drop(ship));assert.equal(limited.remainingBombs,1);for(let i=0;i<10;i++)limited.tick(.1);assert(!limited.ready,'Projectile cap');assert(limited.trails.length<=15);for(let i=0;i<60;i++)limited.tick(.1);assert(limited.drop(ship));assert.equal(limited.remainingBombs,0);assert.equal(limited.bombs.length,1);assert(!limited.drop(ship));
// An unreachable elevated target must never keep a missile circling past 3 s.
// Include slow frames and an old 18-second configuration, not only defaults.
assert.equal(validateMissileConfig().dureeVieSecondes,3);
assert.equal(validateMissileConfig({dureeVieSecondes:18}).dureeVieSecondes,3);
assert.equal(validateMissileConfig({dureeVieSecondes:.5}).dureeVieSecondes,.5);
const elevated=()=>new OrcaMissiles({groundHeight:()=>-10000,raycast:()=>({position:[0,20,3000],normal:[0,-1,0]}),missileConfig:{dureeVieSecondes:18},random:random(42)});
for(const fps of [5,30,60,120]){
 const missiles=elevated();assert(missiles.drop(ship));
 for(let i=0;i<3*fps-1;i++)missiles.tick(1/fps);
 assert.equal(missiles.bombs.length,2,'Still alive just before the deadline at '+fps+' FPS');
 const frozen=JSON.stringify(missiles.getState());missiles.tick(0);assert.equal(JSON.stringify(missiles.getState()),frozen,'Pause freezes the lifetime');
 missiles.tick(1/fps);assert.equal(missiles.bombs.length,0,'Expired at 3 seconds at '+fps+' FPS');
 assert.equal(missiles.expired,2);assert.equal(missiles.impacts,2);assert.equal(missiles.craters.length,2);assert.equal(missiles.blasts.length,2);
 for(const blast of missiles.blasts){assert(blast.position[2]>0,'Timeout explodes in flight');assert(Math.hypot(...blast.position.map((x,i)=>x-[0,20,3000][i]))>1000,'Explode at the projectile, not at the distant target');}
 const smoke=missiles.trails.length;assert(smoke>0);missiles.tick(1/fps);assert(missiles.trails.length<=smoke,'Expired missiles stop emitting smoke');
}
const stalled=elevated();assert(stalled.drop(ship));stalled.tick(3.5);assert.equal(stalled.bombs.length,0,'A long frame does not prolong the lifetime');assert.equal(stalled.expired,2);
assert.equal(stalled.impacts,2);assert.equal(stalled.blasts.length,2);
const timeoutEvents=[],precise=elevated();precise.onImpact=blast=>timeoutEvents.push(blast);assert(precise.drop(ship));
for(let i=0;i<359;i++)precise.tick(1/120);
const lastPositions=precise.bombs.map(m=>({id:m.id,position:[...m.position]}));precise.tick(1/120);
for(const {id,position}of lastPositions)assert.deepEqual(timeoutEvents.find(b=>b.id===id).position,position,'Timeout uses the current missile position');
assert.equal(timeoutEvents.length,2,'Ordinary explosion effects are triggered once per expired missile');
const successive=elevated();assert(successive.drop(ship));for(let i=0;i<10;i++)successive.tick(.1);assert(successive.drop(ship));
for(let i=0;i<20;i++)successive.tick(.1);assert.equal(successive.bombs.length,2,'Each salvo has its own deadline');assert.equal(successive.expired,2);
for(let i=0;i<10;i++)successive.tick(.1);assert.equal(successive.bombs.length,0);assert.equal(successive.expired,4);
const mesh=missileMesh();assert.equal(mesh.length%24,0);assert(mesh.every(Number.isFinite));for(let i=0;i<mesh.length;i+=8)near(Math.hypot(...mesh.slice(i+3,i+6)),1);
const context={createBuffer(channels,length,rate){const pcm=new Float32Array(length);return {duration:length/rate,getChannelData:()=>pcm};}};
const buffer=createMissileLaunchBuffer(context),pcm=buffer.getChannelData(0);assert(buffer.duration>1.4);assert(pcm.every(Number.isFinite));assert(Math.max(...pcm.map(Math.abs))>.89);near(pcm[0],0);assert(Math.abs(pcm.at(-1))<.001);assert(pcm.slice(11025,22050).some(v=>Math.abs(v)>.05),'Sustained rocket sound');
const audio=new MissileAudio({fetchAudio:null});audio.context={...context,currentTime:0,state:'running'};let sounds=0;audio.playSound=()=>sounds++;audio.launch();audio.launch();assert.equal(sounds,2);audio.paused=true;audio.launch();assert.equal(sounds,2);assert.equal(audio.getState().launchType,'rocket');
assert.deepEqual(await fs.readFile('assets/Act On Instinct.mp3'),await fs.readFile('dist/data/orca/act-on-instinct.mp3'));
console.log(JSON.stringify({orcaMissiles:'passed',forwardConeDegrees:45,attitudeAndDriftChecked:true,configurableSpeed:true,tiltAndRoll:true,highwindUnchanged:true,immutableTargets:true,convergenceFrames:[30,60,120],persistentSmoke:true,limits:true,rocketSound:true,suppliedMusic:true}));
