import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createImageryCache} from './imagery-cache.mjs';
import {sourceURL,validTile} from './ign-source.mjs';
import {localImageryURL as imageryURL} from '../dist/imagery.js';

const temporaryRoot=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(temporaryRoot,'chalons-imagery-'));
const bytes=await fs.readFile('.cache/ign/centre-sample.jpg');
let requests=0;
try{
  const cache=createImageryCache({root,interval:0,retries:0,cooldown:0,fetchImage:async url=>{
    requests++;assert.equal(url,sourceURL(17,67124,45037));await new Promise(resolve=>setTimeout(resolve,20));
    return new Response(bytes,{'headers':{'content-type':'image/jpeg'}});
  }});
  const first=await Promise.all(Array.from({length:12},()=>cache.get(17,67124,45037)));
  assert.equal(requests,1,'Simultaneous visitors should download an image only once');first.forEach(data=>assert.deepEqual(data,bytes));
  // A new server instance must still work with no upstream connection.
  const restarted=createImageryCache({root,fetchImage:()=>{throw Error('Upstream must not be called');}});
  assert.deepEqual(await restarted.get(17,67124,45037),bytes);
  assert.deepEqual(await restarted.get(17,67124,45037,{offline:true}),bytes);
  await assert.rejects(restarted.get(17,67125,45037,{offline:true}),/not saved/);
  const invalid=createImageryCache({root,interval:0,retries:0,cooldown:0,fetchImage:async()=>new Response('<error/>',{'headers':{'content-type':'image/jpeg'}})});
  await assert.rejects(invalid.get(17,67125,45037),/invalid/);
  await assert.rejects(fs.access(path.join(root,'17/67125/45037.jpg')));
  const failing=createImageryCache({root,interval:0,retries:0,cooldown:0,fetchImage:async()=>new Response('',{status:503})});
  await assert.rejects(failing.get(17,67125,45037),/503/);
  assert.deepEqual(await failing.get(17,67124,45037),bytes,'An outage cannot invalidate an original');
  await assert.rejects(cache.get(17,'../67124',45037),/outside project/);
  assert(!validTile(19,0,0));assert(!validTile(20,67124,45037));
  assert.equal(new URL(imageryURL(17,67124,45037),'https://example.test/chalons/').href,'https://example.test/chalons/data/imagery/ign/17/67124/45037.jpg');
  assert.equal((await fs.readdir(path.join(root,'17/67124'))).filter(name=>name.endsWith('.tmp')).length,0);
  console.log(JSON.stringify({imagery:'passed',simultaneousVisitors:12,upstreamDownloads:requests,persistentAfterRestart:true,upstreamOutage:'saved image preserved',invalidResponses:'not saved'}));
}finally{
  if(!path.resolve(root).startsWith(temporaryRoot+path.sep)||!path.basename(root).startsWith('chalons-imagery-'))throw Error('Unsafe test cleanup path');
  await fs.rm(root,{recursive:true,force:true});
}
