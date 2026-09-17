import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {FPSHighwind,placeHighwind} from '../dist/fps-highwind.js';
import {meshCollider,trianglePositions,shipHitsGround} from '../dist/highwind-collision.js';
import {HighwindFlight,deckExitPosition} from '../dist/highwind-flight.js';
import {advancePlayer,surfaceHeights} from '../dist/walk-physics.js';
import {inversePoint,rotorMatrix,transform} from '../dist/highwind-math.js';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const base='dist/data/highwind/v4/',index=JSON.parse(await fs.readFile(base+'index.json')),raw=await fs.readFile(base+'mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
assert.equal(hash(await fs.readFile(index.source)),index.sourceSha256,'Export comes from the current user-specified .blend');
assert.equal(hash(raw),index.meshSha256);assert.equal(raw.length,index.vertexCount*44);
assert.equal(index.vertexCount/3,8833);assert.equal(index.objects.length,16);assert.equal(index.ranges.reduce((s,r)=>s+r.count,0),index.vertexCount);
assert(index.objects.some(o=>o.name.startsWith('Pont |')));assert(index.objects.some(o=>o.name.startsWith('Balustrade |')));
assert.equal(index.objects.filter(o=>o.name.startsWith('Tail propeller')&&o.part==='PropTail').length,6,'All new tail hubs and collars follow their parent rotor');
for(const texture of index.textures)assert.equal(hash(await fs.readFile(base+texture.file)),texture.sha256,'Packed textures are preserved byte-for-byte');
for(let i=0;i<vertices.length;i+=11){assert(vertices.subarray(i,i+11).every(Number.isFinite));assert(Math.abs(Math.hypot(...vertices.subarray(i+3,i+6))-1)<1e-5);}
assert.equal(index.ranges.filter(r=>r.part==='PropRear').reduce((s,r)=>s+r.count,0),12*36*3);
assert.deepEqual(Object.keys(index.rotors).sort(),['PropL','PropR','PropRear','PropTail']);
for(const r of index.ranges){
 assert(r.first+r.count<=index.vertexCount&&r.count%3===0);const rotor=index.rotors[r.part];if(!rotor)continue;
 for(let i=r.first*11;i<(r.first+r.count)*11;i+=11){const point=[...vertices.subarray(i,i+3)],moved=transform(rotorMatrix(rotor,.7),point),axis=rotor.axis.findIndex(v=>v===1);assert(Math.abs(point[axis]-moved[axis])<1e-6);assert(Math.abs(Math.hypot(...point.map((v,k)=>v-rotor.pivot[k]))-Math.hypot(...moved.map((v,k)=>v-rotor.pivot[k])))<1e-6);}
}
const collider=meshCollider(trianglePositions(vertices,index.ranges));let deckCases=0;
for(const length of [150,237,500])for(const pitch of [-Math.PI/18,0,Math.PI/18])for(const angle of [0,37,110,275]){
 const pose={longueurMetres:length,angleDegres:angle,pitch,position:{x:-127,y:-136,z:150}};
 const ship=Object.assign(Object.create(FPSHighwind.prototype),{enabled:true,config:{distanceEmbarquementMetres:71},pose,index,residency:{data:{collider}}});
 const exit=deckExitPosition(ship);assert(exit,`Wooden deck exit: ${length}, ${pitch}, ${angle}`);
 const local=inversePoint(pose,[...exit.position,exit.feet]);assert(Math.abs(local[2]-index.deckExit[2])*length<.04,'Exit is on the new wood deck, allowing the foot radius on an inclined surface');
 const scene=ship.playerCollisionScene(),ceilings=surfaceHeights(exit.position,scene.surfaces).filter(z=>z>exit.feet+.1);
 assert(Math.min(...ceilings)-exit.feet>1.7,'Standing headroom on the v4 deck');
 let player={...exit};for(let i=0;i<120;i++)player=advancePlayer(player,0,0,.016,scene);assert(player.grounded);assert(Math.abs(player.feet-exit.feet)<.01,'The player remains standing');
 const flight=new HighwindFlight(ship);flight.mode='flying';const before=structuredClone(pose);assert.equal(flight.interact(player),'exit');assert.deepEqual(ship.pose,before);assert.equal(flight.interact(player),'board');
 assert(!shipHitsGround(collider,pose,()=>0));assert(shipHitsGround(collider,{...pose,position:{x:0,y:0,z:0}},()=>0));deckCases++;
}
for(const length of [150,237]){const placed=placeHighwind(vertices,{longueurMetres:length,angleDegres:0,position:{x:0,y:0,z:0}}),ys=[];for(let i=1;i<placed.length;i+=11)ys.push(placed[i]);assert(Math.abs(Math.max(...ys)-Math.min(...ys)-length)<.0001);}
console.log(JSON.stringify({highwindV4:'passed',sourceFile:index.source,sourceHashVerified:true,packedTextures:5,triangles:index.vertexCount/3,all16Objects:true,animatedHubs:true,deckCases,standingAndReboarding:true}));
