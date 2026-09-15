import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {StreetLocator} from '../dist/walk-streets.js';
import {WalkMode} from '../dist/walk-mode.js';
import {SPAWN,toLocal,toLngLat} from '../dist/walk-core.js';

const road=(name,points,extra={})=>({properties:{group:'road',kind:'residential',name,...extra},geometry:{type:'LineString',coordinates:points.map(toLngLat)}});
const data={features:[road('Rue A',[[0,0],[40,0]]),road('Rue B',[[40,0],[40,40]]),road('',[[0,20],[40,20]],{kind:'footway'}),road('Rue C',[[-1000,-1000],[-960,-1000]]),road('Tunnel',[[0,1000],[40,1000]],{tunnel:true})]};
const streets=new StreetLocator(data);
assert.equal(streets.nameAt([10,0]),'Rue A');
assert.equal(streets.nameAt([40,32]),'Rue B');
assert.equal(streets.nameAt([20,4]),'Rue A','Sidewalk stays attached to its street');
assert.equal(streets.nameAt([35,20]),'','An unnamed path must not inherit nearby Rue B');
assert.equal(streets.nameAt([10,-10]),'','Leave the label blank outside the street corridor');
assert.equal(streets.nameAt([-985,-1000]),'Rue C','Negative grid coordinates');
assert.equal(streets.nameAt([20,1000]),'','Underground streets are excluded');
assert.equal(streets.nameAt([10000,10000]),'');
const multi=new StreetLocator({features:[{properties:{group:'road',name:'Deux tronçons'},geometry:{type:'MultiLineString',coordinates:[[[0,0],[10,0]],[[20,0],[30,0]]].map(line=>line.map(toLngLat))}}]});
assert.equal(multi.nameAt([25,0]),'Deux tronçons');

const real=new StreetLocator(JSON.parse(await fs.readFile('dist/data/lines.geojson','utf8')));
assert.equal(real.nameAt(SPAWN),'Rue Gérard de Nerval');
assert.equal(real.nameAt(toLocal([4.380615,48.946359])),'Avenue du Maréchal Juin');

// Exercise the actual banner update and asynchronous lookup failure.
const label={hidden:true,textContent:''},mode=Object.assign(Object.create(WalkMode.prototype),{root:{querySelector:()=>label},position:[10,0],streets,events:new AbortController()});
mode.updateStreet();assert.equal(label.textContent,'Rue A');assert.equal(label.hidden,false);
mode.position=[40,32];mode.updateStreet();assert.equal(label.textContent,'Rue B');
mode.position=[35,20];mode.updateStreet();assert.equal(label.hidden,true);assert.equal(label.textContent,'');
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 mode.position=[40,32];await mode.loadStreets();assert.equal(label.textContent,'Rue B');assert.equal(label.hidden,false);
 globalThis.fetch=async()=>{throw Error('Offline');};
 await mode.loadStreets();assert.equal(label.hidden,true);assert.equal(mode.streetName,'');
}finally{globalThis.fetch=originalFetch;}
console.log(JSON.stringify({streets:'passed',nervalAndMarechalJuin:true,unnamedPathHidden:true,outsideRoadHidden:true,liveBannerUpdates:true,loadFailureHidden:true}));
