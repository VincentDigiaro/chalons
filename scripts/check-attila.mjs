import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {toLocal,blocked,inRange} from '../dist/walk-core.js';
import {detailedBuildingIds} from './detailed-buildings.mjs';
const dir='dist/data/attila',index=JSON.parse(await fs.readFile(dir+'/index.json','utf8')),survey=JSON.parse(await fs.readFile(dir+'/survey.json','utf8')),raw=await fs.readFile(dir+'/mesh.bin');
const mesh=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(raw.length,index.vertexCount*44);assert.equal(index.parts.length,22);assert.equal(index.stats.mainBuildings,15);assert.equal(new Set(index.excludeIds).size,22);
for(let i=0;i<mesh.length;i+=11){assert([...mesh.subarray(i,i+11)].every(Number.isFinite));assert(Math.abs(mesh[i])<150&&Math.abs(mesh[i+1])<100&&mesh[i+2]>=-.2&&mesh[i+2]<12);assert(Math.abs(Math.hypot(...mesh.subarray(i+3,i+6))-1)<1e-5);}
let first=0;for(const r of index.ranges){assert.equal(r.first,first);assert.equal(r.count%3,0);assert(index.materials[r.material]);first+=r.count;}assert.equal(first,index.vertexCount);
const projected=(a,b,c)=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
let maxAreaError=0;
for(const p of index.parts){let area=0;for(const r of index.objectRanges.filter(r=>r.part===p.id&&r.material===1))for(let i=r.first;i<r.first+r.count;i+=3)area+=projected(...[0,1,2].map(k=>[mesh[(i+k)*11],mesh[(i+k)*11+1]]));const expected=survey.roofAreas.find(a=>a.id===p.id).footprint;maxAreaError=Math.max(maxAreaError,Math.abs(area-expected));assert(Math.abs(area-expected)<.00025,`Roof footprint mismatch ${p.id}`);}
// Observed entrances and windows must survive intermediate OSM nodes and setbacks.
for(const id of [16,7,9,3,18,26,31,34,20,15,30,28])assert(survey.openings.some(o=>o.part===id&&o.side==='street'&&o.kind==='door'),`Missing observed door ${id}`);
assert.equal(survey.openings.filter(o=>o.part===31&&o.side==='street').length,5);
assert.equal(survey.openings.filter(o=>o.part===29&&o.side==='street').length,2);
for(const id of [16,7,9,3])assert(survey.openings.filter(o=>o.part===id&&o.side==='rear').length>=5);
const references=JSON.parse(await fs.readFile(dir+'/references.json','utf8'));assert.equal(references.length,18);
for(const p of references){assert.equal(sha(await fs.readFile(dir+'/'+p.file)),p.sha256);if(p.latitude){assert(p.latitude>48.9648&&p.latitude<48.9655&&p.longitude>4.372&&p.longitude<4.3734);assert(p.url.includes(p.panoId));assert(p.heading>=0&&p.heading<360);}}
assert.equal(references.filter(p=>p.latitude).length,14);assert.equal(references.find(p=>p.id.startsWith('14')).imageryDate,'2022-07');
const ids=await detailedBuildingIds(),roofs=JSON.parse(await fs.readFile('dist/data/roofs/index.json','utf8')),facades=JSON.parse(await fs.readFile('dist/data/facades/index.json','utf8'));assert.deepEqual(roofs.excludedDetailedBuildings,ids);assert.deepEqual(facades.protectedIds,[...ids].sort());
const walk=JSON.parse(await fs.readFile('dist/data/walk/index.json','utf8')),original=[],pedestrian=[],spawn=toLocal([4.372708,48.9651469]),segments=[];let attilaNodes=0;
for(const r of index.ranges)for(let i=r.first;i<r.first+r.count;i+=3){const v=mesh.slice(i*11,(i+3)*11);for(let j=0;j<33;j+=11){const q=toLocal([index.origin[0]+v[j]/index.scale[0],index.origin[1]+v[j+1]/index.scale[1]]);v[j]=q[0];v[j+1]=q[1];}original.push((walk.attilaBase+r.material)+':'+sha(Buffer.from(v.buffer)));}
for(const [file,...bounds]of walk.nodes){if(!inRange(bounds,spawn))continue;const bytes=await fs.readFile('dist/data/walk/'+file),len=bytes.readUInt32LE(0),header=JSON.parse(bytes.toString('utf8',4,len+4));segments.push(...header.segments);if(!file.startsWith('attila/'))continue;attilaNodes++;const data=bytes.subarray(4+len);for(const [m,start,count]of header.ranges)for(let i=start;i<start+count;i+=3)pedestrian.push(m+':'+sha(data.subarray(i*44,(i+3)*44)));}
assert.deepEqual(pedestrian.sort(),original.sort(),'Map and pedestrian Attila geometry differ');assert(!blocked(spawn,segments),'Attila spawn is obstructed');
const glb=await fs.readFile(dir+'/camp-attila.glb');assert.equal(glb.toString('ascii',0,4),'glTF');assert.equal(glb.readUInt32LE(8),glb.length);const gltf=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));assert.equal(gltf.meshes.length,23);assert(gltf.meshes.every(m=>m.primitives.every(p=>p.attributes.COLOR_0!==undefined)));assert.equal(gltf.images.length,index.textures.length);
const report={checks:'passed',buildingParts:index.parts.length,mainBuildings:index.stats.mainBuildings,openings:survey.openings.length,streetViewCaptures:14,userImages:4,triangles:index.stats.triangles,maxRoofAreaErrorM2:maxAreaError,attilaPedestrianNodes:attilaNodes,pedestrianTrianglesPreserved:pedestrian.length,spawnClear:true,glbObjects:gltf.meshes.length,dimensions:'estimated',limit90:'imprecise Maps pin; 92/94 explicitly marked context'};
await fs.writeFile('artifacts/attila/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
