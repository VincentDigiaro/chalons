import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let verified;
async function checkDetailedReplacements(){
 const read=(root,file)=>fs.readFile(root+'/'+file),json=async(root,file)=>JSON.parse(await read(root,file));
 const oldRoot='artifacts/buirette/local-before',root='dist',models=await Promise.all(['buirette','parc14','camp127'].map(id=>json(root,'data/'+id+'/index.json'))),model={parts:models.flatMap(m=>m.parts)},ids=new Set(models.flatMap(m=>m.excludeIds));
 const old=await json(oldRoot,'data/roofs/index.json'),next=await json(root,'data/roofs/index.json'),a=await read(oldRoot,'data/roofs/mesh.bin'),b=await read(root,'data/roofs/mesh.bin'),sa=await read(oldRoot,'data/roofs/surface.bin'),sb=await read(root,'data/roofs/surface.bin');
 assert.deepEqual(next.excludedDetailedBuildings,[...new Set([...old.excludedDetailedBuildings,...ids])]);
 const keys=(index,raw,surface)=>{const out=new Map();for(const tile of index.tiles)for(let i=tile.first;i<tile.first+tile.count;i+=3){const key=tile.x+','+tile.y+':'+raw.subarray(i*12,(i+3)*12).toString('hex')+':'+surface.subarray(i*12,(i+3)*12).toString('hex');out.set(key,{tile,i});}return out;};
 const prev=keys(old,a,sa),current=keys(next,b,sb);for(const key of current.keys())assert(prev.has(key),'An unrelated roof triangle or its material changed');
 const n=2**old.zoom,inside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 let removed=0;for(const [key,{tile,i}]of prev){if(current.has(key))continue;removed++;const at=i*12,x=tile.x+(a.readFloatLE(at)+a.readFloatLE(at+12)+a.readFloatLE(at+24))/3,y=tile.y+(a.readFloatLE(at+4)+a.readFloatLE(at+16)+a.readFloatLE(at+28))/3,p=[x/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI];assert(model.parts.some(part=>inside(p,part.footprint)),'A roof outside the detailed replacements was removed');}assert.equal(removed,old.triangles-next.triangles);assert(removed>0);
 const oldFac=await json(oldRoot,'data/facades/index.json'),fac=await json(root,'data/facades/index.json'),assignBefore=await json(oldRoot,'data/facades/assignments.json'),assign=await json(root,'data/facades/assignments.json');
 assert.deepEqual(assign.buildings,assignBefore.buildings.filter(b=>!ids.has(b.id)),'Unrelated facade assignment changed');
 assert.deepEqual(fac.protectedIds,[...new Set([...oldFac.protectedIds,...ids])].sort());assert.deepEqual(fac.textures,oldFac.textures);assert.deepEqual(fac.overviewTextures,oldFac.overviewTextures);assert.equal(fac.sourceSha256,oldFac.sourceSha256);
 const removedFaces=assignBefore.buildings.filter(b=>ids.has(b.id)).flatMap(b=>b.faces);assert.equal(oldFac.stats.facades-fac.stats.facades,removedFaces.length);assert.equal(oldFac.stats.geometryBytes-fac.stats.geometryBytes,removedFaces.length*52);
 const oldAssignments=await json(oldRoot,'data/roofs/assignments.json'),newAssignments=await json(root,'data/roofs/assignments.json');assert.deepEqual(newAssignments.buildings,oldAssignments.buildings.filter(b=>!ids.has(b.id)).map(b=>{if(!ids.has(b.sharedRoofWith))return b;const c={...b};delete c.sharedRoofWith;return c;}));
 return {removedRoofTriangles:removed,removedFacadeRecords:removedFaces.length};
}
// Historical preservation snapshots remain valid for every unrelated asset.
// For replaced Buirette and Parc14 generic surfaces, validate exact removal
// within their OSM footprints, retaining all other triangles and assignments.
export async function assertPreserved(file,expected){
 const raw=await fs.readFile(file);if(sha(raw)===expected)return;
 const allowed=['dist/data/roofs/mesh.bin','dist/data/roofs/index.json','dist/data/facades/index.json'];
 assert(allowed.includes(file),'Protected asset changed: '+file);
 const old=await fs.readFile('artifacts/buirette/local-before/'+file.replace(/^dist\//,''));assert.equal(sha(old),expected,'Wrong baseline for '+file);
 verified??=checkDetailedReplacements();await verified;
}
