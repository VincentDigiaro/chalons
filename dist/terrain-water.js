import {CITY} from './city-config.js';
import {SpatialIndex} from './walk-collision-index.js';

// A narrow untouched bank keeps the coarse ground triangles out of the water.
export const WATER_BANK_GUARD=12,WATER_BANK_FADE=8;
const bounds=points=>{const b=[Infinity,Infinity,-Infinity,-Infinity];for(const [x,y] of points){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b;};
function ringContains(ring,x,y){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const polygonContains=(rings,x,y)=>ringContains(rings[0],x,y)&&!rings.slice(1).some(r=>ringContains(r,x,y));
function segmentSample(x,y,s){const [a,b]=s,dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy,t=length2?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length2)):0;return {distance:Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy),side:dx*(y-a[1])-dy*(x-a[0])};}
export class WaterMask {
 constructor(land={features:[]},lines={features:[]},{origin=CITY.origin,scale=CITY.scale}={}){
  this.polygons=new SpatialIndex(128);this.banks=new SpatialIndex(128);this.streams=new SpatialIndex(128);this.coasts=new SpatialIndex(128);this.islands=new SpatialIndex(128);this.coastCache=new Map();
  const local=([x,y])=>[(x-origin[0])*scale[0],(y-origin[1])*scale[1]];
  const edges=(points,index,pad=0)=>{for(let i=1;i<points.length;i++){const segment=[points[i-1],points[i]],b=bounds(segment);index.set(index.entries.size,[b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad],{segment,radius:pad});}};
  for(const f of land.features||[]){if(!['water','coastline'].includes(f.properties?.kind))continue;const g=f.geometry,polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
   for(const poly of polys){const rings=poly.map(r=>r.map(local)),index=f.properties.kind==='coastline'?this.islands:this.polygons;index.set(index.entries.size,bounds(rings[0]),rings);for(const ring of rings)edges(ring,f.properties.kind==='coastline'?this.coasts:this.banks);}
  }
  const widths={river:16,canal:10,stream:3,ditch:1,drain:1};
  for(const f of lines.features||[]){const p=f.properties||{};if((p.group!=='water'&&p.kind!=='coastline')||p.tunnel)continue;const g=f.geometry,paths=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
   for(const line of paths){const points=line.map(local);if(p.kind==='coastline')edges(points,this.coasts);else if(widths[p.kind])edges(points,this.streams,(Number(p.width)||widths[p.kind])/2);}
  }
 }
 coast(x,y){
  if(!this.coasts.entries.size)return {water:false,distance:Infinity};
  const key=Math.floor(x/128)+','+Math.floor(y/128),cached=this.coastCache.get(key);if(cached!==undefined)return {water:cached,distance:Infinity};
  let nearest=null;
  for(let reach=64;reach<=131072;reach*=2){for(const {segment} of this.coasts.query([x-reach,y-reach,x+reach,y+reach])){const sample=segmentSample(x,y,segment);if(!nearest||sample.distance<nearest.distance-1e-7)nearest=sample;}if(nearest&&nearest.distance<=reach)break;}
  const result={water:nearest?.side<0,distance:nearest?.distance??Infinity};
  // Far from a bank, an entire cache cell has the same coast classification.
  if(result.distance>Math.SQRT2*128+WATER_BANK_GUARD+WATER_BANK_FADE){if(this.coastCache.size>8192)this.coastCache.clear();this.coastCache.set(key,result.water);}
  return result;
 }
 sample(x,y){
  const point=[x,y,x,y];for(const rings of this.polygons.query(point))if(polygonContains(rings,x,y))return {water:true,weight:0};
  const island=this.islands.query(point).some(r=>polygonContains(r,x,y)),coast=this.coast(x,y);if(coast.water&&!island)return {water:true,weight:0};
  let distance=coast.distance;const reach=WATER_BANK_GUARD+WATER_BANK_FADE,area=[x-reach,y-reach,x+reach,y+reach];
  for(const {segment,radius} of this.streams.query(area)){const d=segmentSample(x,y,segment).distance-radius;if(d<=0)return {water:true,weight:0};distance=Math.min(distance,d);}
  for(const {segment} of this.banks.query(area))distance=Math.min(distance,segmentSample(x,y,segment).distance);
  const t=Math.max(0,Math.min(1,(distance-WATER_BANK_GUARD)/WATER_BANK_FADE));return {water:false,weight:t*t*(3-2*t)};
 }
 weight(x,y){return this.sample(x,y).weight;}
}
let mask=new WaterMask(),revision=0;
export const terrainWaterMask=()=>mask;
export const terrainWaterRevision=()=>revision;
export function setTerrainWater(land,lines,options){mask=new WaterMask(land,lines,options);revision++;return mask;}
