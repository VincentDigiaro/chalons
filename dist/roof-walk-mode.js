import {toLngLat} from './walk-core.js';

// Reuse exactly the same triangles. Only roof UVs and draw materials change.
// Detailed Nerval packets contain no aerialRoofs and pass through untouched.
export function applyRoofMode(header,vertices,index,mode){
 if(mode!=='aerial'||!header.aerialRoofs)return header.ranges;
 const roofCount=index.roofCount||32;
 for(const [tile,first,count] of header.aerialRoofs){
  const [,zoom,x,y]=tile.split('/').map((v,i)=>i?Number(v):v),n=2**zoom;
  for(let i=first;i<first+count;i++){
   const at=i*11,[lng,lat]=toLngLat([vertices[at],vertices[at+1]]);
   vertices[at+6]=(lng+180)/360*n-x;
   vertices[at+7]=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n-y;
   vertices[at+8]=vertices[at+9]=vertices[at+10]=1;
  }
 }
 return [...header.ranges.filter(([m])=>typeof m!=='number'||m<index.roofBase||m>=index.roofBase+roofCount),...header.aerialRoofs];
}
