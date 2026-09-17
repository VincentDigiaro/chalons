// Publish only the Orca mesh, atlas and descriptor, with recoverable backups.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';

const project=path.resolve(import.meta.dirname,'..'),live='C:/nginx/html/chalons',baseURL='https://digiaro.duckdns.org/chalons/';
const files=['data/orca/v1/mesh.bin','data/orca/v1/orca-colors.png','data/orca/v1/index.json'];
const mode=process.argv[2];assert(['prepare','publish','verify-http'].includes(mode));
const release=path.resolve(process.argv[3]||path.join(project,'artifacts','orca-model-release-'+new Date().toISOString().replaceAll(':','-')));
assert(release.startsWith(path.join(project,'artifacts')+path.sep));
const hash=b=>b===null?null:crypto.createHash('sha256').update(b).digest('hex');
const read=file=>fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const put=async(root,file,bytes)=>{const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);};
const manifestPath=path.join(release,'manifest.json');
if(mode==='prepare'){
 assert(!await read(manifestPath),'Release already prepared');
 const index=JSON.parse(await fs.readFile(path.join(project,'dist/data/orca/v1/index.json')));
 assert(!index.objects.some(o=>/^(Train|Canon) \|/.test(o.name)),'Unwanted equipment remains');
 assert.equal(index.objects.filter(o=>o.name.startsWith('Roquettes | corps ')).length,2);
 assert.equal(hash(await fs.readFile(path.join(project,index.source))),index.sourceSha256);
 assert.equal(hash(await fs.readFile(path.join(project,'dist/data/orca/v1/mesh.bin'))),index.meshSha256);
 const entries=[];
 for(const file of files){
  const bytes=await fs.readFile(path.join(project,'dist',file)),old=await read(path.join(live,file));
  assert(old!==null,'Missing existing live file: '+file);
  await put(path.join(release,'source'),file,bytes);await put(path.join(release,'backup'),file,old);
  entries.push({file,sha256:hash(bytes),oldSha256:hash(old)});
  const oldGzip=await read(path.join(live,file+'.gz'));
  if(/\.(bin|json)$/.test(file)||oldGzip){
   const zipped=gzipSync(bytes,{level:6,mtime:0});assert.deepEqual(gunzipSync(zipped),bytes);
   await put(path.join(release,'source'),file+'.gz',zipped);
   if(oldGzip)await put(path.join(release,'backup'),file+'.gz',oldGzip);
   entries.push({file:file+'.gz',sha256:hash(zipped),oldSha256:hash(oldGzip)});
  }
 }
 await fs.writeFile(manifestPath,JSON.stringify({created:new Date().toISOString(),live,baseURL,files,entries},null,2));
 console.log(JSON.stringify({prepared:true,release,modelFiles:files.length,filesWithCompression:entries.length,unwantedEquipment:0,missileLaunchers:2}));
}else{
 const manifest=JSON.parse(await fs.readFile(manifestPath));
 assert.equal(manifest.live,live);assert.equal(manifest.baseURL,baseURL);assert.deepEqual(manifest.files,files);
 assert(manifest.entries.every(e=>files.includes(e.file)||files.some(f=>e.file===f+'.gz')));
 for(const e of manifest.entries)assert.equal(hash(await fs.readFile(path.join(release,'source',e.file))),e.sha256,'Staged file changed: '+e.file);
 if(mode==='publish'){
  const resolved=path.resolve(await fs.realpath(live));assert.equal(resolved.toLowerCase(),path.resolve(live).toLowerCase());
  for(const file of files)assert.equal(hash(await fs.readFile(path.join(project,'dist',file))),manifest.entries.find(e=>e.file===file).sha256,'Local model changed: '+file);
  for(const e of manifest.entries){
   const target=path.resolve(live,e.file);assert(target.startsWith(resolved+path.sep));
   assert(path.resolve(await fs.realpath(path.dirname(target))).toLowerCase().startsWith(resolved.toLowerCase()+path.sep));
   assert.equal(hash(await read(target)),e.oldSha256,'Concurrent server change: '+e.file);
  }
  for(const e of manifest.entries){
   const target=path.resolve(live,e.file),temp=target+'.orca-model-tmp';
   await fs.copyFile(path.join(release,'source',e.file),temp);await fs.rename(temp,target);
   assert.equal(hash(await fs.readFile(target)),e.sha256,'Published file mismatch: '+e.file);
  }
  await fs.writeFile(path.join(release,'published.json'),JSON.stringify({published:new Date().toISOString(),files:manifest.entries.map(e=>e.file)},null,2));
  console.log(JSON.stringify({published:true,modelFiles:files.length,filesWithCompression:manifest.entries.length,release}));
 }else{
  const results=[];
  for(const encoding of ['identity','gzip'])for(const file of files){
   const response=await fetch(baseURL+file,{headers:{'Accept-Encoding':encoding,'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
   assert.equal(response.status,200,file);const bytes=Buffer.from(await response.arrayBuffer());
   assert.equal(hash(bytes),manifest.entries.find(e=>e.file===file).sha256,'HTTPS mismatch: '+file+' / '+encoding);
   results.push({file,requestedEncoding:encoding,servedEncoding:response.headers.get('content-encoding'),cacheControl:response.headers.get('cache-control'),sha256:hash(bytes)});
  }
  await fs.writeFile(path.join(release,'https-validation.json'),JSON.stringify({checked:new Date().toISOString(),results},null,2));
  console.log(JSON.stringify({https:'passed',modelFiles:files.length,requests:results.length,unwantedEquipment:0,release}));
 }
}
