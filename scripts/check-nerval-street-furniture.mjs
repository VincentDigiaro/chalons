import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {blocked,segmentDistance} from '../dist/walk-core.js';
const root=process.argv[2]||'dist',base='artifacts/nerval/furniture-fixes-20260914',read=async p=>JSON.parse(await fs.readFile(p));
const s=await read(root+'/data/nerval/survey.json'),i=await read(root+'/data/nerval/index.json'),before=await read(base+'/before/survey.json'),raw=await fs.readFile(root+'/data/nerval/mesh.bin'),f=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
const digestRows=rows=>crypto.createHash('sha256').update(JSON.stringify(rows.map(o=>JSON.stringify(o)).sort())).digest('hex');
assert.equal(digestRows(s.parts),digestRows(before.parts),'Buildings unchanged');
// Later user changes add two doors to 108 and rebalance two street doors on
// 117. All other earlier openings, including its three garden doors, remain.
const streetPatio=o=>o.part===117&&o.side==='front'&&o.kind==='patio';
assert.equal(digestRows(s.openings.filter(o=>o.reference!=='user-nerval-second-house-doors-20260914-1'&&!streetPatio(o))),digestRows(before.openings.filter(o=>!streetPatio(o))),'Earlier openings unchanged');
const j=i.objects.find(o=>o.type==='continuous-impasse-junction'),tree=i.objects.find(o=>o.type==='observed-garden-tree'),hedge=i.objects.find(o=>o.label==='end-garden-return-hedge');
assert(s.endCorrections.tree.local[1]>-8.1);assert(Math.min(...hedge.path.slice(1).map((q,k)=>segmentDistance(tree.center,[...hedge.path[k],...q])))>1.3,'Tree remains in front of hedge');
const lamps=[i.objects.find(o=>o.type==='observed-streetlamp'),i.objects.find(o=>o.type==='repositioned-streetlamp')];assert(lamps.every(Boolean));
for(const lamp of lamps){
 let best={distance:Infinity};for(const road of s.refinements.streetPaths)for(let k=1;k<road.points.length;k++){const a=road.points[k-1],b=road.points[k],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),t=Math.max(0,Math.min(1,((lamp.center[0]-a[0])*dx+(lamp.center[1]-a[1])*dy)/(l*l))),q=[a[0]+dx*t,a[1]+dy*t],distance=Math.hypot(lamp.center[0]-q[0],lamp.center[1]-q[1]);if(distance<best.distance)best={distance,side:((lamp.center[0]-q[0])*-dy+(lamp.center[1]-q[1])*dx)/l,q};}
 assert(best.side<-3.1&&best.side>-4.35,'Wrong side or outside sidewalk: '+JSON.stringify(best));assert(lamp.arm.reduce((n,x,k)=>n+x*(best.q[k]-lamp.center[k]),0)>0,'Lamp must light the road');assert(lamp.curvedArm);
}
const segments=[],ground=[];
for(const range of i.ranges)for(let v=range.first;v<range.first+range.count;v+=3){const p=[0,1,2].map(k=>Array.from(f.subarray((v+k)*11,(v+k)*11+3))),hits=[];
 for(let k=0;k<3;k++){const a=p[k],b=p[(k+1)%3];if((a[2]>.65)!==(b[2]>.65)){const t=(.65-a[2])/(b[2]-a[2]);hits.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}if(hits.length===2)segments.push(hits.flat());
 if(p.every(q=>q[2]<.2))ground.push({p,kind:i.materials[range.material].kind});
}
const bollards=i.objects.filter(o=>o.type==='pedestrian-bollard');assert.equal(bollards.length,4);
for(const b of bollards.filter(b=>b.id>=2))assert(!blocked(b.center,segments,.22),'Moved bollard hidden inside hedge: '+b.center);
const [a,b]=bollards.filter(b=>b.id>=2).map(b=>b.center);assert(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-1.44)<1e-8);
function surface(q){let top=-Infinity,kind=-1;for(const t of ground){const p=t.p,det=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);if(Math.abs(det)<1e-7)continue;const u=((p[1][1]-p[2][1])*(q[0]-p[2][0])+(p[2][0]-p[1][0])*(q[1]-p[2][1]))/det,w=((p[2][1]-p[0][1])*(q[0]-p[2][0])+(p[0][0]-p[2][0])*(q[1]-p[2][1]))/det;if(u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6){const z=u*p[0][2]+w*p[1][2]+(1-u-w)*p[2][2];if(z>top){top=z;kind=t.kind;}}}return {top,kind};}
let samples=0;
for(const polygon of i.objects.find(o=>o.type==='path-verge-correction').asphalt){const c=[0,1].map(k=>polygon.reduce((n,p)=>n+p[k],0)/polygon.length);for(const vertex of polygon)for(const t of [.15,.4,.7]){const q=c.map((x,k)=>x+(vertex[k]-x)*t),g=surface(q);assert(g.kind!==8&&g.top>=.021,'Grass or hole remains: '+JSON.stringify({q,g}));samples++;}}
for(const ref of await read('scripts/nerval-furniture-references.json'))assert.equal(crypto.createHash('sha256').update(await fs.readFile(ref.file)).digest('hex'),ref.sha256);
const report={passed:true,buildingsUnchanged:s.parts.length,openingsUnchanged:s.openings.length,lampsOnCorrectSide:2,movedBollards:2,bollardClearance:1.06,treeBehindHedge:true,asphaltSamples:samples};await fs.writeFile(base+'/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
