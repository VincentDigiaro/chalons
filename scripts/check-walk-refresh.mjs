// Exercise movement refreshes with the real catalogue, terrain and preparation
// queue. GPU storage and the frame clock are controlled; no network is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {WalkPreparation} from '../dist/walk-preparation.js';
import {SpatialIndex} from '../dist/walk-collision-index.js';
import {loadTerrain,terrainTile} from '../dist/terrain.js';
import {setTerrainImpacts,terrainCraterRevision} from '../dist/terrain-craters.js';
import {CITY,cityDataURL} from '../dist/city-config.js';
import {SPAWN,inRange,nodeLoadRadius,nearDistance} from '../dist/walk-core.js';
const read=async url=>{const b=await fs.readFile('dist/'+url.slice(2));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
await loadTerrain({fetchBuffer:read});
const index=JSON.parse(new TextDecoder().decode(await read(cityDataURL('walk/index.json'))));
const storage=new Map(),vaos=new Set(),frames=new Map();let buffer,frame=0,clock=0,uploads=0;
const gl={createVertexArray(){const v={};vaos.add(v);return v;},createBuffer(){const b={};storage.set(b,null);return b;},bindVertexArray(){},bindBuffer(_target,b){buffer=b;},bufferData(_target,bytes){assert.equal(typeof bytes,'number','Ground uploads must allocate then transfer in chunks');storage.set(buffer,new Uint8Array(bytes));uploads++;},bufferSubData(_target,offset,chunk){storage.get(buffer).set(new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength),offset);},enableVertexAttribArray(){},vertexAttribPointer(){},deleteVertexArray:v=>vaos.delete(v),deleteBuffer:b=>storage.delete(b)};
const renderer=Object.assign(Object.create(WalkRenderer.prototype),{index,gl,nodes:new Map(),ground:new Map(),textures:new Map(),collisionIndex:new SpatialIndex(),errors:0,highwind:{refresh(){},textureKeys:()=>[]},pump(){},texture(){},pruneTextures(){}});
renderer.preparation=new WalkPreparation({budget:()=>1,priority:n=>nearDistance(n.bounds,renderer.position),now:()=>clock+=.5,requestFrame:fn=>{frames.set(++frame,fn);return frame;},cancelFrame:id=>frames.delete(id)});
const nextFrame=()=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn();};
const settle=async()=>{let n=0;while(frames.size){assert(++n<100000);nextFrame();}await new Promise(setImmediate);assert.equal(renderer.errors,0);return n;};
const expectedAt=p=>index.nodes.filter(([file,...b])=>inRange(b,p,nodeLoadRadius(file))).map(n=>n[0]).sort();
const verifyTile=t=>{const expected=terrainTile(t.bounds);assert.deepEqual(storage.get(t.gpu.buffer),new Uint8Array(expected.buffer),'Scheduled ground must retain exact vertices, UVs and normals');};
try{
 renderer.refresh(SPAWN);
 assert.deepEqual([...renderer.nodes.keys()].sort(),expectedAt(SPAWN));
 assert(renderer.ground.size>0);assert.equal(uploads,0,'Refresh must not generate or upload the ground synchronously');
 assert.equal(renderer.preparation.pending,renderer.ground.size);
 const pending=renderer.preparation.pending;renderer.refresh(SPAWN);
 assert.equal(renderer.preparation.pending,pending,'Repeated refreshes must not duplicate unfinished tiles');
 while(!uploads)nextFrame();
 assert.equal([...renderer.ground.values()].filter(t=>t.gpu).length,0,'Partial GPU uploads must stay invisible');
 const firstFrames=await settle();assert(firstFrames>1);
 for(const t of renderer.ground.values())verifyTile(t);
 const originalIterator=index.nodes[Symbol.iterator];
 index.nodes[Symbol.iterator]=()=>{throw Error('Movement must not rescan the full city catalogue');};
 const position=[SPAWN[0]+150,SPAWN[1]+100],before=uploads;
 renderer.trim(position);renderer.refresh(position);
 index.nodes[Symbol.iterator]=originalIterator;
 assert.equal(uploads,before,'Movement must only queue newly exposed ground');
 assert.deepEqual([...renderer.nodes.keys()].sort(),expectedAt(position));
 assert([...renderer.ground.values()].some(t=>!t.gpu));
 await settle();
 // An impact can change the height field while a new tile is being prepared.
 const distant=[SPAWN[0]+5000,SPAWN[1]+5000];renderer.trim(distant);renderer.refresh(distant);
 const nearest=[...renderer.ground.values()].sort((a,b)=>nearDistance(a.bounds,distant)-nearDistance(b.bounds,distant))[0];
 while(!storage.size)nextFrame();
 setTerrainImpacts([[distant[0],distant[1],20,10,3]]);
 await settle();assert.equal(nearest.terrainRevision,terrainCraterRevision());verifyTile(nearest);
 // Cancel an unfinished GPU upload by leaving the entire region.
 const other=[SPAWN[0]-5000,SPAWN[1]-5000];renderer.trim(other);renderer.refresh(other);
 while(!storage.size)nextFrame();
 assert.equal([...renderer.ground.values()].filter(t=>t.gpu).length,0);
 const cancelled=[...renderer.ground.values()];renderer.trim(SPAWN);
 assert(cancelled.every(t=>t.controller.signal.aborted));
 assert.equal(renderer.preparation.pending,0);assert.equal(storage.size,0);assert.equal(vaos.size,0);
 console.log(JSON.stringify({refresh:'passed',city:CITY.id,catalogueNodes:index.nodes.length,synchronousGroundUploads:0,scheduledFrames:firstFrames,exactTerrain:true,spatialSelection:true,cancelledUploadsReleased:true,terrainRevisionDuringPreparation:true}));
}finally{
 renderer.preparation.dispose();for(const t of renderer.ground.values()){t.controller.abort();renderer.drop(t.gpu);}setTerrainImpacts([]);
}
