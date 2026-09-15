import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {applyEndCorrections} from './build-nerval-end-corrections.mjs';
const read=async p=>JSON.parse(await fs.readFile(p));
const sha=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const base=await read('artifacts/nerval/end-corrections/baseline.json');
const survey=await read('dist/data/nerval/survey.json'),index=await read('dist/data/nerval/index.json');
const house=survey.parts.find(p=>p.id===117);
assert.equal(house.roofAxis,1);assert.equal(house.roof,'gable');assert.equal(house.eaves,3);assert.equal(house.rise,4.05);
for(const b of base.parts){
 const p=survey.parts.find(p=>p.id===b.id);assert(p);
 // Roofs and openings of neighbours have since been refined by their own
 // surveys. Keep this correction's original footprint guarantee portable.
 for(const key of ['osm_id','ring'])assert.deepEqual(p[key],b[key],`Existing part ${b.id}: ${key}`);
}
const attilaBefore=Object.fromEntries(await Promise.all(Object.keys(base.attila).map(async file=>[file,await sha('dist/data/attila/'+file)])));
const corrected=structuredClone(survey);await applyEndCorrections(corrected);
const neighbours=s=>s.parts.filter(p=>p.id!==117&&!p.background);
const neighbourOpenings=s=>s.openings.filter(o=>o.part<200&&o.part!==117).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
assert.deepEqual(neighbours(corrected),neighbours(survey),'End corrections must preserve the latest neighbouring houses');
assert.deepEqual(neighbourOpenings(corrected),neighbourOpenings(survey),'End corrections must preserve the latest neighbouring openings');
const doors=survey.openings.filter(o=>o.part===117&&o.side==='right'&&o.kind==='patio');
assert.equal(survey.openings.filter(o=>o.part===117&&o.side==='front'&&o.kind==='patio').length,2,'Two patio doors on street elevation only');
assert.equal(doors.length,3);assert(doors.every(o=>o.leaves===2&&o.shutters==='brown'&&o.glassMaterial&&o.bottom+o.height<house.eaves));
const upper=survey.openings.filter(o=>o.part===117&&o.bottom>3);assert.equal(upper.length,1);assert.equal(upper[0].side,'right');
for(const d of doors)assert(index.objects.some(o=>o.type==='modelled-opening'&&o.part===117&&o.reference===d.reference&&o.side==='right'));
for(const [type,setting] of [['observed-garden-tree','tree'],['observed-streetlamp','streetlamp']]){
 const o=index.objects.find(o=>o.type===type);assert(o);
 const q=survey.endCorrections[setting].local,world=house.center.map((x,i)=>x+house.u[i]*q[0]+house.v[i]*q[1]);
 assert(Math.hypot(...o.center.map((x,i)=>x-world[i]))<1e-10);
}
assert(survey.endCorrections.tree.local[1]>-9.6+.8,'Tree must stand behind the repositioned hedge');
const junction=index.objects.find(o=>o.type==='continuous-impasse-junction'),lamp=index.objects.find(o=>o.type==='observed-streetlamp');
const lampSide=lamp.center.reduce((s,x,i)=>s+(x-junction.junction[i])*junction.v[i],0);
assert(lampSide<-3.1&&lampSide>-4.35,'Lamp must stand on the pavement, beyond the road edge');
const sources=await read('dist/data/buildings.geojson'),background=survey.parts.filter(p=>p.background);
assert.equal(background.length,8);
const roofIndex=await read('dist/data/roofs/index.json'),facadeIndex=await read('dist/data/facades/index.json');
const row=background.filter(p=>p.type==='terrace');
const ridge=p=>p.center.reduce((s,x,i)=>s+x*p.v[i],0)+(p.roofStart+p.roofEnd)/2;
for(const p of row)assert(Math.abs(ridge(p)-ridge(row[0]))<1e-10,'The terraced row needs a continuous ridge');
for(const p of background){
 const source=sources.features.find(f=>f.properties.osm_id===p.osm_id);
 assert.deepEqual(p.ring,source.geometry.coordinates[0].slice(0,-1).map(q=>q.map((n,i)=>(n-survey.origin[i])*survey.scale[i])));
 assert(p.rise>0&&p.eaves+p.rise<9);
 assert(roofIndex.excludedDetailedBuildings.includes(p.osm_id));assert(facadeIndex.protectedIds.includes(p.osm_id));
 for(const q of source.geometry.coordinates[0])assert(q[0]>=index.bounds[0]&&q[0]<=index.bounds[2]&&q[1]>=index.bounds[1]&&q[1]<=index.bounds[3]);
}
const references=await read('scripts/nerval-end-correction-references.json');
for(const r of references)assert.equal(await sha(r.file),r.sha256);
for(const [file,hash] of Object.entries(attilaBefore))assert.equal(await sha('dist/data/attila/'+file),hash,'Camp d’Attila must remain unchanged');
const result={passed:true,roofRotationDegrees:90,roofFootprintPreserved:true,gardenFrenchDoors:doors.length,backgroundVolumes:background.length,treeAndStreetlamp:true,references:references.length,previousPartsPreserved:base.parts.length-1,attilaPreserved:true};
await fs.writeFile('artifacts/nerval/end-corrections/validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
