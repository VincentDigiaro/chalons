import assert from 'node:assert/strict';
import {CITY} from '../dist/city-config.js';
import {terrainCraterField} from '../dist/terrain-craters.js';
import {HighwindBombs,BLAST_SECONDS} from '../dist/highwind-bombs.js';

const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};};
globalThis.localStorage=storage();globalThis.sessionStorage=storage();globalThis.location={hash:''};
const legacyKey='highwind-scorches-v1:'+CITY.id,returnKey='highwind-scorches-map-return:'+CITY.id;
localStorage.setItem(legacyKey,JSON.stringify([[0,0,100,100]]));localStorage.setItem('other-preference','keep');
let sequence=0;const load=()=>import('../dist/bomb-scorches.js?game='+sequence++);
let game=await load();assert.deepEqual(game.readScorches(),[],'Existing persistent damage must not enter a new game');assert.equal(localStorage.getItem(legacyKey),null);assert.equal(localStorage.getItem('other-preference'),'keep');
const ship={enabled:true,residency:{data:{}},pose:{longueurMetres:150,angleDegres:0,position:{x:0,y:0,z:90}}},node={file:'0/way-1.bin',bounds:[0,0,1,1]};
const scars=new game.BombScorches(null),bombs=new HighwindBombs({config:{rayonExplosionMetres:25,rayonCreusementMetres:60,rayonDestructionBatimentsMetres:40},craters:scars.marks,onImpact:b=>scars.add(b.position,b.radius,b.damageRadius,b.craterDepth,b.craterRadius)});
assert(bombs.drop(ship));for(let i=0;i<500&&!bombs.impacts;i++)bombs.tick(.01);assert.equal(bombs.impacts,1);assert(bombs.suppresses(node));assert.equal(game.readScorches().length,1);assert.equal(localStorage.getItem(legacyKey),null,'Impacts are never saved between games');assert.equal(sessionStorage.getItem(returnKey),null,'Impacts do not arm a future restoration');
for(let i=0;i<(BLAST_SECONDS+1)*100;i++)bombs.tick(.01);assert.equal(bombs.blasts.length,0);assert(bombs.suppresses(node),'Destruction remains after effects finish');
assert.equal(new game.BombScorches(null).marks.length,1,'Recreating the renderer keeps the current game');
const depth=bombs.craters[0][4];assert.equal(game.readScorches()[0][4],depth);assert.equal(game.readScorches()[0][5],60);
const snapshot=game.readScorches();snapshot[0][0]=999;assert.equal(game.readScorches()[0][0],0,'Readers cannot mutate shared state');
// Carte deliberately reloads the page, but carries the current game once.
game.preserveScorchesForMap();assert(sessionStorage.getItem(returnKey));location.hash='#walk-return=0,0';game=await load();assert.equal(game.readScorches().length,1);assert.equal(sessionStorage.getItem(returnKey),null,'Map handoff is consumed');assert.equal(game.readScorches()[0][4],depth);assert.equal(-terrainCraterField().offset(0,0),depth,'Map handoff preserves the exact configured depth');assert(new HighwindBombs({craters:game.readScorches()}).suppresses(node));
assert.equal(game.readScorches()[0][5],60);assert(terrainCraterField().offset(50,0)<0,'Map keeps excavation beyond the visual explosion');assert.equal(Math.abs(terrainCraterField().offset(60,0)),0);
game=await load();assert.deepEqual(game.readScorches(),[],'Refreshing the returned map resets damage despite the remaining URL hash');
const freshScars=new game.BombScorches(null),freshBombs=new HighwindBombs({craters:freshScars.marks});assert(!freshBombs.suppresses(node),'Fresh game restores rendering and collision eligibility');assert.equal(freshScars.marks.length,0);assert.equal(freshBombs.blasts.length,0);assert.equal(freshBombs.bombs.length,0);
// Restarting directly from flight never restores the impact either.
game.saveScorches([[0,0,100,100]]);location.hash='';game=await load();assert.deepEqual(game.readScorches(),[]);
// An unrelated URL, malformed handoff or unavailable storage must stay playable.
sessionStorage.setItem(returnKey,JSON.stringify([[0,0,100,100]]));game=await load();assert.deepEqual(game.readScorches(),[]);assert.equal(sessionStorage.getItem(returnKey),null);
location.hash='#walk-return=0,0';for(const raw of ['{bad','{}','[null,[0,0,2,-1]]']){sessionStorage.setItem(returnKey,raw);game=await load();assert.deepEqual(game.readScorches(),[]);}
Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('blocked');}});game=await load();game.saveScorches([[0,0,100,100]]);assert.equal(game.readScorches().length,1);assert.doesNotThrow(()=>game.preserveScorchesForMap());
console.log(JSON.stringify({bombGameReset:'passed',legacySaveDiscarded:true,currentGameDamageRetained:true,mapHandoffOnce:true,refreshRestoresBuildingsAndCollisions:true,refreshClearsEffectsAndTraces:true,unavailableStorage:true}));
