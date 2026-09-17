import {BOMB_ROAD_CUT_MATERIAL,sectionCaps} from './bomb-building-cut.js';
// A road packet can span several streets and both sides of an impact. Subtract
// one shared polygonal circle rather than delete the packet or an infinite half
// of the city. Its 24 tangent cuts join identically across neighbouring packets.
export const ROAD_CUT_SIDES=24;
const EPS=1e-6;
const distance=(v,p)=>(v[0]-p.x)*p.nx+(v[1]-p.y)*p.ny;
const interpolate=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function split(poly,plane){
 const inner=[],outer=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a,plane),db=distance(b,plane);
  (da>=0?outer:inner).push(a);
  if((da>=0)!==(db>=0)){const v=interpolate(a,b,da/(da-db));inner.push(v);outer.push(v);}
 }
 return {inner,outer};
}
function append(out,poly){for(let i=1;i+1<poly.length;i++){const [a,b,c]=[poly[0],poly[i],poly[i+1]],area=Math.hypot((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(area>EPS)out.push(...a,...b,...c);}}
export const roadCutPlanes=([x,y,,radius])=>Array.from({length:ROAD_CUT_SIDES},(_,i)=>{const angle=i*Math.PI*2/ROAD_CUT_SIDES,nx=Math.cos(angle),ny=Math.sin(angle);return {nx,ny,x:x+nx*radius,y:y+ny*radius};});
export function* cutBombRoads(mesh,impacts,{groundHeight=()=>0,isRoad=()=>true,capMaterial=BOMB_ROAD_CUT_MATERIAL}={}){
 if(!impacts.length)return mesh;
 const bounds=[Infinity,Infinity,-Infinity,-Infinity];
 for(const [id,first,count] of mesh.ranges)if(isRoad(id))for(let at=first*11;at<(first+count)*11;at+=11){bounds[0]=Math.min(bounds[0],mesh.vertices[at]);bounds[1]=Math.min(bounds[1],mesh.vertices[at+1]);bounds[2]=Math.max(bounds[2],mesh.vertices[at]);bounds[3]=Math.max(bounds[3],mesh.vertices[at+1]);if(at%4224===0)yield;}
 let current=mesh;const seen=new Set();
 for(const impact of impacts){
  const [x,y,,radius]=impact,key=[x,y,radius].join(',');if(!(radius>0)||seen.has(key))continue;seen.add(key);
  if(Math.hypot(Math.max(bounds[0]-x,0,x-bounds[2]),Math.max(bounds[1]-y,0,y-bounds[3]))>radius/Math.cos(Math.PI/ROAD_CUT_SIDES))continue;
  const planes=roadCutPlanes(impact),sections=planes.map(()=>[]),groups=[];let changed=false,steps=0;
  for(const [id,first,count] of current.ranges){
   if(!isRoad(id)&&id!==capMaterial){groups.push([id,current.vertices.subarray(first*11,(first+count)*11)]);continue;}
   const out=[];
   for(let at=first*11;at<(first+count)*11;at+=33){
    const tri=[0,11,22].map(k=>Array.from(current.vertices.subarray(at+k,at+k+11)));
    if(++steps%128===0)yield;
    if(planes.some(p=>tri.every(v=>distance(v,p)>=-EPS))){append(out,tri);continue;}
    let inner=tri;
    for(const plane of planes){const parts=split(inner,plane);append(out,parts.outer);inner=parts.inner;if(inner.length<3)break;}
    if(inner.length>=3){const removed=[];append(removed,inner);if(removed.length)changed=true;
     for(let i=0;i<inner.length;i++){const a=inner[i],b=inner[(i+1)%inner.length];for(let j=0;j<planes.length;j++)if(Math.abs(distance(a,planes[j]))<EPS&&Math.abs(distance(b,planes[j]))<EPS)sections[j].push([a,b]);}
    }
   }
   if(out.length)groups.push([id,out]);
  }
  if(!changed)continue;
  const caps=[];for(let i=0;i<planes.length;i++){const part=yield* sectionCaps(sections[i],planes[i],groundHeight);for(const value of part)caps.push(value);}
  if(caps.length)groups.push([capMaterial,caps]);
  let size=0;for(const [,v] of groups)size+=v.length;const vertices=new Float32Array(size),ranges=[];let offset=0;
  for(const [id,v] of groups){vertices.set(v,offset);ranges.push([id,offset/11,v.length/11]);offset+=v.length;yield;}
  current={vertices,ranges};
 }
 return current;
}
