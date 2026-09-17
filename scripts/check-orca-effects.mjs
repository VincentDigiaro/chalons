import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {OrcaMissiles} from '../dist/orca-missiles.js';
import {OrcaMissileEffects} from '../dist/orca-missile-effects.js';
import {MissileAudio} from '../dist/orca-missile-audio.js';
import {ORCA_MISSILE_CONFIG,validateMissileConfig,missileImpactConfig} from '../dist/walk-config.js';

const raw=JSON.parse(await fs.readFile(new URL('../fps-config.json',import.meta.url),'utf8'));
const noop=()=>{},uniforms=new Proxy({},{get:(_o,key)=>key}),gl=new Proxy({},{get:()=>noop});
const matrix=new Float32Array(16),camera={position:[0,-20],height:70,yaw:0,pitch:-.2};
function effects(settings,mobile=false){
 const effect=new OrcaMissileEffects(gl,{mobile,config:missileImpactConfig(settings)});
 Object.assign(effect,{program:{},meshProgram:{},u:uniforms,mu:uniforms,reticle:{draw:noop}});return effect;
}
// Constructors use Orca tuning even when a module is imported without ?ship=orca.
assert.deepEqual(new OrcaMissileEffects(gl).config,missileImpactConfig(ORCA_MISSILE_CONFIG));
assert.deepEqual(new MissileAudio({fetchAudio:null}).config,missileImpactConfig(ORCA_MISSILE_CONFIG));
assert.equal(new OrcaMissileEffects(gl).config.limites.particulesVisibles,raw.orca.missiles.explosion.limites.particulesVisibles);
for(const limit of [-1,0,1,100]){
 const canonical=validateMissileConfig({explosion:{limites:{missilesVisiblesOrdinateur:limit,missilesVisiblesMobile:limit}}});
 const legacy=validateMissileConfig({explosion:{limites:{bombesVisiblesOrdinateur:limit,bombesVisiblesMobile:limit}}});
 assert.deepEqual(canonical,legacy,'Previous JSON keys stay compatible');
 assert.equal(canonical.explosion.limites.missilesVisiblesOrdinateur,limit);
 assert(!Object.hasOwn(canonical.explosion.limites,'bombesVisiblesOrdinateur'));
 assert.deepEqual(validateMissileConfig(canonical),canonical,'Normalization is idempotent');
}
const mixed=validateMissileConfig({explosion:{limites:{missilesVisiblesOrdinateur:5,bombesVisiblesOrdinateur:32}}});
assert.equal(mixed.explosion.limites.missilesVisiblesOrdinateur,5,'The current key takes precedence');
for(const limit of [-2,.5,null,'32',Infinity])assert.throws(()=>validateMissileConfig({explosion:{limites:{missilesVisiblesOrdinateur:limit}}}),/orca.missiles.explosion.limites.missilesVisiblesOrdinateur/);
for(const limits of [null,[],2])assert.throws(()=>validateMissileConfig({explosion:{limites:limits}}),/orca.missiles.explosion.limites/);

