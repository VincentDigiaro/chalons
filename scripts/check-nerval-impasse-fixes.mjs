import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {blocked} from '../dist/walk-core.js';
const root=process.argv[2]||'dist',read=async f=>JSON.parse(await fs.readFile(f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const base='artifacts/nerval/impasse-fixes-20260914',survey=await read(root+'/data/nerval/survey.json'),index=await read(root+'/data/nerval/index.json'),raw=await fs.readFile(root+'/data/nerval/mesh.bin'),f=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
const before=await read(base+'/before/survey.json'),preserve=await read(base+'/preservation.json');
for(const p of before.parts)assert.deepEqual(survey.parts.find(q=>q.id===p.id).ring,p.ring,'Footprint changed: '+p.id);
for(const [name,hash]of Object.entries(preserve.attila))assert.equal(sha(await fs.readFile(root+'/data/attila/'+name)),hash,'Attila must remain intact');
assert.equal(survey.openings.filter(o=>o.part===117&&o.side==='right'&&o.kind==='patio').length,3);
const high=survey.openings.find(o=>o.part===115&&o.side==='left'&&!o.kind),front=survey.openings.filter(o=>o.part===115&&o.awning);
for(const o of front)assert(Math.abs((high.bottom+high.height/2)-(o.bottom+o.height/2))<1e-8,'Upper window must align with front windows');
const segments=[],ground=[];
for(const range of index.ranges)for(let v=range.first;v<range.first+range.count;v+=3){
 const p=[0,1,2].map(i=>Array.from(f.subarray((v+i)*11,(v+i)*11+3))),hits=[];
 for(let k=0;k<3;k++){const a=p[k],b=p[(k+1)%3];if((a[2]>.65)!==(b[2]>.65)){const t=(.65-a[2])/(b[2]-a[2]);hits.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
 if(hits.length===2)segments.push(hits.flat());
 if(p.every(q=>q[2]<.2))ground.push({p,kind:index.materials[range.material].kind});
}
function groundAt(q){let top=-Infinity,kind=-1;for(const t of ground){const p=t.p,det=(p[1][1]-p[2][1])*(p[0][0]-p[2][0])+(p[2][0]-p[1][0])*(p[0][1]-p[2][1]);if(Math.abs(det)<1e-7)continue;
 const u=((p[1][1]-p[2][1])*(q[0]-p[2][0])+(p[2][0]-p[1][0])*(q[1]-p[2][1]))/det,w=((p[2][1]-p[0][1])*(q[0]-p[2][0])+(p[0][0]-p[2][0])*(q[1]-p[2][1]))/det;
 if(u>=-1e-6&&w>=-1e-6&&u+w<=1+1e-6){const z=u*p[0][2]+w*p[1][2]+(1-u-w)*p[2][2];if(z>top){top=z;kind=t.kind;}}
 }return {top,kind};}
const j=index.objects.find(o=>o.type==='continuous-impasse-junction');assert(j);
const J=(t,s)=>j.junction.map((n,i)=>n+j.u[i]*t+j.v[i]*s);
let roadSamples=0,sidewalkSamples=0,drivewaySamples=0;
for(let t=0;t<=5;t+=.2)for(const s of [-1,0,1]){const q=J(t,s),surface=groundAt(q);assert.equal(surface.kind,6,'Asphalt gap '+JSON.stringify({q,surface}));assert(!blocked(q,segments,.15),'Junction obstructed');roadSamples++;}
for(let t=5;t<=18;t+=.25)for(const s of [-3.45,-3.70]){const q=J(t,s);assert(!blocked(q,segments,.15),'Hedge blocks sidewalk '+q);assert.equal(groundAt(q).kind,7,'Missing sidewalk');sidewalkSamples++;}
const p=survey.parts.find(p=>p.id===78),W=(x,y)=>p.center.map((n,i)=>n+p.u[i]*x+p.v[i]*y);
for(let y=-17.8;y<=p.bounds[0][1]-.8;y+=.2)for(const x of [4.85,5.95,7.05]){const q=W(x,y);assert(!blocked(q,segments,.16),'Neighbour driveway blocked '+JSON.stringify({x,y,q}));drivewaySamples++;}
const boundary=index.objects.find(o=>o.type==='corrected-garden-frontage');assert(boundary&&boundary.part===77);
for(const ref of await read('scripts/nerval-impasse-correction-references.json'))assert.equal(sha(await fs.readFile(ref.file)),ref.sha256);
const report={passed:true,frenchDoors:3,upperWindowCenter:high.bottom+high.height/2,roadSamples,sidewalkSamples,drivewaySamples,attilaPreserved:true,buildingFootprints:survey.parts.length};
await fs.writeFile(base+'/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
