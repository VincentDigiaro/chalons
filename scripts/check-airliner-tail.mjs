// Regression: paint must partition the fin, never float over another face.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='artifacts/nice-airliners',before='artifacts/nice-airliners-tail-fix/before';
const index=JSON.parse(await fs.readFile(root+'/airliner.json')),raw=await fs.readFile(root+'/airliner.bin');
const data=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length));
const fin=index.objects.find(o=>o.name==='Dérive bleue');assert(fin);
assert(!index.objects.some(o=>o.name.startsWith('Livrée empennage')),'No floating paint overlay');
const outline=[[-10.5,4.9],[-13,6],[-14.9,11.65],[-17.25,11.65],[-18.1,4.7]],mark=[[-15,6.1],[-16.85,10.6],[-17.15,10.6],[-16.4,6.1]];
const signed=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2,area=p=>Math.abs(signed(p));
function intersection(subject,clipper){
 if(signed(clipper)<0)clipper=[...clipper].reverse();
 let output=subject;
 for(let i=0;i<clipper.length&&output.length;i++){
  const a=clipper[i],b=clipper[(i+1)%clipper.length],distance=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const input=output;output=[];
  for(let j=0;j<input.length;j++){
   const p=input[j],q=input[(j+1)%input.length],dp=distance(p),dq=distance(q);
   if(dp>=0)output.push(p);
   if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);output.push(p.map((v,k)=>v+t*(q[k]-v)));}
  }
 }
 return output.length>=3?area(output):0;
}
const sides=new Map([[-1,[]],[1,[]]]);
for(let v=fin.first;v<fin.first+fin.count;v+=3){
 const vertices=[0,1,2].map(k=>Array.from(data.subarray((v+k)*11,(v+k+1)*11))),x=vertices.map(p=>p[0]);
 if(Math.max(...x)-Math.min(...x)>.00001)continue;
 assert(Math.abs(Math.abs(x[0])-.18)<1e-6,'The paint is in the fin plane');
 sides.get(Math.sign(x[0])).push({p:vertices.map(p=>p.slice(1,3)),white:vertices[0][8]>.8});
}
let largestOverlap=0;
for(const triangles of sides.values()){
 assert(triangles.length>0);
 assert(Math.abs(triangles.reduce((sum,t)=>sum+area(t.p),0)-area(outline))<.0001,'Fin coverage, without a second skin');
 assert(Math.abs(triangles.filter(t=>t.white).reduce((sum,t)=>sum+area(t.p),0)-area(mark))<.0001,'Both sides retain the exact painted motif');
 for(let i=0;i<triangles.length;i++)for(let j=0;j<i;j++)largestOverlap=Math.max(largestOverlap,intersection(triangles[i].p,triangles[j].p));
}
assert(largestOverlap<1e-5,'No overlapping blue/white triangles');
let preserved=0;
const oldIndex=JSON.parse(await fs.readFile(before+'/airliner.json')),oldRaw=await fs.readFile(before+'/airliner.bin');
for(const obj of index.objects.filter(o=>o!==fin)){
 const old=oldIndex.objects.find(o=>o.name===obj.name);assert(old,obj.name);assert.equal(obj.count,old.count,obj.name);
 assert(raw.subarray(obj.first*44,(obj.first+obj.count)*44).equals(oldRaw.subarray(old.first*44,(old.first+old.count)*44)),'Unrelated aircraft geometry changed: '+obj.name);preserved++;
}
const result={passed:true,paintInFinSurface:true,floatingDecals:0,largestOverlapSquareMetres:largestOverlap,unrelatedObjectsPreserved:preserved};
await fs.writeFile('artifacts/nice-airliners-tail-fix/geometry-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
