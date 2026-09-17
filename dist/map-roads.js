import {subdivideRoads,drapeVertices} from './terrain.js';
import {mapGroundHeight,mapBaseGroundHeight} from './terrain-map.js';
import {craterMesh,finishGeometry,terrainCraterField} from './terrain-craters.js';
import {cutBombRoads} from './bomb-road-cut.js';

// Refine only where a ridge would pierce a road triangle. Flat sectors retain
// their existing 8 m mesh; this preparation runs once per loaded map sector.
export function prepareMapRoads(vertices,ranges,{origin,scale}={}){
 const cut=finishGeometry(cutBombRoads({vertices,ranges},terrainCraterField().impacts));vertices=cut.vertices;ranges=cut.ranges;
 const samples=new Map(),columns=new Map(),height=(x,y)=>{let column=columns.get(x);if(!column){column=new Map();columns.set(x,column);}if(!column.has(y))column.set(y,mapGroundHeight(x,y,samples));return column.get(y);},base=finishGeometry(craterMesh(subdivideRoads(vertices,ranges),{displace:false})),out=[],result=[];
 const baseSamples=new Map(),refinementHeight=(x,y)=>mapBaseGroundHeight(x,y,baseSamples);
 const emit=(a,b,c,depth=0)=>{
  const points=[a,b,c],h=points.map(p=>refinementHeight(p[0],p[1])),pairs=[[0,1],[1,2],[2,0]],lengths=pairs.map(([i,j])=>Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1]));
  let error=Math.abs(refinementHeight((a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3)-(h[0]+h[1]+h[2])/3);
  for(const [i,j] of pairs)error=Math.max(error,Math.abs(refinementHeight((points[i][0]+points[j][0])/2,(points[i][1]+points[j][1])/2)-(h[i]+h[j])/2));
  if(error>.025&&depth<12&&Math.max(...lengths)>.05){const edge=lengths.indexOf(Math.max(...lengths)),[i,j]=pairs[edge],k=3-i-j,mid=points[i].map((v,n)=>(v+points[j][n])/2);emit(points[i],mid,points[k],depth+1);emit(mid,points[j],points[k],depth+1);return;}
  out.push(...a,...b,...c);
 };
 for(const [material,first,count] of base.ranges){const start=out.length/11;for(let i=first*11;i<(first+count)*11;i+=33)emit(...[0,11,22].map(o=>Array.from(base.vertices.subarray(i+o,i+o+11))));result.push([material,start,out.length/11-start]);}
 return {vertices:drapeVertices(new Float32Array(out),{origin,scale,height:(x,y)=>height(x,y)+.05}),ranges:result};
}
