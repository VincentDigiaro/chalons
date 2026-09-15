import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {applyRoofMode} from '../dist/roof-walk-mode.js';
import './check-roof-mode.mjs';
import {roofPoint} from './roof-policy.mjs';
import {toLngLat} from '../dist/walk-core.js';
const root=process.argv[2]||'dist',index=JSON.parse(await fs.readFile(root+'/data/walk/index.json'));
assert.equal(index.roofModeVersion,1);
let buildings=0,protectedDetails=0,roofVertices=0;
for(const [file] of index.nodes){
 const raw=await fs.readFile(root+'/data/walk/'+file),length=raw.readUInt32LE(0),header=JSON.parse(raw.toString('utf8',4,4+length)),original=new Float32Array(raw.buffer,raw.byteOffset+4+length,(raw.length-4-length)/4);
 const copy=original.slice(),ranges=applyRoofMode(header,copy,index,'aerial');
 if(file.startsWith('roads/')){assert(!header.aerialRoofs);assert.equal(ranges,header.ranges);assert.deepEqual(copy,original);continue;}
 if(file.startsWith('detail/')||file.startsWith('attila/')||file.startsWith('buirette/')){assert(!header.aerialRoofs);assert.equal(ranges,header.ranges);assert.deepEqual(copy,original);protectedDetails++;continue;}
 const roofs=header.ranges.filter(([id])=>id>=index.roofBase),expected=roofs.reduce((n,r)=>n+r[2],0),actual=header.aerialRoofs.reduce((n,r)=>n+r[2],0);
 assert.equal(actual,expected);assert(expected>0);const seen=new Uint8Array(original.length/11);
 for(const [id,start,count] of header.aerialRoofs){
  const match=id.match(/^ign\/17\/(\d+)\/(\d+)$/);assert(match);
  for(let i=start;i<start+count;i++){
   assert.equal(seen[i],0,'Duplicate rollback triangle');seen[i]=1;
   assert(roofs.some(([,first,n])=>i>=first&&i<first+n));
   const at=i*11,p=roofPoint(toLngLat([original[at],original[at+1]]));
   assert(Math.abs(copy[at+6]-(p[0]-Number(match[1])))<1e-6);
   assert(Math.abs(copy[at+7]-(p[1]-Number(match[2])))<1e-6);
   assert(copy[at+6]>=-.0001&&copy[at+6]<=1.0001&&copy[at+7]>=-.0001&&copy[at+7]<=1.0001);
   assert.equal(copy[at+8],1);assert.equal(copy[at+9],1);assert.equal(copy[at+10],1);
   for(let c=0;c<6;c++)assert.equal(copy[at+c],original[at+c],'Rollback changed geometry');
  }
 }
 for(let i=0;i<seen.length;i++)if(!seen[i])for(let c=0;c<11;c++)assert.equal(copy[i*11+c],original[i*11+c],'Rollback changed a facade');
 assert.equal(ranges.reduce((n,r)=>n+r[2],0),original.length/11);
 assert.equal(applyRoofMode(header,original,index,'catalogue'),header.ranges);
 buildings++;roofVertices+=expected;
}
console.log(JSON.stringify({rollback:'passed',buildings,protectedDetails,roofVertices,duplicateGeometry:false,selection:'URL, preference, private browsing'}));
