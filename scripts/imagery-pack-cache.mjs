import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validTile} from './ign-source.mjs';
import {createImageryCache} from './imagery-cache.mjs';
import {encodeImageryPack,decodeImageryPack,jpegSize,validateImageryConfig,MAX_PACK_SIDE,TILE_PIXELS} from '../dist/imagery-packs.js';

export const readImageryConfig=()=>validateImageryConfig(JSON.parse(readFileSync(new URL('../imagery-config.json',import.meta.url),'utf8')));
export function mosaicURL({z,x,y,side}){
  const half=20037508.342789244,step=2*half/2**z,width=Math.min(side,2**z-x),height=Math.min(side,2**z-y);
  return 'https://data.geopf.fr/wms-r?'+new URLSearchParams({SERVICE:'WMS',VERSION:'1.3.0',REQUEST:'GetMap',LAYERS:'ORTHOIMAGERY.ORTHOPHOTOS',STYLES:'normal',CRS:'EPSG:3857',BBOX:[x*step-half,half-(y+height)*step,(x+width)*step-half,half-y*step].join(','),WIDTH:String(width*TILE_PIXELS),HEIGHT:String(height*TILE_PIXELS),FORMAT:'image/jpeg'});
}
async function saveOnce(file,bytes){
  await fs.mkdir(path.dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;
  try{await fs.writeFile(temporary,bytes,{flag:'wx'});try{await fs.link(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}}
  finally{await fs.unlink(temporary).catch(()=>{});}
  return fs.readFile(file);
}
export function createImageryPackCache({root=path.resolve('dist/data/imagery/ign'),tileCache=createImageryCache({root}),fetchImage=globalThis.fetch,getConfig=readImageryConfig,log=()=>{}}={}){
  const pending=new Map(),acquiring=new Map(),failed=new Map(),queue=[];
  let active=0,lastStart=0,timer;
  const stats={requestsIGN:0,mosaicsSaved:0,packetsSaved:0,packetHits:0,errors:0};
  const config=()=>validateImageryConfig(getConfig());
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function pump(){
    clearTimeout(timer);const c=config();if(active>=c.chargementsPaquetsIGNSimultanes||!queue.length)return;
    timer=setTimeout(()=>{const job=queue.shift();active++;lastStart=Date.now();acquire(job).then(job.resolve,job.reject).finally(()=>{active--;acquiring.delete(job.key);pump();});pump();},Math.max(0,c.intervalleRequetesIGNMs-(Date.now()-lastStart)));
  }
  async function acquire({pack,key,file,queuedAt}){
    const c=config();let lastError;
    for(let attempt=0;attempt<=c.nouvellesTentativesIGN;attempt++){
      const started=Date.now();let stage='fetch';
      log('info','packet_download_started',{packet:key,attempt:attempt+1,waitMs:started-queuedAt});
      try{
        stats.requestsIGN++;const response=await fetchImage(mosaicURL(pack),{signal:AbortSignal.timeout(c.delaiRequeteIGNMs)});
        if(!response.ok)throw Object.assign(Error(`IGN HTTP ${response.status}`),{httpStatus:response.status});
        if(!response.headers.get('content-type')?.includes('image/jpeg'))throw Error('Invalid IGN content type');
        stage='validate';const chunks=[];let length=0;
        for await(const chunk of response.body){length+=chunk.length;if(length>c.octetsMaxImageIGN)throw Error('IGN image exceeds configured byte limit');chunks.push(chunk);}
        const bytes=Buffer.concat(chunks),[width,height]=jpegSize(bytes);
        if(width!==Math.min(pack.side,2**pack.z-pack.x)*TILE_PIXELS||height!==Math.min(pack.side,2**pack.z-pack.y)*TILE_PIXELS)throw Error('Wrong IGN mosaic dimensions');
        stage='save';const saved=await saveOnce(file,bytes);stats.mosaicsSaved++;failed.delete(key);
        log('info','packet_download_saved',{packet:key,bytes:saved.length,attempt:attempt+1,durationMs:Date.now()-started});return saved;
      }catch(error){lastError=error;log('error','packet_download_attempt_failed',{packet:key,stage,attempt:attempt+1,error});if(attempt<c.nouvellesTentativesIGN)await wait(c.delaiNouvelleTentativeIGNMs*2**attempt);}
    }
    stats.errors++;failed.set(key,Date.now()+c.delaiApresEchecIGNMs);if(failed.size>c.paquetsIGNEnAttenteMax)failed.delete(failed.keys().next().value);throw lastError;
  }
  async function mosaic(pack,key,offline){
    const file=path.join(root,'mosaics/v1',key+'.jpg');
    try{return await fs.readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(offline)throw Object.assign(Error('Image not saved'),{statusCode:404});
    if(acquiring.has(key))return acquiring.get(key);
    const c=config();if((failed.get(key)||0)>Date.now()||queue.length>=c.paquetsIGNEnAttenteMax)throw Object.assign(Error('IGN packet temporarily unavailable'),{statusCode:503});
    const result=new Promise((resolve,reject)=>queue.push({pack,key,file,queuedAt:Date.now(),resolve,reject}));acquiring.set(key,result);pump();return result;
  }
  async function build(pack,key,file,offline){
    const {z,x,y,side}=pack,tiles=[],images=[],members=[];
    for(let dy=0;dy<side;dy++)for(let dx=0;dx<side;dx++)if(validTile(z,x+dx,y+dy))members.push([x+dx,y+dy]);
    const saved=await Promise.all(members.map(async([tx,ty])=>{
      try{return await tileCache.get(z,tx,ty,{offline:true});}catch(error){if(error.statusCode===404)return null;throw error;}
    }));
    let mosaicIndex=-1;
    if(saved.some(bytes=>!bytes)){mosaicIndex=images.length;images.push(await mosaic(pack,key,offline));}
    for(let i=0;i<members.length;i++){
      const [tx,ty]=members[i],bytes=saved[i];
      if(bytes){const index=images.length;images.push(bytes);tiles.push([tx,ty,index,0,0]);}
      else tiles.push([tx,ty,mosaicIndex,(tx-x)*TILE_PIXELS,(ty-y)*TILE_PIXELS]);
    }
    const encoded=encodeImageryPack({...pack,tiles},images);decodeImageryPack(encoded.buffer,pack);
    const bytes=await saveOnce(file,encoded);stats.packetsSaved++;log('info','packet_saved',{packet:key,tiles:tiles.length,existingTiles:saved.filter(Boolean).length,bytes:bytes.length});return bytes;
  }
  return {root,config,getState:()=>({...stats,active,queued:queue.length,pending:pending.size}),async get(z,x,y,side,{offline=false}={}){
    if(![z,x,y,side].every(Number.isSafeInteger)||side<1||side>MAX_PACK_SIDE||x%side||y%side||z<0||z>19||side>2**z||x<0||y<0||x>=2**z||y>=2**z)throw Object.assign(Error('Invalid imagery packet'),{statusCode:404});
    let intersects=false;for(let dy=0;dy<side;dy++)for(let dx=0;dx<side;dx++)intersects ||= validTile(z,x+dx,y+dy);
    if(!intersects)throw Object.assign(Error('Packet outside project'),{statusCode:404});
    const pack={z,x,y,side},key=`${side}/${z}/${x}/${y}`,file=path.join(root,'packs/v1',key+'.bin');
    try{const bytes=await fs.readFile(file);stats.packetHits++;return bytes;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(pending.has(key))return pending.get(key);
    const result=build(pack,key,file,offline).finally(()=>pending.delete(key));pending.set(key,result);return result;
  }};
}
