import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {collisionGeometry,advancePlayer} from '../dist/walk-physics.js';
const root='dist/data/buirette',index=JSON.parse(await fs.readFile(root+'/index.json')),survey=JSON.parse(await fs.readFile(root+'/survey.json')),raw=await fs.readFile(root+'/mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const beforeRoot='artifacts/buirette-17-19/local-before/data/buirette',old=JSON.parse(await fs.readFile(beforeRoot+'/index.json')),oldRaw=await fs.readFile(beforeRoot+'/mesh.bin');
function triangles(index,raw,parts){const out=[];for(const r of index.objectRanges.filter(r=>parts.has(r.part)))for(let i=r.first;i<r.first+r.count;i+=3)out.push(r.part+':'+r.material+':'+hash(raw.subarray(i*44,(i+3)*44)));return out.sort();}
const oldParts=new Set(old.objectRanges.map(r=>r.part));assert.deepEqual(triangles(index,raw,oldParts),triangles(old,oldRaw,oldParts),'Previously modelled houses or site geometry changed');
assert.deepEqual(index.excludeIds.filter(id=>!old.excludeIds.includes(id)),['way/156698545','way/156691929','way/156701424']);
const scene=collisionGeometry(vertices),reports=[];
for(const number of [17,19]){
 const p=index.parts.find(p=>p.id===number),step=survey.details.find(d=>d.type==='single-shell-threshold'&&d.part===number);assert(p&&step);
 const ranges=index.objectRanges.filter(r=>r.part===number+'-threshold'),unique=new Set();let triangleCount=0;
 for(const r of ranges)for(let i=r.first;i<r.first+r.count;i+=3){const points=[0,1,2].map(k=>Array.from(vertices.subarray((i+k)*11,(i+k)*11+3)).map(x=>x.toFixed(5)).join(',')),key=points.sort().join(';');assert(!unique.has(key),'Duplicate threshold triangle');unique.add(key);triangleCount++;}
 assert(triangleCount>10);
 const {A,u,v}=step.frame,W=(x,y)=>A.map((n,i)=>n+u[i]*x+v[i]*y);
 let body={position:W(step.x,-.95),feet:.027,verticalSpeed:0,grounded:true};
 for(let i=0;i<80;i++)body=advancePlayer(body,v[0]*.022,v[1]*.022,1/60,scene);
 assert(Math.abs(body.feet-step.doorBottom)<.012,'Threshold must be walkable: '+number+' feet='+body.feet);
 const heights=[];for(let i=0;i<120;i++){body=advancePlayer(body,0,0,1/60,scene);heights.push(body.feet);}
 assert(Math.max(...heights)-Math.min(...heights)<1e-5,'Standing on the threshold must remain stable');
 const inward=(body.position[0]-A[0])*v[0]+(body.position[1]-A[1])*v[1];assert(inward<.06,'Closed door must block entry');
 for(let i=0;i<55;i++)body=advancePlayer(body,-v[0]*.025,-v[1]*.025,1/60,scene);
 assert(Math.abs(body.feet-.027)<.015,'Player must return to the pavement');
 assert(survey.details.some(d=>d.type==='enamel-number'&&d.text===String(number)));
 reports.push({house:number,thresholdTriangles:triangleCount,stableStanding:true,doorBlocks:true,returnToPavement:true});
}
assert(survey.details.some(d=>d.type==='door-canopy'&&d.part===17));
assert.equal(survey.openings.filter(o=>o.part===19&&o.kind==='garage').length,2);
assert.equal(survey.openings.filter(o=>o.part===19&&o.side==='gable').length,2);
for(const r of survey.references.filter(r=>r.anchor)){assert.equal(hash(await fs.readFile(root+'/'+r.file)),r.sha256);if(r.role!=='historical-context')assert.equal(r.image_date,'2024-07');}
const report={passed:true,previousBuiretteGeometryPreserved:true,originalOddFootprintsAndHouse15:true,checks:reports};await fs.writeFile('artifacts/buirette-17-19/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
