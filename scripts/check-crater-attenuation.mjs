import assert from 'node:assert/strict';
import {HighwindBombs} from '../dist/highwind-bombs.js';
import {CraterField,terrainCraterField} from '../dist/terrain-craters.js';
import {saveScorches,readScorches} from '../dist/bomb-scorches.js';
import {validateBombConfig} from '../dist/walk-config.js';
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function rig(config={},craters=[]){
 const events=[];
 const bombs=new HighwindBombs({config:{rayonExplosionMetres:50,rayonDestructionBatimentsMetres:30,profondeurCratereRatio:.05,dureeRechargeSecondes:0,...config},craters,groundHeight:p=>bombs.excavation.offset(...p),onImpact:b=>events.push(b)});
 const ship={enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:0,position:{x:0,y:0,z:0}}};
 return {bombs,events,hit(x=0,y=0){ship.pose.position={x,y,z:bombs.excavation.offset(x,y)};const before=bombs.impacts;assert(bombs.drop(ship));bombs.tick(.01);assert.equal(bombs.impacts,before+1);return events.at(-1).craterDepth;}};
}
for(const value of [-1,NaN,Infinity,null,'0.1'])assert.throws(()=>validateBombConfig({attenuationCreusementRepete:value}),/attenuationCreusementRepete/);
for(const value of [0,.05,.1,.5,2])assert.equal(validateBombConfig({attenuationCreusementRepete:value}).attenuationCreusementRepete,value);
const game=rig(),first=[game.hit(),game.hit(),game.hit()];
close(first[0],5);close(first[1],50/11);close(first[2],550/131);assert(first[0]>first[1]&&first[1]>first[2]);
let previous=first.at(-1);for(let n=3;n<1000;n++){const added=game.hit();assert(added>0&&added<previous,'Each later shot continues digging by a smaller amount');previous=added;}
assert(-game.bombs.excavation.offset(0,0)>500,'Repeated excavation has no fixed maximum depth');
assert.equal(game.bombs.craters.length,1000);assert.equal(game.bombs.excavation.index.entries.size,1,'Coincident hits remain grouped in one spatial entry');
for(const event of game.events){assert.equal(event.radius,50);assert.equal(event.damageRadius,30);}
close(game.hit(250,0),5,'An untouched location retains full excavation');
const nearby=rig();nearby.hit();const exact=nearby.bombs.craterDepthAt([0,0]),shifted=nearby.bombs.craterDepthAt([1,0]),rim=nearby.bombs.craterDepthAt([49,0]);
assert(exact<shifted&&shifted<rim&&rim<5,'Nearby impacts attenuate smoothly, without requiring exactly equal coordinates');close(nearby.bombs.craterDepthAt([50,0]),5);
const linear=rig({attenuationCreusementRepete:0});for(let n=0;n<30;n++)close(linear.hit(),5);close(linear.bombs.excavation.offset(0,0),-150);
const strong=rig({attenuationCreusementRepete:.5});strong.hit();assert(strong.hit()<first[1]);
const disabled=rig({profondeurCratereRatio:0});for(let n=0;n<5;n++)close(disabled.hit(),0);assert.equal(disabled.bombs.craters.length,5);close(disabled.bombs.excavation.offset(0,0),0);
// Stored contributions are final depths. Neither map handoff nor a later
// configuration change is allowed to apply the reduction a second time.
saveScorches(nearby.bombs.craters);const saved=readScorches(),before=terrainCraterField().offset(0,0),next=nearby.bombs.craterDepthAt([0,0]);
saveScorches([]);saveScorches(saved);close(terrainCraterField().offset(0,0),before);
const restored=rig({},saved);close(restored.bombs.excavation.offset(0,0),before);close(restored.hit(),next);
const changed=rig({attenuationCreusementRepete:.8},saved);close(changed.bombs.excavation.offset(0,0),before);assert(changed.hit()<next);
const legacy=rig({},[[0,0,50,30]]);close(legacy.bombs.excavation.offset(0,0),-10);close(legacy.hit(),5/1.2);
const replay=new CraterField(game.bombs.craters);for(const x of [0,10,49,51,250]){close(replay.offset(x,0),game.bombs.excavation.offset(x,0));assert.deepEqual(replay.gradient(x,0),game.bombs.excavation.gradient(x,0));}
saveScorches([]);close(rig().hit(),5,'A new game restores the full first impact');
console.log(JSON.stringify({craterAttenuation:'passed',firstContributionsMetres:first,thousandHitsContinueDigging:true,nearbyImpacts:true,newGroundFullDepth:true,zeroRestoresLinear:true,damageRadiiPreserved:true,replayAndNewGame:true}));
