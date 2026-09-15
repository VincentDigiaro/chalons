import {tilePack,packURL,decodeImageryPack,validateImageryConfig} from './imagery-packs.js';
const abortError=()=>new DOMException('Aborted','AbortError');
function withSignal(promise,signal){
  if(!signal)return promise;if(signal.aborted)return Promise.reject(abortError());
  return new Promise((resolve,reject)=>{const abort=()=>reject(abortError());signal.addEventListener('abort',abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export function createImageryPackLoader({fetchImage=(...args)=>globalThis.fetch(...args),getConfig,createBitmap=(...args)=>globalThis.createImageBitmap(...args)}={}){
  const pending=new Map(),cached=new Map();let configuration,cacheBytes=0;
  const stats={requests:0,cacheHits:0};
  const config=()=>configuration??=(getConfig?Promise.resolve().then(getConfig):fetchImage('./imagery-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Imagery configuration unavailable');return r.json();})).then(validateImageryConfig).catch(error=>{configuration=null;throw error;});
  function close(packet){packet.evicted=true;for(const image of packet.images)if(!image.users&&image.bitmap){image.bitmap.close();image.bitmap=null;image.decoding=null;}}
  function trim(limit){while(cacheBytes>limit&&cached.size){const [key,packet]=cached.entries().next().value;cached.delete(key);cacheBytes-=packet.cost;close(packet);}}
  async function bitmap(packet,tile,signal,limit){
    if(signal?.aborted)throw abortError();const image=tile.image;image.users=(image.users||0)+1;
    try{
      if(!image.decoding){
        if(!packet.evicted){const bytes=image.width*image.height*4;packet.cost+=bytes;cacheBytes+=bytes;}
        image.decoding=createBitmap(new Blob([image.data],{type:'image/jpeg'}),{imageOrientation:'none',premultiplyAlpha:'none'}).then(value=>image.bitmap=value).catch(error=>{image.decoding=null;throw error;});
      }
      const source=await image.decoding;if(signal?.aborted)throw abortError();
      const cropped=await createBitmap(source,...tile.region,{imageOrientation:'none',premultiplyAlpha:'none'});
      if(signal?.aborted){cropped.close();throw abortError();}return cropped;
    }finally{image.users--;if(packet.evicted&&!image.users&&image.bitmap){image.bitmap.close();image.bitmap=null;image.decoding=null;}trim(limit);}
  }
  const load=async(z,x,y,{signal}={})=>{
    if(![z,x,y].every(Number.isInteger)||z<0||z>19||x<0||y<0||x>=2**z||y>=2**z)throw Error('Invalid tile');
    if(signal?.aborted)throw abortError();
    const c=await withSignal(config(),signal),pack=tilePack(z,x,y,c.tuilesParCotePaquet),url=packURL(pack);
    let packet=cached.get(url);
    if(packet){stats.cacheHits++;cached.delete(url);cached.set(url,packet);}
    else{
      let resource=pending.get(url);
      if(!resource){
        const controller=new AbortController();resource={controller,users:0};pending.set(url,resource);stats.requests++;
        const timer=setTimeout(()=>controller.abort(),c.delaiRequeteNavigateurMs);
        resource.promise=(async()=>{
          const response=await fetchImage(url,{signal:controller.signal});if(!response.ok)throw Error(`Imagery packet HTTP ${response.status}`);
          const decoded=decodeImageryPack(await response.arrayBuffer(),pack);decoded.cost=decoded.byteLength;
          if(controller.signal.aborted)throw abortError();cached.set(url,decoded);cacheBytes+=decoded.cost;trim(c.cachePaquetsNavigateurOctets);return decoded;
        })().finally(()=>{clearTimeout(timer);if(pending.get(url)===resource)pending.delete(url);});
      }
      resource.users++;
      try{packet=await withSignal(resource.promise,signal);}
      finally{if(!--resource.users&&pending.get(url)===resource){pending.delete(url);resource.controller.abort();}}
    }
    if(signal?.aborted)throw abortError();const tile=packet.tiles.get(`${x}/${y}`);if(!tile)throw Error('Tile outside saved packet');
    return {data:tile.image.data,region:tile.region,source:'local',bitmap:()=>bitmap(packet,tile,signal,c.cachePaquetsNavigateurOctets)};
  };
  load.getState=()=>({...stats,pending:pending.size,cachedPackets:cached.size,cacheBytes});
  load.dispose=()=>{for(const r of pending.values())r.controller.abort();pending.clear();for(const p of cached.values())close(p);cached.clear();cacheBytes=0;};
  return load;
}
