import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import {blocked} from '../dist/walk-core.js';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const evidence=(await fs.readFile('artifacts/nerval-earth-current.txt','utf8')).trim();
const before=path.join(evidence,'backup/dist/data/nerval');
const [s,i,oldS,oldI,raw,oldRaw]=await Promise.all([read('dist/data/nerval/survey.json'),read('dist/data/nerval/index.json'),read(before+'/survey.json'),read(before+'/index.json'),fs.readFile('dist/data/nerval/mesh.bin'),fs.readFile(before+'/mesh.bin')]);
for(const key of Object.keys(oldS))assert.deepEqual(s[key],oldS[key],`Previous survey changed: ${key}`);
const modified=new Set(s.earthSurvey.scope.modifiedParts),excluded=s.parts.filter(p=>p.id<=59).map(p=>p.id);
assert([...modified].every(id=>id>59&&!s.focusParts.includes(id)));
assert.deepEqual(i.pickTriangles.filter(t=>!modified.has(t.part)),oldI.pickTriangles.filter(t=>!modified.has(t.part)),'Geometry changed outside selected southern houses');
const objects=new Set(i.objects.map(o=>JSON.stringify(o)));
for(const o of oldI.objects)assert(objects.has(JSON.stringify(o)),`Lost earlier object: ${o.type}`);
const references=new Set(s.earthSurvey.sources.map(r=>r.id)),details=i.objects.filter(o=>o.type.startsWith('earth-'));
for(const o of details){assert(references.has(o.reference));assert(modified.has(o.part));}
assert.equal(details.filter(o=>o.type==='earth-opening').length,s.earthSurvey.openings.length);
assert.equal(details.filter(o=>o.type==='earth-rooflight').length,s.earthSurvey.rooflights.length);
assert.equal(details.filter(o=>o.type==='earth-chimney').length,1);
assert.equal(details.filter(o=>o.type==='earth-canopy').length,2);
for(const c of s.earthSurvey.canopies){const p=s.parts.find(p=>p.id===c.part);assert(i.pickTriangles.filter(t=>t.part===c.part).every(t=>t.points.every(q=>q[2]>=p.eaves-.001)),'A solid porch wall hides a garage');}
for(const d of details.filter(o=>o.type==='earth-rooflight')){
 const p=s.parts.find(p=>p.id===d.part),[lo,hi]=p.bounds;
 for(const q of d.corners){const local=[p.u,p.v].map(v=>v[0]*(q[0]-p.center[0])+v[1]*(q[1]-p.center[1]));assert(local[0]>lo[0]&&local[0]<hi[0]&&local[1]>lo[1]&&local[1]<(lo[1]+hi[1])/2);const roof=p.eaves+p.rise*(local[1]-lo[1])/((hi[1]-lo[1])/2);assert(Math.abs(q[2]-roof-.060)<1e-6,'Rooflight must follow roof slope');}
}
// Compare actual triangle bytes and resolved materials, ignoring range offsets.
// Every difference must lie within one of the authorized southern building bounds.
const boxes=s.parts.filter(p=>modified.has(p.id)).map(p=>[Math.min(...p.ring.map(q=>q[0]))-1,Math.min(...p.ring.map(q=>q[1]))-1,Math.max(...p.ring.map(q=>q[0]))+1,Math.max(...p.ring.map(q=>q[1]))+1]);
function triangles(index,bytes){const out=new Map();for(const r of index.ranges){const m={...index.materials[r.material]};if(m.texture!==undefined)m.texture=index.textures[m.texture];const material=JSON.stringify(m);for(let j=r.first;j<r.first+r.count;j+=3){const b=bytes.subarray(j*44,(j+3)*44),key=sha(Buffer.concat([Buffer.from(material),b]));if(!out.has(key))out.set(key,{count:0,b});out.get(key).count++;}}return out;}
const oldTriangles=triangles(oldI,oldRaw),newTriangles=triangles(i,raw);
let removed=0,added=0,unchanged=0;
for(const [key,t]of oldTriangles){const common=Math.min(t.count,newTriangles.get(key)?.count||0);unchanged+=common;const difference=t.count-common;if(difference){checkPosition(t.b);removed+=difference;}}
for(const [key,t]of newTriangles){const difference=t.count-Math.min(t.count,oldTriangles.get(key)?.count||0);if(difference){checkPosition(t.b);added+=difference;}}
function checkPosition(b){const q=[0,1].map(k=>[0,1,2].reduce((sum,j)=>sum+b.readFloatLE(j*44+k*4),0)/3);assert(boxes.some(v=>q[0]>=v[0]&&q[0]<=v[2]&&q[1]>=v[1]&&q[1]<=v[3]),'Changed triangle outside authorized buildings: '+q);}
assert(i.vertexCount/oldI.vertexCount<1.10,'Geometry growth exceeds ten percent');
function segments(bytes){const f=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4),out=[];for(let j=0;j<f.length;j+=33){const hits=[];for(let k=0;k<3;k++){const a=j+k*11,b=j+(k+1)%3*11;if((f[a+2]>.65)!==(f[b+2]>.65)){const t=(.65-f[a+2])/(f[b+2]-f[a+2]);hits.push([f[a]+(f[b]-f[a])*t,f[a+1]+(f[b+1]-f[a+1])*t]);}}if(hits.length===2)out.push(hits.flat());}return out;}
const walk=await read('dist/data/walk/index.json');
for(const file of ['index.json','mesh.bin','survey.json'])assert.equal(sha(await fs.readFile('dist/data/nerval/'+file)),walk.sourceHashes['dist/data/nerval/'+file],'Stale FPS copy of '+file);
assert.equal(walk.stats.detailedVertices,i.vertexCount);
const oldWalk=await read(path.join(evidence,'backup/dist/data/walk/index.json'));
assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('detail/')),oldWalk.nodes.filter(n=>!n[0].startsWith('detail/')),'Unrelated walk nodes changed');
const oldSegments=segments(oldRaw),newSegments=segments(raw);let samples=0,preexisting=0;
for(const road of i.objects.filter(o=>o.type==='road-surface')){
 const points=road.centerline.map(q=>q.map((x,k)=>(x-s.origin[k])*s.scale[k]));
 for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);for(let k=0;k<=steps;k++){const q=a.map((x,d)=>x+(b[d]-x)*k/steps),was=blocked(q,oldSegments);samples++;if(was)preexisting++;assert(!blocked(q,newSegments)||was,'New street obstruction at '+q);}}
}
const captures=[];
for(const source of s.earthSurvey.sources){const bytes=await fs.readFile(path.join(evidence,source.capture));captures.push({id:source.id,capture:source.capture,sha256:sha(bytes),bytes:bytes.length});}
const report={passed:true,scope:'Only southern houses outside the user red rectangle',excludedPartsPreserved:excluded,modifiedParts:[...modified],previousSurveyPreserved:true,previousOpeningsPreserved:s.openings.length,previousObjectsPreserved:oldI.objects.length,openings:s.earthSurvey.openings.length,rooflights:s.earthSurvey.rooflights.length,chimneys:1,canopies:2,unchangedTriangles:unchanged,removedTriangles:removed,addedTriangles:added,allMeshChangesConfinedToAuthorizedBuildings:true,streetSamples:samples,preexistingBlockedSamples:preexisting,newBlockedSamples:0,oldTriangles:oldI.stats.triangles,newTriangles:i.stats.triangles,meshGrowthPercent:+((raw.length/oldRaw.length-1)*100).toFixed(2),captures};
await fs.writeFile(path.join(evidence,'validation-earth.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
