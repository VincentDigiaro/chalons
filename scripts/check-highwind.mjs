import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {placeHighwind,highwindBounds,FPSHighwind} from '../dist/fps-highwind.js';
import {validateHighwindConfig} from '../dist/walk-config.js';
const config={present:true,longueurMetres:237,position:{x:20,y:60,z:140},angleDegres:0,dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18};
const index=JSON.parse(await fs.readFile('dist/data/highwind/index.json'));
const raw=await fs.readFile('dist/data/highwind/mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),index.meshSha256);
assert.equal(raw.length,index.vertexCount*44);assert.equal(index.vertexCount,15492);assert.equal(index.materials.length,4);
assert.equal(index.ranges.reduce((n,r)=>n+r.count,0),index.vertexCount);
for(let i=0;i<vertices.length;i+=11){assert(Array.from(vertices.subarray(i,i+11)).every(Number.isFinite));assert(Math.abs(Math.hypot(...vertices.subarray(i+3,i+6))-1)<1e-5);}
for(const r of index.ranges){assert(r.first+r.count<=index.vertexCount&&r.count%3===0);assert(index.materials[r.material]);}
assert.deepEqual(index.materials.map(m=>m.texture).sort(),['Highwind1.png','Highwind2.png','Highwind3.png','color.png']);
for(const m of index.materials){const png=await fs.readFile('dist/data/highwind/'+m.texture);assert.equal(png.subarray(1,4).toString(),'PNG');}
for(const angle of [0,90,135,360,-90])for(const length of [237,118.5]){
 const c=validateHighwindConfig({...config,longueurMetres:length,angleDegres:angle}),v=placeHighwind(vertices,c),a=angle*Math.PI/180,forward=[];
 for(let i=0;i<v.length;i+=11){forward.push((v[i]-c.position.x)*Math.sin(a)+(v[i+1]-c.position.y)*Math.cos(a));assert.equal(v[i+6],vertices[i+6]);assert.equal(v[i+7],vertices[i+7]);assert(Math.abs(Math.hypot(...v.subarray(i+3,i+6))-1)<1e-5);}
 assert(Math.abs(Math.max(...forward)-Math.min(...forward)-length)<.0001,'Configured bow-to-stern length');
 const bounds=highwindBounds(index,c);for(let i=0;i<v.length;i+=11){assert(v[i]>=bounds.horizontal[0]-.0001&&v[i]<=bounds.horizontal[2]+.0001);assert(v[i+2]>=bounds.vertical[0]-.0001&&v[i+2]<=bounds.vertical[1]+.0001);}
}
const nose=placeHighwind(new Float32Array([0,.5,0,0,1,0,0,0,1,1,1]),{...config,angleDegres:90});assert(Math.abs(nose[0]-138.5)<.0001);assert.equal(nose[1],60);
let requests=0,uploads=0,drops=0;
globalThis.fetch=async(url,{signal}={})=>{requests++;if(signal?.aborted)throw new DOMException('Aborted','AbortError');return new Response(await fs.readFile('dist/'+url.replace('./','')));};
const renderer={index:{materials:[]},geometry:v=>{uploads++;return {bytes:v.byteLength};},drop:g=>{if(g)drops++;},texture(){},material(id){return this.index.materials[id];}};
const idle=new FPSHighwind(renderer,{...config,present:false});idle.refresh([20,60]);await new Promise(r=>setTimeout(r,5));assert.equal(requests,0);idle.dispose();
const hidden=new FPSHighwind(renderer,config);hidden.refresh([20,60]);assert.equal(requests,0,'No URL ff7: no model requests');hidden.dispose();
const model=new FPSHighwind(renderer,config,{enabled:true});model.refresh([3000,3000]);assert.equal(requests,0,'No model download far away');
model.refresh([20,60]);await model.initializing;await model.residency.pending;assert.equal(requests,2);assert.equal(uploads,1);assert.equal(model.getState().loaded,true);assert.equal(model.textureKeys().length,4);
assert.equal(model.draw(()=>true),index.ranges.length,'The loaded Hautvent is rendered without a camera-direction filter');
model.refresh([3000,3000]);assert.equal(model.getState().loaded,false);assert.equal(drops,1);assert.equal(model.textureKeys().length,0);
model.refresh([20,60]);await model.residency.pending;assert.equal(uploads,2);assert.equal(requests,3,'Reuse the descriptor on re-entry');model.dispose();assert.equal(uploads,drops,'Dispose all model geometry');
const cancelled=new FPSHighwind(renderer,config,{enabled:true});cancelled.refresh([20,60]);cancelled.dispose();await cancelled.initializing;assert.equal(uploads,drops,'A cancelled load must not create geometry');
// Configured pose stays authoritative even with legacy relative-spawn settings.
for(const position of [{x:-175,y:-98,z:100},{x:1700,y:2200,z:75}]){
 const configured=validateHighwindConfig({...config,position,angleDegres:309,hauteurApparitionMetres:999,distanceDerriereJoueurMetres:999});
 const placed=new FPSHighwind(renderer,configured,{enabled:true}),beforeRequests=requests;
 placed.refresh([position.x+2000,position.y]);assert.equal(requests,beforeRequests,'Load radius is centred on the configured ship');
 placed.refresh([position.x+100,position.y-100]);await placed.initializing;await placed.residency.pending;
 assert.deepEqual(placed.pose.position,position);assert.equal(placed.pose.angleDegres,309);assert(placed.getState().loaded);
 placed.refresh([position.x-100,position.y+100]);assert.deepEqual(placed.pose.position,position);
 placed.pose.position.x+=10;assert.equal(configured.position.x,position.x,'Flight state must not mutate the JSON configuration');
 placed.dispose();assert.equal(uploads,drops);
}
console.log(JSON.stringify({highwind:'passed',triangles:index.vertexCount/3,textures:4,lengths:[237,118.5],angles:[0,90,135,360,-90],disabledMeansNoRequests:true,streamingRadius:500,resourcesReleased:true}));
