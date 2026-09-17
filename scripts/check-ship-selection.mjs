import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {shipIdFromSearch,selectedShipConfig} from '../dist/ship-selection.js';
import {FPS_CONFIG,validateFPSConfig,shipModel} from '../dist/walk-config.js';
import {directHighwindEntry} from '../dist/map-view.js';
import {cityDataURL,CITIES,citySwitchURL} from '../dist/city-config.js';
import {saveMapHighwind,readMapHighwind} from '../dist/highwind-session.js';

for(const id of ['highwind','orca']){
 for(const search of ['?ship='+id,'?fps=1&ship='+id,'?ville=nice&ship='+id,'?ff7&ship='+id]){
  assert.equal(shipIdFromSearch(search),id);assert.equal(selectedShipConfig(FPS_CONFIG,search),FPS_CONFIG[id]);
  assert(directHighwindEntry(search,'',FPS_CONFIG[id]));
  for(const hash of ['#overview','#walk-return=4,48'])assert(!directHighwindEntry(search,hash,FPS_CONFIG[id]));
 }
 assert(!directHighwindEntry('?ship='+id,'',{present:false}));
 assert.equal(new URL(citySwitchURL('https://game.test/?ship='+id,'nice')).searchParams.get('ship'),id);
}
for(const search of ['','?fps=1','?ff7','?ff7=1','?ship=','?ship=unknown','?ship=ORCA','?ship=orca&ship=highwind','?ship=orca&ship=orca','?other=ship%3Dorca'])assert.equal(shipIdFromSearch(search),null);
assert.equal(shipModel('orca','v1').basePath,'orca/v1/');
assert.equal(shipModel('highwind','v9').basePath,'highwind/v9/');
assert.equal(shipModel('orca','../highwind'),null);
assert.equal(cityDataURL('../orca/v1/orca-colors.png',CITIES.nice),'./data/orca/v1/orca-colors.png');
assert.notEqual(FPS_CONFIG.orca,FPS_CONFIG.highwind);
for(const patch of [{longueurMetres:0},{vitessesHelicesToursParSeconde:{PropL:1,PropR:1,PropTail:1}},{bombes:{tailleMetres:-1}}])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,orca:{...FPS_CONFIG.orca,...patch}}),/orca\./);
assert(Object.isFrozen(FPS_CONFIG.orca.missiles??FPS_CONFIG.orca.bombes));
const values=new Map();globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
const poseA={position:{x:1,y:2,z:3},angleDegres:4,pitch:0},poseB={position:{x:10,y:20,z:30},angleDegres:40,pitch:.1};
saveMapHighwind(poseA,'highwind');saveMapHighwind(poseB,'orca');
assert.deepEqual(readMapHighwind('#walk-return=0,0','highwind'),poseA);assert.deepEqual(readMapHighwind('#walk-return=0,0','orca'),{...poseB,roll:0});
assert.equal(readMapHighwind('','orca'),null);assert.equal(readMapHighwind('#walk-return=0,0',null),null);

const index=JSON.parse(await fs.readFile('dist/data/orca/v1/index.json'));
const binary=await fs.readFile('dist/data/orca/v1/mesh.bin');
assert.equal(binary.length,index.vertexCount*44);assert.equal(crypto.createHash('sha256').update(binary).digest('hex'),index.meshSha256);
assert.equal(index.ranges.reduce((n,r)=>n+r.count,0),index.vertexCount);assert.equal(index.ranges.length,3);
assert.deepEqual(Object.keys(index.rotors).sort(),['PropL','PropR']);
for(const r of Object.values(index.rotors))assert(Math.abs(Math.hypot(...r.axis)-1)<1e-6);
const vertices=new Float32Array(binary.buffer,binary.byteOffset,binary.length/4);
for(let i=0;i<vertices.length;i+=11){assert(vertices.subarray(i,i+11).every(Number.isFinite));assert(Math.abs(Math.hypot(...vertices.subarray(i+3,i+6))-1)<.001);}
assert.equal(index.bounds[1][1]-index.bounds[0][1],1);
await fs.access('dist/data/orca/v1/orca-colors.png');

// Fresh module graphs test URL-dependent defaults, including bombs and stock.
const probe=`
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
globalThis.location={search:process.argv[1],hash:''};
const {SHIP_ID,SHIP_CONFIG,FPS_CONFIG,WEAPON_IMPACT_CONFIG}=await import('./dist/walk-config.js');
const {FPSHighwind}=await import('./dist/fps-highwind.js');
const {HighwindFlight,deckExitPosition}=await import('./dist/highwind-flight.js');
const {BOMB_CONFIG,HighwindBombs}=await import('./dist/highwind-bombs.js');
const stock=await import('./dist/bomb-stock.js');
let requests=[];
globalThis.fetch=async url=>{requests.push(url);return new Response(await fs.readFile('dist/'+url.replace('./','')));};
const renderer={index:{materials:[]},geometry:v=>({bytes:v.byteLength}),drop(){},texture(){},material(id){return this.index.materials[id];}};
const ship=new FPSHighwind(renderer,SHIP_CONFIG);
if(!SHIP_ID){ship.refresh([0,0]);assert.equal(ship.enabled,false);assert.equal(requests.length,0);}
else{
 assert.equal(ship.shipId,SHIP_ID);assert.equal(ship.config,FPS_CONFIG[SHIP_ID]);
 assert.equal(BOMB_CONFIG,WEAPON_IMPACT_CONFIG);assert.equal(stock.readBombStock(),WEAPON_IMPACT_CONFIG.nombreBombes);
 const flight=new HighwindFlight(ship);assert.equal(flight.defaultCameraDistance,SHIP_CONFIG.distanceCameraMetres);
 if(SHIP_ID==='orca'){
  ship.refresh([SHIP_CONFIG.position.x,SHIP_CONFIG.position.y]);await ship.initializing;await ship.residency.pending;
  assert(ship.getState().loaded);assert(requests.every(url=>url.includes('/orca/v1/')));assert.equal(ship.draw(()=>true),3);
  ship.animate(.013);assert(ship.rotorAngles.PropL>0&&ship.rotorAngles.PropR>0);
  assert.equal(renderer.index.materials[0].texture,'../orca/v1/orca-colors.png');
  const bombs=new HighwindBombs();assert(!bombs.drop(ship));const {OrcaMissiles}=await import('./dist/orca-missiles.js');const missiles=new OrcaMissiles();assert(missiles.drop(ship));assert.equal(missiles.bombs.length,2);
  assert(deckExitPosition(ship),'The Orca has a usable exit surface');
 }
}
ship.dispose();console.log(JSON.stringify({url:location.search,ship:SHIP_ID,passed:true}));
`;
for(const search of ['?ship=orca','?ship=highwind','?ff7','?ship=unknown',''])process.stdout.write(execFileSync(process.execPath,['--input-type=module','-e',probe,search],{encoding:'utf8',maxBuffer:1024*1024}));
console.log(JSON.stringify({shipSelection:'passed',configIndependent:true,sessionPosesIsolated:true,orcaTriangles:index.vertexCount/3,rotors:2}));
