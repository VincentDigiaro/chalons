import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hash,materials,chooseNiceFacade,nearestSector,niceRepeats} from './nice-facade-policy.mjs';
const root=process.argv.includes('--stage')?'artifacts/nice-textures/build':'dist/data/cities/nice';
const json=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=b=>createHash('sha256').update(b).digest('hex');
const index=json('facades/index.json'),catalog=json('facades/catalogue.json'),assign=json('facades/assignments.json'),walk=json('walk/index.json');
assert.equal(index.textures.length,48);assert.equal(index.overviewTextures.length,48);assert.equal(catalog.materials.length,48);
const textureHashes=new Set();
for(let i=0;i<48;i++){assert.equal(catalog.materials[i].id,materials[i].id);for(const p of [index.textures[i],index.overviewTextures[i]]){assert(p.includes('nice-'));const raw=fs.readFileSync(root+'/facades/'+p);assert.equal(raw.subarray(0,4).toString(),'RIFF');assert.equal(raw.subarray(8,12).toString(),'WEBP');textureHashes.add(sha(raw));}assert.equal(walk.materials[walk.facadeBase+i].texture,'../facades/'+index.textures[i]);}
assert.equal(textureHashes.size,96,'All Nice resolution variants are distinct');
const building=new Map(assign.buildings.map(b=>[hash(b.id),b])),seen=new Map(),counts=Array(48).fill(0);let total=0;
assert.equal(building.size,98803);assert.equal(assign.excluded.length,569);
for(const c of index.chunks){const raw=fs.readFileSync(root+'/facades/'+c.file);assert.equal(raw.length,c.count*52);for(let at=0;at<raw.length;at+=52){const v=Array.from({length:12},(_,i)=>raw.readFloatLE(at+4*i)),id=raw.readUInt32LE(at+48);assert(building.has(id));assert(v.every(Number.isFinite));assert(v[5]>v[4]);assert(Number.isInteger(v[8])&&v[8]>=0&&v[8]<48);assert(v[6]>0&&v[7]>=1);assert(Number.isInteger(v[7]));seen.set(id,(seen.get(id)||0)+1);counts[v[8]]++;total++;}}
assert.equal(total,695662);assert.equal(seen.size,building.size);assert.deepEqual(counts,index.stats.materialCounts);for(const [h,b] of building)assert.equal(seen.get(h),b.faces.length);
assert.equal(walk.sourceHashes['dist/data/facades/index.json'],sha(fs.readFileSync(root+'/facades/index.json')));
assert.equal(json('texture-generation.json').generatedMetadataHashes['walk/index.json'],sha(fs.readFileSync(root+'/walk/index.json')));
// Regression cases: old Nice apartments keep an old-town family; garage doors
// never repeat on upper floors; repeat counts stay deterministic.
const old=[7.276,43.696],p={kind:'apartments',height:20,min_height:0};
for(let seed=0;seed<100;seed++){const m=chooseNiceFacade(p,old,200,nearestSector(old),seed);assert.equal(materials[m].family,'town');assert.equal(m,chooseNiceFacade(p,old,200,nearestSector(old),seed));}
assert.deepEqual(niceRepeats(46,12,3,null),[2,1]);assert.deepEqual(niceRepeats(0,11.6,16.5,5),[2,5]);
const result={validatedAt:new Date().toISOString(),root,facades:48,resolutions:2,eligibleBuildings:seen.size,faces:total,sectors:Object.keys(index.stats.sectorCounts).length,allPathsResolve:true,materialIndicesValid:true};
fs.writeFileSync('artifacts/nice-textures/validation.json',JSON.stringify(result,null,2));console.log(result);
