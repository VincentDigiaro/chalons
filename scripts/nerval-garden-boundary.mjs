// Approximate road-edge alignment read from the user's annotated overview.
// Local metres in house 117's frame; foliage also stays inside the red line.
export const GARDEN_ROAD_LIMIT=13;
export const GARDEN_HEDGE_LIMIT=12.35;
export const GARDEN_BOUNDARY_REFERENCE='user-nerval-garden-boundary-20260914-1';
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export function clipBoundaryPolygon(points,distance){
 const out=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0))out.push(mix(a,b,da/(da-db)));
 }
 return out;
}
export function trimBoundaryPath(points,distance){
 const out=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],da=distance(a);
  if(i){const b=points[i-1],db=distance(b);if((da>=0)!==(db>=0))out.push(mix(b,a,db/(db-da)));}
  if(da>=0)out.push(a);
 }
 return out;
}
export function gardenBoundary(survey){
 const p=survey.parts.find(p=>p.id===117);
 const distance=(q,limit=GARDEN_ROAD_LIMIT)=>limit-p.v.reduce((sum,v,k)=>sum+v*(q[k]-p.center[k]),0);
 return {distance,clip:points=>clipBoundaryPolygon(points,distance),trimHedge:points=>trimBoundaryPath(points,q=>distance(q,GARDEN_HEDGE_LIMIT))};
}
