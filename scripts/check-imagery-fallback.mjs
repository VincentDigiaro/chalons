import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createImageryLoader,imageryURL,localImageryURL,installImageryProtocol} from '../dist/imagery.js';
const tile=[17,67124,45037],primary=imageryURL(...tile),local=localImageryURL(...tile);
const original=await fs.readFile('.cache/ign/centre-sample.jpg');
const backup=await fs.readFile('.cache/nerval-ign/268522-180165.jpg');
const jpeg=bytes=>new Response(bytes,{headers:{'content-type':'image/jpeg'}});
const calls=[];
let mode='healthy';
const load=createImageryLoader({saveOriginals:false,primaryTimeout:15,fetchImage:async(url,{signal}={})=>{
  calls.push(url);
  if(url===local)return jpeg(backup);
  assert.equal(url,primary);
  if(mode==='http')return new Response('',{status:503});
  if(mode==='network')throw TypeError('Connection unavailable');
  if(mode==='invalid')return new Response('<html>Error</html>',{headers:{'content-type':'text/html'}});
  if(mode==='timeout')return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  return jpeg(original);
}});
let result=await load(...tile);assert.equal(result.source,'ign');assert.deepEqual(Buffer.from(result.data),original);assert.deepEqual(calls,[primary]);
for(mode of ['http','network','invalid','timeout']){calls.length=0;result=await load(...tile);assert.equal(result.source,'local');assert.deepEqual(Buffer.from(result.data),backup);assert.deepEqual(calls,[primary,local]);}
calls.length=0;mode='timeout';const controller=new AbortController(),cancelled=load(...tile,{signal:controller.signal});controller.abort();
await assert.rejects(cancelled,{name:'AbortError'});assert.deepEqual(calls,[primary],'Cancelling navigation must not start a fallback');

// Healthy IGN images must not be delivered a second time by our server.
for(const alreadySaved of [true,false]){
  const storageCalls=[];
  const withStorage=createImageryLoader({fetchImage:async(url,options={})=>{
    storageCalls.push([url,options.method||'GET']);
    if(url===primary)return jpeg(original);
    if(url==='./data/imagery/saved.json')return Response.json({tiles:alreadySaved?[tile]:[]});
    assert.equal(url,local);assert.equal(options.method,'HEAD');return new Response(null,{status:200});
  }});
  assert.equal((await withStorage(...tile)).source,'ign');await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(storageCalls,[[primary,'GET'],['./data/imagery/saved.json','GET'],...alreadySaved?[]:[[local,'HEAD']]]);
}

// Exercise the exact callback registered for the MapLibre ground layer.
const originalFetch=globalThis.fetch;let protocol;
try{
  globalThis.fetch=async url=>String(url).startsWith('https:')?new Response('',{status:503}):jpeg(backup);
  installImageryProtocol({addProtocol(name,handler){assert.equal(name,'saved-ign');protocol=handler;}});
  const result=await protocol({url:'saved-ign://17/67124/45037'},new AbortController());assert.deepEqual(Buffer.from(result.data),backup);
}finally{globalThis.fetch=originalFetch;}
console.log(JSON.stringify({imageryFallback:'passed',primary:'IGN',fallbacks:['HTTP failure','network failure','invalid response','timeout'],cancelledNavigation:'no fallback',healthyIGN:'no image body from local server',newOriginal:'background HEAD',groundProtocol:'passed'}));
