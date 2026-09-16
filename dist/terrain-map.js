import {terrainLngLat} from './terrain.js';

// MapLibre DEM tiles are generated from the same local data as the FPS.
// No public elevation service is called during play.
export function installMapTerrain(map,lib){
 lib.addProtocol('local-terrain',async({url},controller)=>{
  const match=url.match(/local-terrain:\/\/(\d+)\/(\d+)\/(\d+)/);
  if(!match)throw Error('Tuile de relief invalide');
  const [,z,x,y]=match.map(Number),n=2**z,size=256;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const context=canvas.getContext('2d'),pixels=context.createImageData(size,size);
  for(let row=0;row<size;row++){
   const lat=Math.atan(Math.sinh(Math.PI*(1-2*(y+(row+.5)/size)/n)))*180/Math.PI;
   for(let col=0;col<size;col++){
    const lng=(x+(col+.5)/size)/n*360-180,h=terrainLngLat(lng,lat),value=Math.round((h+10000)*10),i=(row*size+col)*4;
    pixels.data[i]=value>>16;pixels.data[i+1]=(value>>8)&255;pixels.data[i+2]=value&255;pixels.data[i+3]=255;
   }
  }
  if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
  context.putImageData(pixels,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Impossible de préparer le relief');
  return {data:await blob.arrayBuffer()};
 });
 map.addSource('local-terrain',{type:'raster-dem',tiles:['local-terrain://{z}/{x}/{y}'],tileSize:256,maxzoom:14,encoding:'mapbox',attribution:'Relief © IGN RGE ALTI · Licence Ouverte 2.0'});
 map.setTerrain({source:'local-terrain',exaggeration:1});
 map.once('remove',()=>lib.removeProtocol('local-terrain'));
}
