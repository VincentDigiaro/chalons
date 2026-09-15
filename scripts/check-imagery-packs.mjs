import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createImageryCache} from './imagery-cache.mjs';
import {createImageryPackCache,readImageryConfig,mosaicURL} from './imagery-pack-cache.mjs';
import {createImageryServer} from './serve-imagery.mjs';
import {createImageryPackLoader} from '../dist/imagery-pack-loader.js';
import {encodeImageryPack,decodeImageryPack,packURL,tilePack,validateImageryConfig} from '../dist/imagery-packs.js';
import {installImageryProtocol,loadImagery} from '../dist/imagery.js';

// Exact raster checks use the bundled test runtime; production needs only Node.
const sharp=createRequire('C:/Users/cid77/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/anchor.js')('sharp');
const temporaryRoot=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(temporaryRoot,'chalons-imagery-packs-'));
const baseConfig=readImageryConfig(),c={...baseConfig,intervalleRequetesIGNMs:0,nouvellesTentativesIGN:0,delaiApresEchecIGNMs:0};
const z=18,x=134248,y=90072,side=4,pack={z,x,y,side},original=await fs.readFile('dist/data/imagery/ign/18/134248/90072.jpg');
const rgb=Buffer.alloc(1024*1024*3);
for(let yy=0;yy<1024;yy++)for(let xx=0;xx<1024;xx++){const i=(yy*1024+xx)*3;rgb[i]=Math.floor(xx/256)*60;rgb[i+1]=Math.floor(yy/256)*60;rgb[i+2]=(xx+yy)%256;}
const mosaic=await sharp(rgb,{raw:{width:1024,height:1024,channels:3}}).jpeg().toBuffer();
let server,base,upstream=0,decodes=0,crops=0,closed=0;
const bitmaps=new Set();
function image(pixels,width,height){const item={pixels,width,height,close(){assert(!this.closed,'Bitmap closed twice');this.closed=true;closed++;bitmaps.delete(this);}};bitmaps.add(item);return item;}
async function createBitmap(source,...args){
  if(source instanceof Blob){decodes++;const {data,info}=await sharp(Buffer.from(await source.arrayBuffer())).removeAlpha().raw().toBuffer({resolveWithObject:true});return image(data,info.width,info.height);}
  assert(!source.closed);crops++;const [left,top,width,height]=args;
  return image(await sharp(source.pixels,{raw:{width:source.width,height:source.height,channels:3}}).extract({left,top,width,height}).raw().toBuffer(),width,height);
}
const clients=[];
async function start(packs,offline=false){server=createImageryServer({cache:createImageryCache({root}),packs,offline});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}/`;}
async function stop(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;}}
function client(options={}){const calls=[],loader=createImageryPackLoader({createBitmap,fetchImage:(url,init)=>{calls.push(url);return fetch(new URL(url,base),init);},...options});clients.push(loader);return {loader,calls};}
const members=Array.from({length:32},(_,i)=>[z,x+i%8,y+Math.floor(i/8)]);
try{
  await fs.mkdir(path.join(root,`${z}/${x}`),{recursive:true});await fs.writeFile(path.join(root,`${z}/${x}/${y}.jpg`),original);
  const packs=createImageryPackCache({root,getConfig:()=>c,fetchImage:async url=>{upstream++;assert.equal(new URL(url).pathname,'/wms-r');assert.equal(new URL(url).searchParams.get('WIDTH'),'1024');await new Promise(resolve=>setTimeout(resolve,25));return new Response(mosaic,{headers:{'content-type':'image/jpeg'}});}});
  await start(packs);
  const {loader,calls}=client(),results=await Promise.all(members.map(t=>loader(...t)));
  assert.equal(upstream,2);assert.equal(calls.filter(url=>url.endsWith('.bin')).length,2);assert.equal(calls.length,3,'Only configuration and two packet HTTP requests');
  assert.deepEqual(Buffer.from(results[0].data),original,'Existing JPEG must be byte-identical');
  assert.deepEqual(await fs.readFile(path.join(root,`${z}/${x}/${y}.jpg`)),original);
  assert.deepEqual(await fs.readFile(path.join(root,`mosaics/v1/4/${z}/${x}/${y}.jpg`)),mosaic,'IGN original saved without recompression');
  const actual=await Promise.all(results.map(r=>r.bitmap()));
  for(let i=0;i<members.length;i++){
    const [,tx,ty]=members[i],expected=i===0?await sharp(original).raw().toBuffer():await sharp(mosaic).extract({left:(tx-x)%4*256,top:(ty-y)*256,width:256,height:256}).raw().toBuffer();
    assert.deepEqual(actual[i].pixels,expected,`Wrong crop/orientation for ${tx}/${ty}`);assert.equal(actual[i].width,256);actual[i].close();
  }
  assert.equal(decodes,3,'Decode each of the two atlases and the original only once');
  await loader(...members[31]);assert.equal(calls.length,3,'Reuse packet for later tile requests');
  const cold={tiles:members.length,httpPackets:2,ignRequests:upstream,decodes,crops};
  await stop();
  await start(createImageryPackCache({root,getConfig:()=>c,fetchImage:()=>{throw Error('IGN unavailable');}}),true);
  const warm=client();await Promise.all(members.map(t=>warm.loader(...t)));assert.equal(warm.calls.length,3);
  const head=await fetch(new URL(packURL(pack),base),{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.match(head.headers.get('cache-control'),/immutable/);
  for(const url of ['data/imagery/ign/packs/v1/4/18/0/0.bin','data/imagery/ign/packs/v1/20/18/134240/90060.bin','data/imagery/ign/packs/v1/4/18/134249/90072.bin'])assert.equal((await fetch(new URL(url,base))).status,404);
  assert.equal((await fetch(new URL(packURL(pack),base),{method:'POST'})).status,405);

  // Cancel one subscriber, keep the shared request for the others.
  let release,fetchSignal;const bytes=await fs.readFile(path.join(root,`packs/v1/4/${z}/${x}/${y}.bin`));
  const shared=client({getConfig:()=>c,fetchImage:(_url,{signal})=>{fetchSignal=signal;return new Promise((resolve,reject)=>{release=()=>resolve(new Response(bytes));signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}}).loader;
  const a=new AbortController(),b=new AbortController(),first=shared(z,x,y,{signal:a.signal}),second=shared(z,x+1,y,{signal:b.signal});
  await new Promise(resolve=>setTimeout(resolve,0));a.abort();await assert.rejects(first,{name:'AbortError'});assert(!fetchSignal.aborted);release();await second;
  const cancel=client({getConfig:()=>c,fetchImage:(_url,{signal})=>new Promise((_resolve,reject)=>{fetchSignal=signal;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})}).loader;
  const abort=new AbortController(),cancelled=cancel(z,x,y,{signal:abort.signal});await new Promise(resolve=>setTimeout(resolve,0));abort.abort();await assert.rejects(cancelled);assert(fetchSignal.aborted);
  const short=client({getConfig:()=>({...c,delaiRequeteNavigateurMs:10}),fetchImage:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}).loader;
  await assert.rejects(short(z,x,y));
  const invalid=client({getConfig:()=>c,fetchImage:async()=>new Response(bytes.subarray(0,bytes.length-1))}).loader;await assert.rejects(invalid(z,x,y));
  const small=client({getConfig:()=>({...c,cachePaquetsNavigateurOctets:0})}).loader;
  const uncached=await small(z,x,y),uncachedBitmap=await uncached.bitmap();uncachedBitmap.close();assert.equal(small.getState().cacheBytes,0);assert.equal(small.getState().cachedPackets,0);
  assert.throws(()=>validateImageryConfig({...c,tuilesParCotePaquet:20}));

  // The actual MapLibre protocol returns the cropped ImageBitmap directly.
  const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap;let protocol;
  try{globalThis.fetch=(url,init)=>oldFetch(new URL(url,base),init);globalThis.createImageBitmap=createBitmap;installImageryProtocol({addProtocol(name,handler){assert.equal(name,'saved-ign');protocol=handler;}});const result=await protocol({url:`saved-ign://${z}/${x+1}/${y+2}`},new AbortController());assert.equal(result.data.width,256);assert.equal(result.data.height,256);result.data.close();}
  finally{loadImagery.dispose();globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;}

  // JSON packet size and acquisition concurrency/spacing are actually used.
  let active=0,peak=0;const starts=[];
  const throttleConfig={...c,chargementsPaquetsIGNSimultanes:2,intervalleRequetesIGNMs:15};
  const throttled=createImageryPackCache({root:path.join(root,'throttle'),getConfig:()=>throttleConfig,fetchImage:async()=>{starts.push(Date.now());peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,60));active--;return new Response(mosaic,{headers:{'content-type':'image/jpeg'}});}});
  await Promise.all([0,4,8,12].map(dx=>throttled.get(z,x+dx,y,4)));assert.equal(peak,2);assert(starts.slice(1).every((time,i)=>time-starts[i]>=12));
  const tinyMosaic=await sharp(mosaic).extract({left:0,top:0,width:512,height:512}).jpeg().toBuffer();let tinyIGN=0;
  const tiny=createImageryPackCache({root:path.join(root,'tiny'),getConfig:()=>({...c,tuilesParCotePaquet:2}),fetchImage:async url=>{tinyIGN++;assert.equal(new URL(url).searchParams.get('WIDTH'),'512');return new Response(tinyMosaic,{headers:{'content-type':'image/jpeg'}});}});
  await stop();await start(tiny);const tinyClient=client();await Promise.all(members.slice(0,16).filter(t=>t[1]<x+4).map(t=>tinyClient.loader(...t)));assert.equal(tinyIGN,2);
  const url=new URL(mosaicURL(pack));assert.equal(url.searchParams.get('CRS'),'EPSG:3857');assert.equal(url.searchParams.get('WIDTH'),'1024');
  console.log(JSON.stringify({imageryPackets:'passed',cold,restartOffline:{tiles:32,httpPackets:2,ignRequests:0},existingOriginals:'unchanged',allCropPixels:'identical to stored image',sharedCancellation:'passed',timeouts:'JSON used',invalidPackets:'rejected',configSideAndConcurrency:'used',maplibreProtocol:'cropped bitmap',browserIGNRequests:0}));
}finally{
  for(const loader of clients)loader.dispose();await stop();assert.equal(bitmaps.size,0,'Decoded bitmap memory leaked');
  const target=path.resolve(root);assert(target.startsWith(temporaryRoot+path.sep)&&path.basename(target).startsWith('chalons-imagery-packs-'));await fs.rm(target,{recursive:true,force:true});
}
