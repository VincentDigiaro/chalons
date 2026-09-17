// Build small triangle blocks within the existing preparation budget. Aiming
// never builds an acceleration structure or scans the whole loaded scene.
export function* prepareRaycastMesh(vertices,ranges){
 const blocks=[];
 for(const [material,first,count] of ranges)for(let start=first;start<first+count;start+=384){
  const end=Math.min(start+384,first+count),bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  for(let i=start*11;i<end*11;i+=11)for(let axis=0;axis<3;axis++){bounds[axis]=Math.min(bounds[axis],vertices[i+axis]);bounds[axis+3]=Math.max(bounds[axis+3],vertices[i+axis]);}
  blocks.push({material,first:start,count:end-start,bounds});yield;
 }
 return {vertices,blocks};
}

export function rayBoxDistance(origin,direction,bounds,limit){
 let near=0,far=limit;
 for(let axis=0;axis<3;axis++){
  const d=direction[axis],p=origin[axis];
  if(Math.abs(d)<1e-12){if(p<bounds[axis]||p>bounds[axis+3])return Infinity;continue;}
  const a=(bounds[axis]-p)/d,b=(bounds[axis+3]-p)/d;
  near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return Infinity;
 }
 return near;
}

export function raycastMesh(mesh,origin,direction,limit,accept=()=>true){
 let hit=null,best=limit;const v=mesh.vertices,[dx,dy,dz]=direction;
 for(const block of mesh.blocks){
  if(!accept(block.material)||rayBoxDistance(origin,direction,block.bounds,best)===Infinity)continue;
  for(let at=block.first*11,end=(block.first+block.count)*11;at<end;at+=33){
   const ax=v[at],ay=v[at+1],az=v[at+2],ex=v[at+11]-ax,ey=v[at+12]-ay,ez=v[at+13]-az,fx=v[at+22]-ax,fy=v[at+23]-ay,fz=v[at+24]-az;
   const px=dy*fz-dz*fy,py=dz*fx-dx*fz,pz=dx*fy-dy*fx,det=ex*px+ey*py+ez*pz;
   if(Math.abs(det)<1e-9)continue;
   const tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az,u=(tx*px+ty*py+tz*pz)/det;
   if(u< -1e-7||u>1.0000001)continue;
   const qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex,w=(dx*qx+dy*qy+dz*qz)/det;
   if(w< -1e-7||u+w>1.0000001)continue;
   const distance=(fx*qx+fy*qy+fz*qz)/det;if(distance<1e-5||distance>best)continue;
   const normal=[ey*fz-ez*fy,ez*fx-ex*fz,ex*fy-ey*fx],length=Math.hypot(...normal),sign=normal[0]*dx+normal[1]*dy+normal[2]*dz>0?-1:1;
   best=distance;hit={distance,position:origin.map((p,i)=>p+direction[i]*distance),normal:normal.map(n=>n/length*sign)};
  }
 }
 return hit;
}

// Walk short sections of the ray through the existing resident-node index.
export function raycastScene(origin,direction,limit,query,accept){
 let hit=null,best=limit;const visited=new Set();
 for(let t=0;t<best;t+=64){
  const end=Math.min(t+64,best),a=origin.map((p,i)=>p+direction[i]*t),b=origin.map((p,i)=>p+direction[i]*end);
  for(const node of query([Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])])){
   if(visited.has(node))continue;visited.add(node);
   if(!node.gpu||!node.aimMesh)continue;
   const xy=node.gpu.xyBounds||node.bounds,z=node.gpu.zBounds;
   if(rayBoxDistance(origin,direction,[xy[0],xy[1],z[0],xy[2],xy[3],z[1]],best)===Infinity)continue;
   const candidate=raycastMesh(node.aimMesh,origin,direction,best,id=>accept(node,id));
   if(candidate){hit=candidate;best=hit.distance;}
  }
 }
 return hit;
}
