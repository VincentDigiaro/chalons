import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=process.argv[2]||'dist',read=async n=>JSON.parse(await fs.readFile(`${root}/data/nerval/${n}`));
const s=await read('survey.json'),index=await read('index.json'),raw=await fs.readFile(`${root}/data/nerval/mesh.bin`),f=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
for(const r of JSON.parse(await fs.readFile('scripts/nerval-roundabout-references.json')))assert.equal(crypto.createHash('sha256').update(await fs.readFile(r.file)).digest('hex'),r.sha256);
const house=n=>s.roundabout.houseParts[n],open=n=>s.openings.filter(o=>house(n).includes(o.part));
assert.deepEqual(Object.keys(s.roundabout.houseParts),['22','24','26','28','30','32']);
const entry=open(32).find(o=>o.entry32),windows=open(32).filter(o=>!o.kind);assert(entry&&windows.length===2&&windows.every(o=>entry.along<o.along),'The white-framed entrance is left of the two windows');
for(const n of [22,24,26,28,30,32])assert.equal(open(n).filter(o=>o.kind==='garage').length,1,`One garage on ${n}`);
assert(open(28).some(o=>o.kind==='patio'&&o.bottom>2.5));assert(index.objects.some(o=>o.type==='flowered-balcony'&&o.garageBelow));
assert(open(30).some(o=>o.kind==='door'&&o.woodPanels));assert(open(30).some(o=>o.closed));assert(open(22).some(o=>o.archedGlass));assert(open(24).filter(o=>o.stone).length>=4);
for(const id of [76,73])assert(index.excludeIds.includes(s.parts.find(p=>p.id===id).osm_id));
const area=r=>Math.abs(r.reduce((n,q,i)=>{const b=r[(i+1)%r.length];return n+q[0]*b[1]-q[1]*b[0];},0)/2);
for(const id of s.roundabout.parts){const p=s.parts.find(p=>p.id===id);assert(Math.abs(area(p.ring)-index.pickTriangles.filter(t=>t.part===id).reduce((n,t)=>n+area(t.points),0))<.001,'Original footprint remains intact: '+id);}
for(let i=0;i<f.length;i+=11){assert(Array.from(f.subarray(i,i+11)).every(Number.isFinite));assert(f[i+2]>=0&&f[i+2]<16,'Valid elevation');}
assert.equal(raw.length,index.vertexCount*44);
// A long straight boundary must still triangulate into an actual lawn. The
// satellite image beneath it is not a replacement for the photographed garden.
const grass=index.ranges.filter(r=>index.materials[r.material].kind===8);
for(const id of [77,78]){const p=s.parts.find(p=>p.id===id),x=id===77?-3:0,y=p.bounds[0][1]-3.5,q=p.center.map((n,i)=>n+p.u[i]*x+p.v[i]*y);let covered=false;
 for(const range of grass)for(let v=range.first;v<range.first+range.count;v+=3){const pts=[0,1,2].map(i=>Array.from(f.subarray((v+i)*11,(v+i)*11+3)));if(pts.some(p=>p[2]>.20))continue;const signs=pts.map((a,i)=>{const b=pts[(i+1)%3];return (b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]);});if(signs.every(n=>n>=-.001)||signs.every(n=>n<=.001))covered=true;}
 assert(covered,'Missing actual lawn geometry in front of '+id);
}
console.log(JSON.stringify({roundabout:'passed',houses:6,osmParts:7,referencePhotos:8,entrance32Verified:true,balcony28Verified:true,triangles:index.stats.triangles}));
