import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CITIES,CITY,cityDataURL,citySwitchURL,cityHighwindConfig} from '../dist/city-config.js';
import {Terrain} from '../dist/terrain.js';
import {ORIGIN,SCALE,SPAWN,SPAWN_YAW,toLocal} from '../dist/walk-core.js';
import {createImageryCache} from './imagery-cache.mjs';
import {validTile,tilePoint} from './ign-source.mjs';
import {readWalkEntry} from '../dist/walk-url.js';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {FPS_CONFIG} from '../dist/walk-config.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(citySwitchURL('https://game.test/?ship=highwind#view','chalons'),null);
assert.equal(citySwitchURL('https://game.test/?ville=nice&fps=1','nice'),null);
const switched=new URL(citySwitchURL('https://game.test/?ship=highwind&fps=1&x=5&y=6&angle=22&pitch=10&roofs=catalogue#view','nice'));
assert.equal(switched.searchParams.get('ville'),'nice');assert(switched.searchParams.get('ship')==='highwind');assert.equal(switched.searchParams.get('roofs'),'catalogue');assert.equal(switched.hash,'#overview');
for(const key of ['fps','x','y','angle','pitch'])assert(!switched.searchParams.has(key));
assert.equal(cityDataURL('walk/../facades/a.webp',CITIES.chalons),'./data/walk/../facades/a.webp');
assert.equal(cityDataURL('walk/../facades/a.webp',CITIES.nice),'./data/cities/nice/facades/a.webp');
assert.equal(cityDataURL('walk/../highwind/Highwind1.png',CITIES.nice),'./data/highwind/Highwind1.png');
const root=path.resolve(cityDataURL('').slice(2).replace(/^data/,'dist/data'));
const indexBytes=await fs.readFile(path.join(root,'walk/index.json')),index=JSON.parse(indexBytes);
assert.deepEqual(ORIGIN,index.origin);assert.deepEqual(SCALE,index.scale);
if(CITY.id==='chalons'){assert.deepEqual(SPAWN,index.spawn);assert(Math.abs(SPAWN_YAW-index.yaw)<1e-12);}
else{
 const runway=JSON.parse(await fs.readFile(path.join(root,'nice-pistes/index.json'))).bounds,[lng,lat]=CITY.spawn.coordinates;
 assert(lng>runway[0]&&lng<runway[2]&&lat>runway[1]&&lat<runway[3],'Nice starts at the airport');
 const entry=readWalkEntry('?ville=nice&fps=1',CITY.navigationBounds),ship=new FPSHighwind({},FPS_CONFIG.highwind,{enabled:true});
 assert.deepEqual(entry.position,SPAWN);assert.deepEqual([ship.pose.position.x,ship.pose.position.y],entry.position);assert.equal(ship.pose.angleDegres,45);assert.equal(ship.pose.position.z,FPS_CONFIG.highwind.position.z);ship.dispose();
 assert.equal(cityHighwindConfig(FPS_CONFIG.highwind,CITIES.chalons),FPS_CONFIG.highwind,'Châlons keeps the configured placement');
}
const meta=JSON.parse(await fs.readFile(path.join(root,'terrain/index.json'))),raw=await fs.readFile(path.join(root,meta.file?'terrain/'+meta.file:'terrain/elevations.bin'));
const terrain=new Terrain(meta,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
assert(Math.abs(terrain.height(...index.spawn))<.03,'Imported terrain keeps its original altitude reference');
assert(Number.isFinite(terrain.height(...SPAWN)));
let highest=-Infinity;for(const value of terrain.samples)highest=Math.max(highest,value*terrain.unit);
assert(Math.abs(highest-meta.maxAltitude)<.11,'Terrain units match the original IGN extraction');
const hill=toLocal(CITY.id==='nice'?[7.3005,43.6908]:[4.43,48.96]);assert(terrain.height(...hill)>(CITY.id==='nice'?50:5));
assert(Number.isFinite(terrain.flightHeight(...hill)));assert(terrain.maximum([hill[0]-30,hill[1]-30,hill[0]+30,hill[1]+30])>=terrain.height(...hill));
for(const material of index.materials.filter(m=>m.texture))await fs.access(path.resolve('dist',cityDataURL('walk/'+material.texture)));
if(CITY.id==='nice'){
 const files=new Set((await fs.readdir(root,{recursive:true})).map(f=>f.replaceAll(path.sep,'/')));
 for(const [file] of index.nodes)assert(files.has('walk/'+file),'Missing Nice geometry: '+file);
 assert(![...files].some(f=>/\.(js|mjs|html|css)$/.test(f)),'Only city data was imported');
 const report=JSON.parse(await fs.readFile(path.join(root,'import.json')));
 let generated=null;
 try{generated=JSON.parse(await fs.readFile(path.join(root,'texture-generation.json')));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(generated){assert.equal(generated.city,'nice');assert.equal(generated.initialImportSha256,hash(await fs.readFile(path.join(root,'import.json'))));assert.deepEqual(generated.initialMetadataHashes,report.metadataHashes);assert.deepEqual(Object.keys(generated.generatedMetadataHashes),['walk/index.json']);}
 for(const [file,expected] of Object.entries(report.metadataHashes))assert.equal(hash(await fs.readFile(path.join(root,file))),generated?.generatedMetadataHashes?.[file]??expected);
 const packs=JSON.parse(await fs.readFile(path.join(root,'walk-downloads/index.json')));assert.equal(packs.sourceHash,hash(indexBytes));
 assert.equal(packs.packs.reduce((n,p)=>n+p.entries.length,0),index.nodes.filter(([f])=>/^\d+\//.test(f)).length);
 for(const pack of packs.packs.filter((_,i)=>i%19===0)){
  const bytes=await fs.readFile(path.join(root,'walk-downloads',pack.file));assert.equal(hash(bytes)+'.pack',pack.file);
  const [file,offset,length,rawLength]=pack.entries[0],decoded=gunzipSync(bytes.subarray(offset,offset+length));assert.equal(decoded.length,rawLength);assert.deepEqual(decoded,await fs.readFile(path.join(root,'walk',file)));
 }
 const [x,y]=tilePoint(...CITY.origin,17).map(Math.floor),bounds=CITY.navigationBounds.flat();
 assert(!validTile(17,x,y));assert(validTile(17,x,y,bounds));
 const cache=createImageryCache({root:path.join(root,'imagery/ign'),bounds,fetchImage:()=>{throw Error('Use imported images');}});
 assert((await cache.get(17,x,y,{offline:true})).length>1000);await assert.rejects(cache.get(17,67124,45037,{offline:true}),/outside project/);
 console.log(JSON.stringify({city:CITY.id,nodes:index.nodes.length,archives:packs.packs.length,terrainMaximum:highest,terrainAtMontBoron:terrain.height(...hill),savedImages:true,sharedEngine:true}));
}else{
 console.log(JSON.stringify({city:CITY.id,originalCoordinates:true,terrainMaximum:highest}));
 console.log(execFileSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,MAP_CITY:'nice'},encoding:'utf8'}).trim());
}
