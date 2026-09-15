import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {excludeReplacedWalkNodes} from '../dist/walk-replacements.js';
import {fetchWalkBuffer} from '../dist/walk-loading.js';

const out='artifacts/buirette-overlap-fix',json=async file=>JSON.parse(await fs.readFile(file));
const registry=await json('dist/data/custom-models.json'),old=await json('artifacts/buirette-15-fixes/local-before/data/walk/index.json');
const staleNode=old.nodes.find(n=>n[0]==='24/way-156701424.bin');assert(staleNode,'The old index must reproduce the bug');
const filtered=excludeReplacedWalkNodes(old,registry);
assert(!filtered.nodes.includes(staleNode));
assert.equal(filtered.materials,old.materials);
const ids=new Set(registry.models.flatMap(m=>m.excludeIds));
assert.deepEqual(filtered.nodes,old.nodes.filter(([file])=>{const m=/^\d+\/(way|relation)-(\d+)\.bin$/.exec(file);return !m||!ids.has(m[1]+'/'+m[2]);}));
assert(old.nodes.includes(staleNode),'Filtering must not mutate a reused index');
const future={nodes:[['21/way-4321.bin'],['21/way-4322.bin'],['future/detail.bin'],['roads/way-4321.bin']]};
assert.deepEqual(excludeReplacedWalkNodes(future,{models:[{excludeIds:['way/4321']}]}).nodes,future.nodes.slice(1));

const active=await json('dist/data/walk/index.json');assert(active.retiredNodes.includes(staleNode[0]));
for(const file of active.retiredNodes){
 assert(!active.nodes.some(n=>n[0]===file));
 const raw=await fs.readFile('dist/data/walk/'+file),length=raw.readUInt32LE(0),header=JSON.parse(raw.toString('utf8',4,4+length));
 assert.equal(raw.length,4+length);assert.deepEqual(header.ranges,[]);assert.deepEqual(header.segments,[]);
}
const controller=new AbortController();let seenCache;
globalThis.fetch=async(_url,options)=>{seenCache=options.cache;return new Response('{}');};
await fetchWalkBuffer('/data/custom-models.json',{signal:controller.signal,cache:'no-store'});assert.equal(seenCache,'no-store');
const baseline=await json(out+'/baseline.json'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const file of ['data/buirette/index.json','data/buirette/mesh.bin','data/nerval/index.json','data/nerval/mesh.bin','data/attila/index.json','data/attila/mesh.bin','data/facades/index.json','data/roofs/index.json','custom-model-residency.js'])assert.equal(hash(await fs.readFile('dist/'+file)),baseline.local[file],'Unexpected geometry or map loader change: '+file);
const result={passed:true,staleIndexExcluded:true,legacyPacketsEmpty:active.retiredNodes.length,retiredCollisionsEmpty:true,registryBypassesCache:true,futureModelsSupported:true,modelGeometryUnchanged:true};
await fs.writeFile(out+'/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
