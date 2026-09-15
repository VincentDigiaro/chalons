import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {toLocal,blocked,stepPlayer} from '../dist/walk-core.js';
import {facadeHash} from '../dist/facade-layer.js';
import {detailedBuildingIds} from './detailed-buildings.mjs';
const json=async f=>JSON.parse(await fs.readFile(f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const model=await json('dist/data/parc14/index.json'),survey=await json('dist/data/parc14/survey.json'),walk=await json('dist/data/walk/index.json'),raw=await fs.readFile('dist/data/parc14/mesh.bin');
const a=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),baseline=await json('artifacts/parc14/baseline.json'),before=await json('artifacts/parc14/walk-before.json');
assert.deepEqual(model.gameAnchor,[-413,2800]);assert(Math.hypot(...toLocal(model.origin).map((n,i)=>n-model.gameAnchor[i]))<1e-7);
assert.equal(model.parts.length,5);assert.equal(model.stats.mainBuildings,3);assert.equal(raw.length,model.vertexCount*44);
assert.equal(model.siteDetails.filter(d=>d.type==='triangular-dormer'&&d.side==='front').length,3);
assert.equal(model.siteDetails.filter(d=>d.type==='triangular-dormer'&&d.side==='rear').length,2);
for(const type of ['stone-statue-with-planter','rear-garden','rear-terrace','conifer','neighbor-balcony','neighbor-dormer','front-drive-without-vehicle'])assert(model.siteDetails.some(d=>d.type===type),type);
assert(!model.siteDetails.some(d=>/^(car|vehicle)$/.test(d.type)));
assert(survey.openings.filter(o=>o.part===14&&o.side==='rear').length>=3);
for(const r of survey.roofAreas)assert(Math.abs(r.footprint-r.roofProjected)<1e-5,'Footprint coverage '+r.id);
for(let i=0;i<a.length;i+=11){assert(a.subarray(i,i+11).every(Number.isFinite));assert(Math.abs(Math.hypot(...a.subarray(i+3,i+6))-1)<1e-5);assert(a[i+2]>=-.005&&a[i+2]<16);}
for(const p of model.parts){const source=(await json('dist/data/buildings.geojson')).features.find(f=>f.properties.osm_id===p.osmId);assert.deepEqual(p.footprint,source.geometry.coordinates[0]);}
for(const ref of survey.references)assert.equal(sha(await fs.readFile('dist/data/parc14/'+ref.file)),ref.sha256);
for(const [file,hash]of Object.entries(baseline.files).filter(([f])=>/^(nerval|attila|buirette)\//.test(f)))assert.equal(sha(await fs.readFile('dist/data/'+file)),hash,'Existing model changed: '+file);
assert.deepEqual(walk.materials,before.materials,'Existing material numbers changed');
const genericIds=new Set(model.excludeIds),retired=file=>genericIds.has(file.split('/').at(-1).replace('.bin','').replace('-','/'));
assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('parc14/')),before.nodes.filter(n=>!retired(n[0])),'Unrelated packets changed');
for(const id of model.excludeIds)assert((await detailedBuildingIds()).includes(id));
const registry=await json('dist/data/custom-models.json');assert.deepEqual(registry.models.find(m=>m.id==='parc14').excludeIds,model.excludeIds);
const fac=await json('dist/data/facades/index.json'),fa=await json('dist/data/facades/assignments.json'),roof=await json('dist/data/roofs/index.json'),ra=await json('dist/data/roofs/assignments.json');
const hashes=new Set(model.excludeIds.map(facadeHash));for(const id of model.excludeIds){assert(fac.protectedIds.includes(id));assert(roof.excludedDetailedBuildings.includes(id));assert(!fa.buildings.some(b=>b.id===id));assert(!ra.buildings.some(b=>b.id===id));assert(!walk.nodes.some(n=>retired(n[0])));}
for(const c of fac.chunks){const b=await fs.readFile('dist/data/facades/'+c.file);for(let i=0;i<b.length;i+=52)assert(!hashes.has(b.readUInt32LE(i+48)));}
const expected=[],actual=[],segments=[];
for(const range of model.ranges)for(let i=range.first;i<range.first+range.count;i+=3){const tri=a.slice(i*11,(i+3)*11);for(let k=0;k<33;k+=11){const p=toLocal([model.origin[0]+tri[k]/model.scale[0],model.origin[1]+tri[k+1]/model.scale[1]]);tri[k]=p[0];tri[k+1]=p[1];}expected.push((walk.attilaBase+range.material)+':'+sha(Buffer.from(tri.buffer)));}
for(const [file,...bounds]of walk.nodes){const near=bounds[0]<-350&&bounds[2]>-475&&bounds[1]<2840&&bounds[3]>2730;if(!near&&!file.startsWith('parc14/'))continue;const b=await fs.readFile('dist/data/walk/'+file),n=b.readUInt32LE(0),h=JSON.parse(b.toString('utf8',4,4+n));segments.push(...h.segments);if(!file.startsWith('parc14/'))continue;for(const [mat,start,count]of h.ranges)for(let i=start;i<start+count;i+=3)actual.push(mat+':'+sha(b.subarray(4+n+i*44,4+n+(i+3)*44)));}
assert.deepEqual(actual.sort(),expected.sort(),'The game and map must display exactly the same mesh');
const F=(x,y)=>[model.gameAnchor[0]+model.frame.u[0]*x+model.frame.v[0]*y,model.gameAnchor[1]+model.frame.u[1]*x+model.frame.v[1]*y];
const spawn=[-418.51,2816.94];assert(!blocked(spawn,segments),'Street entry blocked');
// Preserve the complete nearby public road axis and the driveway to the garage.
const roads=await json('dist/data/lines.geojson'),road=roads.features.find(f=>f.properties.osm_id==='way/316737077').geometry.coordinates.map(toLocal);let roadSamples=0;
for(let i=0;i<road.length-1;i++)for(let j=0;j<=30;j++){const p=road[i].map((v,k)=>v+(road[i+1][k]-v)*j/30);if(Math.hypot(p[0]+413,p[1]-2800)>55)continue;assert(!blocked(p,segments),'Road obstructed '+p);roadSamples++;}
for(let y=-12;y<-5.9;y+=.1)assert(!blocked(F(-6,y),segments),'Driveway blocked at '+y);
const start=F(-6,-6.2),end=stepPlayer(start,...model.frame.v.map(v=>v*2),segments);assert(Math.hypot(end[0]-start[0],end[1]-start[1])<1,'Garage door must be solid');
for(const id of model.excludeIds){const n=id.split('/')[1],file=Number(n)%100+'/'+id.replace('/','-')+'.bin',b=await fs.readFile('dist/data/walk/'+file),size=b.readUInt32LE(0),h=JSON.parse(b.toString('utf8',4,4+size));assert.equal(b.length,4+size);assert.deepEqual(h.ranges,[]);assert.deepEqual(h.segments,[]);}
const result={passed:true,triangles:model.stats.triangles,parts:model.parts.length,openings:survey.openings.length,referencePhotos:8,mapFpsIdentical:true,osmFootprintsPreserved:true,oldGenericVolumesRemoved:true,otherModelsUnchanged:true,materialsUnchanged:true,roadSamples,drivewayClear:true,garageSolid:true};
await fs.writeFile('artifacts/parc14/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
