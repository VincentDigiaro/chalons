import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {blocked} from '../dist/walk-core.js';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const evidence=(await fs.readFile('artifacts/nerval-streetview-current.txt','utf8')).trim(),backup=path.join(evidence,'backup');
const [s,i,oldS,oldI,raw,oldRaw,walk,oldWalk]=await Promise.all([
 read('dist/data/nerval/survey.json'),read('dist/data/nerval/index.json'),read(backup+'/dist/data/nerval/survey.json'),read(backup+'/dist/data/nerval/index.json'),
 fs.readFile('dist/data/nerval/mesh.bin'),fs.readFile(backup+'/dist/data/nerval/mesh.bin'),read('dist/data/walk/index.json'),read(backup+'/dist/data/walk/index.json')]);
const details=s.streetViewSurvey,modified=new Set(details.modifiedParts),sources=new Set(details.sources.map(s=>s.id));
for(const key of Object.keys(oldS))assert.deepEqual(s[key],oldS[key],`Original survey changed: ${key}`);
assert.deepEqual([...modified],[91,93,95,96,100,102,103,104,116,117,118]);
assert.deepEqual(i.pickTriangles.filter(t=>!modified.has(t.part)),oldI.pickTriangles.filter(t=>!modified.has(t.part)),'Geometry changed outside selected houses');
const currentObjects=new Set(i.objects.map(o=>JSON.stringify(o))),retiredObjects=[];
for(const o of oldI.objects)if(!currentObjects.has(JSON.stringify(o))){
 assert((o.type==='frontage'&&['nerval-23','nerval-24','nerval-25','nerval-28'].includes(o.id))||(o.type==='landscape-hedge'&&o.label==='nerval-28-front')||(o.type==='supported-gutter'&&o.part===116),'Unrelated object lost: '+JSON.stringify(o));retiredObjects.push(o);
}
const objects=i.objects.filter(o=>o.type.startsWith('streetview-'));
for(const o of objects){assert(modified.has(o.part));assert(sources.has(o.reference),'Missing reference '+o.reference);}
assert.equal(objects.filter(o=>o.type==='streetview-opening').length,10);
assert.equal(objects.filter(o=>o.type==='streetview-frontage').length,4);
assert.equal(objects.filter(o=>o.type==='streetview-tree').length,2);
assert(i.pickTriangles.filter(t=>t.part===116).every(t=>t.points.every(q=>q[2]>=2.499)),'Solid wall still masks the garage of 47');
assert(objects.some(o=>o.type==='streetview-opening'&&o.part===118&&o.kind==='garage'));
assert.equal(details.roofs[0].zones[0].axis,1);assert.equal(details.roofs[0].zones[1].axis,0);
assert.deepEqual(s.openings,oldS.openings,'Earlier user corrections must remain intact');
assert.equal(i.objects.filter(o=>o.type==='earth-opening').length,20);

