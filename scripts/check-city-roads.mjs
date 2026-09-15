import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {inRange,toLocal,SPAWN} from '../dist/walk-core.js';
const root='dist/data/city-roads/',index=JSON.parse(await fs.readFile(root+'index.json')),walk=JSON.parse(await fs.readFile('dist/data/walk/index.json'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const [file,hash] of Object.entries(index.sourceHashes))assert.equal(sha(await fs.readFile(file)),hash,'Stale road input: '+file);
assert(index.stats.ways>6800);assert(index.stats.crossingWays>50);assert(index.stats.protectedArea>8000);
assert.equal(walk.stats.cityRoadVertices,index.stats.vertices);
assert.equal(walk.nodes.filter(n=>n[0].startsWith('roads/')).length,index.nodes.length);
const probes=[SPAWN,toLocal([4.3631,48.9566]),toLocal([4.37273,48.96513]),toLocal([4.31695,48.96446]),toLocal([4.40638,48.920079])];
const nearby=probes.map(()=>({bytes:0,assets:0}));let bytes=0,vertices=0,raised=0,risers=0;
for(const [file,...bounds] of index.nodes){
 assert(/^chunks\/-?\d+_-?\d+_[a-f0-9]{16}\.bin$/.test(file));
 const data=await fs.readFile(root+file),size=data.readUInt32LE(0),header=JSON.parse(data.toString('utf8',4,size+4));assert(header.cityRoads);
 assert.equal(data.length,4+size+header.ranges.reduce((s,r)=>s+r[2],0)*44);
 assert.equal(sha(data).slice(0,16),file.split('_').at(-1).slice(0,-4));
 assert(data.equals(await fs.readFile('dist/data/walk/roads/'+file.split('/')[1])),'Map and FPS road sectors differ');
 let count=0;for(const [mat,first,n] of header.ranges){assert(index.materials[mat]);assert.equal(first,count);assert.equal(n%3,0);count+=n;}
 const mesh=new Float32Array(data.buffer,data.byteOffset+size+4,count*11);
 for(let i=0;i<mesh.length;i+=11){const [x,y,z,nx,ny,nz]=mesh.subarray(i,i+6);assert(mesh.subarray(i,i+11).every(Number.isFinite));assert(x>=bounds[0]-.002&&x<=bounds[2]+.002&&y>=bounds[1]-.002&&y<=bounds[3]+.002);assert(z>=.02&&z<15);assert(Math.abs(Math.hypot(nx,ny,nz)-1)<.001);if(z>1)raised++;if(nz<.1)risers++;}
 probes.forEach((p,i)=>{if(inRange(bounds,p)){nearby[i].bytes+=data.length;nearby[i].assets++;}});bytes+=data.length;vertices+=count;
}
assert.equal(bytes,index.stats.bytes);assert.equal(vertices,index.stats.vertices);assert(raised>1000&&risers>1000);
assert(nearby.every(n=>n.assets>0&&n.assets<100&&n.bytes<8e6),'Bounded pedestrian road loading');
const result={passed:true,ways:index.stats.ways,sectors:index.nodes.length,vertices,raisedVertices:raised,kerbVertices:risers,nearby:nearby.map(n=>({sectors:n.assets,MB:+(n.bytes/1e6).toFixed(2)}))};
await fs.mkdir('artifacts/city-roads',{recursive:true});await fs.writeFile('artifacts/city-roads/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
