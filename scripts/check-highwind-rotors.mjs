import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FPS_CONFIG,validateHighwindConfig} from '../dist/walk-config.js';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {shipMatrix,transform,inversePoint} from '../dist/highwind-math.js';
const near=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const parts=['PropL','PropR','PropRear','PropTail'];
const index=JSON.parse(await fs.readFile('dist/data/highwind/index.json'));
const bytes=await fs.readFile('dist/data/highwind/mesh.bin'),vertices=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4);
assert.deepEqual(Object.keys(index.rotors).sort(),parts);
assert.deepEqual(Object.keys(FPS_CONFIG.highwind.vitessesHelicesToursParSeconde).sort(),parts);
for(const rotor of Object.values(index.rotors))assert(!('speed' in rotor),'Speed belongs only in fps-config.json');
const range=index.ranges.find(r=>r.part==='PropTail');
assert.equal(range.count,540,'All three tail propellers contain 180 triangles');
assert.equal(index.ranges.filter(r=>r.part==='PropTail').length,1,'One draw and pivot for all three propellers');
const pivot=index.rotors.PropTail.pivot;
const tailPoints=[];
for(let i=range.first*11;i<(range.first+range.count)*11;i+=11)tailPoints.push(Array.from(vertices.subarray(i,i+3)));
tailPoints.sort((a,b)=>a[1]-b[1]);
const disks=[];
for(const point of tailPoints){
 const last=disks.at(-1);
 if(!last||point[1]-last.at(-1)[1]>.03)disks.push([point]);else last.push(point);
}
assert.deepEqual(disks.map(d=>d.length),[180,180,180],'Three distinct propeller disks, including the one next to the turbine');
assert.equal(index.ranges.find(r=>r.part==='Turbine').count,214*3,'Only the shaft remains fixed');
assert.deepEqual(index.rotors.PropTail.axis,[0,1,0]);
const rates={PropL:.13,PropR:.71,PropRear:1.37,PropTail:2};
const config=validateHighwindConfig({...FPS_CONFIG.highwind,vitessesHelicesToursParSeconde:rates});
assert(Object.isFrozen(config.vitessesHelicesToursParSeconde));
for(const part of parts)for(const value of [undefined,null,'2',-1,NaN,Infinity])assert.throws(()=>validateHighwindConfig({...config,vitessesHelicesToursParSeconde:{...rates,[part]:value}}),new RegExp(part));
for(const value of [null,[],2,{...rates,PropTypo:1}])assert.throws(()=>validateHighwindConfig({...config,vitessesHelicesToursParSeconde:value}),/vitessesHelices/);
validateHighwindConfig({...config,vitessesHelicesToursParSeconde:Object.fromEntries(parts.map(p=>[p,0]))});
function makeShip(speeds=rates){
 const ship=new FPSHighwind({}, {...config,vitessesHelicesToursParSeconde:{...speeds}},{enabled:true});
 ship.index=index;ship.residency={data:{gpu:{}}};return ship;
}
function draws(ship){const matrices=new Map();ship.draw((gpu,id,first,count,m)=>{matrices.set(index.ranges.find(r=>r.first===first).part,m);return true;},[]);return matrices;}
function expectedPoint(point,rotor,turns){
 const p=rotor.pivot,a=2*Math.PI*turns*rotor.direction,c=Math.cos(a),s=Math.sin(a),q=point.map((x,i)=>x-p[i]);
 return rotor.axis[2]===1?[p[0]+c*q[0]-s*q[1],p[1]+s*q[0]+c*q[1],point[2]]:[p[0]+c*q[0]+s*q[2],point[1],p[2]-s*q[0]+c*q[2]];
}
for(const fps of [4,13,60,144]){
 const ship=makeShip();let elapsed=0;
 for(const target of [.125,.25,.5,1.125,4.125]){
  while(elapsed<target-1e-12){const dt=Math.min(1/fps,target-elapsed);ship.animate(dt);elapsed+=dt;}
  const matrices=draws(ship);
  for(const part of parts){
   const rotor=index.rotors[part],point=[rotor.pivot[0]+.1,rotor.pivot[1],rotor.pivot[2]];
   const actual=inversePoint(ship.pose,transform(matrices.get(part),point));
   expectedPoint(point,rotor,target*rates[part]).forEach((n,i)=>near(actual[i],n));
  }
  for(const disk of disks){
   const point=disk.reduce((best,p)=>Math.hypot(p[0]-pivot[0],p[2]-pivot[2])>Math.hypot(best[0]-pivot[0],best[2]-pivot[2])?p:best);
   const actual=inversePoint(ship.pose,transform(matrices.get('PropTail'),point));
   expectedPoint(point,index.rotors.PropTail,target*2).forEach((n,i)=>near(actual[i],n));
   near(actual[1],point[1]);
   near(Math.hypot(actual[0]-pivot[0],actual[2]-pivot[2]),Math.hypot(point[0]-pivot[0],point[2]-pivot[2]));
  }
  assert.deepEqual(Array.from(matrices.get('Turbine')),Array.from(shipMatrix(ship.pose)),'The shaft remains fixed');
 }
 const before={...ship.rotorAngles};for(const dt of [-1,NaN,Infinity,0])ship.animate(dt);assert.deepEqual(ship.rotorAngles,before);
 ship.config.vitessesHelicesToursParSeconde.PropTail=0;ship.animate(.17);near(ship.rotorAngles.PropTail,before.PropTail);
 assert.notEqual(ship.rotorAngles.PropL,before.PropL,'Each speed is independent');
}
console.log(JSON.stringify({highwindRotors:'passed',tailTurnsPerSecondTested:2,configuredTailTurnsPerSecond:FPS_CONFIG.highwind.vitessesHelicesToursParSeconde.PropTail,sharedTailPivot:true,tailPropellers:disks.length,tailTriangles:180,frameRates:[4,13,60,144],fractionalSpeedsContinuous:true,zeroStopsRotor:true,allSpeedsFromFPSConfig:true}));
