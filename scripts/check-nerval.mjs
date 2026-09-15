import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
for(const file of ['dist/nerval-layer.js','dist/nerval-ui.js','dist/nerval-ground-materials.js','dist/nerval-house-materials.js','scripts/build-nerval.mjs','scripts/build-nerval-end-site.mjs','scripts/build-nerval-house42.mjs','scripts/build-nerval-house42-rear.mjs','scripts/nerval-landscape.mjs','dist/app.js'])execFileSync(process.execPath,['--check',file]);
const read=async file=>JSON.parse(await fs.readFile(`dist/data/nerval/${file}`,'utf8'));
const [index,survey,buildings]=await Promise.all(['index.json','survey.json','buildings.geojson'].map(read));
const raw=await fs.readFile('dist/data/nerval/mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
assert.equal(vertices.length,index.vertexCount*11);assert.equal(index.vertexCount%3,0);
assert.equal(new Set(index.excludeIds).size,survey.parts.length);assert.equal(buildings.features.length,survey.parts.length);
let next=0;
for(const range of index.ranges){assert.equal(range.first,next);next+=range.count;assert.equal(range.count%3,0);const mat=index.materials[range.material];assert(mat);
 for(let v=range.first;v<next;v++){const p=vertices.slice(v*11,v*11+11);assert([...p].every(Number.isFinite));assert(Math.abs(p[0])<250&&Math.abs(p[1])<250);assert(p[2]>=0&&p[2]<16);assert(Math.abs(Math.hypot(...p.slice(3,6))-1)<.00001);if(mat.texture!==undefined&&!mat.repeat){assert(p[6]>=0&&p[6]<=1&&p[7]>=0&&p[7]<=1);}else assert(Math.abs(p[6])<200&&Math.abs(p[7])<200);for(const c of p.slice(8))assert(c>=0&&c<=1);}
}
assert.equal(next,index.vertexCount);
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2);
let expectedArea=0,actualArea=0;
for(const part of survey.parts){const expected=area(part.ring),actual=index.pickTriangles.filter(t=>t.part===part.id).reduce((sum,t)=>sum+area(t.points),0);assert(Math.abs(actual-expected)<.0001,`Roof footprint mismatch: ${part.id}, ${expected}, ${actual}`);expectedArea+=expected;actualArea+=actual;}
const patches=survey.parts.flatMap(p=>p.patches);
if(index.cityFacadeCatalogue){assert.equal(index.paintedPatches.length,0,'No photo collage remains');assert.equal(new Set(index.retiredPhotoPatches).size,patches.length);assert.deepEqual([...index.retiredPhotoPatches].sort(),patches.map(p=>p.id).sort());assert(index.cityFacadeCatalogue.parts.every(id=>!survey.focusParts.includes(id)));}
else {assert.equal(index.paintedPatches.length,patches.length,'Every annotated patch must be applied to its actual surface');assert.equal(new Set(index.paintedPatches).size,patches.length);}
for(const patch of patches){const part=survey.parts.find(p=>p.id===patch.part);assert(part);assert(survey.photos.some(p=>Number(p.id)===patch.photo));assert(patch.uv[0]>=0&&patch.uv[0]+patch.uv[2]<=1);assert(patch.uv[1]>=0&&patch.uv[1]+patch.uv[3]<=1);}
for(const texture of index.textures)await fs.access(`dist/data/nerval/${texture}`);
for(const photo of survey.photos)await fs.access(`dist/data/nerval/references/${photo.id}.webp`);
assert.equal(survey.photos.length,28);assert(survey.photos.every(p=>/^[a-f0-9]{64}$/.test(p.sha256)));
const roofIndex=JSON.parse(await fs.readFile('dist/data/roofs/index.json','utf8'));assert.deepEqual(roofIndex.excludedDetailedBuildings,await (await import('./detailed-buildings.mjs')).detailedBuildingIds());
const preservedKeys=['ring','bounds','u','v','center','eaves','rise','roof','color','photos'];
const cleanPatch=p=>Object.fromEntries(['part','photo','quad','height','bottom','side','span','depth','mask','note'].map(k=>[k,p[k]]));
// These 64 parts were compared field by field with the previous model before
// recording this signature. The check is portable and does not require Git.
const preserved=survey.parts.filter(p=>!p.focus).map(p=>({id:p.id,...Object.fromEntries(preservedKeys.map(k=>[k,p[k]])),patches:p.patches.map(cleanPatch)}));
assert.equal(preserved.length,64);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(preserved)).digest('hex'),'ec5582b2c99a6b95929d8b20b587cee6eebf853c65a79662c724585ae100dc74','The model outside the selected area changed');
assert.equal(survey.focusParts.filter(id=>id<200).length,37);assert.deepEqual(survey.focusParts.filter(id=>id>=200),[201,202,203,204,205,206,207,208]);assert.equal(survey.parts.find(p=>p.id===99).roof,'gable');assert(survey.openings.some(p=>p.part===99&&p.side==='left'));
assert(survey.parts.filter(p=>p.focus).every(p=>p.patches.length===0),'Selected facades must contain no photo decals');
assert.equal(index.objects.filter(o=>o.type==='modelled-opening').length,survey.openings.length);
assert(index.objects.some(o=>o.type==='timber-porch'&&o.part===119));
assert(index.objects.some(o=>o.type==='pedestrian-path'&&o.osm_id==='way/119936729'));
for(const label of ['garage-42-divider','end-garden-return-hedge','45-tall-entry-screen'])assert(index.objects.some(o=>o.type==='landscape-hedge'&&o.label===label),`Missing observed hedge: ${label}`);
const vestibules=index.objects.filter(o=>o.type==='entrance-vestibule');assert.equal(vestibules.length,1,'One entrance, without the old duplicate glazing');
const entry=vestibules[0],house=survey.parts.find(p=>p.id===entry.part),observedEntry=survey.openings.find(o=>o.part===entry.part&&o.kind==='entrance');
assert(entry.left>=house.surfaceBounds.front[0]-.01&&entry.right<=house.surfaceBounds.front[1]+.01,'Entrance extends beyond the house frontage');
assert(entry.face<entry.wall&&entry.depth>.2,'Glazed entrance needs actual side returns');
assert(entry.doorWidth>=.7&&entry.doorWidth<1.1,'Door should be a single normal-width leaf');
assert(entry.fixedPanePlinth>.6&&entry.fixedPanePlinth<.9);
assert(entry.soffit-entry.head>=0&&entry.soffit-entry.head<.08,'Timber head must meet the roof soffit');
assert.equal(entry.head,observedEntry.bottom+observedEntry.height);
const glassId=index.materials.findIndex(m=>m.kind===12);assert(glassId>=0&&index.ranges.some(r=>r.material===glassId&&r.count>12));
// A gutter must be carried by one real OSM edge, never the full bounding box
// spanning the empty driveway of an L-shaped building.
const pointOn=(q,a,b)=>{const d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d);if(!l)return false;const t=((q[0]-a[0])*d[0]+(q[1]-a[1])*d[1])/(l*l);return t>=-.001&&t<=1.001&&Math.abs((q[0]-a[0])*d[1]-(q[1]-a[1])*d[0])/l<.001;};
for(const gutter of index.objects.filter(o=>o.type==='supported-gutter')){const ring=survey.parts.find(p=>p.id===gutter.part).ring;assert(ring.some((p,i)=>pointOn(gutter.start,p,ring[(i+1)%ring.length])&&pointOn(gutter.end,p,ring[(i+1)%ring.length])),`Unsupported gutter ${gutter.part}`);}
for(const kind of [6,7,8,9]){const m=index.materials.find(m=>m.kind===kind);assert(m.repeat&&m.texture!==undefined,'Ground albedo must be loaded with mipmaps and repeat');}
const streets=JSON.parse(await fs.readFile('scripts/nerval-footprints.json','utf8')).streets;
const surfaces=index.objects.filter(o=>o.type==='road-surface');
assert.equal(surfaces.length,streets.length);
for(const street of streets)assert.deepEqual(surfaces.find(s=>s.osm_id===street.properties.osm_id)?.centerline,street.geometry.coordinates,'The asphalt surface must follow the complete street centreline');
for(const o of survey.openings){assert(survey.focusParts.includes(o.part));assert(o.width>0&&o.height>0&&o.along>0&&o.along<1);assert(o.reference?survey.supplementaryReferences.some(r=>r.id===o.reference):survey.photos.some(p=>Number(p.id)===o.photo));}
const rearGarden=index.objects.find(o=>o.type==='rear-garden');assert(rearGarden);
const rearOpenings=index.objects.filter(o=>o.type==='modelled-opening'&&[rearGarden.reference,survey.endSite.rearGarden.correction,survey.endSite.rearGarden.gableCorrection].includes(o.reference));
assert.equal(rearOpenings.length,5);
assert(!rearOpenings.some(o=>o.part===115&&o.side==='left'&&o.kind==='door'),'Replace the solid gable door with a French door');
const gableDoor=survey.openings.find(o=>o.part===115&&o.side==='left'&&o.kind==='patio');
assert(gableDoor&&gableDoor.along===.66&&gableDoor.glassMaterial&&gableDoor.leaves===2&&gableDoor.shutters==='brown','Two-leaf gable French door with timber shutters, matching the user example');
assert(!rearOpenings.some(o=>o.part===112&&o.side==='back'),'Remove the non-existent rear-wing window marked red');
const terraceDoors=rearOpenings.filter(o=>o.part===115&&o.side==='back'&&o.kind==='patio');assert.equal(terraceDoors.length,2,'Two French doors at the green annotations');
assert(Math.abs(terraceDoors[0].anchor[0]-terraceDoors[1].anchor[0])>2.8,'Keep the two terrace door openings separate');
assert(!index.objects.some(o=>o.type==='end-house-garden'&&o.details.includes('green privacy screen')));
assert(index.objects.filter(o=>o.type==='rear-rooflight').length===2);
for(const label of ['house42-rear-perimeter','house42-path-screen-return','house42-neighbour-rear-divider'])assert(index.objects.some(o=>o.type==='landscape-hedge'&&o.label===label));
const result={nervalChecks:'passed',parts:survey.parts.length,refinedParts:survey.focusParts.length,unchangedParts:survey.parts.length-survey.focusParts.length,appliedPhotoPatches:index.paintedPatches.length,catalogueParts:index.cityFacadeCatalogue?.parts.length||0,roofFootprintAreaM2:+actualArea.toFixed(3),areaErrorM2:Math.abs(expectedArea-actualArea),triangles:index.stats.triangles,meshMB:+(raw.length/1e6).toFixed(2),references:28};
await fs.writeFile('artifacts/nerval/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
