import earcut from './vendor/earcut.js';
import {cityDataURL} from './city-config.js';
import {toLocal,toLngLat,nearDistance} from './walk-core.js';
import {terrainCraterField,finishGeometry} from './terrain-craters.js';
import {cutBombRoads,roadCutPlanes,ROAD_CUT_SIDES} from './bomb-road-cut.js';
import {SpatialIndex} from './walk-collision-index.js';

// Apply the same tangent cuts to the distant road overview and vector lines.
// Only affected polygons are triangulated; untouched features keep their data.
export function cutMapRoadFeatures(data,impacts){
 if(!impacts.length)return data;
 const index=new SpatialIndex(200),seen=new Set(),features=[];
 for(const p of impacts){const key=[p[0],p[1],p[3]].join(',');if(!(p[3]>0)||seen.has(key))continue;seen.add(key);const r=p[3]/Math.cos(Math.PI/ROAD_CUT_SIDES);index.set(key,[p[0]-r,p[1]-r,p[0]+r,p[1]+r],p);}
 for(const feature of data.features){
  const {type,coordinates}=feature.geometry;
  if(!['Polygon','MultiPolygon','LineString','MultiLineString'].includes(type)||(type.includes('Line')&&feature.properties?.group!=='road')){features.push(feature);continue;}
  const bounds=[Infinity,Infinity,-Infinity,-Infinity],points=type==='Polygon'||type==='MultiLineString'?coordinates.flat():type==='MultiPolygon'?coordinates.flat(2):coordinates;
  for(const p of points){const [x,y]=toLocal(p);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
  const hits=index.query(bounds).filter(p=>nearDistance(bounds,p)<p[3]/Math.cos(Math.PI/ROAD_CUT_SIDES));
  if(!hits.length){features.push(feature);continue;}
  if(type.includes('Line')){
   let lines=(type==='LineString'?[coordinates]:coordinates).map(line=>line.map(toLocal));
   for(const impact of hits){const planes=roadCutPlanes(impact),next=[];
    for(const line of lines){let run=[];const flush=()=>{if(run.length>1)next.push(run);run=[];};
     for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i];let lo=0,hi=1;
      for(const p of planes){const da=(a[0]-p.x)*p.nx+(a[1]-p.y)*p.ny,db=(b[0]-p.x)*p.nx+(b[1]-p.y)*p.ny;if(da>=0&&db>=0){lo=1;hi=0;break;}if(da>0)lo=Math.max(lo,da/(da-db));else if(db>0)hi=Math.min(hi,da/(da-db));}
      if(lo>=hi){if(!run.length)run.push(a);run.push(b);continue;}
      const point=t=>a.map((v,k)=>v+(b[k]-v)*t);
      if(lo>0){if(!run.length)run.push(a);run.push(point(lo));}flush();if(hi<1)run.push(point(hi),b);
     }flush();
    }lines=next;
   }
   if(lines.length)features.push({...feature,geometry:{type:'MultiLineString',coordinates:lines.map(l=>l.map(toLngLat))}});
  }else{
   const vertices=[];
   for(const rings of type==='Polygon'?[coordinates]:coordinates){const points=[],holes=[];for(let r=0;r<rings.length;r++){if(r)holes.push(points.length);for(const p of rings[r].slice(0,-1))points.push(toLocal(p));}for(const i of earcut(points.flat(),holes))vertices.push(...points[i],0,0,0,1,0,0,1,1,1);}
   const cut=finishGeometry(cutBombRoads({vertices:new Float32Array(vertices),ranges:[[0,0,vertices.length/11]]},hits)),polygons=[];
   for(let at=0;at<cut.vertices.length;at+=33){const ring=[0,11,22].map(k=>toLngLat(cut.vertices.subarray(at+k,at+k+2)));ring.push(ring[0]);polygons.push([ring]);}
   if(polygons.length)features.push({...feature,geometry:{type:'MultiPolygon',coordinates:polygons}});
  }
 }
 return {...data,features};
}
export const bombMapRoadData={};
export async function loadBombMapRoads(){
 const impacts=terrainCraterField().impacts;if(!impacts.length)return;
 await Promise.all([['lines','lines.geojson'],['overview','city-roads/overview.geojson']].map(async([key,file])=>{const response=await fetch(cityDataURL(file));if(!response.ok)throw Error('Routes détruites : HTTP '+response.status);bombMapRoadData[key]=cutMapRoadFeatures(await response.json(),impacts);}));
}
