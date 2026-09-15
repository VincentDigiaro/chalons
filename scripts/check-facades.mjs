import {assertPreserved} from './check-preservation.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {facadeHash} from '../dist/facade-layer.js';
import {chooseFacade,facadeRepeats} from './facade-policy.mjs';

for(const file of ['dist/facade-layer.js','scripts/build-facades.mjs','dist/facade-catalogue.js'])execFileSync(process.execPath,['--check',file]);
const root='dist/data/facades/',index=JSON.parse(await fs.readFile(root+'index.json','utf8')),catalog=JSON.parse(await fs.readFile(root+'catalogue.json','utf8'));
const assignments=JSON.parse(await fs.readFile(root+'assignments.json','utf8'));
const sourceRaw=await fs.readFile('dist/data/buildings.geojson'),buildings=JSON.parse(sourceRaw),source=new Map(buildings.features.map(f=>[f.properties.osm_id,f]));
const detailed=JSON.parse(await fs.readFile('dist/data/nerval/index.json','utf8'));
assert.equal(index.sourceSha256,crypto.createHash('sha256').update(sourceRaw).digest('hex'),'OSM inputs changed; rebuild facades');
assert.equal(catalog.materials.length,48);assert(index.textures.length<=64);assert.equal(index.stride,52);
assert.equal(index.textures.length,catalog.materials.length);assert.equal(index.overviewTextures.length,index.textures.length);
const currentIds=new Set(await (await import('./detailed-buildings.mjs')).detailedBuildingIds()),protectedIds=new Set(index.protectedIds),seen=new Set(),hashes=new Map();
for(const id of currentIds)assert(protectedIds.has(id),'Nerval model expanded; rebuild facades');
assert.deepEqual([...protectedIds].sort(),[...currentIds].sort(),'Protection must match the custom buildings exactly');
const hasExistingTexture=p=>Object.entries(p).some(([key,value])=>value&&/^(facade_texture|wall_texture|texture|textured|material_map|facade:.*texture|building:.*texture)$/.test(key));
let faces=0,bytes=0;const materialCounts=Array(catalog.materials.length).fill(0);
for(const assignment of assignments.buildings){
 assert(!seen.has(assignment.id));seen.add(assignment.id);assert(source.has(assignment.id));assert(!currentIds.has(assignment.id));
 assert(!hasExistingTexture(source.get(assignment.id).properties),'Existing texture overwritten');
 const hash=facadeHash(assignment.id);assert(!hashes.has(hash),'Building selection hash collision');hashes.set(hash,assignment);
 assert(assignment.faces.length>0);for(const face of assignment.faces){assert(face[3]>=0&&face[3]<catalog.materials.length);assert(face[4]>=.11);materialCounts[face[3]]++;}faces+=assignment.faces.length;
}
for(const chunk of index.chunks){
 const data=await fs.readFile(root+chunk.file);assert.equal(data.length,chunk.count*52);assert.equal(data.length,chunk.bytes);bytes+=data.length;
 for(let at=0;at<data.length;at+=52){
  const a=Array.from({length:12},(_,i)=>data.readFloatLE(at+i*4));assert(a.every(Number.isFinite));
  const assignment=hashes.get(data.readUInt32LE(at+48));assert(assignment,'Unassigned wall');
  const p=source.get(assignment.id).properties;assert(Math.abs(a[4]-p.min_height)<.001);assert(Math.abs(a[5]-p.height)<.001);assert(a[5]>a[4]);
  assert(a[6]>0&&a[7]>=1);assert(Number.isInteger(a[8])&&a[8]>=0&&a[8]<catalog.materials.length);
  if(['garage','shop'].includes(catalog.materials[a[8]].family))assert.equal(a[7],1,'Ground-floor openings repeat vertically');
  if(catalog.materials[a[8]].family==='garage')assert(a[5]-a[4]<=3.801,'Garage texture stretched over multiple floors');
  if(catalog.materials[a[8]].bays){const bays=a[6]*catalog.materials[a[8]].bays;assert(Math.abs(bays-Math.round(bays))<.0001,'Texture ends in the middle of a window bay');}
  assert(!currentIds.has(assignment.id),'Wall belongs to a custom Nerval building');
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
for(const excluded of assignments.excluded){
 assert(!seen.has(excluded.id),'Building both assigned and excluded');seen.add(excluded.id);
 const p=source.get(excluded.id)?.properties;assert(p,'Excluded building absent from source');
 if(['nerval','attila','buirette','parc14','camp127'].includes(excluded.reason))assert(currentIds.has(excluded.id),'Plain neighbour incorrectly excluded with custom model');
 else if(excluded.reason==='existing-texture')assert(hasExistingTexture(p),'Plain building incorrectly marked as textured');
 else {assert.equal(excluded.reason,'non-wall');assert(['no','roof','greenhouse','construction'].includes(p.kind)||!Number.isFinite(p.height)||p.height<=p.min_height,'Eligible building left without facades');}
}
assert.equal(seen.size,buildings.features.length,'Missing source building');
assert(materialCounts.every(n=>n>0),'Every catalogue sample should contribute to the city');assert(lowBytes<100000&&detailBytes<2000000);
// Regression cases for the unsuitable proportions seen with the first catalogue.
const family=(kind,height,area,seed=0)=>catalog.materials[chooseFacade({kind,height,min_height:0},[4.38,48.94],area,{id:1},seed,false)].family;
assert.equal(family('garage',8,30),'annex');assert.equal(family('yes',8,15),'annex');
assert.equal(family('garage',3,30),'garage');assert.equal(family('church',15,800),'church');
assert.equal(family('warehouse',8,1200),'industrial');assert.equal(family('retail',3,200),'shop');
assert.notEqual(family('retail',9,200),'shop');
assert.equal(facadeRepeats(catalog.materials[40],40,8)[1],2);
try{const baseline=JSON.parse(await fs.readFile('artifacts/facades/preservation.json','utf8'));for(const [file,hash] of Object.entries(baseline.protectedHashes))await assertPreserved(file,hash);}catch(error){if(error.code!=='ENOENT')throw error;}
const batchBaseline=JSON.parse(await fs.readFile('artifacts/facades48/preservation.json','utf8'));
for(const [file,hash] of Object.entries(batchBaseline))await assertPreserved(file,hash);
const result={checks:'passed',catalogue:catalog.materials.length,texturedBuildings:assignments.buildings.length,facades:faces,protectedNervalBuildings:index.stats.excludedNerval,protectedAttilaBuildings:index.stats.excludedAttila,chunks:index.chunks.length,geometryBytes:bytes,overviewTextureBytes:lowBytes,detailTextureBytes:detailBytes,roofs:'updated only for detailed-model exclusions',original16Textures:'unchanged'};
await fs.mkdir('artifacts/facades',{recursive:true});await fs.writeFile('artifacts/facades/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