const projectiles=Array.from({length:40},(_,id)=>({id,position:[id,0,40],velocity:[0,1,0],direction:[0,1,0],heading:0,scale:1}));
// Interleaved trail points reproduce two missiles fired on the same frame.
// Mobile downsampling must preserve both, rather than always skip one side.
const trails=Array.from({length:30},(_,n)=>projectiles.slice(0,4).map(m=>({id:m.id,position:[m.id,n,40],born:n/30,seed:.5}))).flat();
for(const recent of [0,1,7,11])for(const mobile of [false,true]){
 const settings=validateMissileConfig({explosion:{limites:{particulesVisibles:-1,missilesVisiblesOrdinateur:35,missilesVisiblesMobile:21},particules:{particulesParTrainee:recent}}}),effect=effects(settings,mobile);
 effect.draw({settings,bombs:projectiles,trails,blasts:[],time:1,target:null},matrix,camera);
 assert.equal(effect.visibleBombs,mobile?21:35,'Per-platform missile mesh limit is used');
 for(let id=0;id<4;id++)assert.equal(effect.renderedSprites.filter(s=>s.source==='trail:'+id&&s.priority===2).length,recent,'Configured recent smoke points per trail on both platforms');
 if(recent===0)assert(!effect.renderedSprites.some(s=>s.source.startsWith('trail:')),'Zero disables trail smoke');
}
for(const cap of [0,2,8,70,1000,-1]){
 const settings=validateMissileConfig({explosion:{limites:{particulesVisibles:cap}}}),effect=effects(settings);
 const blasts=Array.from({length:12},(_,id)=>({id,position:[0,id,0],started:.5,radius:12}));
 effect.draw({settings,bombs:projectiles.slice(0,4),trails,blasts,time:1,target:null},matrix,camera);
 assert.equal(effect.particles,cap<0?effect.sprites.length:Math.min(cap,effect.sprites.length));
 const flames=effect.renderedSprites.filter(s=>s.source.startsWith('missile:'));
 assert.equal(flames.length,cap<0?8:Math.min(cap,8),'Smoke never evicts the current rocket flames');
 if(cap>=8||cap<0)for(let id=0;id<4;id++)assert(flames.some(s=>s.source==='missile:'+id));
 if(cap===2)assert.equal(new Set(flames.map(s=>s.source)).size,2,'Tiny budgets are shared between missiles');
 if(cap===1000)for(const blast of blasts)assert(effect.renderedSprites.some(s=>s.source==='blast:'+blast.id&&s.kind>0),'Every current explosion retains fire when the budget can cover it');
 let additive=false;for(const sprite of effect.renderedSprites){if(sprite.kind>0)additive=true;else assert(!additive,'Transparent smoke remains before additive fire in the GPU buffer');}
}

// Reproduce the reported sustained-fire failure with the exact quoted limits.
// Before this fix all flames disappeared after 3 seconds at a 1,000 cap.
const settings=validateMissileConfig({...raw.orca.missiles,explosion:{...raw.orca.missiles.explosion,limites:{...raw.orca.missiles.explosion.limites,particulesVisibles:1000},particules:{...raw.orca.missiles.explosion.particules,particulesParTrainee:7}}});
const ship={shipId:'orca',enabled:true,residency:{data:{}},pose:{position:{x:0,y:0,z:60},longueurMetres:9.454,angleDegres:0}};
const state=new OrcaMissiles({missileConfig:settings,random:()=>.5}),desktop=effects(settings),mobile=effects(settings,true);
let saturatedFrames=0,checkedFrames=0;
for(let frame=0;frame<60*20;frame++){
 if(frame%30===0)state.drop(ship);state.tick(1/60);
 // Check the actual generated vertex buffers throughout the run on each platform.
 if(frame%5)continue;
 for(const effect of [desktop,mobile]){
  effect.draw(state,matrix,camera);checkedFrames++;
  assert.equal(effect.visibleBombs,state.bombs.length,'All in-flight missile meshes remain visible');
  assert.equal(effect.renderedSprites.filter(s=>s.source.startsWith('missile:')).length,state.bombs.length*2,'Every live missile keeps its propulsion flame after prolonged firing');
  assert(effect.particles<=1000,'Respect the user budget without raising it');
  if(effect.skippedParticles){saturatedFrames++;for(const b of state.blasts.filter(b=>state.time-b.started<.65))assert(effect.renderedSprites.some(s=>s.source==='blast:'+b.id&&s.kind>0),'Recent impact remains visible in a saturated scene');}
 }
}
assert(saturatedFrames>100);assert(state.impacts>50);assert(state.bombs.length>0);
console.log(JSON.stringify({orcaEffects:'passed',secondsOfContinuousFire:20,checkedFrames,saturatedFrames,particleCap:1000,desktopAndMobile:true,missileNamesAndLegacyKeys:true,recentTrailSetting:true,propulsionAndRecentExplosionsPreserved:true}));