function triangles(index,bytes){const out=new Map();for(const r of index.ranges){const m={...index.materials[r.material]};if(m.texture!==undefined)m.texture=index.textures[m.texture];const material=Buffer.from(JSON.stringify(m));for(let j=r.first;j<r.first+r.count;j+=3){const b=bytes.subarray(j*44,(j+3)*44),key=sha(Buffer.concat([material,b]));if(!out.has(key))out.set(key,{count:0,b});out.get(key).count++;}}return out;}
const regions=[93,96,100,117].map(id=>{const p=s.parts.find(p=>p.id===id),g=s.groups.find(g=>g.id===p.group),pts=s.parts.filter(x=>g.parts.includes(x.id)).flatMap(x=>x.ring),local=pts.map(q=>[p.u,p.v].map(v=>(q[0]-p.center[0])*v[0]+(q[1]-p.center[1])*v[1]));return {p,lo:[Math.min(...local.map(q=>q[0]))-3,Math.min(...local.map(q=>q[1]))-13],hi:[Math.max(...local.map(q=>q[0]))+5,Math.max(...local.map(q=>q[1]))+3]};});
const garden=oldI.objects.find(o=>o.type==='garden-road-boundary'&&o.part===117).polygon;
function inGarden(q){let inside=false;for(let j=0,k=garden.length-1;j<garden.length;k=j++){const a=garden[j],b=garden[k];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function inside(b){const q=[0,1].map(k=>[0,1,2].reduce((sum,j)=>sum+b.readFloatLE(j*44+k*4),0)/3);const selected=regions.some(({p,lo,hi})=>{const v=[p.u,p.v].map(v=>(q[0]-p.center[0])*v[0]+(q[1]-p.center[1])*v[1]);return v.every((n,k)=>n>=lo[k]&&n<=hi[k]);});
 // The new driveway retriangulates the existing flat garden polygon at 47.
 // This exception cannot admit walls, trees, fences or another building.
 const sameGardenGround=[0,1,2].every(j=>b.readFloatLE(j*44+8)<.20)&&inGarden(q);
 assert(selected||sameGardenGround,'Mesh changed outside selected houses/gardens: '+q);}
const old=triangles(oldI,oldRaw),now=triangles(i,raw);let removed=0,added=0,unchanged=0;
for(const [k,t]of old){const common=Math.min(t.count,now.get(k)?.count||0);unchanged+=common;if(t.count>common){inside(t.b);removed+=t.count-common;}}
for(const [k,t]of now){const delta=t.count-Math.min(t.count,old.get(k)?.count||0);if(delta){inside(t.b);added+=delta;}}
assert(raw.length<oldRaw.length*1.20,'Street details exceed the mesh budget');
function segments(raw){const out=[];for(let j=0;j<raw.length;j+=132){const hits=[];for(let k=0;k<3;k++){const a=j+k*44,b=j+(k+1)%3*44,az=raw.readFloatLE(a+8),bz=raw.readFloatLE(b+8);if((az>.65)!==(bz>.65)){const t=(.65-az)/(bz-az);hits.push([0,4].map(n=>raw.readFloatLE(a+n)+(raw.readFloatLE(b+n)-raw.readFloatLE(a+n))*t));}}if(hits.length===2)out.push(hits.flat());}return out;}
const oldSegments=segments(oldRaw),newSegments=segments(raw);let samples=0;
for(const road of i.objects.filter(o=>o.type==='road-surface')){
 const points=road.centerline.map(q=>q.map((n,k)=>(n-s.origin[k])*s.scale[k]));
 for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let k=0;k<=count;k++){const p=a.map((n,d)=>n+(b[d]-n)*k/count);samples++;assert(!blocked(p,newSegments)||blocked(p,oldSegments),'New obstacle on street: '+p);}}
}
for(const file of ['index.json','mesh.bin','survey.json'])assert.equal(walk.sourceHashes['dist/data/nerval/'+file],sha(await fs.readFile('dist/data/nerval/'+file)),'Stale FPS data');
assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('detail/')),oldWalk.nodes.filter(n=>!n[0].startsWith('detail/')),'Unrelated streaming nodes changed');
for(const [file,hash]of Object.entries(oldWalk.sourceHashes))if(!file.startsWith('dist/data/nerval/'))assert.equal(walk.sourceHashes[file],hash,'Unrelated source changed '+file);
const download=await read('dist/data/walk-downloads/index.json');assert.equal(download.sourceHash,sha(await fs.readFile('dist/data/walk/index.json')));
for(const file of ['dist/data/nerval/index.json','dist/data/nerval/mesh.bin','dist/data/nerval/survey.json','dist/data/walk/index.json','dist/data/walk-downloads/index.json',...walk.nodes.filter(n=>n[0].startsWith('detail/')).map(n=>'dist/data/walk/'+n[0])]){
 try{assert(zlib.gunzipSync(await fs.readFile(file+'.gz')).equals(await fs.readFile(file)),'Stale gzip '+file);}catch(e){if(e.code!=='ENOENT')throw e;}
}
const captures=[];for(const r of details.sources){const b=await fs.readFile(path.join(evidence,r.capture));captures.push({id:r.id,imageDate:r.imageDate,sha256:sha(b),bytes:b.length});}
const report={passed:true,modifiedParts:[...modified],originalSurveyPreserved:true,originalOpeningsPreserved:s.openings.length,redZoneGeometryPreserved:true,unchangedTriangles:unchanged,removedTriangles:removed,addedTriangles:added,oldTriangles:oldI.stats.triangles,newTriangles:i.stats.triangles,growthPercent:+((raw.length/oldRaw.length-1)*100).toFixed(2),streetSamples:samples,newStreetObstructions:0,retiredObjects,details:objects.length,captures};
await fs.writeFile(path.join(evidence,'validation-streetview.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,captures:captures.length}));
