import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
for(const file of ['dist/nerval-layer.js','dist/nerval-ui.js','scripts/build-nerval.mjs','dist/app.js'])execFileSync(process.execPath,['--check',file]);
const read=async file=>JSON.parse(await fs.readFile(`dist/data/nerval/${file}`,'utf8'));
const [index,survey,buildings]=await Promise.all(['index.json','survey.json','buildings.geojson'].map(read));
const raw=await fs.readFile('dist/data/nerval/mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
assert.equal(vertices.length,index.vertexCount*11);assert.equal(index.vertexCount%3,0);
assert.equal(new Set(index.excludeIds).size,survey.parts.length);assert.equal(buildings.features.length,survey.parts.length);
let next=0;
for(const range of index.ranges){assert.equal(range.first,next);next+=range.count;assert.equal(range.count%3,0);
 for(let v=range.first;v<next;v++){const p=vertices.slice(v*11,v*11+11);assert([...p].every(Number.isFinite));assert(Math.abs(p[0])<250&&Math.abs(p[1])<250);assert(p[2]>=0&&p[2]<16);assert(Math.abs(Math.hypot(...p.slice(3,6))-1)<.00001);if(range.material>0){assert(p[6]>=0&&p[6]<=1&&p[7]>=0&&p[7]<=1);}for(const c of p.slice(8))assert(c>=0&&c<=1);}
}
assert.equal(next,index.vertexCount);
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2);
let expectedArea=0,actualArea=0;
for(const part of survey.parts){const expected=area(part.ring),actual=index.pickTriangles.filter(t=>t.part===part.id).reduce((sum,t)=>sum+area(t.points),0);assert(Math.abs(actual-expected)<.0001,`Roof footprint mismatch: ${part.id}, ${expected}, ${actual}`);expectedArea+=expected;actualArea+=actual;}
const patches=survey.parts.flatMap(p=>p.patches);assert.equal(index.paintedPatches.length,patches.length,'Every annotated patch must be applied to its actual surface');assert.equal(new Set(index.paintedPatches).size,patches.length);
for(const patch of patches){const part=survey.parts.find(p=>p.id===patch.part);assert(part);assert(survey.photos.some(p=>Number(p.id)===patch.photo));assert(patch.uv[0]>=0&&patch.uv[0]+patch.uv[2]<=1);assert(patch.uv[1]>=0&&patch.uv[1]+patch.uv[3]<=1);}
for(const texture of index.textures)await fs.access(`dist/data/nerval/${texture}`);
for(const photo of survey.photos)await fs.access(`dist/data/nerval/references/${photo.id}.webp`);
assert.equal(survey.photos.length,28);assert(survey.photos.every(p=>/^[a-f0-9]{64}$/.test(p.sha256)));
const roofIndex=JSON.parse(await fs.readFile('dist/data/roofs/index.json','utf8'));assert.deepEqual(roofIndex.excludedDetailedBuildings,index.excludeIds);
const result={nervalChecks:'passed',parts:survey.parts.length,appliedPhotoPatches:patches.length,roofFootprintAreaM2:+actualArea.toFixed(3),areaErrorM2:Math.abs(expectedArea-actualArea),triangles:index.stats.triangles,meshMB:+(raw.length/1e6).toFixed(2),references:28};
await fs.writeFile('artifacts/nerval/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
