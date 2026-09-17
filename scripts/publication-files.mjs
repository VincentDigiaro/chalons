import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {listNervalPublicationFiles} from './publication-nerval.mjs';

const libraryCode=['vendor/maplibre-gl.js','vendor/earcut.js','vendor/earcut.LICENSE'];
export const isCodePublicationFile=file=>libraryCode.includes(file)||!file.includes('/')&&!file.includes('\\')&&!file.startsWith('.')&&/\.(js|css|html|svg)$/.test(file);

// Follow the Nice model registry instead of walking the entire city. Only
// active mesh, texture and pedestrian dependencies accompany the runtime.
export async function listNiceModelPublicationFiles(source){
 const prefix='data/cities/nice/',registryFile=prefix+'custom-models.json',files=new Set();
 async function include(file){
  assert(file.startsWith(prefix)&&!file.includes('\\')&&!file.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')),'Invalid Nice model path: '+file);
  let current=source;
  for(const segment of file.split('/')){current=path.join(current,segment);assert(!(await fs.lstat(current)).isSymbolicLink(),'Unexpected symlink: '+file);}
  assert((await fs.stat(current)).isFile(),'Missing Nice model dependency: '+file);files.add(file);return current;
 }
 let registry;
 try{registry=JSON.parse(await fs.readFile(path.join(source,registryFile),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 await include(registryFile);
 assert(Array.isArray(registry.models),'Invalid Nice model registry');
 const folders=new Set();
 for(const model of registry.models){
  assert(/^[a-z0-9][a-z0-9-]*$/.test(model.id),'Invalid Nice model ID');
  const folder=prefix+model.id;assert.equal(model.basePath,'./'+folder,'Nice model outside its city folder');assert(!folders.has(folder),'Duplicate Nice model');folders.add(folder);
  const index=JSON.parse(await fs.readFile(await include(folder+'/index.json'),'utf8'));
  const mesh=await include(folder+'/mesh.bin');assert.equal((await fs.stat(mesh)).size,index.vertexCount*44,'Truncated Nice model: '+model.id);
  assert(Array.isArray(index.textures),'Missing model texture table');
  for(const texture of index.textures){assert(typeof texture==='string'&&!path.posix.isAbsolute(texture)&&!texture.includes('\\'),'Invalid model texture');await include(folder+'/'+texture);}
 }
 if(registry.walk){
  assert.equal(registry.walk.version,1);assert(Array.isArray(registry.walk.nodes)&&Array.isArray(registry.walk.materials));
  for(const [file]of registry.walk.nodes){
   const match=/^\.\.\/([a-z0-9][a-z0-9-]*)\/walk\/([^/\\]+\.bin)$/.exec(file);
   assert(match&&folders.has(prefix+match[1]),'FPS dependency outside a registered Nice model: '+file);
   await include(prefix+match[1]+'/walk/'+match[2]);
  }
  // Custom FPS textures are relative to the city walk directory, just as in
  // the renderer. Restrict them to a model already present in the registry.
  for(const material of registry.walk.materials.filter(m=>m.texture)){
   assert(!material.texture.includes('\\'),'Invalid FPS texture');const file=path.posix.normalize(prefix+'walk/'+material.texture);
   assert([...folders].some(folder=>file.startsWith(folder+'/')),'FPS texture outside registered models');await include(file);
  }
 }
 return [...files].sort();
}

// Append one path at a time: a city's file count can exceed V8's argument limit.
export async function listPublicationFiles(source,activeWalk,{scope='all'}={}){
 assert(['all','code','code-and-nice-models','code-and-models'].includes(scope),'Unknown publication scope');
 if(scope==='code-and-models')return [...new Set([...await listPublicationFiles(source,activeWalk,{scope:'code-and-nice-models'}),...await listNervalPublicationFiles(source)])];
 if(scope==='code-and-nice-models')return [...await listPublicationFiles(source,activeWalk,{scope:'code'}),...await listNiceModelPublicationFiles(source)];
 if(scope==='code'){
  const files=[];
  // No directory traversal: data and fonts are never enumerated or read.
  for(const entry of await fs.readdir(source,{withFileTypes:true})){
   if(!isCodePublicationFile(entry.name))continue;
   assert(!entry.isSymbolicLink(),'Unexpected symlink');if(entry.isFile())files.push(entry.name);
  }
  for(const file of libraryCode){const entry=await fs.lstat(path.join(source,file)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!entry)continue;assert(entry.isFile()&&!entry.isSymbolicLink(),'Unexpected library file');files.push(file);}
  return files;
 }
 const out=[],folders=[''];
 while(folders.length){
  const folder=folders.pop();
  for(const entry of await fs.readdir(path.join(source,folder),{withFileTypes:true})){
   assert(!entry.isSymbolicLink(),'Unexpected symlink');if(entry.name.startsWith('.'))continue;
   const file=folder?folder+'/'+entry.name:entry.name;
   if(entry.isDirectory())folders.push(file);
   else if(entry.isFile()&&!file.endsWith('.gz')&&(!file.startsWith('data/walk/')||!file.endsWith('.bin')||activeWalk.has(file)))out.push(file);
  }
 }
 return out;
}
