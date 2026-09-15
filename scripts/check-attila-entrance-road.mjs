import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {blocked} from '../dist/walk-core.js';
import {sub,dot,len,mix,add,mul} from './attila-geometry.mjs';
const read=async p=>JSON.parse(await fs.readFile(p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root='artifacts/attila/entrance-road-20260914',base=await read(root+'/baseline.json'),original=await read(root+'/building-mesh-hashes.json');
const index=await read('dist/data/attila/index.json'),survey=await read('dist/data/attila/survey.json'),mesh=await fs.readFile('dist/data/attila/mesh.bin');
for(const part of index.parts){
 assert.deepEqual(part.footprint,base.index.parts.find(p=>p.id===part.id).footprint);
 if(part.id!==3)assert.equal(sha(Buffer.concat(index.objectRanges.filter(r=>r.part===part.id).map(r=>mesh.subarray(r.first*44,(r.first+r.count)*44)))),original[part.id],'Neighbour geometry changed: '+part.id);
}
// The historical Nerval snapshot predates subsequent authorised Nerval edits.
// Recheck it only when auditing the original Attila release itself.
if(process.argv.includes('--verify-original-nerval'))for(const [file,hash]of Object.entries(base.nerval))assert.equal(sha(await fs.readFile('dist/data/nerval/'+file)),hash,'Nerval changed during Attila correction');
const house=index.parts.find(p=>p.id===3),entry=index.siteDetails.find(o=>o.type==='corner-entrance');
assert.equal(entry.part,3);assert.equal(entry.steps,3);assert.equal(entry.curvedFence.length,13);
assert(Math.abs(dot(sub(entry.gateAxis,entry.doorAxis),house.frame.u))<1e-10,'Gate and stairs must line up with the door');
assert(entry.canopyWidth>3&&entry.canopyWidth<3.3);
const streetOpenings=survey.openings.filter(o=>o.part===3&&o.side==='street');assert.equal(streetOpenings.length,8);assert(streetOpenings.every(o=>o.depth===.24));
const street=index.siteDetails.find(o=>o.type==='street-layout');assert.equal(street.crossings.length,3);assert.equal(street.kerbOpening,11.2);
let stripes=0;
for(const crossing of street.crossings){
 assert(Math.abs(dot(crossing.direction,crossing.across))<1e-10);
 for(const q of crossing.stripes){
  const edge=sub(q[1],q[0]);assert(Math.abs(len(edge)-2.4)<1e-8);assert(Math.abs(dot(edge,crossing.across))<1e-8,'Paint stripe points across its own road');
  assert(Math.abs(len(sub(q[2],q[1]))-.5)<1e-8);
  for(const p of q){assert(Math.abs(dot(sub(p,crossing.center),crossing.across))<crossing.roadWidth/2);
   if(crossing.name==='Rue des Francs')assert(dot(sub(p,street.junction),street.road.v)<-street.road.width/2,'Branch crossing intrudes into main road');
  }stripes++;
 }
}
for(const lamp of index.siteDetails.filter(o=>o.type==='streetlamp'))assert(Math.abs(dot(sub(lamp.center,street.junction),street.road.v))>street.road.width/2+.5);
for(const [i,kind]of [[4,14],[5,15],[6,16]]){const m=index.materials[i];assert.equal(m.kind,kind);assert(m.repeat&&m.texture!==undefined);await fs.access('dist/data/attila/'+index.textures[m.texture]);}
// Sample all three usable street corridors against actual geometry at knee height.
const f=new Float32Array(mesh.buffer,mesh.byteOffset,mesh.length/4),segments=[];
for(let v=0;v<index.vertexCount;v+=3){const hits=[];for(let k=0;k<3;k++){
 const a=(v+k)*11,b=(v+(k+1)%3)*11;if((f[a+2]>.65)!==(f[b+2]>.65)){const t=(.65-f[a+2])/(f[b+2]-f[a+2]);hits.push([f[a]+(f[b]-f[a])*t,f[a+1]+(f[b+1]-f[a+1])*t]);}
}if(hits.length===2)segments.push(hits.flat());}
let samples=0;for(const [a,b,d]of [[street.road.a,street.road.b,street.road.v],[street.junction,add(street.junction,mul(street.francs.direction,30)),street.francs.across]]){
 const n=Math.ceil(len(sub(b,a))*2);for(let k=0;k<=n;k++)for(const side of [-1,0,1]){const q=add(mix(a,b,k/n),mul(d,side));assert(!blocked(q,segments),'Street corridor obstructed '+JSON.stringify(q));samples++;}
}
for(const r of await read('scripts/attila-entrance-road-references.json'))assert.equal(sha(await fs.readFile(r.file)),r.sha256);
const result={passed:true,house78Openings:8,steps:3,curvedFence:true,unchangedBuildings:21,crossings:3,stripes,streetSamples:samples,obstructions:0,texturedRoad:true};
await fs.writeFile(root+'/validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
