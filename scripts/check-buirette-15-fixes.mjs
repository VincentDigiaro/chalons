import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {clip} from './attila-geometry.mjs';
import {collisionGeometry,advancePlayer} from '../dist/walk-physics.js';
import {toLocal} from '../dist/walk-core.js';

const out='artifacts/buirette-15-fixes',root='dist/data/buirette';
const index=JSON.parse(await fs.readFile(root+'/index.json')),survey=JSON.parse(await fs.readFile(root+'/survey.json'));
const bytes=await fs.readFile(root+'/mesh.bin'),vertices=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
const old=JSON.parse(await fs.readFile(out+'/local-before/data/buirette/index.json'));
const oldBytes=await fs.readFile(out+'/local-before/data/buirette/mesh.bin');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function triangleHashes(i,b){return i.objectRanges.filter(r=>r.part!==17&&old.objectRanges.some(o=>o.part===r.part)).flatMap(r=>Array.from({length:r.count/3},(_,k)=>r.part+':'+r.material+':'+hash(b.subarray((r.first+k*3)*44,(r.first+k*3+3)*44)))).sort();}
assert.deepEqual(triangleHashes(index,bytes),triangleHashes(old,oldBytes),'An existing building or its surroundings changed');
for(const p of old.parts)assert.deepEqual(index.parts.find(q=>p.id===q.id),p,'Existing placement changed: '+p.id);
assert.deepEqual(index.excludeIds.filter(id=>!old.excludeIds.includes(id)),['way/156701424']);
assert.equal(survey.openings.filter(o=>o.part===15).length,5);
assert(survey.openings.some(o=>o.part===15&&o.shape==='octagon'));
assert(survey.details.some(o=>o.part===15&&o.type==='brick-and-ceramic-frieze'&&o.insets===9));
const handle=survey.details.find(d=>d.type==='horizontal-door-handle'&&d.part===17);
assert(handle);assert.equal(handle.a[2],handle.b[2],'Handle must be horizontal');

function triangles(i,v){return i.objectRanges.flatMap(r=>Array.from({length:r.count/3},(_,k)=>({part:r.part,p:[0,1,2].map(j=>Array.from(v.subarray((r.first+k*3+j)*11,(r.first+k*3+j)*11+3)))})));}
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function intersection(a,b){let q=a;const signed=b.reduce((s,a,i)=>{const c=b[(i+1)%b.length];return s+a[0]*c[1]-a[1]*c[0];},0),sign=Math.sign(signed);
 for(let i=0;i<b.length;i++){const a=b[i],c=b[(i+1)%b.length];q=clip(q,p=>sign*((c[0]-a[0])*(p[1]-a[1])-(c[1]-a[1])*(p[0]-a[0])));}return area(q);
}
function overlaps(all){const horizontal=all.filter(t=>Math.max(...t.p.map(p=>p[2]))-Math.min(...t.p.map(p=>p[2]))<2e-5),steps=horizontal.filter(t=>t.part==='17-threshold');let total=0,pairs=0;
 for(const t of steps)for(const other of horizontal){if(other.part==='17-threshold'||Math.abs(t.p[0][2]-other.p[0][2])>2e-5)continue;const a=intersection(t.p.map(p=>p.slice(0,2)),other.p.map(p=>p.slice(0,2)));if(a>1e-5){total+=a;pairs++;if(process.env.DEBUG_OVERLAPS)console.log(JSON.stringify({area:a,part:other.part,step:t.p,other:other.p}));}}return {area:total,pairs};
}
const before=overlaps(triangles(old,new Float32Array(oldBytes.buffer,oldBytes.byteOffset,oldBytes.length/4)));
assert(before.area>.1,'Regression fixture must reproduce the overlapping threshold');
const after=overlaps(triangles(index,vertices));assert.equal(after.pairs,0,'Threshold still has coincident horizontal surfaces');

// Check the real local FPS packets near the door, including generic pavement
// and all other detailed geometry, rather than testing an isolated stair.
const walk=JSON.parse(await fs.readFile('dist/data/walk/index.json'));
const step=survey.details.find(d=>d.type==='single-shell-threshold'&&d.part===17),{A,u,v}=step.frame;
const W=(x,y)=>toLocal(A.map((a,i)=>index.origin[i]+(a+u[i]*x+v[i]*y)/index.scale[i]));
const door=W(step.x,0),buffers=[],all=[];
for(const [file,x0,y0,x1,y1]of walk.nodes){if(door[0]+3<x0||door[0]-3>x1||door[1]+3<y0||door[1]-3>y1)continue;
 const b=await fs.readFile('dist/data/walk/'+file),h=b.readUInt32LE(0),start=4+h,data=new Float32Array(b.buffer,b.byteOffset+start,(b.length-start)/4);buffers.push(data);
 if(!file.startsWith('buirette/'))for(let i=0;i<data.length;i+=33)all.push({part:file,p:[0,11,22].map(k=>Array.from(data.subarray(i+k,i+k+3)))});
}
for(const t of triangles(index,vertices)){all.push({...t,p:t.p.map(p=>[...toLocal([index.origin[0]+p[0]/index.scale[0],index.origin[1]+p[1]/index.scale[1]]),p[2]])});}
assert.equal(overlaps(all).pairs,0,'FPS scene contains a pavement/threshold overlap');
const scene={segments:[],surfaces:[]};for(const b of buffers){const g=collisionGeometry(b);scene.segments.push(...g.segments);scene.surfaces.push(...g.surfaces);}
let player={position:W(step.x,-1.1),feet:.027,verticalSpeed:0,grounded:true};
for(let i=0;i<120;i++)player=advancePlayer(player,0,0,1/60,scene);
const pavementHeight=player.feet;
for(let i=0;i<90;i++)player=advancePlayer(player,v[0]*.02,v[1]*.02,1/60,scene);
assert(Math.abs(player.feet-step.doorBottom)<.013,'Full-scene approach must reach the threshold');
const heights=[];for(let i=0;i<120;i++){player=advancePlayer(player,0,0,1/60,scene);heights.push(player.feet);}
assert(Math.max(...heights)-Math.min(...heights)<1e-5,'Full-scene feet must remain stable');
for(let i=0;i<65;i++)player=advancePlayer(player,-v[0]*.025,-v[1]*.025,1/60,scene);
assert(Math.abs(player.feet-pavementHeight)<.01,'Pavement must be reachable after leaving the step');
const report={passed:true,existingPlacementsPreserved:true,unrelatedTrianglesPreserved:true,oneNewFootprint:true,handleHorizontal:true,overlapBefore:before,overlapAfter:after,fullFpsSceneOverlap:false,thresholdStandingStable:true,pavementHeight,house15Openings:5};
await fs.writeFile(out+'/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
