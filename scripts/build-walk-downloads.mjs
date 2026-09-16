import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';

const root=path.resolve('dist/data/walk'),target=path.resolve('dist/data/walk-downloads');
const indexBytes=await fs.readFile(path.join(root,'index.json')),index=JSON.parse(indexBytes);
// Generic buildings only. Detailed landmarks and roads retain their original
// resources. Sort spatially for useful adjacent ranges without loading strangers.
const nodes=index.nodes.filter(([file])=>/^\d+\/[^/]+\.bin$/.test(file));
nodes.sort((a,b)=>Math.floor((a[2]+a[4])/128)-Math.floor((b[2]+b[4])/128)||(a[1]+a[3])-(b[1]+b[3])||a[0].localeCompare(b[0]));
await fs.mkdir(target,{recursive:true});const packs=[];let totalBytes=0;
for(let i=0;i<nodes.length;i+=256){
 const entries=[],buffers=[];let offset=0;
 for(const [file] of nodes.slice(i,i+256)){const original=await fs.readFile(path.join(root,file)),bytes=gzipSync(original,{level:6});entries.push([file,offset,bytes.length,original.length]);buffers.push(bytes);offset+=bytes.length;}
 const bytes=Buffer.concat(buffers),file=crypto.createHash('sha256').update(bytes).digest('hex')+'.pack';
 await fs.writeFile(path.join(target,file),bytes);packs.push({file,entries});totalBytes+=bytes.length;
}
await fs.writeFile(path.join(target,'index.json'),JSON.stringify({version:1,encoding:'gzip',sourceHash:crypto.createHash('sha256').update(indexBytes).digest('hex'),packs}));
const used=new Set(packs.map(p=>p.file));
for(const file of await fs.readdir(target))if(/^[a-f0-9]{64}\.pack$/.test(file)&&!used.has(file))await fs.unlink(path.join(target,file));
console.log(JSON.stringify({buildings:nodes.length,archives:packs.length,bytes:totalBytes}));
