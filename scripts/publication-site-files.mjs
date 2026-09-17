import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sitePath(root,file){
 assert(typeof file==='string'&&!file.includes('\\')&&!file.includes(':')&&!file.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')),'Invalid publication path: '+file);
 const target=path.resolve(root,file);assert(target.startsWith(root+path.sep),'Path outside site: '+file);return target;
}
export async function listSiteFiles(root){
 const files=[],folders=[''];
 while(folders.length){
  const folder=folders.pop();
  for(const entry of await fs.readdir(path.join(root,folder),{withFileTypes:true})){
   if(entry.name.startsWith('.'))continue;
   const file=folder?folder+'/'+entry.name:entry.name;
   assert(!entry.isSymbolicLink(),'Unexpected symlink: '+file);
   if(entry.isDirectory())folders.push(file);
   // Compressed companions are generated from the authoritative raw file.
   else if(entry.isFile()&&!file.endsWith('.gz')){sitePath(root,file);files.push(file);}
  }
 }
 return files.sort();
}
export async function parallel(items,fn,concurrency=12){
 let next=0;await Promise.all(Array.from({length:concurrency},async()=>{while(next<items.length){const i=next++;await fn(items[i],i);}}));
}
export async function optional(file){try{return await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function fingerprint(file){
 const s=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!s)return null;assert(s.isFile()&&!s.isSymbolicLink(),'Expected a regular file: '+file);
 return [s.size,s.mtimeMs,s.ctimeMs,s.ino];
}
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Check the data formats themselves, never a list of approved city/model names.
export async function validateSiteFiles(root,files){
 const available=new Set(files),hashes=new Map();
 const digest=async file=>{if(!hashes.has(file))hashes.set(file,sha(await fs.readFile(sitePath(root,file))));return hashes.get(file);};
 function dependency(owner,base,ref){
  assert(typeof ref==='string'&&!/^(?:[a-z]+:|\/)/i.test(ref)&&!ref.includes('\\'),'Invalid dependency in '+owner+': '+ref);
  const file=path.posix.normalize(path.posix.join(base,ref));sitePath(root,file);
  assert(available.has(file),'Missing dependency: '+file+' (referenced by '+owner+')');return file;
 }
 async function geometry(owner,index,base){
  for(const node of index.nodes||[])dependency(owner,base,node[0]);
  for(const item of [...(index.textures||[]),...(index.overviewTextures||[])])dependency(owner,base,typeof item==='string'?item:item.file);
  for(const material of index.materials||[])if(typeof material.texture==='string')dependency(owner,base,material.texture);
  for(const chunk of index.chunks||[])if(chunk.file)dependency(owner,base,chunk.file);
  if(index.catalogue)dependency(owner,base,index.catalogue);
  if(index.file)dependency(owner,base,index.file);
  if(index.mesh||index.vertexCount!==undefined&&index.ranges){
   const mesh=dependency(owner,base,index.mesh||'mesh.bin'),stride=index.stride||44;
   assert.equal((await fs.stat(sitePath(root,mesh))).size,index.vertexCount*stride,'Truncated mesh: '+mesh);
   if(index.meshSha256)assert.equal(await digest(mesh),index.meshSha256,'Mesh hash mismatch: '+mesh);
  }
 }
 for(const file of files.filter(f=>/(?:^|\/)(?:index|custom-models)\.json$/.test(f))){
  const bytes=await fs.readFile(sitePath(root,file)),index=JSON.parse(bytes),base=path.posix.dirname(file);
  await geometry(file,index,base);
  for(const model of index.models||[]){
   const modelBase=path.posix.normalize(model.basePath);
   dependency(file,modelBase,'index.json');dependency(file,modelBase,'mesh.bin');
  }
  if(index.walk)await geometry(file,index.walk,path.posix.join(base,'walk'));
  if(file.endsWith('/walk/index.json')){
   const cityBase=path.posix.dirname(base);
   for(const [input,expected] of Object.entries(index.sourceHashes||{})){
    if(!input.startsWith('dist/data/'))continue;
    const dep=dependency(file,cityBase,input.slice('dist/data/'.length));
    assert.equal(await digest(dep),expected,'Rebuild FPS data: '+file+' (changed '+dep+')');
   }
  }
  if(file.endsWith('/walk-downloads/index.json')){
   const walk=dependency(file,path.posix.dirname(base),'walk/index.json');
   assert.equal(await digest(walk),index.sourceHash,'Rebuild the FPS download index: '+file);
   for(const pack of index.packs||[])dependency(file,base,pack.file);
  }
 }
}

// Dependencies first; activation indices and HTML last, for every city.
export const publicationPriority=file=>file.endsWith('.html')?7:/(?:^|\/)walk-downloads\/index\.json$/.test(file)?6:/(?:^|\/)(?:walk\/index|custom-models)\.json$/.test(file)?5:/\.(?:m?js|css)$/.test(file)?4:file.endsWith('/index.json')?3:file.endsWith('.json')?2:1;
