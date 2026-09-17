import assert from 'node:assert/strict';
import {BackgroundPreparation} from '../dist/walk-preparation.js';
import {BombScorches,saveScorches,craterSoilPixels,prepareCraterSoilPixels} from '../dist/bomb-scorches.js';
import {terrainCraterRevision,terrainCraterStamp,setTerrainImpacts,terrainCraterField} from '../dist/terrain-craters.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {collisionGeometry} from '../dist/walk-physics.js';
import {nearbyCollision} from '../dist/walk-collision-index.js';
import {boxMesh,combineMeshes,drain} from './bomb-cut-fixtures.mjs';

function controlledQueue(now){
 const callbacks=new Map();let id=0;
 const queue=new BackgroundPreparation({now,requestFrame:fn=>{callbacks.set(++id,fn);return id;},cancelFrame:id=>callbacks.delete(id)});
 const frame=deadline=>{const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn(deadline);};
 const finish=()=>{let frames=0;while(callbacks.size){assert(++frames<100000,'Background work stalled');frame();}return frames;};
 return {queue,callbacks,frame,finish};
}
let clock=0,work=0;const idle=controlledQueue(()=>clock);
const idleDone=idle.queue.add({controller:new AbortController()},(function*(){for(let i=0;i<12;i++){clock++;work++;yield;}})());
idle.frame({timeRemaining:()=>0,didTimeout:false});assert.equal(work,0,'Busy frames defer all optional work');
idle.frame({timeRemaining:()=>0,didTimeout:true});assert.equal(work,1,'A timeout advances one small step, not the whole job');
idle.frame({timeRemaining:()=>50,didTimeout:false});assert.equal(work,3,'Even idle time uses at most the 2 ms work allowance');
idle.finish();await idleDone;assert.equal(work,12);idle.queue.dispose();
assert.deepEqual(drain(prepareCraterSoilPixels()),craterSoilPixels());

// Height sampling is deliberately expensive. draw() may schedule it, never run
// it. The geometry eventually matches the old renderer byte for byte.
let samples=0,uploads=0,deletes=0,ready=0;clock=0;
const gpuData=new Map();let bound;
const gl=new Proxy({createBuffer:()=>({}),createVertexArray:()=>({}),bindBuffer:(_target,buffer)=>bound=buffer,bufferData:(_target,data)=>{uploads++;gpuData.set(bound,data);},deleteBuffer:()=>deletes++},{get:(o,k)=>o[k]??(()=>{})});
const marks=Array.from({length:24},(_,i)=>[i%6*40,Math.floor(i/6)*40,12,12,2,8]);saveScorches(marks);
const scheduled=controlledQueue(()=>clock),scars=new BombScorches(gl,{marks,preparation:scheduled.queue,onReady:()=>ready++,height:(x,y)=>{samples++;clock+=.002;return terrainCraterField().offset(x,y);}});scars.program={};scars.uniforms={};
scars.draw([],[],[100,80]);assert.equal(samples,0);assert.equal(uploads,0);assert.equal(scars.draws,0);assert.equal(scars.pending.size,24);
scheduled.frame();assert(samples>0);assert(scars.cache.size<24,'One frame must not rebuild every trace');
const scorchFrames=scheduled.finish();scars.draw([],[],[100,80]);assert.equal(scars.draws,24);assert.equal(ready,24);assert.equal(scars.pending.size,0);
assert(scheduled.queue.stats.maxFrameMs<2.3,'Scorch sampling yields inside the frame allowance');
const expected=scars.geometry(marks[0]),expectedData=gpuData.get(expected.buffer);assert.deepEqual(gpuData.get(scars.cache.get(0).buffer),expectedData);scars.release(expected);
const oldGPU=scars.cache.get(0),farGPU=scars.cache.get(23),beforeUploads=uploads,beforeSamples=samples;
scars.add([0,0,0],12,12,2,8);scars.draw([],[],[100,80]);assert.equal(samples,beforeSamples);assert.equal(uploads,beforeUploads);assert.equal(scars.cache.get(0),oldGPU,'Keep the old trace while its replacement is prepared');assert.equal(scars.draws,24);
assert.equal(scars.pending.size,1,'Only the overlapping trace is rebuilt; repeated positions share one draw');
scheduled.finish();scars.draw([],[],[100,80]);assert.notEqual(scars.cache.get(0),oldGPU);assert.equal(scars.cache.get(23),farGPU,'A distant crater does not invalidate this buffer');
// Another impact during preparation must not be lost or publish a partial mesh.
scars.add([0,0,0],12,12,2,8);scars.draw([],[],[100,80]);scheduled.frame();scars.add([0,0,0],12,12,2,8);scars.draw([],[],[100,80]);scheduled.finish();scars.draw([],[],[100,80]);scheduled.finish();scars.draw([],[],[100,80]);assert.equal(scars.cache.get(0).revision,terrainCraterRevision());assert.equal(scars.pending.size,0);
scars.add([500,500,0],12,12,2,8);scars.draw([],[],[200,200]);assert(scars.pending.size>0);const beforeCancel=uploads;scars.dispose();scheduled.finish();assert.equal(uploads,beforeCancel,'Disposal cancels queued uploads');scheduled.queue.dispose();assert(deletes>0);

