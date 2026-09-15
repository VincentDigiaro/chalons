import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const read=async f=>JSON.parse(await fs.readFile(f));
const index=await read('dist/data/parc14/index.json'),roads=await read('dist/data/city-roads/index.json');
const frame=([x,y])=>[(x+413)*index.frame.u[0]+(y-2800)*index.frame.u[1],(x+413)*index.frame.v[0]+(y-2800)*index.frame.v[1]];
const modelFrame=([x,y])=>[x*index.frame.u[0]+y*index.frame.u[1],x*index.frame.v[0]+y*index.frame.v[1]];
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
const box=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
const intersects=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
function intersection(subject,mask){
 const sign=Math.sign(mask.reduce((s,a,i)=>{const b=mask[(i+1)%3];return s+a[0]*b[1]-a[1]*b[0];},0));
 for(let i=0;i<3&&subject.length;i++){
  const a=mask[i],b=mask[(i+1)%3],side=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])),out=[];
  for(let j=0;j<subject.length;j++){const p=subject[j],q=subject[(j+1)%subject.length],sp=side(p),sq=side(q);if(sp>=0)out.push(p);if((sp>=0)!==(sq>=0))out.push(p.map((n,k)=>n+(q[k]-n)*sp/(sp-sq)));}
  subject=out;
 }
 return subject.length>2?area(subject):0;
}
const street=[];
for(const [file,x0,y0,x1,y1]of roads.nodes){
 if(x0>=-350||x1<=-480||y0>=2840||y1<=2750)continue;
 const b=await fs.readFile('dist/data/city-roads/'+file),size=b.readUInt32LE(0),a=new Float32Array(b.buffer.slice(b.byteOffset+4+size,b.byteOffset+b.length));
 for(let i=0;i<a.length;i+=33){if(Math.max(a[i+2],a[i+13],a[i+24])>.5)continue;const p=[0,11,22].map(k=>frame(a.subarray(i+k,i+k+2)));if(area(p)>1e-8)street.push({p,b:box(p)});}
}
async function grounds(root){
 const m=await read(root+'/index.json'),b=await fs.readFile(root+'/mesh.bin'),a=new Float32Array(b.buffer,b.byteOffset,b.length/4),ground=[];let duplicateKerbVertices=0;
 for(const range of m.ranges){
  if(range.material===8)for(let i=range.first*11;i<(range.first+range.count)*11;i+=11)if(a[i+2]<.16&&Math.abs(a[i+8]-181/255)<1e-6&&Math.abs(a[i+9]-178/255)<1e-6&&Math.abs(a[i+10]-164/255)<1e-6)duplicateKerbVertices++;
  if(range.material!==6&&range.material!==8)continue;
  for(let i=range.first*11;i<(range.first+range.count)*11;i+=33){
   if(a[i+5]<.9||![.027,.028,.035,.045,.046,.055].some(z=>[0,11,22].every(k=>Math.abs(a[i+k+2]-z)<1e-6)))continue;
   const p=[0,11,22].map(k=>modelFrame(a.subarray(i+k,i+k+2)));ground.push({p,b:box(p),material:range.material});
  }
 }
 const overlap=ground.reduce((sum,g)=>sum+street.reduce((n,s)=>n+(intersects(g.b,s.b)?intersection(g.p,s.p):0),0),0);
 return {ground,overlap,duplicateKerbVertices};
}
const before=await grounds('artifacts/parc14-corrections/before/data/parc14'),after=await grounds('dist/data/parc14');
assert(before.overlap>1,'The regression fixture includes actual garden/street overlaps');
assert(after.overlap<.001,'Ground overlaps the street by '+after.overlap+' square metres');
assert(before.duplicateKerbVertices>0);assert.equal(after.duplicateKerbVertices,0,'Remove the extra kerb that shares the street pavement height');
function contains(p,t){const s=t.map((a,i)=>{const b=t[(i+1)%3];return(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);});return s.every(x=>x>=-1e-7)||s.every(x=>x<=1e-7);}
const blueSamples=[[-13,-10],[-13,-3],[-13,5],[-13,13],[-35,-20],[-30,-20],[-21,-16]];
for(const p of blueSamples){assert(!before.ground.some(g=>g.material===6&&contains(p,g.p)),'Sample must target a reported bare area');assert(after.ground.some(g=>g.material===6&&contains(p,g.p)),'Missing grass at '+p);}
const dormers=index.siteDetails.filter(d=>d.type==='triangular-dormer'&&d.side==='front');
for(const d of dormers){assert(Math.abs(d.width/d.height-2.5/1.65)<1e-6,'Photo-matched triangular proportions');assert.equal(d.lowerPaneCount,6);assert.deepEqual(d.transomHeightRatios,[.45,.70,.86]);}
const result={passed:true,bareZonesGrassed:blueSamples.length,duplicateKerbRemoved:true,streetOverlapBeforeM2:before.overlap,streetOverlapAfterM2:after.overlap,dormerWidthMetres:dormers[0].width,dormerHeightMetres:dormers[0].height,frontDormers:dormers.length};
await fs.writeFile('artifacts/parc14-corrections/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
