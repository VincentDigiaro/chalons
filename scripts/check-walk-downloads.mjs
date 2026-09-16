import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {WalkDownloads} from '../dist/walk-downloads.js';
const manifest=JSON.parse(await fs.readFile('dist/data/walk-downloads/index.json'));
const pack=manifest.packs.find(p=>p.entries.length>=40),files=pack.entries.slice(0,40).map(e=>e[0]);
const nodes=()=>files.map(file=>({file,controller:new AbortController()}));
let calls=[],rangeSupport=true;
globalThis.fetch=async(url,options={})=>{
 calls.push({url:String(url),range:options.headers?.Range});
 const file='dist/'+String(url).replace(/^\.\//,'');
 let bytes=await fs.readFile(file);
 if(options.headers?.Range&&rangeSupport){const [,a,b]=options.headers.Range.match(/bytes=(\d+)-(\d+)/),start=Number(a),end=Number(b);return new Response(bytes.subarray(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}});}
 return new Response(bytes);
};
const signal=new AbortController().signal;
for(const count of [1,2,7,40,256]){
 calls=[];const loader=new WalkDownloads(count);await loader.load(signal);let queue=nodes(),objects=0;
 while(queue.length){const group=loader.take(queue);assert(group.length<=count);const result=await loader.read(group,{signal,onRetry(){}});for(let i=0;i<group.length;i++)assert(Buffer.from(result[i]).equals(await fs.readFile('dist/data/walk/'+group[i].file)));objects+=result.length;}
 assert.equal(objects,40);
 if(count===1){assert.equal(calls.length,40);assert(calls.every(c=>c.url.startsWith('./data/walk/')&&!c.range),'1 must use only the existing individual resources');}
 else {assert.equal(loader.stats.groupedRequests,Math.ceil(40/count)-(40%count===1?1:0));assert(calls.some(c=>c.range));}
}
rangeSupport=false;const fallback=new WalkDownloads(40);await fallback.load(signal);const result=await fallback.read(fallback.take(nodes()),{signal,onRetry(){}});assert.equal(result.length,40);assert.equal(fallback.stats.fallbacks,1);assert.equal(fallback.stats.singleRequests,40);
console.log(JSON.stringify({downloads:'passed',counts:[1,2,7,40,256],individualBytesPreserved:true,unsupportedRangeFallback:true}));
