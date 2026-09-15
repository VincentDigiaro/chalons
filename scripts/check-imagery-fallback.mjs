import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createImageryLoader,localImageryURL,installImageryProtocol} from '../dist/imagery.js';
const tile=[17,67124,45037],local=localImageryURL(...tile);
const original=await fs.readFile('.cache/ign/centre-sample.jpg');
const jpeg=()=>new Response(original,{headers:{'content-type':'image/jpeg'}});
const calls=[];
let mode='healthy';
const load=createImageryLoader({localTimeout:15,fetchImage:async(url,{signal}={})=>{
  calls.push(url);assert.equal(url,local,'Visitors must never bypass persistent server storage');
  if(mode==='http')return new Response('',{status:503});
  if(mode==='network')throw TypeError('Connection unavailable');
  if(mode==='invalid')return new Response('<html>Error</html>',{headers:{'content-type':'text/html'}});
  if(mode==='truncated')return new Response(original.subarray(0,original.length-2),{headers:{'content-type':'image/jpeg'}});
  if(mode==='timeout')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  return jpeg();
}});
for(let i=0;i<2;i++){
  calls.length=0;const result=await load(...tile);
  assert.equal(result.source,'local');assert.deepEqual(Buffer.from(result.data),original);assert.deepEqual(calls,[local]);
}
for(mode of ['http','network','invalid','truncated','timeout']){
  calls.length=0;await assert.rejects(load(...tile));assert.deepEqual(calls,[local]);
}
calls.length=0;mode='timeout';const controller=new AbortController(),cancelled=load(...tile,{signal:controller.signal});controller.abort();
await assert.rejects(cancelled,{name:'AbortError'});assert.deepEqual(calls,[local]);
calls.length=0;await assert.rejects(load(...tile,{signal:controller.signal}),{name:'AbortError'});assert.deepEqual(calls,[]);
await assert.rejects(load(20,0,0),/Invalid tile/);assert.deepEqual(calls,[]);

// The MapLibre ground protocol uses the same saved original, without any IGN call.
const originalFetch=globalThis.fetch;let protocol;
try{
  globalThis.fetch=async url=>{assert.equal(url,local);return jpeg();};
  installImageryProtocol({addProtocol(name,handler){assert.equal(name,'saved-ign');protocol=handler;}});
  const result=await protocol({url:'saved-ign://17/67124/45037'},new AbortController());assert.deepEqual(Buffer.from(result.data),original);
}finally{globalThis.fetch=originalFetch;}
console.log(JSON.stringify({imagery:'passed',primary:'saved local original',browserIGNRequests:0,backgroundDuplicateDownloads:0,timeoutAndCancellation:'passed',invalidImages:'rejected',groundProtocol:'passed'}));
