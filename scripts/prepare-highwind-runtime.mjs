import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
const root=process.cwd(),live='C:/nginx/html/chalons',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const base=path.join(root,'artifacts/highwind-auto-release');await fs.mkdir(base,{recursive:true});
const work=await fs.mkdtemp(path.join(base,'release-'));await fs.mkdir(path.join(work,'files'));await fs.mkdir(path.join(work,'backup'));
const replace=(text,from,to)=>{assert(text.includes(from),'Expected runtime code is absent');return text.replace(from,to);};
const current=await fs.readFile('dist/walk-config.js','utf8');
const modelCode=current.slice(current.indexOf('export const HIGHWIND_MODELS='),current.indexOf('export function validatePreparationConfig'));
const manifest={root,live,work,files:[]};
for(const file of ['walk-loading.js','walk-config.js','fps-highwind.js','map-highwind.js']){
 const before=await fs.readFile(path.join(live,file));let text=before.toString('utf8');
 if(file==='walk-config.js'){
  const start=text.indexOf('export const HIGHWIND_MODELS='),end=text.indexOf('export function validatePreparationConfig');assert(start>=0&&end>start);
  text=text.slice(0,start)+modelCode+text.slice(end);
  text=replace(text,"if(Object.hasOwn(value,'modele')&&(typeof value.modele!=='string'||!Object.hasOwn(HIGHWIND_MODELS,value.modele)))invalid('modele');","if(Object.hasOwn(value,'modele')&&!highwindModel(value.modele))invalid('modele');");
 }else if(file==='fps-highwind.js'){
  text=replace(text,'import {HIGHWIND_MODELS}', 'import {highwindModel}');
  text=replace(text,"HIGHWIND_MODELS[this.config.modele??'original']","highwindModel(this.config.modele??'original')");
  text=replace(text,"fetchWalkBuffer(base+'index.json',{signal})","fetchWalkBuffer(base+'index.json',{signal,fatalStatuses:[404,422]})");
 }else if(file==='map-highwind.js'){
  text=replace(text,'FPS_CONFIG,HIGHWIND_MODELS','FPS_CONFIG,highwindModel');
  text=replace(text,"HIGHWIND_MODELS[this.pose.modele??'original']","highwindModel(this.pose.modele??'original')");
 }else{
  text=replace(text,"cache='default'}={})","cache='default',fatalStatuses=[]}={})");
  text=replace(text,'if(!response.ok)throw Error(`HTTP ${response.status}`);',"if(!response.ok){const fatal=fatalStatuses.includes(response.status),detail=fatal?await response.json().catch(()=>null):null;throw Object.assign(Error(detail?.error||`HTTP ${response.status}`),{fatal});}");
  text=replace(text,'if(signal.aborted)throw signal.reason||error;','if(signal.aborted)throw signal.reason||error;\n   if(error.fatal)throw error;');
 }
 const bytes=Buffer.from(text),gzip=gzipSync(bytes);
 await fs.writeFile(path.join(work,'backup',file),before);
 const oldGzip=await fs.readFile(path.join(live,file+'.gz')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(oldGzip)await fs.writeFile(path.join(work,'backup',file+'.gz'),oldGzip);
 await fs.writeFile(path.join(work,'files',file),bytes);await fs.writeFile(path.join(work,'files',file+'.gz'),gzip);
 manifest.files.push({file,before:hash(before),after:hash(bytes),gzip:hash(gzip),oldGzip:oldGzip?hash(oldGzip):null});
}
for(const [file,source] of [['chalons.conf','C:/nginx/conf/chalons.conf'],['highwind.conf','scripts/nginx-highwind.conf']]){
 const bytes=await fs.readFile(source);await fs.writeFile(path.join(work,file),bytes);manifest[file]=hash(bytes);
}
await fs.writeFile(path.join(work,'manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(base,'latest.txt'),work);
console.log(JSON.stringify({prepared:work,files:manifest.files.map(f=>f.file),unrelatedRuntimeChangesExcluded:true}));
