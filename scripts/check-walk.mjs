import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {EYE_HEIGHT,LOAD_RADIUS,ROAD_LOAD_RADIUS,nodeLoadRadius,SPAWN,SPAWN_YAW,toLocal,toLngLat,inRange,farDistance,blocked,movement,stepPlayer,viewProjection} from '../dist/walk-core.js';
import {roofPoint,roofUV} from './roof-policy.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const file of ['dist/walk-core.js','dist/walk-renderer.js','dist/walk-visibility.js','dist/walk-mode.js','scripts/build-walk.mjs'])execFileSync(process.execPath,['--check',file]);
const index=JSON.parse(await fs.readFile('dist/data/walk/index.json','utf8'));
const roofAssignments=new Map(JSON.parse(await fs.readFile('dist/data/roofs/assignments.json')).buildings.map(a=>[a.id,a]));
assert.equal((index.cityRoadMaterialBase??index.materials.length)-index.roofBase,32);
// The runtime JSON controls streaming; packaged geometry needs no rebuild.
assert.equal(index.eyeHeight,EYE_HEIGHT);
for(const [file,hash] of Object.entries(index.sourceHashes))assert.equal(sha(await fs.readFile(file)),hash,`Rebuild pedestrian assets: ${file}`);
const detail=JSON.parse(await fs.readFile('dist/data/nerval/index.json','utf8')),raw=await fs.readFile('dist/data/nerval/mesh.bin');
const originalTriangles=[];for(const r of detail.ranges)for(let first=r.first;first<r.first+r.count;first+=3){const catalogueIndex=detail.materials[r.material].catalogueIndex,material=catalogueIndex===undefined?r.material:index.facadeBase+catalogueIndex;originalTriangles.push(material+':'+sha(raw.subarray(first*44,(first+3)*44)));}
const pedestrianTriangles=[],nearSegments=[],names=new Set();let totalVertices=0,bytes=0,initialBytes=0,initialAssets=0;
for(const node of index.nodes){
 const [file,...bounds]=node;assert(!file.includes('..'));assert(!names.has(file));names.add(file);assert(bounds.every(Number.isFinite));
 const buffer=await fs.readFile('dist/data/walk/'+file),headerLength=buffer.readUInt32LE(0),header=JSON.parse(buffer.toString('utf8',4,4+headerLength)),mesh=buffer.subarray(4+headerLength);
 assert.equal(mesh.length%44,0);let first=0;
 for(const [id,start,count] of header.ranges){const material=header.cityRoads?id+index.cityRoadMaterialBase:id;assert.equal(start,first);assert.equal(count%3,0);first+=count;assert.equal(typeof material,'number','Photographic roof tile retained in a building packet');assert(index.materials[material]);
  if(material>=index.roofBase&&!header.cityRoads){
   assert(!file.startsWith('detail/'),'Catalogue applied to Nerval');
   const id=file.split('/').at(-1).slice(0,-4).replace('-','/'),roof=roofAssignments.get(id);assert(roof);assert.equal(material,index.roofBase+roof.material);
   for(let v=start;v<start+count;v+=3){const at=v*44,p=[mesh.readFloatLE(at),mesh.readFloatLE(at+4)],uv=roofUV(roof,roofPoint(toLngLat(p)));assert(Math.abs(mesh.readFloatLE(at+24)-uv[0])<.002&&Math.abs(mesh.readFloatLE(at+28)-uv[1])<.002,'Map and FPS roof repeats differ');}
  }
  if(file.startsWith('detail/'))for(let v=start;v<start+count;v+=3)pedestrianTriangles.push(material+':'+sha(mesh.subarray(v*44,(v+3)*44)));
 }
 assert.equal(first*44,mesh.length);
 for(let at=0;at<mesh.length;at+=44){const x=mesh.readFloatLE(at),y=mesh.readFloatLE(at+4),z=mesh.readFloatLE(at+8);assert(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));assert(x>=bounds[0]-.005&&x<=bounds[2]+.005&&y>=bounds[1]-.005&&y<=bounds[3]+.005);}
 for(const s of header.segments)assert(s.length===4&&s.every(Number.isFinite));
 if(inRange(bounds,SPAWN,nodeLoadRadius(file))){assert(farDistance(bounds,SPAWN)<=nodeLoadRadius(file));initialBytes+=buffer.length;initialAssets++;nearSegments.push(...header.segments);}
 totalVertices+=first;bytes+=buffer.length;
}
assert.equal(totalVertices,index.stats.vertices);assert.equal(bytes,index.stats.bytes);
assert.deepEqual(pedestrianTriangles.sort(),originalTriangles.sort(),'Detailed street vertices or materials changed');
// Keep the original 24 MB / 500 m density budget as the configured area grows.
const areaFactor=(Math.max(LOAD_RADIUS,ROAD_LOAD_RADIUS)/500)**2;
assert(initialAssets>100&&initialAssets<2000*areaFactor);assert(initialBytes<24e6*areaFactor,'Too much geometry for the configured loading area');assert(!blocked(SPAWN,nearSegments),'Spawn collides with a building or fence');
let p=[...SPAWN];for(let i=0;i<200;i++)p=stepPlayer(p,...movement(SPAWN_YAW,1,0,1/60),nearSegments);
assert(Math.hypot(p[0]-SPAWN[0],p[1]-SPAWN[1])>5,'The first metres of the impasse are obstructed');
const wall=[[1,-2,1,2]];const stopped=stepPlayer([0,0],3,0,wall);assert(stopped[0]<.8,'Player tunnels through a wall');
const slide=stepPlayer([.7,0],.5,1,wall);assert(slide[0]<.8&&slide[1]>.9,'Player cannot slide along walls');
assert(Math.abs(Math.hypot(...movement(0,1,1,.05))-Math.hypot(...movement(0,1,0,.05)))<1e-10,'Diagonal acceleration');
const original=[4.3801,48.9465],roundtrip=toLngLat(toLocal(original));assert(Math.hypot(roundtrip[0]-original[0],roundtrip[1]-original[1])<1e-12);
const camera=[...SPAWN,EYE_HEIGHT+.022],matrix=viewProjection(camera,0,0,16/9),project=p=>Array.from({length:4},(_,r)=>matrix[r]*p[0]+matrix[4+r]*p[1]+matrix[8+r]*p[2]+matrix[12+r]);
const center=project([camera[0],camera[1]+10,camera[2]]);assert(Math.abs(center[0]/center[3])<.00001&&Math.abs(center[1]/center[3])<.00001);assert(center[3]>0);assert(Math.abs(center[2]/center[3])<1);
const ground=project([camera[0],camera[1]+10,0]);assert(ground[1]<0,'The ground is projected above eye level');
await fs.mkdir('artifacts/walk',{recursive:true});const result={checks:'passed',eyeHeight:EYE_HEIGHT,radius:LOAD_RADIUS,initialAssets,initialGeometryMB:+(initialBytes/1e6).toFixed(2),detailedTrianglesUnchanged:pedestrianTriangles.length,spawnClear:true,collisions:'wall, sliding, frame subdivision',camera:'perspective and ground orientation',totalAssets:index.nodes.length};await fs.writeFile('artifacts/walk/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
