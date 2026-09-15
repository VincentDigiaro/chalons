import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {blocked,toLocal,inRange,stepPlayer} from '../dist/walk-core.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>fs.readFile('dist/'+f),json=async f=>JSON.parse(await read(f));
const index=await json('data/buirette/index.json'),survey=await json('data/buirette/survey.json'),raw=await read('data/buirette/mesh.bin'),walk=await json('data/walk/index.json');
assert.equal(index.parts.length,8);assert.equal(index.stats.mainBuildings,6);assert.equal(raw.length,index.vertexCount*44);assert.equal(survey.openings.length,43);
assert.deepEqual(index.parts.filter(p=>p.address).map(p=>p.address),['12','14','16','17','19','15']);assert(index.parts.filter(p=>!p.address).every(p=>p.confidence.includes('non confirmée')));
const v=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);for(let i=0;i<v.length;i+=11){assert([...v.subarray(i,i+11)].every(Number.isFinite));assert(Math.abs(Math.hypot(...v.subarray(i+3,i+6))-1)<1e-5);assert(v[i+2]>=-.001&&v[i+2]<12);}
for(const r of survey.roofAreas)assert(Math.abs(r.footprint-r.roofProjected)<1e-5,'Roof footprint '+r.id);
for(const id of [12,14])assert(survey.openings.some(o=>o.part===id&&o.kind==='door'));
assert.equal(survey.openings.filter(o=>o.part===14&&o.kind==='window').length,4);assert.equal(survey.openings.filter(o=>o.part===16&&o.side==='bay').length,6);
assert(survey.details.some(o=>o.type==='blue-gate'));assert(survey.openings.every(o=>o.depth>=.13));
for(const r of survey.references){assert.equal(r.image_date,r.role==='historical-context'?'2017-10':'2024-07');assert.equal(sha(await read('data/buirette/'+r.file)),r.sha256);}
const roofs=await json('data/roofs/index.json'),fac=await json('data/facades/index.json');for(const id of index.excludeIds){assert(roofs.excludedDetailedBuildings.includes(id));assert(fac.protectedIds.includes(id));assert(!walk.nodes.some(n=>n[0].endsWith('/'+id.replace('/','-')+'.bin')));}
const original=[],fps=[],segments=[],spawn=toLocal([4.375918,48.961350]);
for(const range of index.ranges)for(let first=range.first;first<range.first+range.count;first+=3){const t=v.slice(first*11,(first+3)*11);for(let k=0;k<33;k+=11){const q=toLocal([index.origin[0]+t[k]/index.scale[0],index.origin[1]+t[k+1]/index.scale[1]]);t[k]=q[0];t[k+1]=q[1];}original.push((walk.attilaBase+range.material)+':'+sha(Buffer.from(t.buffer)));}
for(const [file,...bounds]of walk.nodes){if(!inRange(bounds,spawn))continue;const b=await read('data/walk/'+file),h=b.readUInt32LE(0),header=JSON.parse(b.toString('utf8',4,4+h));segments.push(...header.segments);if(!file.startsWith('buirette/'))continue;for(const [m,start,count]of header.ranges)for(let i=start;i<start+count;i+=3)fps.push(m+':'+sha(b.subarray(4+h+i*44,4+h+(i+3)*44)));}
assert.deepEqual(fps.sort(),original.sort(),'Map/FPS triangles differ');assert(!blocked(spawn,segments),'Spawn obstructed');
const south=toLocal([4.376025,48.961160]),north=toLocal([4.375751,48.961470]);for(let k=0;k<=80;k++){const p=south.map((x,i)=>x+(north[i]-x)*k/80);assert(!blocked(p,segments),'Public street obstructed '+k);}
for(const p of index.parts.filter(p=>p.address)){const front=p.front.map(toLocal),mid=front[0].map((a,i)=>(a+front[1][i])/2),n=p.frame.v.map(x=>-x),start=mid.map((x,i)=>x+n[i]*1),end=stepPlayer(start,-n[0]*2,-n[1]*2,segments);assert(-(end[0]-start[0])*n[0]-(end[1]-start[1])*n[1]<1.05,'Wall plane must block the player (lateral sliding allowed) '+p.id);}
for(const d of survey.details.filter(d=>d.type==='blue-fence'||d.type==='blue-gate')){const mid=d.a.map((v,i)=>(v+d.b[i])/2),q=toLocal(mid.map((v,i)=>index.origin[i]+v/index.scale[i]));assert(blocked(q,segments,.15),'Fence or gate must block the player');}
const baseline=JSON.parse(await fs.readFile('artifacts/buirette/baseline.json'));for(const file of ['data/nerval/index.json','data/nerval/mesh.bin','data/attila/index.json','data/attila/mesh.bin'])assert.equal(sha(await read(file)),baseline.dist[file],'Unrelated model changed '+file);
const before=JSON.parse(await fs.readFile('artifacts/buirette/local-before/data/walk/index.json'));assert.deepEqual(walk.materials,before.materials,'Material indices changed');assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('buirette/')),before.nodes.filter(n=>!index.excludeIds.some(id=>n[0].endsWith('/'+id.replace('/','-')+'.bin'))));
const report={checks:'passed',buildings:6,annexes:2,openings:survey.openings.length,triangles:index.stats.triangles,referenceDate:'2024-07',mapFpsIdentical:true,streetSamples:81,spawnClear:true,existingModelsPreserved:true};await fs.writeFile('artifacts/buirette/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
