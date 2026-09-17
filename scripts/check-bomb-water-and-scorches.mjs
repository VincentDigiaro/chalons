import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {WaterMask,setTerrainWater,terrainWaterMask,WATER_BANK_GUARD} from '../dist/terrain-water.js';
import {CraterField,setTerrainImpacts} from '../dist/terrain-craters.js';
import {terrainTile} from '../dist/terrain.js';
import {BombScorches,craterSoilPixels} from '../dist/bomb-scorches.js';
import {BOMB_SCORCH_DEFAULTS,BOMB_SOIL_DEFAULTS,validateBombConfig} from '../dist/walk-config.js';
import {CITIES} from '../dist/city-config.js';
const collection=features=>({type:'FeatureCollection',features}),feature=(type,coordinates,properties)=>({type:'Feature',properties,geometry:{type,coordinates}}),rect=(w,s,e,n)=>[[w,s],[e,s],[e,n],[w,n],[w,s]],local={origin:[0,0],scale:[1,1]},near=(a,b)=>assert(Math.abs(a-b)<1e-4,`${a} != ${b}`);
const lake=collection([feature('Polygon',[rect(-200,-200,0,200)],{kind:'water'})]);setTerrainWater(lake,collection([]),local);
const one=new CraterField([[0,0,100,70,20]]),two=new CraterField([[0,0,100,70,20],[0,0,100,70,20]]);
for(const [x,y] of [[-50,0],[-10,30],[5,0],[WATER_BANK_GUARD,0]]){near(one.offset(x,y),0);near(two.offset(x,y),0);assert.deepEqual(two.gradient(x,y),[0,0]);}
assert(one.offset(40,0)<-10);near(two.offset(40,0),one.offset(40,0)*2);near(one.gradient(16,0)[0],(one.offset(16.25,0)-one.offset(15.75,0))/.5);
setTerrainImpacts([[0,0,100,70,20]]);const tile=terrainTile([-64,-64,64,64]);
for(let i=0;i<tile.length;i+=33){const p=[0,11,22].map(k=>tile.subarray(i+k,i+k+3));if(p.reduce((n,v)=>n+v[0],0)<0)near(p.reduce((n,v)=>n+v[2],0)/3,-.025);}
const island=new WaterMask(collection([feature('Polygon',[rect(-200,-200,200,200),rect(-60,-60,60,60)],{kind:'water'})]),collection([]),local);assert.equal(island.sample(0,0).weight,1);assert(island.sample(100,0).water);
const coast=new WaterMask(collection([]),collection([feature('LineString',[[0,-1000],[0,1000]],{kind:'coastline',group:'coastline'})]),local);assert(coast.sample(100,0).water);assert.equal(coast.sample(-100,0).weight,1);
const underground=new WaterMask(collection([]),collection([feature('LineString',[[-100,0],[100,0]],{kind:'river',group:'water',tunnel:true})]),local);assert.equal(underground.sample(0,0).weight,1,'Covered rivers do not shield city streets');
for(const city of Object.values(CITIES)){
 const root='dist/'+city.dataRoot.slice(2),land=JSON.parse(await fs.readFile(root+'land.geojson')),lines=JSON.parse(await fs.readFile(root+'lines.geojson')),mask=new WaterMask(land,lines,city);
 const sample=(lng,lat)=>mask.sample((lng-city.origin[0])*city.scale[0],(lat-city.origin[1])*city.scale[1]);
 assert.equal(sample(...city.origin).weight,1,'City centre stays diggable: '+city.id);
 if(city.id==='nice'){for(const p of [[7.26,43.68],[7.32,43.68],[7.287,43.692]])assert(sample(...p).water,'Sea and harbour are protected');assert(mask.coasts.entries.size>7000);}
 else assert(sample(4.355416,48.954642).water,'Marne water polygon is protected');
}
setTerrainWater(collection([]),collection([]),local);setTerrainImpacts([]);
for(const key of Object.keys(BOMB_SCORCH_DEFAULTS))for(const value of [-1,null,NaN,Infinity,'1'])assert.throws(()=>validateBombConfig({noircissement:{[key]:value}}),new RegExp(key));
for(const key of ['opacite','douceurBord'])assert.throws(()=>validateBombConfig({noircissement:{[key]:1.01}}),new RegExp(key));
assert.deepEqual(validateBombConfig({noircissement:{}}).noircissement,BOMB_SCORCH_DEFAULTS);assert.throws(()=>validateBombConfig({noircissement:{typo:1}}),/typo/);
let uploaded,uniforms=new Map();const gl=new Proxy({createVertexArray:()=>({}),createBuffer:()=>({}),bufferData:(_kind,data)=>uploaded=data,uniform2fv:(key,value)=>uniforms.set(key,value)},{get:(o,k)=>o[k]??(()=>{})}),mark=[0,0,100,70,20];
const drawPrepared=scars=>{scars.draw([],[],[0,0]);while(scars.preparation.pending)scars.preparation.flush();scars.draw([],[],[0,0]);};
for(const ratio of [.5,1,2]){const scars=new BombScorches(gl,{marks:[mark],height:()=>0,config:{tailleRatio:ratio,opacite:.35,douceurBord:.8},soil:{opacite:0}});scars.program={};scars.uniforms={u_scorch:'scorch'};drawPrepared(scars);assert.equal(scars.draws,1);assert.deepEqual(uniforms.get('scorch'),[.35,.8]);near(Math.max(...Array.from(uploaded).filter((_,i)=>i%7===0)),100*ratio);assert.equal(uploaded.length,20*20*6*7,'Trace settings do not add polygons');assert.deepEqual(scars.bounds(mark),[-100*ratio,-100*ratio,100*ratio,100*ratio]);scars.dispose();}
for(const config of [{opacite:0},{tailleRatio:0}]){const scars=new BombScorches(gl,{marks:[mark],config,soil:{opacite:0}});scars.draw([],[]);assert.equal(scars.draws,0);assert.equal(scars.cache.size,0);assert.equal(scars.marks.length,1,'Hiding a trace preserves its crater and damage');}
assert.deepEqual(validateBombConfig({terre:{}}).terre,BOMB_SOIL_DEFAULTS);
for(const key of Object.keys(BOMB_SOIL_DEFAULTS))for(const value of [-1,null,NaN,Infinity,'1'])assert.throws(()=>validateBombConfig({terre:{[key]:value}}),new RegExp(key));
assert.throws(()=>validateBombConfig({terre:{opacite:1.01}}),/opacite/);assert.throws(()=>validateBombConfig({terre:{tailleMotifMetres:0}}),/tailleMotifMetres/);assert.throws(()=>validateBombConfig({terre:{typo:1}}),/typo/);
const soilPixels=craterSoilPixels();assert.equal(soilPixels.data.length,128*128*4);assert.deepEqual(craterSoilPixels(),soilPixels,'Soil stays stable across streaming and map transitions');
const earth=new BombScorches(gl,{marks:[mark,mark],height:(x,y)=>-20*(1-Math.min(1,(x*x+y*y)/10000))**2,config:{opacite:0,tailleRatio:0},soil:{opacite:1,tailleMotifMetres:5}});earth.program={};earth.uniforms={u_soil:'soil'};drawPrepared(earth);assert.equal(earth.draws,1,'Repeated hits still share one draw');assert.deepEqual(uniforms.get('soil'),[1,5]);assert.equal(uploaded.length,20*20*6*7);assert.deepEqual(earth.bounds(mark),[-100,-100,100,100],'Soil covers excavation independently of soot size');
assert(new Set(Array.from(uploaded).filter((_,i)=>i%7===6).map(v=>v.toFixed(3))).size>20,'Lighting follows the crater slopes');
setTerrainWater(lake,collection([]),local);earth.geometry(mark);for(let i=0;i<uploaded.length;i+=7)if(uploaded[i]<=0)assert.equal(uploaded[i+5],0,'Water gets neither soil nor soot');setTerrainWater(collection([]),collection([]),local);
assert.equal(terrainWaterMask().sample(0,0).weight,1);
console.log(JSON.stringify({waterAndScorches:'passed',seaRiversLakes:true,shoreGuardMetres:WATER_BANK_GUARD,islandsAndCoveredRivers:true,repeatedHitsProtectWater:true,scorchSizeOpacityAndSoftness:true,scorchPolygonCountFixed:true,soilConfigAndSlopeLighting:true,soilTextureSharedAndDeterministic:true}));
