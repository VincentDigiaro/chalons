import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {WalkGeometryLoader} from '../dist/walk-geometry-loader.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {excludeReplacedWalkNodes} from '../dist/walk-replacements.js';
import {SPAWN,EYE_HEIGHT,inRange,nodeLoadRadius,nearDistance} from '../dist/walk-core.js';
import {FPS_CONFIG} from '../dist/walk-config.js';

const args=process.argv.slice(2),root=args[0]||'dist',fallback=args[1]||root;
const read=async file=>{try{return await fs.readFile(path.join(root,file));}catch(e){if(e.code!=='ENOENT')throw e;return fs.readFile(path.join(fallback,file));}};
const originalIndex=JSON.parse(await read('data/walk/index.json')),registry=JSON.parse(await read('data/custom-models.json'));
const index=excludeReplacedWalkNodes(originalIndex,registry),packs=index.geometryPacks;assert.equal(packs.version,1);
const seen=new Set();let rawBytes=0,compressedOriginals=0,compressedPacks=0;
for(const pack of packs.files){
 const bytes=await read('data/walk/'+pack.file);assert.equal(bytes.length,pack.bytes);assert.equal(bytes.readUInt32LE(0),0x314b5057);assert.equal(bytes.readUInt32LE(4),pack.entries.length);
 let end=8;compressedPacks+=gzipSync(bytes).length;
 for(const [file,offset,length] of pack.entries){
  assert(!seen.has(file),'Each building must have exactly one packet');seen.add(file);assert.equal(offset,end);end+=length;
  const original=await read('data/walk/'+file);assert(bytes.subarray(offset,offset+length).equals(original),'Changed building bytes: '+file);
  rawBytes+=length;compressedOriginals+=gzipSync(original).length;
 }
 assert.equal(end,bytes.length);assert(pack.bytes<=packs.config.tailleMaxPaquetOctets||pack.entries.length===1);
}
assert.deepEqual([...seen].sort(),originalIndex.nodes.filter(([file])=>!file.startsWith('roads/')).map(([file])=>file).sort());
assert.equal(rawBytes,packs.stats.buildingBytes);

// A shared request survives one subscriber leaving. Later subscribers reuse its
// immutable bytes; unrelated/excluded buildings are never delivered to the GPU.
const makeNode=(file,bounds)=>({file,bounds,controller:new AbortController()});
const fixture=Buffer.alloc(20);fixture.writeUInt32LE(0x314b5057);fixture.writeUInt32LE(3,4);fixture.set([1,2,3,4,5,6,7,8,9,10,11,12],8);
const manifest={version:1,files:[{file:'packs/shared.bin',bytes:20,entries:[['a.bin',8,4],['b.bin',12,4],['c.bin',16,4]]}]};
let finish,requestSignal,requests=0;const delivered=[];
globalThis.fetch=(url,{signal})=>{requests++;requestSignal=signal;return new Promise((resolve,reject)=>{finish=()=>resolve(new Response(fixture));signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});};
const loader=new WalkGeometryLoader({concurrency:2,onLoad(node,buffer){delivered.push([node.file,[...new Uint8Array(buffer)]]);new Uint8Array(buffer).fill(0);node.gpu={};},onError:error=>{throw error;}});
loader.configure(manifest);const a=makeNode('a.bin',[0,0,1,1]),b=makeNode('b.bin',[1,0,2,1]),c=makeNode('c.bin',[2,0,3,1]);
loader.sync([a,b],[0,0]);assert.equal(requests,1);a.controller.abort();loader.prune([b]);assert(!requestSignal.aborted);finish();
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async instance=>{for(let i=0;instance.active||instance.queue.length;i++){assert(i<10000,'Loader did not finish');await new Promise(r=>setTimeout(r,2));}};
await settle(loader);assert.deepEqual(delivered,[['b.bin',[5,6,7,8]]]);
loader.sync([b,c],[0,0]);assert.equal(requests,1);assert.deepEqual(delivered.at(-1),['c.bin',[9,10,11,12]]);assert(loader.getState().cachedPackBytes>0);
loader.prune([]);assert.equal(loader.getState().cachedPackBytes,0);loader.dispose();
const cancelled=new WalkGeometryLoader({concurrency:1,onLoad(){assert.fail('Cancelled packet was delivered');},onError:assert.fail});
cancelled.configure(manifest);cancelled.sync([makeNode('a.bin',[0,0,1,1])],[0,0]);cancelled.dispose();assert(requestSignal.aborted);await turn();assert.equal(cancelled.active,0);

