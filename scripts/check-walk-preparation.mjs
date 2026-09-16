import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {prepareWalkGeometry,WalkPreparation} from '../dist/walk-preparation.js';
import {applyRoofMode} from '../dist/roof-walk-mode.js';
import {loadTerrain,drapeVertices,subdivideRoads} from '../dist/terrain.js';
import {collisionGeometry} from '../dist/walk-physics.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
const read=async file=>{const b=await fs.readFile('dist/'+file.replace(/^\.\//,''));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
await loadTerrain({fetchBuffer:read});
const index=JSON.parse(await fs.readFile('dist/data/walk/index.json'));
const selected=[...index.nodes.filter(n=>/^\d+\//.test(n[0])).slice(0,12),...index.nodes.filter(n=>n[0].startsWith('roads/')).slice(0,12),...index.nodes.filter(n=>/^(detail|buirette|attila|camp127|parc14)\//.test(n[0])).filter((n,i)=>i%41===0).slice(0,24)];
let compared=0,steps=0;
for(const [file] of selected)for(const mode of ['aerial','catalogue']){
 const raw=await read('data/walk/'+file),size=new DataView(raw).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,size)));
 let expected=new Float32Array(raw.slice(0),4+size),ranges=header.cityRoads?header.ranges.map(([id,first,count])=>[id+index.cityRoadMaterialBase,first,count]):applyRoofMode(header,expected,index,mode);
 if(header.cityRoads){const road=subdivideRoads(expected,ranges);expected=road.vertices;ranges=road.ranges;}
 drapeVertices(expected);const collision=collisionGeometry(expected);
 const iterator=prepareWalkGeometry(raw.slice(0),index,mode);let next;do{next=iterator.next();steps++;}while(!next.done);
 const actual=next.value;
 assert(Buffer.from(actual.vertices.buffer,actual.vertices.byteOffset,actual.vertices.byteLength).equals(Buffer.from(expected.buffer,expected.byteOffset,expected.byteLength)),file+': vertices changed');
 assert.deepEqual(actual.ranges,ranges,file+': materials changed');assert.deepEqual(actual.collision,collision,file+': collisions changed');
 const gpuBytes=new Uint8Array(expected.byteLength);let deleted=0;
 const gl={createVertexArray:()=>1,createBuffer:()=>2,bindVertexArray(){},bindBuffer(){},bufferData(_target,bytes){assert.equal(bytes,expected.byteLength);},bufferSubData(_target,offset,chunk){gpuBytes.set(new Uint8Array(chunk.buffer,chunk.byteOffset,chunk.byteLength),offset);},enableVertexAttribArray(){},vertexAttribPointer(){},deleteVertexArray(){deleted++;},deleteBuffer(){deleted++;}};
 const r=Object.assign(Object.create(WalkRenderer.prototype),{gl}),upload=r.uploadGeometry(actual.vertices);let result;do{result=upload.next();}while(!result.done);
 assert(Buffer.from(gpuBytes).equals(Buffer.from(expected.buffer,expected.byteOffset,expected.byteLength)));assert.equal(deleted,0);
 const abort=r.uploadGeometry(actual.vertices);abort.next();abort.return();assert.equal(deleted,2,'Cancelled uploads must release partial GPU resources');compared++;
}
let now=0;const frames=[],queue=new WalkPreparation({budget:()=>2,now:()=>now,requestFrame:fn=>(frames.push(fn),frames.length),cancelFrame(){}});
let work=0;const jobs=[];
for(let i=0;i<40;i++){const node={controller:new AbortController()};jobs.push(queue.add(node,(function*(){for(let j=0;j<5;j++){work++;now++;yield;}return i;})()));}
assert.equal(work,0,'A download burst must not prepare its objects synchronously');
let frameCount=0;while(frames.length){frames.shift()();frameCount++;}
assert.deepEqual(await Promise.all(jobs),Array.from({length:40},(_,i)=>i));assert(frameCount>=100);assert(queue.stats.maxFrameMs<=2);
const node={controller:new AbortController()},pending=queue.add(node,(function*(){yield;})());node.controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(queue.pending,0);queue.dispose();
const budgetResults=[];
for(const budget of [1,4,20,0]){
 let clock=0,completedWork=0;const callbacks=[],q=new WalkPreparation({budget:()=>budget,now:()=>clock,requestFrame:fn=>(callbacks.push(fn),callbacks.length),cancelFrame(){}}),results=[];
 for(let i=0;i<40;i++)results.push(q.add({controller:new AbortController()},(function*(){for(let j=0;j<3;j++){clock++;completedWork++;yield;}return i;})()));
 callbacks.shift()();const firstFrameWork=completedWork;
 assert.equal(firstFrameWork,budget===0?120:budget,'Configured allowance is used, including values above the old 4 ms cap');
 let frames=1;while(callbacks.length){callbacks.shift()();frames++;}
 assert.deepEqual(await Promise.all(results),Array.from({length:40},(_,i)=>i));assert.equal(completedWork,120);
 if(budget===0)assert.equal(frames,1,'Unlimited drains all already queued work in one frame');
 budgetResults.push({budget,firstFrameWork,frames});q.dispose();
}
console.log(JSON.stringify({preparation:'passed',byteIdenticalCases:compared,generatorSteps:steps,burstObjects:40,workFrames:frameCount,cancelledUploadsReleased:true,budgetResults}));
