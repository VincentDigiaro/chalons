import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FPS_CONFIG,BOMB_DEFAULTS,validateBombConfig,validateHighwindConfig} from '../dist/walk-config.js';

for(const input of [undefined,null,[],1,'bombes'])assert.throws(()=>validateBombConfig(input),/highwind.bombes/);
assert.deepEqual(validateBombConfig({}),BOMB_DEFAULTS);
for(const key of Object.keys(BOMB_DEFAULTS).filter(key=>key!=='nombreBombes'&&typeof BOMB_DEFAULTS[key]==='number')){
 for(const value of [-1,null,undefined,'5',NaN,Infinity])assert.throws(()=>validateBombConfig({[key]:value}),new RegExp(key));
 assert.equal(validateBombConfig({[key]:.125})[key],.125);
}
for(const value of [-2,-.5,.5,null,undefined,'5',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateBombConfig({nombreBombes:value}),/nombreBombes/);
for(const value of [-1,0,1,40])assert.equal(validateBombConfig({nombreBombes:value}).nombreBombes,value);
for(const key of ['tailleMetres','rayonExplosionMetres'])assert.throws(()=>validateBombConfig({[key]:0}),new RegExp(key));
for(const key of ['dureeRechargeSecondes','rayonCreusementMetres','rayonDestructionBatimentsMetres','profondeurCratereRatio'])assert.equal(validateBombConfig({[key]:0})[key],0);
assert.equal(validateBombConfig({rayonExplosionMetres:25}).rayonCreusementMetres,25,'Old configurations retain the original excavation radius');
assert.equal(validateBombConfig({profondeurCratereRatio:2}).profondeurCratereRatio,2,'No arbitrary depth cap');
assert.throws(()=>validateBombConfig({profondeurCratereRatio:Number.MAX_VALUE}),/profondeurCratereRatio/);
assert.throws(()=>validateHighwindConfig({...FPS_CONFIG.highwind,bombes:{typo:1}}),/highwind.bombes.typo/);
assert(Object.isFrozen(validateHighwindConfig({...FPS_CONFIG.highwind,bombes:{}}).bombes));

const root=fileURLToPath(new URL('..',import.meta.url)),original=await fs.readFile(path.join(root,'fps-config.json'),'utf8');
await fs.mkdir(path.join(root,'artifacts/fps-config/tests'),{recursive:true});
const temp=await fs.mkdtemp(path.join(root,'artifacts/fps-config/tests/bombs-'));await fs.mkdir(path.join(temp,'dist'));await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
for(const file of await fs.readdir(path.join(root,'dist')))if(file.endsWith('.js'))await fs.copyFile(path.join(root,'dist',file),path.join(temp,'dist',file));
const probe=`
import assert from 'node:assert/strict';
import {HighwindBombs,BOMB_CONFIG} from './dist/highwind-bombs.js';
import {FPS_CONFIG} from './dist/walk-config.js';
import {HighwindBombEffects} from './dist/highwind-bomb-effects.js';
import {BombScorches,readScorches,saveScorches} from './dist/bomb-scorches.js';
import {loadMapBombDamage} from './dist/bomb-map-damage.js';
import {CraterField,terrainCraterField} from './dist/terrain-craters.js';
const c=FPS_CONFIG.highwind.bombes;assert.deepEqual(BOMB_CONFIG,c);
const ship={enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:0,position:{x:0,y:0,z:90}}};
const bombs=new HighwindBombs();assert.deepEqual(bombs.config,c);assert(bombs.drop(ship));assert.equal(bombs.remainingBombs,c.nombreBombes===-1?-1:c.nombreBombes-1);assert.equal(bombs.readyAt,c.dureeRechargeSecondes);assert.equal(bombs.bombs[0].scale,c.tailleMetres/7);
assert(Math.abs(bombs.bombs[0].position[2]-(90-150*.105-4.5*c.tailleMetres/7))<1e-8,'Release clears the scaled tail');
const clock=new HighwindBombs();clock.drop(ship);
if(c.dureeRechargeSecondes===0){for(let i=0;i<20;i++)assert(clock.drop(ship),'Zero cooldown imposes no ammunition limit');}
else{while(clock.time<c.dureeRechargeSecondes-.0002)clock.tick(Math.min(.01,c.dureeRechargeSecondes-.0002-clock.time));assert(!clock.drop(ship));clock.tick(.0003);assert(clock.drop(ship),'The JSON cooldown ends at its configured time');}
for(let i=0;i<1000&&!bombs.impacts;i++)bombs.tick(.01);assert.equal(bombs.impacts,1);const b=bombs.blasts[0];assert.equal(b.radius,c.rayonExplosionMetres);assert.equal(b.damageRadius,c.rayonDestructionBatimentsMetres);assert.equal(b.position[2],0);
const node=x=>({file:'0/way-1.bin',bounds:[x,0,x+.001,.001]});
assert.equal(bombs.suppresses(node(c.rayonDestructionBatimentsMetres*.5)),c.rayonDestructionBatimentsMetres>0);
assert(!bombs.suppresses(node(c.rayonDestructionBatimentsMetres+.1)),'Destruction follows its own radius, not the visual blast');
const depth=c.rayonCreusementMetres*c.profondeurCratereRatio*2;
assert.equal(b.craterRadius,c.rayonCreusementMetres);assert.equal(bombs.getState().craterRadiusMetres,c.rayonCreusementMetres);
assert.equal(b.craterDepth,depth);assert.equal(bombs.getState().craterDepthMetres,depth);
assert.equal(bombs.craterDepthAt([0,0]),depth/(1+c.attenuationCreusementRepete),'The JSON attenuation controls the next shot at this location');
assert.deepEqual(bombs.craters[0],[0,0,c.rayonExplosionMetres,c.rayonDestructionBatimentsMetres,depth,c.rayonCreusementMetres]);
assert.equal(-new CraterField(bombs.craters).offset(0,0),depth);
assert.equal(-new CraterField(bombs.craters).offset(c.rayonCreusementMetres,0),0,'Excavation stops at its own radius');
if(depth>0)assert(Math.abs(new CraterField(bombs.craters).offset(c.rayonCreusementMetres/2,0)+depth*.75**2)<1e-8,'Crater width is independent of explosion and destruction');
assert.equal(-new CraterField([...bombs.craters,...bombs.craters]).offset(0,0),depth*2);
// A different later configuration cannot resize or undo a saved impact.
const restored=new HighwindBombs({config:{...c,rayonExplosionMetres:3,rayonCreusementMetres:1,rayonDestructionBatimentsMetres:2,profondeurCratereRatio:1},craters:[...bombs.craters,[1000,0]]});
assert.equal(-new CraterField(restored.craters).offset(0,0),depth,'Saved depth survives a changed configuration');
assert.deepEqual(restored.craters[0],bombs.craters[0],'Saved crater radius survives a changed configuration');
assert(restored.suppresses(node(1085)),'Legacy 100 m damage survives a smaller new setting');assert(!restored.suppresses(node(1101)));assert.equal(restored.suppresses(node(c.rayonDestructionBatimentsMetres*.5)),c.rayonDestructionBatimentsMetres>0);
const scars=new BombScorches(null,{marks:[]});scars.add(b.position,b.radius,b.damageRadius,b.craterDepth,b.craterRadius);assert.deepEqual(readScorches(),bombs.craters);assert.deepEqual(scars.config,c.noircissement);assert.deepEqual(scars.soil,c.terre);assert.equal(-terrainCraterField().offset(0,0),depth);
saveScorches([[9,8]]);assert.deepEqual(readScorches(),[[9,8,100,100]]);
saveScorches([[0,0,4,-1],[0,0,0,5],[0,0,2],[0,0,100,70,-1],[0,0,100,70,Infinity],[0,0,100,70,10,-1],[0,0,100,70,10,Infinity],null]);assert.deepEqual(readScorches(),[]);
// Exercise the renderer's actual buffer generation: every effect scales while
// particle counts and mobile draw-call budgets remain unchanged.
let uploaded,scaleUniform;const noop=()=>{},gl=new Proxy({createVertexArray:()=>({}),createBuffer:()=>({}),bufferData:(_kind,data)=>{uploaded=data;},uniform1f:(name,value)=>{if(name==='u_scale')scaleUniform=value;}},{get:(o,k)=>o[k]??noop});
const uniforms=new Proxy({},{get:(_o,key)=>key}),effects=new HighwindBombEffects(gl,{mobile:true});Object.assign(effects,{program:{},meshProgram:{},u:uniforms,mu:uniforms});
assert.deepEqual(effects.config.limites,c.limites);assert.deepEqual(effects.config.particules,c.particules);
const camera={position:[0,-240],height:115,yaw:0,pitch:-.35},matrix=new Float32Array(16);
const snapshot=radius=>{effects.draw({time:1,bombs:[],blasts:[{position:[0,0,0],started:0,id:1,radius}]},matrix,camera);return effects.sprites.map(s=>({p:[...s.p],size:s.size}));};
const base=snapshot(100),changed=snapshot(c.rayonExplosionMetres),factor=c.rayonExplosionMetres/100;assert.equal(base.length,changed.length);assert.equal(effects.draws,2);
for(let i=0;i<base.length;i++){assert(Math.abs(changed[i].size-base[i].size*factor)<1e-6);for(let j=0;j<3;j++)assert(Math.abs(changed[i].p[j]-base[i].p[j]*factor)<1e-6);}
effects.draw({time:0,blasts:[],bombs:[{position:[0,0,20],velocity:[0,0,0],heading:0,age:0,scale:c.tailleMetres/7}]},matrix,camera);assert.equal(scaleUniform,c.tailleMetres/7,'The mesh shader receives the actual configured scale');
new BombScorches(gl,{marks:[],height:()=>0}).geometry(bombs.craters[0]);let maxX=0;for(let i=0;i<uploaded.length;i+=7)maxX=Math.max(maxX,Math.abs(uploaded[i]));assert(Math.abs(maxX-Math.max(c.terre.opacite?c.rayonCreusementMetres:0,c.noircissement.opacite?c.rayonExplosionMetres*c.noircissement.tailleRatio:0))<.001,'Soil follows excavation while the black trace keeps its own size');
saveScorches([...bombs.craters,[1000,0]]);globalThis.fetch=async()=>({ok:true,json:async()=>({nodes:[['0/way-1.bin',c.rayonDestructionBatimentsMetres*.5,0,c.rayonDestructionBatimentsMetres*.5+.001,.001],['0/way-2.bin',c.rayonDestructionBatimentsMetres+.1,0,c.rayonDestructionBatimentsMetres+1,1],['0/way-3.bin',1085,0,1086,1]]})});
const damage=await loadMapBombDamage();assert.equal(damage.ids.includes('way/1'),c.rayonDestructionBatimentsMetres>0);assert(!damage.ids.includes('way/2'));assert(damage.ids.includes('way/3'),'The map keeps historical destruction');
const stockValues=new Map();globalThis.sessionStorage={getItem:k=>stockValues.get(k),setItem:(k,v)=>stockValues.set(k,v),removeItem:k=>stockValues.delete(k)};globalThis.location={hash:''};
let stock=await import('./dist/bomb-stock.js?new');assert.equal(stock.readBombStock(),c.nombreBombes);const spent=c.nombreBombes===-1?-1:Math.max(0,c.nombreBombes-3);stock.saveBombStock(spent);stock.preserveBombStockForMap();globalThis.location.hash='#walk-return=0,0';stock=await import('./dist/bomb-stock.js?map');assert.equal(stock.readBombStock(),spent);assert.equal(stockValues.size,0);stock=await import('./dist/bomb-stock.js?restart');assert.equal(stock.readBombStock(),c.nombreBombes,'Restart replenishes stock but map transitions do not');
console.log(JSON.stringify({jsonBombSettings:'passed',...c,independentRadii:true,scaledMeshAndEffects:true,savedImpactSizes:true,mobileBudgetUnchanged:true}));
`;
for(const bombes of [
 {dureeRechargeSecondes:.4,tailleMetres:14,rayonExplosionMetres:250,rayonCreusementMetres:15,rayonDestructionBatimentsMetres:25,profondeurCratereRatio:.05,noircissement:{tailleRatio:.5,opacite:.4,douceurBord:.2},nombreBombes:80,limites:{bombesVisiblesOrdinateur:100,bombesVisiblesMobile:50,explosionsSimultanees:12,particulesVisibles:2400,eclairagesSimultanes:8,sonsSimultanes:20,sonsEnAttente:300}},
 {dureeRechargeSecondes:4,tailleMetres:.7,rayonExplosionMetres:25,rayonCreusementMetres:75,rayonDestructionBatimentsMetres:180,profondeurCratereRatio:.3,noircissement:{tailleRatio:2,opacite:1,douceurBord:0}},
 {dureeRechargeSecondes:0,tailleMetres:3.5,rayonExplosionMetres:65,rayonDestructionBatimentsMetres:0,profondeurCratereRatio:0,noircissement:{tailleRatio:0,opacite:0}},
 {rayonExplosionMetres:100,attenuationCreusementRepete:.3},
 {rayonExplosionMetres:100,attenuationCreusementRepete:0},
 {rayonExplosionMetres:25,rayonCreusementMetres:0,rayonDestructionBatimentsMetres:40},
 {rayonExplosionMetres:100}
]){
 const config=JSON.parse(original);config.highwind.bombes=bombes;await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify(config));
 console.log(execFileSync(process.execPath,['--input-type=module','--eval',probe],{cwd:temp,encoding:'utf8'}).trim());
}
assert.equal(await fs.readFile(path.join(root,'fps-config.json'),'utf8'),original,'Tests leave the live JSON unchanged');
