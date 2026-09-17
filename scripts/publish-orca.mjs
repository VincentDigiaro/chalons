// Targeted release to the existing Châlons server, with recoverable backups.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
const project=path.resolve(import.meta.dirname,'..');
assert(process.argv[3]===undefined||process.argv[3]==='--entry-only');
const entryOnly=process.argv[3]==='--entry-only';
const release=path.join(project,'artifacts/orca-integration/publication'+(entryOnly?'-entry-gzip':''));
const live='C:/nginx/html/chalons';
const baseURL='https://digiaro.duckdns.org/chalons/';
const files=entryOnly?['index.html']:['data/orca/v1/mesh.bin','data/orca/v1/orca-colors.png','data/orca/v1/index.json',
 'ship-selection.js','walk-config.js','fps-highwind.js','map-highwind.js','map-view.js',
 'highwind-session.js','city-config.js','bomb-stock.js','highwind-bombs.js','bomb-scorches.js',
 'highwind-flight.js','highwind-music.js','highwind-ui.js','walk-renderer.js','walk-mode.js','app.js'];
const digest=bytes=>bytes?crypto.createHash('sha256').update(bytes).digest('hex'):null;
const read=file=>fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const put=async(root,file,bytes)=>{const p=path.join(root,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);};
const manifestFile=path.join(release,'manifest.json'),mode=process.argv[2];
assert(['prepare','publish','verify'].includes(mode));
if(mode==='prepare'){
 assert(!await read(manifestFile),'This release has already been prepared');
 const entries=[];
 for(const file of files){
  const source=await fs.readFile(path.join(project,'dist',file));
  const previous=await read(path.join(live,file)),previousGzip=await read(path.join(live,file+'.gz'));
  const zipped=/\.(js|json|bin|html)$/.test(file)?gzipSync(source,{level:6}):null;
  await put(path.join(release,'source'),file,source);
  if(zipped)await put(path.join(release,'source'),file+'.gz',zipped);
  if(previous)await put(path.join(release,'backup'),file,previous);
  if(previousGzip)await put(path.join(release,'backup'),file+'.gz',previousGzip);
  entries.push({file,hash:digest(source),gzipHash:digest(zipped),oldHash:digest(previous),oldGzipHash:digest(previousGzip)});
 }
 const config=await fs.readFile(path.join(project,'fps-config.json'));
 await fs.writeFile(manifestFile,JSON.stringify({created:new Date().toISOString(),live,baseURL,configHash:digest(config),entries},null,2));
 console.log(JSON.stringify({prepared:true,files:entries.length,backups:path.join(release,'backup')}));
}else{
 const manifest=JSON.parse(await fs.readFile(manifestFile));
 assert.equal(manifest.live,live);assert.equal(manifest.baseURL,baseURL);
 assert.deepEqual(manifest.entries.map(e=>e.file),files);
 assert.equal(digest(await fs.readFile(path.join(project,'fps-config.json'))),manifest.configHash,'Configuration changed since preparation');
 if(mode==='publish'){
  const resolved=await fs.realpath(live);assert.equal(path.resolve(resolved).toLowerCase(),path.resolve(live).toLowerCase());
  for(const e of manifest.entries){
   assert.equal(digest(await fs.readFile(path.join(project,'dist',e.file))),e.hash,'Local source changed: '+e.file);
   assert.equal(digest(await fs.readFile(path.join(release,'source',e.file))),e.hash,'Stage changed: '+e.file);
   assert.equal(digest(await read(path.join(live,e.file))),e.oldHash,'Concurrent server change: '+e.file);
   assert.equal(digest(await read(path.join(live,e.file+'.gz'))),e.oldGzipHash,'Concurrent compressed server change: '+e.file);
   if(e.gzipHash)assert.equal(digest(await fs.readFile(path.join(release,'source',e.file+'.gz'))),e.gzipHash);
  }
  for(const e of manifest.entries)for(const file of [e.file,...(e.gzipHash?[e.file+'.gz']:[])]){
   const target=path.resolve(live,file);assert(target.startsWith(path.resolve(live)+path.sep));
   await fs.mkdir(path.dirname(target),{recursive:true});
   const parent=path.resolve(await fs.realpath(path.dirname(target))).toLowerCase();
   assert(parent===path.resolve(live).toLowerCase()||parent.startsWith(path.resolve(live).toLowerCase()+path.sep));
   const temp=target+'.orca-tmp';await fs.copyFile(path.join(release,'source',file),temp);await fs.rename(temp,target);
  }
  console.log(JSON.stringify({published:true,files:manifest.entries.length}));
 }else{
  const results=[];
  for(const e of [...manifest.entries,{file:'fps-config.json',hash:manifest.configHash}]){
   const response=await fetch(baseURL+e.file,{cache:'no-store'});assert.equal(response.status,200,e.file);
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(digest(bytes),e.hash,'Served bytes differ: '+e.file);results.push(e.file);
  }
  await fs.writeFile(path.join(release,'https-validation.json'),JSON.stringify({checked:new Date().toISOString(),files:results},null,2));
  console.log(JSON.stringify({https:'passed',files:results.length,orca:baseURL+'?ship=orca',highwind:baseURL+'?ship=highwind'}));
 }
}
