import {shipMatrix,transform,triangleDistance} from './highwind-math.js';
import {GROUND_HEIGHT,collisionGeometry} from './walk-physics.js';

const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const bounds=p=>[0,1,2].map(i=>Math.min(...p.map(v=>v[i]))).concat([0,1,2].map(i=>Math.max(...p.map(v=>v[i]))));
const overlaps=(a,b)=>a[0]<=b[3]+1e-7&&a[3]>=b[0]-1e-7&&a[1]<=b[4]+1e-7&&a[4]>=b[1]-1e-7&&a[2]<=b[5]+1e-7&&a[5]>=b[2]-1e-7;
export function trianglePositions(vertices,ranges=[{first:0,count:vertices.length/11}]){
 const fixed=ranges.filter(r=>!r.part?.startsWith('Prop')),out=new Float32Array(fixed.reduce((n,r)=>n+r.count*3,0));let at=0;
 for(const r of fixed)for(let i=r.first*11;i<(r.first+r.count)*11;i+=11){out.set(vertices.subarray(i,i+3),at);at+=3;}return out;
}
export function meshCollider(triangles){
 const triangle=i=>[0,3,6].map(j=>triangles.subarray(i*9+j,i*9+j+3)),boxes=Array.from({length:triangles.length/9},(_,i)=>bounds(triangle(i)));
 const build=ids=>{const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];for(const i of ids)for(let a=0;a<3;a++){b[a]=Math.min(b[a],boxes[i][a]);b[a+3]=Math.max(b[a+3],boxes[i][a+3]);}if(ids.length<=8)return {b,ids};const axis=[0,1,2].sort((a,c)=>(b[c+3]-b[c])-(b[a+3]-b[a]))[0];ids.sort((a,c)=>boxes[a][axis]+boxes[a][axis+3]-boxes[c][axis]-boxes[c][axis+3]);const mid=ids.length>>1;return {b,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};};
 const root=build(boxes.map((_,i)=>i));
 return {triangles,root,triangle,query(box,visit){const walk=n=>{if(!overlaps(n.b,box))return false;if(n.ids){for(const i of n.ids)if(overlaps(boxes[i],box)&&visit(triangle(i)))return true;return false;}return walk(n.left)||walk(n.right);};return walk(root);}};
}
// Nearest fixed hull surface in 3D. Bounding boxes only prune the search;
// they never count as contact with the airship.
export function meshDistance(collider,point,maxDistance=Infinity){
 if(!collider?.root||!point.every(Number.isFinite))return Infinity;
 const distanceToBox=b=>Math.hypot(...point.map((v,i)=>Math.max(b[i]-v,0,v-b[i+3])));let best=Infinity;
 const visit=node=>{if(distanceToBox(node.b)>Math.min(best,maxDistance))return;if(node.ids){for(const id of node.ids){const [a,b,c]=collider.triangle(id),d=triangleDistance(point,a,b,c);if(d<=maxDistance)best=Math.min(best,d);}return;}const children=[node.left,node.right].sort((a,b)=>distanceToBox(a.b)-distanceToBox(b.b));for(const child of children)visit(child);};
 visit(collider.root);return best;
}
// SAT includes coplanar edge axes, so narrow fins do not become solid columns.
export function trianglesIntersect(a,b){
 const ea=[sub(a[1],a[0]),sub(a[2],a[1]),sub(a[0],a[2])],eb=[sub(b[1],b[0]),sub(b[2],b[1]),sub(b[0],b[2])],na=cross(ea[0],ea[1]),nb=cross(eb[0],eb[1]);
 const separated=axis=>{const len=Math.hypot(...axis);if(len<1e-14)return false;const pa=a.map(p=>dot(p,axis)),pb=b.map(p=>dot(p,axis)),eps=1e-8*len;return Math.max(...pa)<Math.min(...pb)-eps||Math.max(...pb)<Math.min(...pa)-eps;};
 if(separated(na)||separated(nb))return false;
 for(const x of ea){if(separated(cross(na,x)))return false;for(const y of eb)if(separated(cross(x,y)))return false;}
 for(const y of eb)if(separated(cross(nb,y)))return false;return true;
}
export function worldBounds(collider,pose){const b=collider.root.b,m=shipMatrix(pose),p=[];for(const x of [b[0],b[3]])for(const y of [b[1],b[4]])for(const z of [b[2],b[5]])p.push(transform(m,[x,y,z]));return bounds(p);}
// A coarse lower envelope, at most 32 supports across the ship's length and
// width. Extract it once; flight never intersects individual hull triangles.
export function groundSupports(collider){
 if(collider.groundSupports)return collider.groundSupports;
 const b=collider.root.b,dx=(b[3]-b[0])||1,dy=(b[4]-b[1])||1,cells=new Array(32),v=collider.triangles;
 for(let i=0;i<v.length;i+=3){
  const col=Math.max(0,Math.min(3,Math.floor((v[i]-b[0])/dx*4))),row=Math.max(0,Math.min(7,Math.floor((v[i+1]-b[1])/dy*8))),key=row*4+col;
  if(!cells[key]||v[i+2]<cells[key][2])cells[key]=[v[i],v[i+1],v[i+2]];
 }
 return collider.groundSupports=cells.filter(Boolean);
}
// Ground height is the smoothed cell average supplied by the flight renderer.
// Walking on decks still uses the complete fixed mesh via walkingGeometry.
export function shipHitsGround(collider,pose,groundHeight=null){
 const supports=groundSupports(collider),m=shipMatrix(pose),point=[0,0,0];
 for(const [x,y,z] of supports){
  point[0]=m[0]*x+m[4]*y+m[8]*z+m[12];point[1]=m[1]*x+m[5]*y+m[9]*z+m[13];point[2]=m[2]*x+m[6]*y+m[10]*z+m[14];
  if(point[2]<(groundHeight?groundHeight(point):GROUND_HEIGHT))return true;
 }
 return false;
}
// Keep already cached flight modules compatible during a game update.
export const shipHitsWorld=shipHitsGround;
export function walkingGeometry(collider,pose){
 const m=shipMatrix(pose),v=collider.triangles,out=new Float32Array(v.length/3*11);
 for(let i=0;i<v.length;i+=9){const p=[0,3,6].map(j=>transform(m,v.subarray(i+j,i+j+3))),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),len=Math.hypot(...n)||1;for(let k=0;k<3;k++)out.set([...p[k],...n.map(x=>x/len),0,0,1,1,1],(i/3+k)*11);}
 return collisionGeometry(out);
}
