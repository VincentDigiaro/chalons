import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {facadeHash} from '../dist/facade-layer.js';

for(const file of ['dist/facade-layer.js','scripts/build-facades.mjs','dist/facade-catalogue.js'])execFileSync(process.execPath,['--check',file]);
const root='dist/data/facades/',index=JSON.parse(await fs.readFile(root+'index.json','utf8')),catalog=JSON.parse(await fs.readFile(root+'catalogue.json','utf8'));
const assignments=JSON.parse(await fs.readFile(root+'assignments.json','utf8'));
const sourceRaw=await fs.readFile('dist/data/buildings.geojson'),buildings=JSON.parse(sourceRaw),source=new Map(buildings.features.map(f=>[f.properties.osm_id,f]));
const detailed=JSON.parse(await fs.readFile('dist/data/nerval/index.json','utf8'));
assert.equal(index.sourceSha256,crypto.createHash('sha256').update(sourceRaw).digest('hex'),'OSM inputs changed; rebuild facades');
assert.equal(catalog.materials.length,16);assert(index.textures.length<=32);assert.equal(index.stride,52);
assert.equal(index.textures.length,catalog.materials.length);assert.equal(index.overviewTextures.length,index.textures.length);
const currentIds=new Set(detailed.excludeIds),protectedIds=new Set(index.protectedIds),seen=new Set(),hashes=new Map();
for(const id of currentIds)assert(protectedIds.has(id),'Nerval model expanded; rebuild facades');
assert(index.protectedBounds[0]<=detailed.bounds[0]&&index.protectedBounds[1]<=detailed.bounds[1]&&index.protectedBounds[2]>=detailed.bounds[2]&&index.protectedBounds[3]>=detailed.bounds[3]);
let faces=0,bytes=0;const materialCounts=Array(16).fill(0);
for(const assignment of assignments.buildings){
 assert(!seen.has(assignment.id));seen.add(assignment.id);assert(source.has(assignment.id));assert(!currentIds.has(assignment.id));
 const hash=facadeHash(assignment.id);assert(!hashes.has(hash),'Building selection hash collision');hashes.set(hash,assignment);
 assert(assignment.faces.length>0);for(const face of assignment.faces){assert(face[3]>=0&&face[3]<16);assert(face[4]>=.11);materialCounts[face[3]]++;}faces+=assignment.faces.length;
}
for(const chunk of index.chunks){
 const data=await fs.readFile(root+chunk.file);assert.equal(data.length,chunk.count*52);assert.equal(data.length,chunk.bytes);bytes+=data.length;
 const [w,s,e,n]=index.protectedBounds;
 for(let at=0;at<data.length;at+=52){
  const a=Array.from({length:12},(_,i)=>data.readFloatLE(at+i*4));assert(a.every(Number.isFinite));
  const assignment=hashes.get(data.readUInt32LE(at+48));assert(assignment,'Unassigned wall');
  const p=source.get(assignment.id).properties;assert(Math.abs(a[4]-p.min_height)<.001);assert(Math.abs(a[5]-p.height)<.001);assert(a[5]>a[4]);
  assert(a[6]>0&&a[7]>=1);assert(Number.isInteger(a[8])&&a[8]>=0&&a[8]<16);if(a[8]===13)assert.equal(a[7],1,'Garage doors repeat vertically');
  const center=[(chunk.x+(a[0]+a[2])*.5)/2**index.zoom,(chunk.y+(a[1]+a[3])*.5)/2**index.zoom];
  const lng=center[0]*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*center[1])))*180/Math.PI;
  assert(!(lng>w&&lng<e&&lat>s&&lat<n),'Wall intersects protected street');
 }
}
function webpSize(bytes){assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');const kind=bytes.toString('ascii',12,16);if(kind==='VP8 ')return [bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff];if(kind==='VP8X')return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];throw Error('Unsupported WebP header');}
let lowBytes=0,detailBytes=0;
for(let i=0;i<index.textures.length;i++){
 const low=await fs.readFile(root+index.overviewTextures[i]),high=await fs.readFile(root+index.textures[i]);
 assert.deepEqual(webpSize(low),index.overviewSize);assert.deepEqual(webpSize(high),index.textureSize);lowBytes+=low.length;detailBytes+=high.length;
}
assert.equal(seen.size,index.stats.texturedBuildings);assert.equal(faces,index.stats.facades);assert.equal(bytes,index.stats.geometryBytes);assert.deepEqual(materialCounts,index.stats.materialCounts);
assert.equal(assignments.excluded.length+seen.size,buildings.features.length);
assert(materialCounts.every(n=>n>0));assert(lowBytes<100000&&detailBytes<2000000);
try{const baseline=JSON.parse(await fs.readFile('artifacts/facades/preservation.json','utf8'));for(const [file,hash] of Object.entries(baseline.protectedHashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),hash,`Protected file changed: ${file}`);}catch(error){if(error.code!=='ENOENT')throw error;}
const result={checks:'passed',catalogue:16,texturedBuildings:seen.size,facades:faces,protectedNervalBuildings:index.stats.excludedNerval,chunks:index.chunks.length,geometryBytes:bytes,overviewTextureBytes:lowBytes,detailTextureBytes:detailBytes,roofs:'unchanged'};
await fs.mkdir('artifacts/facades',{recursive:true});await fs.writeFile('artifacts/facades/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
