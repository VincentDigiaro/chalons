import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {meshCollider,meshDistance,trianglePositions} from '../dist/highwind-collision.js';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {HighwindFlight} from '../dist/highwind-flight.js';
import {shipMatrix,transform,triangleDistance} from '../dist/highwind-math.js';
const near=(a,b)=>assert(Math.abs(a-b)<.0001,`${a} differs from ${b}`);
const triangle=meshCollider(new Float32Array([0,0,0,10,0,0,0,10,0]));
near(meshDistance(triangle,[9,9,0]),Math.sqrt(32));
assert.equal(meshDistance(triangle,[9,9,0],2),Infinity,'Empty corner of a bounding box is not the hull');
near(meshDistance(triangle,[1,1,40],40),40);assert.equal(meshDistance(triangle,[1,1,40.1],40),Infinity);
const index=JSON.parse(await fs.readFile('dist/data/highwind/index.json')),bytes=await fs.readFile('dist/data/highwind/mesh.bin'),vertices=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),collider=meshCollider(trianglePositions(vertices,index.ranges));
// Compare accelerated queries with an independent exhaustive surface search.
for(let i=0;i<80;i++){
 const point=[Math.sin(i*1.7)*.6,Math.cos(i*.7)*.8,Math.sin(i*.3)*.4];let expected=Infinity;
 for(let j=0;j<collider.triangles.length/9;j++)expected=Math.min(expected,triangleDistance(point,...collider.triangle(j)));
 near(meshDistance(collider,point),expected);
 assert.equal(Number.isFinite(meshDistance(collider,point,.15)),expected<=.15);
}
let cases=0;
for(const longueurMetres of [70,150,237])for(const angleDegres of [0,130,280])for(const pitch of [-.17,0,.17])for(const axis of [0,1,2])for(const direction of [-1,1]){
 const pose={longueurMetres,angleDegres,pitch,position:{x:500,y:-1200,z:340}},config={distanceEmbarquementMetres:40};
 const ship=Object.assign(Object.create(FPSHighwind.prototype),{enabled:true,pose,config,residency:{data:{collider}}}),flight=new HighwindFlight(ship);
 let extreme;for(let i=0;i<collider.triangles.length;i+=3){const p=Array.from(collider.triangles.subarray(i,i+3));if(!extreme||p[axis]*direction>extreme[axis]*direction)extreme=p;}
 for(const distance of [39.9,40.1,2000]){
  const p=[...extreme];p[axis]+=direction*distance/longueurMetres;const world=transform(shipMatrix(pose),p),player={position:world.slice(0,2),feet:world[2]-.85};
  flight.updateContact(player);assert.equal(flight.contact,distance<40,'Rotated, scaled hull: '+JSON.stringify({longueurMetres,angleDegres,pitch,axis,direction,distance}));
  if(distance<40)near(ship.contactDistance(player),distance);
  ship.config.distanceEmbarquementMetres=45;flight.updateContact(player);assert.equal(flight.contact,distance<45);ship.config.distanceEmbarquementMetres=40;cases++;
 }
 ship.residency.data=null;flight.updateContact({position:[500,-1200],feet:340});assert(!flight.contact,'Unloaded model cannot leave a stale boarding button');
}
console.log(JSON.stringify({boardingDistance:'passed',cases,exactSurface:true,verticalDistance:true,configurable:true,unloadedHidden:true}));
