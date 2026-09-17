import {terrainLngLat,terrainBaseLngLat} from './terrain.js';
import {terrainCraterField} from './terrain-craters.js';
import {CITY} from './city-config.js';

export const MAP_DEM_ZOOM=14,MAP_DEM_SIZE=256;
export function mapDEMEncoding(){const baseShift=Math.ceil(10000+terrainCraterField().totalDepth),precision=Math.min(100,(2**24-1)/(2*baseShift));return {baseShift,precision};}
export const mapDEMValue=(h,encoding=mapDEMEncoding())=>Math.round((h+encoding.baseShift)*encoding.precision);
export const mapDEMHeight=(h,encoding=mapDEMEncoding())=>mapDEMValue(h,encoding)/encoding.precision-encoding.baseShift;
// Same grid origin and interpolation as MapLibre, not pixel-centre samples.
function sampledGroundHeight(x,y,samples,height){
 const lng=CITY.origin[0]+x/CITY.scale[0],lat=CITY.origin[1]+y/CITY.scale[1],n=2**MAP_DEM_ZOOM*MAP_DEM_SIZE;
 const u=(lng+180)/360*n,v=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
 const sample=(col,row)=>{const key=row*n+col;if(samples?.has(key))return samples.get(key);const h=mapDEMHeight(height(col/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*row/n)))*180/Math.PI));samples?.set(key,h);return h;};
 return (1-b)*((1-a)*sample(i,j)+a*sample(i+1,j))+b*((1-a)*sample(i,j+1)+a*sample(i+1,j+1));
}
export const mapGroundHeight=(x,y,samples)=>sampledGroundHeight(x,y,samples,terrainLngLat);
export const mapBaseGroundHeight=(x,y,samples)=>sampledGroundHeight(x,y,samples,terrainBaseLngLat);

// MapLibre DEM tiles are generated from the same local data as the FPS.
// No public elevation service is called during play.
export function installMapTerrain(map,lib){
 const encoding=mapDEMEncoding();
 lib.addProtocol('local-terrain',async({url},controller)=>{
  const match=url.match(/local-terrain:\/\/(\d+)\/(\d+)\/(\d+)/);
  if(!match)throw Error('Tuile de relief invalide');
  const [,z,x,y]=match.map(Number),n=2**z,size=MAP_DEM_SIZE;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const context=canvas.getContext('2d'),pixels=context.createImageData(size,size);
  for(let row=0;row<size;row++){
   const lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+row/size)/n)))*180/Math.PI;
   for(let col=0;col<size;col++){
    const lng=(x+col/size)/n*360-180,value=mapDEMValue(terrainLngLat(lng,lat),encoding),i=(row*size+col)*4;
    pixels.data[i]=value>>16;pixels.data[i+1]=(value>>8)&255;pixels.data[i+2]=value&255;pixels.data[i+3]=255;
   }
  }
  if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
  context.putImageData(pixels,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Impossible de préparer le relief');
  return {data:await blob.arrayBuffer()};
 });
 map.addSource('local-terrain',{type:'raster-dem',tiles:['local-terrain://{z}/{x}/{y}'],tileSize:MAP_DEM_SIZE,maxzoom:MAP_DEM_ZOOM,encoding:'custom',redFactor:65536/encoding.precision,greenFactor:256/encoding.precision,blueFactor:1/encoding.precision,baseShift:encoding.baseShift,attribution:'Relief © IGN RGE ALTI · Licence Ouverte 2.0'});
 map.setTerrain({source:'local-terrain',exaggeration:1});
 map.once('remove',()=>lib.removeProtocol('local-terrain'));
}
