import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sourceURL,validTile} from './ign-source.mjs';

export const isJPEG=bytes=>bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;

// Disk is the source of truth. Saved originals are never expired or evicted.
export function createImageryCache({root=path.resolve('dist/data/imagery/ign'),bounds,fetchImage=globalThis.fetch,concurrency=4,interval=125,timeout=20000,retries=2,cooldown=30000,maxQueue=512}={}){
  const pending=new Map(),failed=new Map(),queue=[];
  let active=0,lastStart=0,timer;
  const stats={downloads:0,hits:0,errors:0};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function pump(){
    clearTimeout(timer);
    if(active>=concurrency||!queue.length)return;
    const delay=Math.max(0,interval-(Date.now()-lastStart));
    timer=setTimeout(()=>{
      const job=queue.shift();if(!job)return;
      active++;lastStart=Date.now();
      acquire(job).then(job.resolve,job.reject).finally(()=>{active--;pending.delete(job.key);pump();});pump();
    },delay);
  }
  async function acquire({z,x,y,key,file}){
    let lastError;
    for(let attempt=0;attempt<=retries;attempt++){
      let temporary;
      try{
        const response=await fetchImage(sourceURL(z,x,y),{signal:AbortSignal.timeout(timeout)});
        if(!response.ok)throw Error(`Image HTTP ${response.status}`);
        if(!response.headers.get('content-type')?.includes('image/jpeg'))throw Error('Image content type invalid');
        const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes.length>2*1024*1024||!isJPEG(bytes))throw Error('Image incomplete or invalid');
        await fs.mkdir(path.dirname(file),{recursive:true});temporary=`${file}.${randomUUID()}.tmp`;
        await fs.writeFile(temporary,bytes,{flag:'wx'});
        // Publish the complete file without overwriting an earlier saved original.
        try{await fs.link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}
        await fs.unlink(temporary);temporary=null;
        stats.downloads++;failed.delete(key);return await fs.readFile(file);
      }catch(error){
        lastError=error;if(temporary)await fs.unlink(temporary).catch(()=>{});
        if(attempt<retries)await wait(500*2**attempt);
      }
    }
    stats.errors++;failed.set(key,Date.now()+cooldown);
    if(failed.size>maxQueue)failed.delete(failed.keys().next().value);
    throw lastError;
  }
  return {
    root,stats,
    async get(z,x,y,{offline=false}={}){
      if(!validTile(z,x,y,bounds))throw Object.assign(Error('Tile outside project'),{statusCode:404});
      const key=`${z}/${x}/${y}`,file=path.join(root,`${key}.jpg`);
      try{const bytes=await fs.readFile(file);if(!isJPEG(bytes))throw Error(`Invalid saved image: ${key}`);stats.hits++;return bytes;}
      catch(error){if(error.code!=='ENOENT')throw error;}
      if(offline)throw Object.assign(Error('Image not saved'),{statusCode:404});
      if(pending.has(key))return pending.get(key);
      if((failed.get(key)||0)>Date.now()||queue.length>=maxQueue)throw Object.assign(Error('Image temporarily unavailable'),{statusCode:503});
      const result=new Promise((resolve,reject)=>queue.push({z,x,y,key,file,resolve,reject}));pending.set(key,result);pump();return result;
    }
  };
}
