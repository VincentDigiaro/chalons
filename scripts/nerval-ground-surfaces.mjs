// Cut away hidden ground at build time. Millimetre height offsets cannot keep
// stacked lawns, gravel and paving apart in the flight camera's depth buffer.
// Work on the existing vertex attributes so elevations, UVs and tints survive.
const STRIDE=11,EPS=1e-8;
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export const projectedArea=points=>Math.abs(points.slice(1,-1).reduce((s,p,i)=>s+cross(points[0],p,points[i+2]),0))/2;
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function clip(points,distance){
 const out=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b),insideA=da>=0,insideB=db>=0;
  if(insideA)out.push(a);
  if(insideA!==insideB)out.push(mix(a,b,da/(da-db)));
 }
 return out;
}
function subtract(points,mask){
 const outside=[];let inside=points;
 const signedArea=mask.slice(1,-1).reduce((s,p,i)=>s+cross(mask[0],p,mask[i+2]),0),sign=Math.sign(signedArea);
 // Avoid splitting a surface along the infinite extensions of a disjoint
 // cutter's edges. This keeps neighbouring paths from fragmenting each other.
 let intersection=points;
 for(let i=0;i<mask.length&&intersection.length>=3;i++)intersection=clip(intersection,p=>sign*cross(mask[i],mask[(i+1)%mask.length],p));
 if(intersection.length<3||projectedArea(intersection)<=EPS)return [points];
 for(let i=0;i<mask.length&&inside.length>=3;i++){
  const a=mask[i],b=mask[(i+1)%mask.length],distance=p=>sign*cross(a,b,p);
  const piece=clip(inside,p=>-distance(p));
  if(piece.length>=3&&projectedArea(piece)>EPS)outside.push(piece);
  inside=clip(inside,distance);
 }
 return outside;
}
const overlaps=(a,b)=>a[0]<b[2]-EPS&&a[2]>b[0]+EPS&&a[1]<b[3]-EPS&&a[3]>b[1]+EPS;
function groundTriangles(batches,groundMaterials){
 const triangles=[];let order=0;
 for(const [material,data] of [...batches].filter(([id])=>groundMaterials.has(id)).sort((a,b)=>a[0]-b[0]))for(let offset=0;offset<data.length;offset+=3*STRIDE){
  const points=[0,1,2].map(i=>Array.from(data.slice(offset+i*STRIDE,offset+(i+1)*STRIDE)));
  order++;
  // Only ground replaces ground. Do not cut holes beneath raised stones,
  // railings or foliage: their underside can be seen at pedestrian height.
  // Raised gardens and every surface above the kerb remain untouched.
  if(points.some(p=>p[2]<0||p[2]>.25)||Math.abs(points[0][5])<.1||projectedArea(points)<EPS)continue;
  const [a,b,c]=points,det=cross(a,b,c);
  const dx=((b[2]-a[2])*(c[1]-a[1])-(c[2]-a[2])*(b[1]-a[1]))/det;
  const dy=((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/det;
  triangles.push({material,offset,points,order,height:p=>a[2]+dx*(p[0]-a[0])+dy*(p[1]-a[1]),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]});
 }
 return triangles;
}
function coveringMask(surface,other){
 if(!overlaps(surface.bounds,other.bounds))return [];
 const delta=p=>other.height(p)-surface.height(p),heights=other.points.map(delta);
 // Coplanar surfaces keep the existing material/primitive draw order.
 if(heights.every(z=>Math.abs(z)<EPS))return other.order>surface.order?other.points:[];
 const mask=clip(other.points,delta);
 return mask.length>=3&&projectedArea(mask)>EPS?mask:[];
}
export function resolveGroundSurfaces(batches,groundMaterials){
 const triangles=groundTriangles(batches,groundMaterials),replacements=new Map();
 let inputTriangles=0,outputTriangles=0,changedTriangles=0,inputArea=0,outputArea=0;
 for(const surface of triangles){
  inputTriangles++;inputArea+=projectedArea(surface.points);let pieces=[surface.points];
  for(const other of triangles){
   if(surface===other)continue;
   const mask=coveringMask(surface,other);if(!mask.length)continue;
   pieces=pieces.flatMap(p=>subtract(p,mask));if(!pieces.length)break;
  }
  const vertices=[];
  for(const p of pieces)for(let i=1;i<p.length-1;i++){
   const tri=[p[0],p[i],p[i+1]];if(projectedArea(tri)<=EPS)continue;
   vertices.push(...tri.flat());outputArea+=projectedArea(tri);outputTriangles++;
  }
  const original=surface.points.flat();
  if(vertices.length!==33||vertices.some((v,i)=>Math.abs(v-original[i])>EPS))changedTriangles++;
  if(!replacements.has(surface.material))replacements.set(surface.material,new Map());
  replacements.get(surface.material).set(surface.offset,vertices);
 }
 for(const [material,changes] of replacements){
  const source=batches.get(material),result=[];
  for(let i=0;i<source.length;i+=33){const vertices=changes.get(i)??source.slice(i,i+33);for(const v of vertices)result.push(v);}
  batches.set(material,result);
 }
 return {inputTriangles,outputTriangles,changedTriangles,removedAreaM2:inputArea-outputArea};
}
