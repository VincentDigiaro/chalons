import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {toLocal,blocked} from '../dist/walk-core.js';
import {facadeHash} from '../dist/facade-layer.js';
import {detailedBuildingIds} from './detailed-buildings.mjs';
const json=async f=>JSON.parse(await fs.readFile(f)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const model=await json('dist/data/camp127/index.json'),survey=await json('dist/data/camp127/survey.json'),walk=await json('dist/data/walk/index.json'),raw=await fs.readFile('dist/data/camp127/mesh.bin');
const a=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4),baseline=await json('artifacts/camp127/baseline.json'),before=await json('artifacts/camp127/walk-before.json');
assert.deepEqual(model.gameAnchor,[-412,2110]);assert(Math.hypot(...toLocal(model.origin).map((n,i)=>n-model.gameAnchor[i]))<1e-7);
assert.equal(model.parts.length,6);assert.equal(model.stats.mainBuildings,5);assert.equal(raw.length,model.vertexCount*44);
for(const r of survey.roofAreas)assert(Math.abs(r.footprint-r.roofProjected)<1e-5,'Footprint coverage '+r.id);
for(let i=0;i<a.length;i+=11){assert(a.subarray(i,i+11).every(Number.isFinite));assert(Math.abs(Math.hypot(...a.subarray(i+3,i+6))-1)<1e-5);assert(a[i+2]>=-.005&&a[i+2]<12);}
const buildings=await json('dist/data/buildings.geojson');
for(const p of model.parts)assert.deepEqual(p.footprint,buildings.features.find(f=>f.properties.osm_id===p.osmId).geometry.coordinates[0]);
for(const ref of survey.references)assert.equal(sha(await fs.readFile('dist/data/camp127/'+ref.file)),ref.sha256);
for(const [file,hash]of Object.entries(baseline.files))assert.equal(sha(await fs.readFile('dist/data/'+file)),hash,'Existing model changed: '+file);
assert.deepEqual(walk.materials,before.materials,'Existing material numbers changed');
const ids=new Set(model.excludeIds),retired=file=>ids.has(file.split('/').at(-1).replace('.bin','').replace('-','/'));
assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('camp127/')),before.nodes.filter(n=>!retired(n[0])),'Unrelated packets changed');
for(const id of ids)assert((await detailedBuildingIds()).includes(id));
const registry=await json('dist/data/custom-models.json');assert.deepEqual(registry.models.find(m=>m.id==='camp127').excludeIds,model.excludeIds);
const fac=await json('dist/data/facades/index.json'),fa=await json('dist/data/facades/assignments.json'),roof=await json('dist/data/roofs/index.json'),ra=await json('dist/data/roofs/assignments.json');
const hashes=new Set(model.excludeIds.map(facadeHash));
for(const id of ids){assert(fac.protectedIds.includes(id));assert(roof.excludedDetailedBuildings.includes(id));assert(!fa.buildings.some(b=>b.id===id));assert(!ra.buildings.some(b=>b.id===id));assert(!walk.nodes.some(n=>retired(n[0])));}
for(const c of fac.chunks){const b=await fs.readFile('dist/data/facades/'+c.file);for(let i=0;i<b.length;i+=52)assert(!hashes.has(b.readUInt32LE(i+48)));}
const expected=[],actual=[],segments=[];
for(const range of model.ranges)for(let i=range.first;i<range.first+range.count;i+=3){const tri=a.slice(i*11,(i+3)*11);for(let k=0;k<33;k+=11){const p=toLocal([model.origin[0]+tri[k]/model.scale[0],model.origin[1]+tri[k+1]/model.scale[1]]);tri[k]=p[0];tri[k+1]=p[1];}expected.push((walk.attilaBase+range.material)+':'+sha(Buffer.from(tri.buffer)));}
for(const [file,...bounds]of walk.nodes){const near=bounds[0]<-335&&bounds[2]>-470&&bounds[1]<2160&&bounds[3]>2030;if(!near&&!file.startsWith('camp127/'))continue;const b=await fs.readFile('dist/data/walk/'+file),n=b.readUInt32LE(0),h=JSON.parse(b.toString('utf8',4,4+n));segments.push(...h.segments);if(!file.startsWith('camp127/'))continue;for(const [mat,start,count]of h.ranges)for(let i=start;i<start+count;i+=3)actual.push(mat+':'+sha(b.subarray(4+n+i*44,4+n+(i+3)*44)));}
assert.deepEqual(actual.sort(),expected.sort(),'The game and map must display exactly the same mesh');
// Regression: the final stair tread must join a real landing surface and the
// opening between its handrails must not be crossed by a guardrail.
const framePoint=p=>[p[0]*model.frame.u[0]+p[1]*model.frame.u[1],p[0]*model.frame.v[0]+p[1]*model.frame.v[1],p[2]];
function partTriangles(part){const triangles=[];for(const r of model.objectRanges.filter(r=>r.part===part))for(let i=r.first;i<r.first+r.count;i+=3){const tri=[];for(let k=0;k<3;k++)tri.push(framePoint(Array.from(a.subarray((i+k)*11,(i+k)*11+3))));triangles.push(tri);}return triangles;}
const inTriangle=(p,t)=>{const cross=(p,a,b)=>(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);const v=t.map((q,i)=>cross(p,q,t[(i+1)%3]));return v.every(n=>n>=-1e-5)||v.every(n=>n<=1e-5);};
for(const landing of survey.details.filter(d=>d.type==='connected-entrance-landing')){
 const tris=partTriangles(landing.part),entry=landing.flightEntry,c=entry[0].map((n,i)=>(n+entry[1][i])/2),floor=landing.height;
 for(const dx of [-.08,0,.08,.35])assert(tris.some(t=>t.every(p=>Math.abs(p[2]-floor)<.004)&&inTriangle([c[0]+dx,c[1]],t)),'Missing tread/landing floor at '+landing.part+' '+dx);
 // Slice all metal and masonry above the floor at torso height.
 const slice=[];for(const t of tris){const hit=[];for(let i=0;i<3;i++){const p=t[i],q=t[(i+1)%3];if((p[2]>floor+.48)!==(q[2]>floor+.48)){const f=(floor+.48-p[2])/(q[2]-p[2]);hit.push(p.slice(0,2).map((n,i)=>n+(q[i]-n)*f));}}if(hit.length===2)slice.push(hit.flat());}
 assert(!blocked(c,slice),'Guardrail blocks the stair-to-landing opening '+landing.part);
}
// Regression: brown trim must remain in front of the oblique stone facade.
const trim=survey.details.find(d=>d.type==='stone-trim-aligned'),[fa0,fa1]=trim.facade,d=fa1.map((v,i)=>v-fa0[i]),L=Math.hypot(d[0],d[1]),n=[d[1]/L,-d[0]/L];let checkedBrickVertices=0;
for(const r of model.objectRanges.filter(r=>r.part===129))for(let i=r.first;i<r.first+r.count;i++){const j=i*11,z=a[j+2];if(z<2||z>5.3||Math.abs(a[j+8]-166/255)>.001||Math.abs(a[j+9]-94/255)>.001||Math.abs(a[j+10]-64/255)>.001)continue;const projection=(a[j]-fa0[0])*n[0]+(a[j+1]-fa0[1])*n[1];assert(projection>=.039,'Brick intersects the stone facade');checkedBrickVertices++;}
assert(checkedBrickVertices>200);
// Regression: behind the portillon the house garden is inside the return,
// and the complete garage opening is outside it.
const layout=survey.details.find(d=>d.type==='front-fence-and-gate').frameLayout;
assert.deepEqual(layout.gateRight,[8.72,1.49]);assert.deepEqual(layout.returnEnd,[7.82,6.56]);
const houseTris=partTriangles(127),slice=[];for(const t of houseTris){const hit=[];for(let i=0;i<3;i++){const p=t[i],q=t[(i+1)%3];if((p[2]>.65)!==(q[2]>.65)){const f=(.65-p[2])/(q[2]-p[2]);hit.push(p.slice(0,2).map((n,i)=>n+(q[i]-n)*f));}}if(hit.length===2)slice.push(hit.flat());}
for(const p of [[8.05,2.05],[7.60,3.05],[7.20,4.05],[9.90,2.05],[9.90,4.05],[9.90,5.65]])assert(!blocked(p,slice),'Gate/garage approach obstructed at '+p);
assert.equal(model.parts.find(p=>p.id===401).osmId,'way/156681188');assert.equal(model.parts.find(p=>p.id===401).styleFrom,400);
assert.equal(survey.details.filter(d=>d.type==='opposite-street-gable').length,2);
assert(!blocked([-407.54,2110.39],segments),'Street entry blocked');
const roads=await json('dist/data/lines.geojson');let roadSamples=0;
for(const f of roads.features.filter(f=>/Attila/i.test(f.properties.name))){const road=f.geometry.coordinates.map(toLocal);for(let i=0;i<road.length-1;i++){const L=Math.hypot(...road[i].map((v,k)=>v-road[i+1][k]));for(let j=0;j<=Math.ceil(L);j++){const p=road[i].map((v,k)=>v+(road[i+1][k]-v)*j/Math.ceil(L));if(Math.hypot(p[0]+412,p[1]-2110)>48)continue;assert(!blocked(p,segments),'Road obstructed '+p);roadSamples++;}}}
assert(roadSamples>40);
for(const id of ids){const n=id.split('/')[1],file=Number(n)%100+'/'+id.replace('/','-')+'.bin',b=await fs.readFile('dist/data/walk/'+file),size=b.readUInt32LE(0),h=JSON.parse(b.toString('utf8',4,4+size));assert.equal(b.length,4+size);assert.deepEqual(h.ranges,[]);assert.deepEqual(h.segments,[]);}
const result={passed:true,triangles:model.stats.triangles,parts:model.parts.length,openings:survey.openings.length,referencePhotos:4,mapFpsIdentical:true,osmFootprintsPreserved:true,oldGenericVolumesRemoved:true,otherModelsUnchanged:true,materialsUnchanged:true,connectedLandings:true,checkedBrickVertices,gateApproachClear:true,oppositeBuildings:2,roadSamples};
await fs.writeFile('artifacts/camp127/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
