import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {loadTerrain,terrainBaseHeight as height} from '../dist/terrain.js';
import {GROUND42_REGION,GROUND42_MAX_EDGE} from './nerval-house42-ground.mjs';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=(await fs.readFile('artifacts/nerval-ground42-current.txt','utf8')).trim(),backup=path.join(root,'backup');
const [i,oldI,s,oldS,raw,oldRaw,walk,oldWalk]=await Promise.all([
 read('dist/data/nerval/index.json'),read(backup+'/dist/data/nerval/index.json'),read('dist/data/nerval/survey.json'),read(backup+'/dist/data/nerval/survey.json'),
 fs.readFile('dist/data/nerval/mesh.bin'),fs.readFile(backup+'/dist/data/nerval/mesh.bin'),read('dist/data/walk/index.json'),read(backup+'/dist/data/walk/index.json')]);
assert.deepEqual(s,oldS,'Building survey and prior corrections changed');
assert.deepEqual(i.pickTriangles,oldI.pickTriangles,'Building geometry changed');
assert.deepEqual(i.materials,oldI.materials);assert.deepEqual(i.textures,oldI.textures);
const objects=new Set(i.objects.map(o=>JSON.stringify(o)));
for(const o of oldI.objects)assert(objects.has(JSON.stringify(o)),'Existing object removed: '+o.type);
function triangles(index,bytes){const out=[];for(const r of index.ranges)for(let j=r.first;j<r.first+r.count;j+=3){const b=bytes.subarray(j*44,(j+3)*44);out.push({kind:index.materials[r.material].kind,material:r.material,b,p:[0,1,2].map(k=>Array.from({length:11},(_,d)=>b.readFloatLE(k*44+d*4)))});}return out;}
const all=triangles(i,raw),oldAll=triangles(oldI,oldRaw);
const tall=t=>t.p.some(p=>p[2]>.3);
const signatures=list=>list.filter(tall).map(t=>t.material+':'+sha(t.b)).sort();
assert.deepEqual(signatures(all),signatures(oldAll),'Walls, fences, roofs or planting above 30 cm changed');
const low=list=>list.filter(t=>t.kind>=6&&t.kind<=9&&t.p.every(p=>p[2]>=0&&p[2]<=.25));
const ground=low(all),oldGround=low(oldAll);
const [xmin,ymin,xmax,ymax]=GROUND42_REGION;
const inside=([x,y])=>x>=xmin&&x<=xmax&&y>=ymin&&y<=ymax;
await loadTerrain({fetchBuffer:async url=>{const b=await fs.readFile('dist/'+url.replace(/^\.\//,''));return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);}});
function clearance(list){let min=Infinity,holes=0,samples=0;for(const t of list.filter(t=>t.kind===8)){
 const p=t.p,c=[0,1].map(k=>p.reduce((sum,q)=>sum+q[k],0)/3);if(!inside(c))continue;
 for(const weights of [[1/3,1/3,1/3],[.6,.2,.2],[.2,.6,.2],[.2,.2,.6]]){
  const q=[0,1].map(k=>p.reduce((sum,v,j)=>sum+v[k]*weights[j],0)),z=p.reduce((sum,v,j)=>sum+(v[2]+height(v[0],v[1]))*weights[j],0);
  const delta=z-height(...q);min=Math.min(min,delta);holes+=delta<-.025;samples++;
 }
 }return {minimumMetres:min,submergedSamples:holes,samples};}
const before=clearance(oldGround),after=clearance(ground);
assert.equal(after.submergedSamples,0,'Lawn still disappears under the relief');assert(after.minimumMetres>.01);
assert(after.minimumMetres>before.minimumMetres+.08,'Terrain conformity did not improve');
for(const t of ground.filter(t=>t.p.some(inside)))for(let k=0;k<3;k++)assert(Math.hypot(t.p[k][0]-t.p[(k+1)%3][0],t.p[k][1]-t.p[(k+1)%3][1])<=GROUND42_MAX_EDGE+.001,'Long ground triangle remains');
function top(list,[x,y]){let best=null;for(const t of list){const [a,b,c]=t.p,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<1e-9)continue;
 const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det,w=1-u-v;if(Math.min(u,v,w)<-1e-5)continue;
 const p=a.map((q,k)=>q*u+b[k]*v+c[k]*w);if(!best||p[2]>best.p[2])best={kind:t.kind,p};
 }return best;}
const curve=i.objects.find(o=>o.type==='house42-paved-curve');assert(curve);
for(const p of curve.centerline){const t=top(ground,p);assert.equal(t?.kind,9,'Disconnected entry paving');assert(t.p[6]>=128&&t.p[6]<192,'Wrong paving finish');}
assert(Math.hypot(...curve.centerline.at(-1).map((v,k)=>v-curve.entry[k]))<.06,'Path does not reach the entrance');
const world=(id,q)=>{const p=s.parts.find(p=>p.id===id);return p.center.map((v,k)=>v+p.u[k]*q[0]+p.v[k]*q[1]);};
const drive=top(ground,world(112,[6.7,-7.6]));assert.equal(drive?.kind,9);assert(drive.p[6]<128,'Garage lost its original hex paving');
for(const [id,q]of [[108,[-6.5,10]],[108,[2.5,12]],[120,[-9.8,5.5]],[120,[-9.8,-6]]])assert.equal(top(ground,world(id,q))?.kind,8,'Missing neighbour grass '+id);
let streetSamples=0;
for(const road of i.objects.filter(o=>o.type==='road-surface')){
 const points=road.centerline.map(p=>p.map((v,k)=>(v-s.origin[k])*s.scale[k]));
 for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);
  for(let k=0;k<=count;k++){const p=a.map((v,d)=>v+(b[d]-v)*k/count),old=top(oldGround,p),now=top(ground,p);assert.equal(now?.kind,old?.kind,'Garden crosses public street');if(old)assert(Math.abs(now.p[2]-old.p[2])<.0001);streetSamples++;}
 }
}
for(const file of ['index.json','mesh.bin','survey.json'])assert.equal(walk.sourceHashes['dist/data/nerval/'+file],sha(await fs.readFile('dist/data/nerval/'+file)),'Stale FPS mesh');
assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('detail/')),oldWalk.nodes.filter(n=>!n[0].startsWith('detail/')));
for(const [file,hash]of Object.entries(oldWalk.sourceHashes))if(!file.startsWith('dist/data/nerval/'))assert.equal(walk.sourceHashes[file],hash);
const download=await read('dist/data/walk-downloads/index.json');assert.equal(download.sourceHash,sha(await fs.readFile('dist/data/walk/index.json')));
for(const file of ['dist/nerval-ground-materials.js','dist/data/nerval/index.json','dist/data/nerval/mesh.bin','dist/data/nerval/survey.json','dist/data/walk/index.json','dist/data/walk-downloads/index.json',...walk.nodes.filter(n=>n[0].startsWith('detail/')).map(n=>'dist/data/walk/'+n[0])]){try{assert(zlib.gunzipSync(await fs.readFile(file+'.gz')).equals(await fs.readFile(file)),'Stale gzip '+file);}catch(e){if(e.code!=='ENOENT')throw e;}}
const report={passed:true,buildingGeometryPreserved:true,previousObjectsPreserved:oldI.objects.length,terrainBefore:before,terrainAfter:after,streetSamples,continuousPavingSamples:curve.centerline.length,oldTriangles:oldI.stats.triangles,newTriangles:i.stats.triangles};
await fs.writeFile(path.join(root,'validation-ground42.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
