import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {highwindShadowProjection,highwindShadowRadius} from '../dist/highwind-shadow.js';
import {shipMatrix,rotorMatrix,multiply,transform} from '../dist/highwind-math.js';
import {SUN_DIRECTION} from '../dist/scene-sky.js';

const index=JSON.parse(await fs.readFile('dist/data/highwind/index.json'));
const raw=await fs.readFile('dist/data/highwind/mesh.bin'),vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
const near=(a,b)=>assert(Math.abs(a-b)<.0001,`${a} != ${b}`);
const projected=(projection,p)=>transform(projection.matrix,p.map((v,i)=>v-projection.origin[i]));
let radius=highwindShadowRadius(index),checked=0;
for(const range of index.ranges){
 const rotor=index.rotors?.[range.part];if(!rotor)continue;
 for(let i=range.first*11;i<(range.first+range.count)*11;i+=11)radius=Math.max(radius,Math.hypot(...rotor.pivot)+Math.hypot(...rotor.pivot.map((p,j)=>vertices[i+j]-p)));
}
for(const length of [15,150,237])for(const angle of [0,37,110,275])for(const pitch of [-.6,0,.6]){
 const pose={position:{x:6500,y:-4300,z:1700},longueurMetres:length,angleDegres:angle,pitch};
 const projection=highwindShadowProjection(index,pose,1024,radius),model=shipMatrix(pose);
 for(const range of index.ranges)for(const rotorAngle of [0,1.7,4.3]){
  const rotor=index.rotors?.[range.part],matrix=rotor?multiply(model,rotorMatrix(rotor,rotorAngle)):model;
  for(let i=range.first*11;i<(range.first+range.count)*11;i+=11){
   const p=transform(matrix,vertices.subarray(i,i+3)),clip=projected(projection,p);
   assert(clip.every(v=>Math.abs(v)<1),'Animated geometry must stay inside the shadow map');
   // Moving along a solar ray preserves XY in shadow space at any altitude.
   const ground=[p[0]-SUN_DIRECTION[0]/SUN_DIRECTION[2]*p[2],p[1]-SUN_DIRECTION[1]/SUN_DIRECTION[2]*p[2],0],q=projected(projection,ground);
   near(clip[0],q[0]);near(clip[1],q[1]);assert(q[2]>clip[2]);checked++;
  }
 }
 const moved={...pose,position:{x:pose.position.x+81,y:pose.position.y-72,z:pose.position.z+44}};
 assert.deepEqual(highwindShadowProjection(index,moved,1024,radius).matrix,projection.matrix,'Translation must not change scale or depth precision');
}
console.log(JSON.stringify({highwindShadow:'passed',projectedVertices:checked,lengths:[15,150,237],rotationAndPitch:true,animatedRotorsFit:true,sunProjection:true,altitudeIndependentPrecision:true}));
