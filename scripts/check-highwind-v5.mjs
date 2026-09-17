import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {meshCollider,trianglePositions,shipHitsGround} from '../dist/highwind-collision.js';
import {HighwindFlight,deckExitPosition} from '../dist/highwind-flight.js';
import {advancePlayer} from '../dist/walk-physics.js';
import {inversePoint,rotorMatrix,transform} from '../dist/highwind-math.js';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const base='dist/data/highwind/v5/',index=JSON.parse(await fs.readFile(base+'index.json')),raw=await fs.readFile(base+'mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
assert.equal(hash(await fs.readFile(index.source)),index.sourceSha256);assert.equal(hash(raw),index.meshSha256);assert.equal(raw.length,index.vertexCount*44);
assert.equal(index.objects.length,7);assert.equal(index.vertexCount/3,8133);
assert(index.objects.every(o=>!o.name.includes('hub')&&!o.name.includes('collar')));
assert.equal(index.textures.length,7);
for(const t of index.textures)assert.equal(hash(await fs.readFile(base+t.file)),t.sha256);
assert.equal(index.ranges.reduce((n,r)=>n+r.count,0),index.vertexCount);
assert.equal(index.ranges.filter(r=>r.part==='PropRear').reduce((n,r)=>n+r.count,0),12*36*3);
assert.deepEqual(Object.keys(index.rotors).sort(),['PropL','PropR','PropRear','PropTail']);
for(let i=0;i<vertices.length;i+=11){assert(vertices.subarray(i,i+11).every(Number.isFinite));assert(Math.abs(Math.hypot(...vertices.subarray(i+3,i+6))-1)<1e-5);}
for(const range of index.ranges){
 const rotor=index.rotors[range.part];if(!rotor)continue;
 for(let i=range.first*11;i<(range.first+range.count)*11;i+=11){const p=[...vertices.subarray(i,i+3)],q=transform(rotorMatrix(rotor,.7),p);assert(Math.abs(Math.hypot(...p.map((n,k)=>n-rotor.pivot[k]))-Math.hypot(...q.map((n,k)=>n-rotor.pivot[k])))<1e-6);}
}
const collider=meshCollider(trianglePositions(vertices,index.ranges));let deckCases=0;
for(const length of [150,237,500])for(const pitch of [-Math.PI/18,0,Math.PI/18])for(const angle of [0,37,110,275]){
 const pose={longueurMetres:length,angleDegres:angle,pitch,position:{x:-127,y:-136,z:150}};
 const ship=Object.assign(Object.create(FPSHighwind.prototype),{enabled:true,config:{distanceEmbarquementMetres:71},pose,index,residency:{data:{collider}}});
 const exit=deckExitPosition(ship);assert(exit);const local=inversePoint(pose,[...exit.position,exit.feet]);assert(Math.abs(local[2]-index.deckExit[2])*length<.04);
 const scene=ship.playerCollisionScene();let player={...exit};for(let i=0;i<120;i++)player=advancePlayer(player,0,0,.016,scene);assert(player.grounded);assert(Math.abs(player.feet-exit.feet)<.01);
 const flight=new HighwindFlight(ship);flight.mode='flying';assert.equal(flight.interact(player),'exit');assert.equal(flight.interact(player),'board');
 assert(!shipHitsGround(collider,pose,()=>0));assert(shipHitsGround(collider,{...pose,position:{x:0,y:0,z:0}},()=>0));deckCases++;
}
console.log(JSON.stringify({highwindV5:'passed',triangles:index.vertexCount/3,packedTextures:7,addedHubsRemoved:true,rotors:true,deckCases}));
