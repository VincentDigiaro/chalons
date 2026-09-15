// Always use the saved same-origin original. Only the server contacts IGN,
// and it saves a missing tile to disk before returning it to the visitor.
export const IGN_LAYER = 'ORTHOIMAGERY.ORTHOPHOTOS';
export const IGN_WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM_0_19&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}';
export const LOCAL_IMAGERY = './data/imagery/ign/{z}/{x}/{y}.jpg';
export const IMAGERY_TILES = 'saved-ign://{z}/{x}/{y}';
export const imageryURL = (z,x,y) => IGN_WMTS.replace('{z}',z).replace('{x}',x).replace('{y}',y);
export const localImageryURL=(z,x,y)=>LOCAL_IMAGERY.replace('{z}',z).replace('{x}',x).replace('{y}',y);

export function createImageryLoader({fetchImage=(...args)=>globalThis.fetch(...args),localTimeout=12000}={}){
  async function read(url,signal,timeout){
    const controller=new AbortController(),abort=()=>controller.abort();
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeout);
    try{
      const response=await fetchImage(url,{signal:controller.signal});
      if(!response.ok||!response.headers.get('content-type')?.includes('image/'))throw Error('Image unavailable');
      const data=await response.arrayBuffer(),bytes=new Uint8Array(data);
      if(bytes.length<5||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('Invalid image');
      return data;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return async(z,x,y,{signal}={})=>{
    if(![z,x,y].every(Number.isInteger)||z<0||z>19||x<0||y<0||x>=2**z||y>=2**z)throw Error('Invalid tile');
    return {data:await read(localImageryURL(z,x,y),signal,localTimeout),source:'local'};
  };
}
export const loadImagery=createImageryLoader();
export function installImageryProtocol(maplibre){
  maplibre.addProtocol('saved-ign',async(params,controller)=>{
    const tile=params.url.match(/^saved-ign:\/\/(\d+)\/(\d+)\/(\d+)$/);if(!tile)throw Error('Invalid image URL');
    const {data}=await loadImagery(...tile.slice(1).map(Number),{signal:controller.signal});return {data};
  });
}
