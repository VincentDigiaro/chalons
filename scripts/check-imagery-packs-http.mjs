// Real HTTP and real IGN requests. Use --public after deployment; otherwise an
// isolated empty cache proves the cold path, followed by an offline restart.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import {createImageryCache} from './imagery-cache.mjs';
import {createImageryPackCache,readImageryConfig} from './imagery-pack-cache.mjs';
import {createImageryServer} from './serve-imagery.mjs';
import {createImageryPackLoader} from '../dist/imagery-pack-loader.js';
import {tilePack,packURL} from '../dist/imagery-packs.js';
const publicTest=process.argv.includes('--public'),root=path.resolve('artifacts/imagery-packs-release/http-cache'),config=readImageryConfig();
const n=config.tuilesParCotePaquet,z=18,x=Math.floor(134248/n)*n,y=Math.floor(90072/n)*n;
const tiles=Array.from({length:n*n*2},(_,i)=>[z,x+i%(n*2),y+Math.floor(i/(n*2))]);
let server,base='https://digiaro.duckdns.org/chalons/',ignRequests=0;const ign=[];
const packs=createImageryPackCache({root,fetchImage:async(url,init)=>{
  ignRequests++;const start=Date.now(),r=await fetch(url,init);ign.push({url,status:r.status,ms:Date.now()-start});return r;
}});
async function start(offline=false){server=createImageryServer({cache:createImageryCache({root}),packs,offline});server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}/`;}
async function stop(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;}}
async function round(){const calls=[];let bytes=0;const started=Date.now();const loader=createImageryPackLoader({fetchImage:async(url,init)=>{calls.push(url);const response=await fetch(new URL(url,base),init);bytes+=Number(response.headers.get('content-length')||0);return response;}});try{
  const loaded=await Promise.all(tiles.map(tile=>loader(...tile)));assert.equal(loaded.length,tiles.length);assert.equal(calls.filter(url=>url.endsWith('.bin')).length,2);assert.equal(calls.length,3);assert(calls.every(url=>url.startsWith('./')));
  for(let i=0;i<loaded.length;i++){const [,tx,ty]=tiles[i],tile=loaded[i];assert(tile.data.length>0);assert.equal(tile.region[2],256);assert.equal(tile.region[3],256);if(tile.data.length===loaded[0].data.length&&tile.region[0])assert.equal(tile.region[0],(tx%n)*256);}
  return {tiles:tiles.length,packetRequests:2,configRequests:1,ms:Date.now()-started,bytes};
}finally{loader.dispose();}}
try{
  if(!publicTest){await assert.rejects(fs.access(path.join(root,'packs')));await start();}
  const cold=await round();if(!publicTest){assert.equal(ignRequests,2);await stop();await start(true);}
  const before=ignRequests,warm=await round();assert.equal(ignRequests,before);
  const result={realHTTP:true,publicHTTPS:publicTest,base,cold,warm,...(!publicTest?{coldIGNRequests:ignRequests,warmIGNRequests:0,ign}:{}),browserIGNRequests:0};
  await fs.mkdir('artifacts/imagery-packs-release',{recursive:true});await fs.writeFile(`artifacts/imagery-packs-release/${publicTest?'public':'real-ign'}-http-validation.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await stop();}
