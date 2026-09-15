import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const [beforeRoot,afterRoot]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(beforeRoot&&afterRoot,'Usage: check-nerval-catalogue.mjs original output');
const read=(root,p)=>fs.readFile(path.join(root,p)),json=async(root,p)=>JSON.parse(await read(root,p));
const [before,after,survey]=await Promise.all([json(beforeRoot,'data/nerval/index.json'),json(afterRoot,'data/nerval/index.json'),json(beforeRoot,'data/nerval/survey.json')]);
const [oldMesh,newMesh]=await Promise.all([read(beforeRoot,'data/nerval/mesh.bin'),read(afterRoot,'data/nerval/mesh.bin')]);
const c=after.cityFacadeCatalogue;assert(c);assert.deepEqual(before.pickTriangles,after.pickTriangles);assert.deepEqual(before.objects,after.objects);assert.deepEqual(before.excludeIds,after.excludeIds);
assert.deepEqual(before.materials,after.materials.slice(0,c.baseMaterialCount));
assert.deepEqual(c.protectedParts,[...new Set([...survey.focusParts,...(survey.roundabout?.parts||[]),...survey.parts.filter(p=>p.focus).map(p=>p.id)])].sort((a,b)=>a-b));
assert.equal(after.paintedPatches.length,0);assert.deepEqual(after.retiredPhotoPatches,before.paintedPatches);
const photo=m=>m.texture!==undefined&&/^facades-\d+\.webp$/.test(before.textures[m.texture]);
const geometry=bytes=>Buffer.concat([0,1,2].map(i=>bytes.subarray(i*44,i*44+24)));
const oldFull=new Map(),oldGeometry=new Map();let oldPhotos=0;
function increment(map,key,delta=1){map.set(key,(map.get(key)||0)+delta);}
for(const r of before.ranges)for(let v=r.first;v<r.first+r.count;v+=3){const b=oldMesh.subarray(v*44,(v+3)*44);if(photo(before.materials[r.material])){oldPhotos+=3;continue;}increment(oldFull,r.material+':'+sha(b));increment(oldGeometry,sha(geometry(b)));}
let remapped=0;
for(const r of after.ranges)for(let v=r.first;v<r.first+r.count;v+=3){const b=newMesh.subarray(v*44,(v+3)*44),m=after.materials[r.material];assert(!photo(m),'Photo collage still rendered');increment(oldGeometry,sha(geometry(b)),-1);if(m.catalogueIndex===undefined){const k=r.material+':'+sha(b);assert(oldFull.get(k)>0,'A retained triangle changed');increment(oldFull,k,-1);}else{assert(m.kind===11&&m.repeat);assert(m.catalogueIndex>=0&&m.catalogueIndex<48);remapped+=3;}}
assert([...oldGeometry.values()].every(n=>n===0),'A building shape, tree, fence, road or modeled detail changed');
assert.equal(remapped,c.retexturedVertices);assert.equal(oldPhotos,c.removedPhotoVertices);
assert.equal(newMesh.length/44,before.vertexCount-oldPhotos);
assert.equal([...oldFull.values()].reduce((s,n)=>s+n,0)*3,remapped);
// Explicitly prove every protected building triangle retains all 11 vertex fields.
const keys=new Set(before.pickTriangles.filter(t=>c.protectedParts.includes(t.part)).map(t=>t.points.flat().map(Math.fround).join(',')));
for(const r of before.ranges)for(let v=r.first;v<r.first+r.count;v+=3){const b=oldMesh.subarray(v*44,(v+3)*44),p=[0,1,2].flatMap(i=>[0,1,2].map(j=>b.readFloatLE(i*44+j*4))).join(',');if(keys.has(p))assert.equal(oldFull.get(r.material+':'+sha(b)),0,'Protected building retextured');}
const [walkBefore,walkAfter]=await Promise.all([json(beforeRoot,'data/walk/index.json'),json(afterRoot,'data/walk/index.json')]);
assert.deepEqual(walkBefore.materials,walkAfter.materials);assert.equal(walkBefore.facadeBase,walkAfter.facadeBase);assert.equal(walkBefore.roofBase,walkAfter.roofBase);
assert.deepEqual(walkBefore.nodes.filter(n=>!n[0].startsWith('detail/')),walkAfter.nodes.filter(n=>!n[0].startsWith('detail/')));
const expected=[],actual=[];
for(const r of after.ranges){const m=after.materials[r.material],id=m.catalogueIndex===undefined?r.material:walkAfter.facadeBase+m.catalogueIndex;for(let v=r.first;v<r.first+r.count;v+=3)expected.push(id+':'+sha(newMesh.subarray(v*44,(v+3)*44)));}
for(const n of walkAfter.nodes.filter(n=>n[0].startsWith('detail/'))){let raw;try{raw=await read(afterRoot,'data/walk/'+n[0]);}catch(e){if(e.code!=='ENOENT')throw e;raw=await read(beforeRoot,'data/walk/'+n[0]);}const h=raw.readUInt32LE(0),header=JSON.parse(raw.toString('utf8',4,4+h)),mesh=raw.subarray(4+h);for(const [id,first,count] of header.ranges)for(let v=first;v<first+count;v+=3)actual.push(id+':'+sha(mesh.subarray(v*44,(v+3)*44)));}
assert.deepEqual(actual.sort(),expected.sort(),'Map and FPS differ');
console.log(JSON.stringify({preservation:'passed',protectedParts:c.protectedParts.length,unchangedShapes:true,unchangedDetailedMaterials:true,unchangedObjects:after.objects.length,cityFacadeParts:c.parts.length,cityFacadeFaces:c.assignments.length,removedPhotoTriangles:oldPhotos/3,mapAndFpsMatch:true,genericAndAttilaPacketsUnchanged:true}));