// Resident terrain and building changes use the background queue even when
// foreground loading has a large/unlimited allowance. Collisions switch with
// their visual geometry, and their spatial index is ready before movement uses it.
setTerrainImpacts([]);clock=0;
const background=controlledQueue(()=>clock+=.05),index={materials:[{kind:0},{kind:6}]};
const base=combineMeshes(boxMesh(8,-4,22,4,{material:0}),boxMesh(-25,-25,25,25,{bottom:0,top:.035,material:1}));base.collision=collisionGeometry(base.vertices);
const oldNodeGPU={},oldTileGPU={},node={file:'detail/background.bin',bounds:[-25,-25,25,25],mesh:base,collision:base.collision,ranges:base.ranges,gpu:oldNodeGPU,hasGround:true,bombImpactCount:0,terrainRevision:terrainCraterRevision(),terrainStamp:terrainCraterStamp([-25,-25,25,25]),controller:new AbortController()};
const tile={bounds:[-32,-32,32,32],gpu:oldTileGPU,terrainRevision:terrainCraterRevision(),terrainStamp:terrainCraterStamp([-32,-32,32,32]),controller:new AbortController()};
const impacts=[],renderer=Object.assign(Object.create(WalkRenderer.prototype),{gl,index,damagePreparation:background.queue,preparation:{add(){throw Error('Damage entered the foreground loading queue');}},errors:0,bombs:{craters:impacts}});
const impact=[0,0,12,12,2,8];impacts.push(impact);setTerrainImpacts(impacts);renderer.ensureBombDamage(node);renderer.ensureTerrainTile(tile);
assert.equal(background.queue.pending,2);assert.equal(node.gpu,oldNodeGPU);assert.equal(node.collision,base.collision);assert.equal(tile.gpu,oldTileGPU);
let geometryFrames=0;
while(background.callbacks.size){background.frame();geometryFrames++;assert.equal(node.gpu===oldNodeGPU,node.collision===base.collision,'No partially installed collision/render pair');}
await Promise.resolve();await Promise.resolve();assert(geometryFrames>1);assert.notEqual(tile.gpu,oldTileGPU);assert.notEqual(node.gpu,oldNodeGPU);assert.equal(renderer.errors,0);assert.equal(node.terrainRevision,terrainCraterRevision());
Object.defineProperty(node.collision,'segments',{get(){throw Error('Collision index built synchronously after installation');}});nearbyCollision(node.collision,[-5,-5,5,5]);
const unchangedNodeGPU=node.gpu,unchangedTileGPU=tile.gpu;
impacts.push([3000,3000,12,12,2,8]);setTerrainImpacts(impacts);renderer.ensureBombDamage(node);renderer.ensureTerrainTile(tile);assert.equal(background.queue.pending,0,'Distant impacts do not rebuild previously cratered terrain');assert.equal(node.gpu,unchangedNodeGPU);assert.equal(tile.gpu,unchangedTileGPU);
background.queue.dispose();saveScorches([]);
console.log(JSON.stringify({backgroundDestruction:'passed',idleTimeRespected:true,timeoutMakesBoundedProgress:true,scorchFrames,geometryFrames,drawDoesNoSamplingOrUpload:true,oldBuffersKeptUntilReady:true,localInvalidation:true,collisionIndexPrepared:true,successiveImpactsPreserved:true,cancellationReleasesWork:true}));
