import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {blocked} from '../dist/walk-core.js';
const root=process.argv[2]||'dist';
const survey=JSON.parse(await fs.readFile(root+'/data/nerval/survey.json'));
const index=JSON.parse(await fs.readFile(root+'/data/nerval/index.json'));
const ref=JSON.parse(await fs.readFile('scripts/nerval-refinement-references.json'));
for(const r of ref)assert.equal(crypto.createHash('sha256').update(await fs.readFile(r.file)).digest('hex'),r.sha256,'Reference changed');
const yellow=survey.openings.filter(o=>o.part===115&&o.styleReference);
assert.equal(yellow.length,3);
for(const o of yellow)assert(o.kind==='patio'&&o.leaves===2&&o.shutters==='brown'&&o.width>=1.3&&o.glassMaterial);
const pink=survey.openings.find(o=>o.part===112&&o.styleReference);
assert(pink.kind==='door'&&pink.woodPanels&&!pink.glazed&&!pink.glassMaterial,'Pink annotation: solid timber door');
const garages=survey.openings.filter(o=>o.part===105&&o.kind==='garage');
assert.equal(garages.length,2);assert(garages.every(o=>o.garageStyle==='panels'&&o.width>2.5));
assert.equal(survey.openings.filter(o=>o.part===109&&o.kind==='garage').length,2);
assert.equal(survey.openings.filter(o=>o.part===111&&o.kind==='patio').length,2);
for(const id of [80,83]){const p=survey.parts.find(p=>p.id===id);assert.equal(p.roofSections.length,2);assert(p.roofSections[0].eaves>p.roofSections[1].eaves);assert(!p.frontFlat);}
for(const type of ['curved-cream-wall','dead-end-sign','stormwater-grate','tiered-planter','observed-entrance-porch'])assert(index.objects.some(o=>o.type===type),type);
const island=index.objects.filter(o=>o.type==='planted-island');assert.equal(island.length,1);assert.equal(island[0].light,'double curved arm');
for(const id of [77,80,83,86,99,101,105,109,110,111,114,117])assert(index.objects.some(o=>o.type==='refined-ground'&&o.part===id),'Missing ground at '+id);
// Check all the detailed road centre lines at half-metre intervals, rather
// than only checking the FPS spawn point. No new fence may block the route.
const mesh=await fs.readFile(root+'/data/nerval/mesh.bin'),f=new Float32Array(mesh.buffer,mesh.byteOffset,mesh.length/4),segments=[];
for(let v=0;v<index.vertexCount;v+=3){
 const hits=[];for(let i=0;i<3;i++){
  const a=(v+i)*11,b=(v+(i+1)%3)*11;
  if((f[a+2]>.65)!==(f[b+2]>.65)){const t=(.65-f[a+2])/(f[b+2]-f[a+2]);hits.push([f[a]+(f[b]-f[a])*t,f[a+1]+(f[b+1]-f[a+1])*t]);}
 }if(hits.length===2)segments.push(hits.flat());
}
let samples=0;const obstructions=[];
for(const street of survey.refinements.streetPaths)for(let i=1;i<street.points.length;i++){
 const a=street.points[i-1],b=street.points[i];if(a[0]>-28||b[0]>-28)continue;
 const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);
 for(let k=0;k<=n;k++){const q=a.map((x,j)=>x+(b[j]-x)*k/n);samples++;if(blocked(q,segments))obstructions.push(q);}
}
assert.equal(obstructions.length,0,'Road centre obstructed: '+JSON.stringify(obstructions.slice(0,8)));
const result={passed:true,references:ref.length,openings:survey.openings.length,triangles:index.stats.triangles,threeShutteredFrenchDoors:true,solidTimberRearDoor:true,twoBlueHouseGarages:true,roadSamples:samples,roadObstructions:0};
await fs.writeFile('artifacts/nerval/refinement-20260913/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