// Compare both transports through the actual renderer, including collisions,
// per-building eligibility, and motion into previously downloaded boundary packs.
globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function run(packed){
 let handle=0,requests=[],draws=[];const gl=new Proxy({}, {get(target,key){
  if(key in target)return target[key];if(/^[A-Z_0-9]+$/.test(key))return target[key]=++handle;
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(key==='getExtension')return ()=>null;
  if(key==='drawArrays')return (mode,first,count)=>draws.push([first,count]);
  if(key.startsWith('create'))return ()=>++handle;return ()=>{};
 }});
 globalThis.fetch=async(url,{signal}={})=>{
  if(!String(url).startsWith('./data/walk/'))return new Response('',{status:404});
  assert(!signal?.aborted);const file=String(url).slice('./data/walk/'.length);requests.push(file);
  return new Response(await read('data/walk/'+file));
 };
 const renderer=new WalkRenderer({clientWidth:800,clientHeight:600,getContext:()=>gl});
 renderer.index={...index,geometryPacks:packed?packs:undefined};
 // Texture transport is independent; make it ready in both geometry runs.
 renderer.texture=()=>({gpu:1});
 const snapshots=[];
 try{
  for(const position of [SPAWN,[SPAWN[0]+100,SPAWN[1]],[-413,2800]]){
   const requestStart=requests.length;renderer.trim(position);renderer.refresh(position);await settle(renderer);
   assert.equal(renderer.errors,0);const wanted=index.nodes.filter(([file,...bounds])=>inRange(bounds,position,nodeLoadRadius(file))).map(n=>n[0]).sort();
   const loaded=[...renderer.nodes.values()].filter(n=>n.gpu).sort((a,b)=>a.file.localeCompare(b.file));
   assert.deepEqual(loaded.map(n=>n.file).sort(),wanted,'Packets must not widen or shrink the building radius');
   if(packed){
    const current=new Set();for(const file of requests.slice(requestStart))if(file.startsWith('packs/')){assert(!current.has(file),'Duplicate pack HTTP request');current.add(file);const pack=packs.files.find(p=>p.file===file);assert(pack.entries.some(([f])=>wanted.includes(f)),'Requested a pack with no needed building');}
    assert(!requests.slice(requestStart).some(file=>seen.has(file)),'Packed buildings still use individual HTTP requests');
   }
   draws=[];renderer.draw(position,EYE_HEIGHT+.022,0,0);
   const signature=loaded.map(n=>[n.file,n.gpu.count,n.ranges,hash(JSON.stringify(n.collision))]);
   snapshots.push({position,signature:hash(JSON.stringify(signature)),draws:hash(JSON.stringify(draws)),collisions:hash(JSON.stringify(renderer.collisionScene(position))),buildings:loaded.filter(n=>!n.file.startsWith('roads/')).length,requests:requests.length-requestStart,buildingRequests:requests.slice(requestStart).filter(f=>!f.startsWith('roads/')).length});
  }
 }finally{renderer.dispose();await settle(renderer);assert.equal(renderer.geometryLoader.getState().cachedPackBytes,0);}
 return snapshots;
}
const legacy=await run(false),packed=await run(true);
for(let i=0;i<legacy.length;i++)for(const key of ['signature','draws','collisions','buildings'])assert.deepEqual(packed[i][key],legacy[i][key],key+' changed after packaging');
assert(packed[0].buildingRequests<legacy[0].buildingRequests/5,'Insufficient measured request reduction');
const report={packaging:'passed',buildings:seen.size,packets:packs.files.length,geometryBytesUnchanged:rawBytes,compressedOriginals,compressedPacks,perBuildingRange:true,sharedRequest:true,cacheReuse:true,abortAndEviction:true,geometryAndCollisionsIdentical:true,configuredConcurrency:FPS_CONFIG.chargementsGeometrieSimultanes,positions:legacy.map((r,i)=>({position:r.position,buildings:r.buildings,buildingRequestsBefore:r.buildingRequests,buildingRequestsAfter:packed[i].buildingRequests,allGeometryRequestsBefore:r.requests,allGeometryRequestsAfter:packed[i].requests}))};
await fs.mkdir('artifacts/walk-packs-release',{recursive:true});await fs.writeFile('artifacts/walk-packs-release/validation-'+(root==='dist'?'local':'public')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
