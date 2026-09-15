import earcut,{flatten} from 'earcut';
import {roofPoint} from './roof-policy.mjs';
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const bounds=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const intersects=(a,b)=>Math.min(a[2],b[2])-Math.max(a[0],b[0])>1e-7&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>1e-7;
function triangles(feature){
 const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates,out=[];
 for(const poly of polygons){const rings=poly.map(r=>r.slice(0,-1).map(roofPoint)),flat=flatten(rings),indices=earcut(flat.vertices,flat.holes,2);for(let i=0;i<indices.length;i+=3){const p=indices.slice(i,i+3).map(v=>flat.vertices.slice(v*2,v*2+2));out.push({p,b:bounds(p)});}}
 return out;
}
function overlap(a,b){
 for(const t of a)for(const u of b){if(!intersects(t.b,u.b))continue;let poly=t.p;const sign=Math.sign(cross(...u.p));
  for(let i=0;i<3&&poly.length;i++){
   const c=u.p[i],d=u.p[(i+1)%3],out=[];
   for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length],x=cross(c,d,p)*sign,y=cross(c,d,q)*sign;if(x>=0)out.push(p);if((x>=0)!==(y>=0)){const k=x/(x-y);out.push([p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k]);}}poly=out;
  }
  let area=0;for(let i=1;i<poly.length-1;i++)area+=Math.abs(cross(poly[0],poly[i],poly[i+1]));if(area>1e-7)return true;
 }
 return false;
}
// Coplanar OSM overlaps used to share one aerial image. Keep their new material
// and UV frame identical too, so depth ties cannot alternate conflicting textures.
export function harmonizeRoofOverlaps(features,assignments){
 const nodes=features.map((f,i)=>{const poly=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;return {f,i,b:bounds(poly.flatMap(p=>p[0].map(roofPoint)))};}),buckets=new Map(),parent=nodes.map((_,i)=>i);
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};let overlaps=0;
 for(const n of nodes){const seen=new Set();for(let x=Math.floor(n.b[0]);x<=Math.floor(n.b[2]);x++)for(let y=Math.floor(n.b[1]);y<=Math.floor(n.b[3]);y++){
  const key=`${Math.round(n.f.properties.height*1000)}/${x}/${y}`,bucket=buckets.get(key)||[];
  for(const other of bucket){if(seen.has(other.i))continue;seen.add(other.i);if(root(n.i)===root(other.i)||!intersects(n.b,other.b))continue;
   n.tri??=triangles(n.f);other.tri??=triangles(other.f);
   if(overlap(n.tri,other.tri)){parent[root(n.i)]=root(other.i);overlaps++;}
  }
  bucket.push(n);buckets.set(key,bucket);
 }}
 const leaders=new Map();for(let i=0;i<nodes.length;i++){const r=root(i),best=leaders.get(r);if(best===undefined||assignments[i].areaM2>assignments[best].areaM2)leaders.set(r,i);}
 let shared=0;for(let i=0;i<nodes.length;i++){const best=leaders.get(root(i));if(best===i)continue;const target=assignments[i],source=assignments[best];target.material=source.material;target.uvTransform=[...source.uvTransform];target.tint=source.tint;target.sharedRoofWith=source.id;shared++;}
 return {overlaps,shared};
}
