import {cityDataURL} from './city-config.js';
import {fetchWalkBuffer} from './walk-loading.js';

// Static archives with byte ranges: the requested count can change without
// rebuilding data or a dynamic production endpoint. One always uses old URLs.
export class WalkDownloads {
 constructor(count=1){this.count=count;this.entries=new Map();this.stats={singleRequests:0,groupedRequests:0,groupedObjects:0,fallbacks:0};}
 async load(signal,indexBuffer){
  if(this.count===1)return;
  try{
   const response=await fetch(cityDataURL('walk-downloads/index.json'),{signal,cache:'no-cache'});
   if(!response.ok)throw Error('Archive index unavailable');
   const manifest=await response.json();if(manifest.version!==1||manifest.encoding!=='gzip')throw Error('Invalid archive index');
   if(indexBuffer){const digest=await crypto.subtle.digest('SHA-256',indexBuffer),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==manifest.sourceHash)throw Error('Stale archives');}
   for(const pack of manifest.packs){
    if(!/^[a-f0-9]+\.pack$/.test(pack.file))throw Error('Invalid archive path');
    let end=0;
    pack.entries.forEach(([file,offset,bytes,rawBytes],i)=>{
     if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(bytes)||offset!==end||bytes<4||!Number.isSafeInteger(rawBytes)||rawBytes<4||rawBytes%4)throw Error('Invalid archive bounds');
     end=offset+bytes;this.entries.set(file,{pack,i,offset,bytes,rawBytes});
    });
   }
  }catch(error){this.entries.clear();if(signal.aborted)throw error;this.stats.fallbacks++;}
 }
 take(queue){
  const first=queue.shift(),entry=this.entries.get(first.file);
  if(!entry||this.count===1)return [first];
  const available=new Map(queue.filter(n=>!n.controller.signal.aborted).map(n=>[n.file,n]));
  let lo=entry.i,hi=entry.i;
  while(hi-lo+1<this.count){
   if(hi+1<entry.pack.entries.length&&available.has(entry.pack.entries[hi+1][0]))hi++;
   else if(lo>0&&available.has(entry.pack.entries[lo-1][0]))lo--;
   else break;
  }
  const nodes=entry.pack.entries.slice(lo,hi+1).map(([file])=>file===first.file?first:available.get(file));
  const selected=new Set(nodes);for(let i=queue.length-1;i>=0;i--)if(selected.has(queue[i]))queue.splice(i,1);
  return nodes;
 }
 async read(nodes,{signal,onRetry}){
  const first=this.entries.get(nodes[0].file),last=this.entries.get(nodes.at(-1).file);
  if(nodes.length===1){this.stats.singleRequests++;return [await fetchWalkBuffer(cityDataURL('walk/'+nodes[0].file),{signal,onRetry})];}
  const start=first.offset,end=last.offset+last.bytes-1;
  try{
   const attempt=new AbortController(),abort=()=>attempt.abort(signal.reason),timer=setTimeout(()=>attempt.abort(),20000);
   signal.addEventListener('abort',abort,{once:true});
   let buffer;
   try{
    if(signal.aborted)throw signal.reason;
    const response=await fetch(cityDataURL('walk-downloads/'+first.pack.file),{signal:attempt.signal,headers:{Range:`bytes=${start}-${end}`}});
    if(response.status!==206||!response.headers.get('content-range')?.startsWith(`bytes ${start}-${end}/`)){await response.body?.cancel();throw Error('Byte ranges unavailable');}
    buffer=await response.arrayBuffer();if(buffer.byteLength!==end-start+1)throw Error('Incomplete archive range');
   }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
   this.stats.groupedRequests++;this.stats.groupedObjects+=nodes.length;
   const buffers=[];
   for(const node of nodes){
    if(signal.aborted)throw signal.reason;
    if(node.controller.signal.aborted){buffers.push(null);continue;}
    const e=this.entries.get(node.file),offset=e.offset-start;
    const stream=new Blob([new Uint8Array(buffer,offset,e.bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
    const raw=await new Response(stream).arrayBuffer();if(raw.byteLength!==e.rawBytes)throw Error('Invalid decoded geometry');buffers.push(raw);
   }
   return buffers;
  }catch(error){
   if(signal.aborted)throw error;
   // A static host without Range support, stale or absent archives remains usable.
   for(const node of nodes)this.entries.delete(node.file);this.stats.fallbacks++;
   const buffers=[];for(const node of nodes){this.stats.singleRequests++;buffers.push(node.controller.signal.aborted?null:await fetchWalkBuffer(cityDataURL('walk/'+node.file),{signal,onRetry}));}return buffers;
  }
 }
 getState(){return {objectsPerDownload:this.count,...this.stats};}
}
