import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolveGroundSurfaces,projectedArea} from './nerval-ground-surfaces.mjs';

const vertex=([x,y,z],color)=>[x,y,z,0,0,1,x/2,y/2,...color];
const triangle=(points,color)=>points.flatMap(p=>vertex(p,color));
const square=(x0,y0,x1,y1,z,color)=>[[[x0,y0,z],[x1,y0,z],[x1,y1,z]],[[x0,y0,z],[x1,y1,z],[x0,y1,z]]].flatMap(t=>triangle(t,color));
const triangles=batches=>[...batches].flatMap(([material,data])=>Array.from({length:data.length/33},(_,i)=>({material,p:[0,1,2].map(j=>Array.from(data.slice(i*33+j*11,i*33+(j+1)*11)))})));
function at(t,x,y){
 const [a,b,c]=t.p,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
 if(Math.abs(det)<1e-10)return null;
 const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det,w=1-u-v;
 return Math.min(u,v,w)<-1e-9?null:{material:t.material,vertex:a.map((q,i)=>q*u+b[i]*v+c[i]*w)};
}
const top=(list,x,y)=>list.map(t=>at(t,x,y)).filter(Boolean).sort((a,b)=>Math.abs(a.vertex[2]-b.vertex[2])<1e-8?a.material-b.material:a.vertex[2]-b.vertex[2]).at(-1);
const red=[1,0,0],green=[0,1,0],blue=[0,0,1];
// Nested surfaces only 1 mm apart; a coplanar patch; and a sloping patch
// crossing a flat lawn. The independent point oracle checks the upper surface,
// its material, height and interpolated UVs, including an unchanged solid top.
const batches=new Map([
 [6,square(0,0,10,10,.020,red)],
 [7,square(1,1,7,7,.021,green)],
 [8,[...square(4,4,9,9,.021,blue),...triangle([[0,0,.010],[8,0,.040],[0,8,.040]],blue)]],
 [2,square(2,2,3,3,.080,red)],
]);
const before=triangles(batches),solid=[...batches.get(2)],stats=resolveGroundSurfaces(batches,new Set([6,7,8])),after=triangles(batches);
assert(stats.changedTriangles>0&&stats.removedAreaM2>0);
assert.deepEqual(batches.get(2),solid,'Solid geometry must remain byte-for-byte identical');
let samples=0;
for(let x=.03317;x<10;x+=.1391234)for(let y=.01719;y<10;y+=.151923){
 const a=top(before,x,y),b=top(after,x,y);
 assert(a&&b,`New hole at ${x},${y}`);assert.equal(b.material,a.material);
 a.vertex.forEach((v,i)=>assert(Math.abs(v-b.vertex[i])<1e-7,`Changed attribute ${i} at ${x},${y}`));
 assert.equal(after.filter(t=>[6,7,8].includes(t.material)&&at(t,x,y)).length,1,`Hidden ground still overlaps at ${x},${y}`);samples++;
}
// Disjoint triangles with overlapping bounding boxes must not be fragmented.
const separate=new Map([[6,triangle([[0,0,.02],[2,0,.02],[0,2,.02]],red)],[7,triangle([[2,2,.03],[2,.9,.03],[.9,2,.03]],blue)]]);
const intact=structuredClone(separate);resolveGroundSurfaces(separate,new Set([6,7]));assert.deepEqual(separate,intact);

// Audit the actual float32 mesh as consumed by the map and the FPS builder.
const index=JSON.parse(await fs.readFile('dist/data/nerval/index.json'));
const raw=await fs.readFile('dist/data/nerval/mesh.bin'),f=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
const grounds=new Set(index.materials.flatMap((m,i)=>m.kind>=6&&m.kind<=9?[i]:[]));
const data=new Map(index.ranges.map(r=>[r.material,f.slice(r.first*11,(r.first+r.count)*11)]));
const low=triangles(data).filter(t=>grounds.has(t.material)&&t.p.every(p=>p[2]>=0&&p[2]<=.25)&&Math.abs(t.p[0][5])>=.1&&projectedArea(t.p)>1e-8);
let seed=123456789,groundSamples=0;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(const t of low.filter(t=>grounds.has(t.material))){
 const u=.1+random()*.35,v=.1+random()*.35,w=1-u-v;
 const x=t.p[0][0]*u+t.p[1][0]*v+t.p[2][0]*w,y=t.p[0][1]*u+t.p[1][1]*v+t.p[2][1]*w;
 // Float32 edge quantisation can create micrometre slivers; only count a
 // competing triangle when the sample is at least 0.1 mm inside every edge.
 const competing=low.filter(q=>q!==t&&q.p.every((a,i)=>{const b=q.p[(i+1)%3],c=q.p[(i+2)%3],edge=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]),side=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);return Math.sign(side)*edge>1e-4*Math.hypot(b[0]-a[0],b[1]-a[1]);}));
 const z=at(t,x,y).vertex[2];
 const conflicts=competing.filter(q=>at(q,x,y).vertex[2]>z+1e-6||grounds.has(q.material));
 assert(!conflicts.length,`Overlapping ground at ${x},${y}: ${JSON.stringify({material:t.material,z,points:t.p.map(p=>p.slice(0,3)),conflicts:conflicts.map(q=>({material:q.material,z:at(q,x,y).vertex[2],points:q.p.map(p=>p.slice(0,3))}))})}`);groundSamples++;
}
console.log(JSON.stringify({ground:'passed',fixtureSamples:samples,meshSamples:groundSamples,...stats}));
