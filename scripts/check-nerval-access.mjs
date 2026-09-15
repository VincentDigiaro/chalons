import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {collisionGeometry,advancePlayer} from '../dist/walk-physics.js';
import {segmentDistance,blocked} from '../dist/walk-core.js';
const root=process.argv[2]||'dist',index=JSON.parse(await fs.readFile(root+'/data/nerval/index.json')),survey=JSON.parse(await fs.readFile(root+'/data/nerval/survey.json')),raw=await fs.readFile(root+'/data/nerval/mesh.bin'),f=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
const ramp=index.objects.find(o=>o.type==='entrance-ramp'),wall=index.objects.find(o=>o.type==='street-setback-wall');assert(ramp&&wall);
const bounds=[0,1].map(k=>[Math.min(...ramp.route.map(p=>p[k]))-2,Math.max(...ramp.route.map(p=>p[k]))+2]),local=[];
for(let v=0;v<f.length;v+=33){const points=[0,11,22].map(i=>[f[v+i],f[v+i+1]]);if([0,1].every(k=>Math.max(...points.map(p=>p[k]))>=bounds[k][0]&&Math.min(...points.map(p=>p[k]))<=bounds[k][1]))local.push(...f.subarray(v,v+33));}
const scene=collisionGeometry(new Float32Array(local));
const first=ramp.route[0],last=ramp.route.at(-1),dx=last[0]-first[0],dy=last[1]-first[1],length=Math.hypot(dx,dy),direction=[dx/length,dy/length];
// The gate remains closed. Test the usable ramp from inside the property.
assert.equal(ramp.material,'white-grey-gravel');
const house32=survey.parts.find(p=>p.id===86),W32=q=>house32.center.map((n,i)=>n+house32.u[i]*q[0]+house32.v[i]*q[1]);
const localStart=[house32.u,house32.v].map(axis=>axis.reduce((n,x,i)=>n+x*(first[i]-house32.center[i]),0));
assert(blocked(W32([4.75,localStart[1]-.65]),scene.segments,.10),'The front gate must stay closed');
let body={position:first.slice(0,2),feet:first[2],verticalSpeed:0,grounded:true};
for(const target of [ramp.route.at(-1),first]){
 const sign=target===first?-1:1,targetPosition=target.slice(0,2);
 for(let i=0;i<400;i++){const distance=Math.hypot(body.position[0]-targetPosition[0],body.position[1]-targetPosition[1]);if(distance<.34)break;body=advancePlayer(body,direction[0]*sign*.045,direction[1]*sign*.045,1/60,scene);}
 if(Math.hypot(body.position[0]-targetPosition[0],body.position[1]-targetPosition[1])>=.36)console.log('Nearby blockers',scene.segments.filter(s=>segmentDistance(body.position,s)<.30&&s[5]>body.feet+.005&&s[4]<body.feet+1.65));
 assert(Math.hypot(body.position[0]-targetPosition[0],body.position[1]-targetPosition[1])<.36,'Ramp blocked: '+JSON.stringify(body)+' target '+target);
 assert(Math.abs(body.feet-target[2])<.17,'Ramp elevation mismatch');
}
const street=survey.refinements.streetPaths.find(s=>s.points.length>20),segments=street.points.slice(1).map((b,i)=>[...street.points[i],...b]);
let clearance=Infinity;for(let i=1;i<wall.path.length;i++)for(let t=0;t<=1;t+=.05){const a=wall.path[i-1],b=wall.path[i],q=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];clearance=Math.min(clearance,...segments.map(s=>segmentDistance(q,s)));}
assert(clearance>=4.65,'Wall encroaches on road/sidewalk: '+clearance);
// Check actual triangles at the missing-surface locations, not just metadata.
function heightAt(q,kind){let top=-Infinity;for(const range of index.ranges.filter(r=>index.materials[r.material].kind===kind))for(let v=range.first;v<range.first+range.count;v+=3){const p=[0,1,2].map(i=>Array.from(f.subarray((v+i)*11,(v+i)*11+3))),det=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);if(Math.abs(det)<1e-6)continue;const u=((p[1][1]-p[2][1])*(q[0]-p[2][0])+(p[2][0]-p[1][0])*(q[1]-p[2][1]))/det,w=((p[2][1]-p[0][1])*(q[0]-p[2][0])+(p[0][0]-p[2][0])*(q[1]-p[2][1]))/det;if(u>=0&&w>=0&&u+w<=1)top=Math.max(top,u*p[0][2]+w*p[1][2]+(1-u-w)*p[2][2]);}return top;}
for(const q of [[-67.5,-77.5],[-64,-76],[-57,-73]])assert(heightAt(q,6)>.02,'Missing road '+q);
// This point lies on the raised sidewalk. Hidden asphalt underneath it is
// deliberately removed by the ground-overlap cleanup.
assert(heightAt([-66,-79],7)>.13,'Missing junction sidewalk');
const p=survey.parts.find(p=>p.id===101),W=q=>p.center.map((n,i)=>n+p.u[i]*q[0]+p.v[i]*q[1]);
for(const q of [[8.5,-10.4],[8.7,-5],[8.8,2],[8.6,6]])assert(heightAt(W(q),9)>.07,'Missing driveway '+q);
console.log(JSON.stringify({access:'passed',rampWalkedBothWays:true,rampLength:+length.toFixed(2),width:ramp.width,wallRoadDistance:+clearance.toFixed(2),groundSamples:8}));
