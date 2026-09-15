// Real public HTTPS transfers through the production geometry queue. This
// measures request counts, not the frame rate or latency of a mobile device.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {WalkGeometryLoader} from '../dist/walk-geometry-loader.js';
import {excludeReplacedWalkNodes} from '../dist/walk-replacements.js';
import {SPAWN,inRange,nodeLoadRadius} from '../dist/walk-core.js';
import {FPS_CONFIG} from '../dist/walk-config.js';

const base='https://digiaro.duckdns.org/chalons/',nativeFetch=globalThis.fetch;
const json=async file=>{const r=await nativeFetch(new URL(file,base),{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);return r.json();};
const [raw,registry,config]=await Promise.all([json('data/walk/index.json'),json('data/custom-models.json'),json('fps-config.json')]);
assert.deepEqual(config,FPS_CONFIG);
const index=excludeReplacedWalkNodes(raw,registry),requests=[],loaded=new Set(),errors=[];
globalThis.fetch=(url,options)=>{requests.push(String(url));return nativeFetch(new URL(url,base),options);};
const loader=new WalkGeometryLoader({concurrency:config.chargementsGeometrieSimultanes,onLoad(node,buffer){assert(buffer.byteLength>=4);node.gpu={};loaded.add(node.file);},onError:error=>errors.push(error.message)});
loader.configure(index.geometryPacks);
const nodes=index.nodes.filter(([file,...bounds])=>!file.startsWith('roads/')&&inRange(bounds,SPAWN,nodeLoadRadius(file))).map(([file,...bounds])=>({file,bounds,controller:new AbortController()}));
const wantedPacks=new Set(nodes.map(n=>loader.key(n))),start=Date.now();
try{
 loader.sync(nodes,SPAWN);
 while(loader.active||loader.queue.length){assert(Date.now()-start<45000,'Public geometry transfer exceeded the test deadline');await new Promise(r=>setTimeout(r,20));}
 assert.deepEqual(errors,[]);assert.equal(loaded.size,nodes.length);assert.equal(requests.length,wantedPacks.size);assert.equal(new Set(requests).size,requests.length);assert(requests.every(url=>url.startsWith('./data/walk/packs/')));
 const report={publicHTTPS:'passed',buildingsLoaded:loaded.size,geometryRequests:requests.length,individualBuildingRequests:0,queueLimit:config.chargementsGeometrieSimultanes};
 await fs.writeFile('artifacts/walk-packs-release/https-loader-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{loader.dispose();globalThis.fetch=nativeFetch;}
