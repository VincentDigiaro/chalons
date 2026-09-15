import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createImageryCache} from './imagery-cache.mjs';
import {createImageryServer} from './serve-imagery.mjs';
import {createImageryLoader} from '../dist/imagery.js';

const temporaryRoot=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(temporaryRoot,'chalons-imagery-http-'));
const bytes=await fs.readFile('.cache/ign/centre-sample.jpg'),tile=[17,67124,45037];
let downloads=0,server,base;
async function start(cache,offline=false){
  server=createImageryServer({cache,offline});server.listen(0,'127.0.0.1');await once(server,'listening');
  base=`http://127.0.0.1:${server.address().port}/`;
}
async function stop(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;}}
try{
  const cache=createImageryCache({root,interval:0,retries:0,fetchImage:async()=>{
    downloads++;await new Promise(resolve=>setTimeout(resolve,20));
    return new Response(bytes,{headers:{'content-type':'image/jpeg'}});
  }});
  await start(cache);
  const load=createImageryLoader({fetchImage:(url,options)=>fetch(new URL(url,base),options)});
  const results=await Promise.all(Array.from({length:12},()=>load(...tile)));
  results.forEach(result=>assert.deepEqual(Buffer.from(result.data),bytes));
  assert.equal(downloads,1);
  assert.deepEqual(await fs.readFile(path.join(root,tile.join('/')+'.jpg')),bytes,'Original must be saved before HTTP delivery');
  await stop();
  // A real server restart and unavailable upstream cannot affect a saved image.
  await start(createImageryCache({root,fetchImage:()=>{throw Error('IGN is offline');}}),true);
  assert.deepEqual(Buffer.from((await load(...tile)).data),bytes);
  const url=new URL('data/imagery/ign/'+tile.join('/')+'.jpg',base);
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.match(head.headers.get('cache-control'),/immutable/);
  assert.equal((await fetch(new URL('data/imagery/ign/17/67125/45037.jpg',base))).status,404);
  assert.equal((await fetch(new URL('data/imagery/ign/20/0/0.jpg',base))).status,404);
  assert.equal((await fetch(new URL('fps-config.json',base))).status,404);
  assert.equal((await fetch(url,{method:'POST'})).status,405);
  console.log(JSON.stringify({imageryHTTP:'passed',visitors:12,downloads,savedBeforeDelivery:true,restartWithIGNOffline:'passed',savedHEAD:'passed',unrelatedFiles:'not exposed'}));
}finally{
  await stop();
  const target=path.resolve(root);assert(target.startsWith(temporaryRoot+path.sep)&&path.basename(target).startsWith('chalons-imagery-http-'));
  await fs.rm(target,{recursive:true,force:true});
}
