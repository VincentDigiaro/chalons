import {fetchWalkBuffer} from './walk-loading.js';
import {nearDistance} from './walk-core.js';

// One queue slot is one HTTP resource, regardless of how many buildings use it.
export class WalkGeometryLoader{
 constructor({concurrency,onLoad,onError,onRetry=()=>{}}){
  Object.assign(this,{concurrency,onLoad,onError,onRetry});
  this.resources=new Map();this.entries=new Map();this.queue=[];this.active=0;
  this.requests={packs:0,singles:0};this.disposed=false;
 }
 configure(packs){
  if(this.manifest===packs)return;
  if(this.resources.size)throw Error('Cannot change geometry packs while loading.');
  this.manifest=packs;this.entries.clear();
  if(!packs)return;
  if(packs.version!==1)throw Error('Unsupported building pack version.');
  for(const pack of packs.files){
   if(!/^packs\/[\w-]+\.bin$/.test(pack.file)||!Number.isSafeInteger(pack.bytes)||pack.bytes<8)throw Error('Invalid building pack.');
   for(const [file,offset,length] of pack.entries){
    if(this.entries.has(file)||![offset,length].every(Number.isSafeInteger)||offset<8||offset%4||length<4||length%4||offset+length>pack.bytes)throw Error('Invalid building pack entry: '+file);
    this.entries.set(file,{pack,offset,length});
   }
  }
 }
 key(node){return this.entries.get(node.file)?.pack.file||node.file;}
 prune(nodes){
  const used=new Set([...nodes].map(node=>this.key(node)));
  for(const [key,resource] of this.resources)if(!used.has(key)){
   resource.controller.abort();resource.buffer=null;this.resources.delete(key);
  }
  this.queue=this.queue.filter(r=>this.resources.get(r.file)===r);
 }
 sync(nodes,position){
  if(this.disposed)return;
  nodes=[...nodes];this.prune(nodes);
  for(const resource of this.resources.values()){resource.nodes.clear();resource.distance=Infinity;}
  for(const node of nodes){
   if(node.controller.signal.aborted)continue;
   const entry=this.entries.get(node.file),key=entry?.pack.file||node.file;
   let resource=this.resources.get(key);
   if(!resource){
    if(node.gpu||node.failed)continue;
    resource={file:key,pack:entry?.pack,nodes:new Set(),distance:Infinity,state:'queued',controller:new AbortController()};
    this.resources.set(key,resource);
   }
   resource.nodes.add(node);resource.distance=Math.min(resource.distance,nearDistance(node.bounds,position));
   if(resource.state==='ready')this.deliver(resource,node);
   else if(resource.state==='failed'&&!node.gpu&&!node.failed){node.failed=true;this.onError(resource.error,node);}
   else node.loading=resource.state==='loading';
  }
  this.queue=[...this.resources.values()].filter(r=>r.state==='queued').sort((a,b)=>a.distance-b.distance||a.file.localeCompare(b.file));
  this.pump();
 }
 deliver(resource,node){
  if(this.disposed||node.gpu||node.failed||node.controller.signal.aborted)return;
  node.retrying=false;node.loading=false;
  try{
   const entry=this.entries.get(node.file);
   // Each building owns its copy: aerial roof UV edits cannot alter the cache.
   const buffer=entry?resource.buffer.slice(entry.offset,entry.offset+entry.length):resource.buffer;
   this.onLoad(node,buffer);
  }catch(error){node.failed=true;this.onError(error,node);}
 }
 pump(){
  while(!this.disposed&&this.active<this.concurrency&&this.queue.length){
   const resource=this.queue.shift();if(resource.controller.signal.aborted)continue;
   resource.state='loading';this.active++;this.requests[resource.pack?'packs':'singles']++;
   for(const node of resource.nodes)node.loading=true;
   fetchWalkBuffer('./data/walk/'+resource.file,{signal:resource.controller.signal,onRetry:()=>{
    for(const node of resource.nodes)node.retrying=true;this.onRetry();
   }}).then(buffer=>{
    if(this.disposed||resource.controller.signal.aborted)return;
    if(resource.pack){
     const view=new DataView(buffer);
     if(buffer.byteLength!==resource.pack.bytes||view.getUint32(0,true)!==0x314b5057||view.getUint32(4,true)!==resource.pack.entries.length)throw Error('Invalid building pack: '+resource.file);
    }
    resource.buffer=buffer;resource.state='ready';
    for(const node of resource.nodes)this.deliver(resource,node);
    if(!resource.pack)resource.buffer=null;
   }).catch(error=>{
    if(error.name==='AbortError'||resource.controller.signal.aborted)return;
    resource.state='failed';resource.error=error;for(const node of resource.nodes)if(!node.controller.signal.aborted){node.failed=true;this.onError(error,node);}
   }).finally(()=>{
    this.active--;for(const node of resource.nodes)node.loading=false;this.pump();
   });
  }
 }
 getState(){return {active:this.active,queued:this.queue.length,requests:{...this.requests},cachedPackBytes:[...this.resources.values()].reduce((total,r)=>total+(r.pack?r.buffer?.byteLength||0:0),0)};}
 dispose(){this.disposed=true;for(const r of this.resources.values()){r.controller.abort();r.buffer=null;}this.resources.clear();this.queue=[];}
}
