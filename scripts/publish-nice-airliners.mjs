// Targeted, recoverable aircraft publication; unrelated site work is preserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {sha,sitePath,optional,parallel,publicationPriority} from './publication-site-files.mjs';
const project=path.resolve(import.meta.dirname,'..'),source=path.join(project,'dist'),live=path.resolve('C:/nginx/html/chalons');
const baseURL='https://digiaro.duckdns.org/chalons/',prefix='data/cities/nice/',registryFile=prefix+'custom-models.json';
const [mode,releaseArg]=process.argv.slice(2);assert(['prepare','publish','verify-http'].includes(mode)&&releaseArg);
const release=path.resolve(releaseArg);assert(release.startsWith(path.join(project,'artifacts')+path.sep));
const manifestFile=path.join(release,'manifest.json'),hash=b=>b===null?null:sha(b),json=async f=>JSON.parse(await fs.readFile(f));
const allowed=f=>f===registryFile||/^data\/cities\/nice\/airport-airliners-[a-z0-9-]+\/(?:index\.json|mesh\.bin|walk\/-?\d+_-?\d+-[a-f0-9]{12}\.bin)$/.test(f)||/^data\/cities\/nice\/imagery\/ign\/18\/\d+\/\d+\.jpg$/.test(f);
const put=async(root,file,bytes)=>{const target=sitePath(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);};
async function safeParent(file){
 let current=live;assert.equal(path.resolve(await fs.realpath(live)).toLowerCase(),live.toLowerCase());
 for(const part of path.dirname(file).split('/')){current=path.join(current,part);const stat=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!stat)break;assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Redirected publication path');}
}
if(mode==='prepare'){
 assert(!await optional(manifestFile),'Release already exists');
 const registry=await json(sitePath(source,registryFile)),liveRegistry=await json(sitePath(live,registryFile));
 // A later aircraft fix legitimately replaces an already-published aircraft
 // set. Every unrelated registry field, model, material and packet must agree.
 const withoutAircraft=r=>({...r,models:r.models.filter(m=>!m.id.startsWith('airport-airliners-')),walk:{...r.walk,nodes:r.walk.nodes.filter(([file])=>!file.startsWith('../airport-airliners-'))}});
 assert.deepEqual(withoutAircraft(registry),withoutAircraft(liveRegistry),'The unrelated live Nice registry changed; reconcile before publishing');
 const files=new Set([registryFile]);
 for(const m of registry.models.filter(m=>m.id.startsWith('airport-airliners-'))){
  const folder=prefix+m.id,index=await json(sitePath(source,folder+'/index.json')),mesh=await fs.readFile(sitePath(source,folder+'/mesh.bin'));
  assert.equal(mesh.length,index.vertexCount*44);assert.equal(sha(mesh),index.meshSha256);files.add(folder+'/index.json');files.add(folder+'/mesh.bin');
 }
 for(const [file]of registry.walk.nodes.filter(([f])=>f.startsWith('../airport-airliners-')))files.add(path.posix.normalize(prefix+'walk/'+file));
 // Also retain available local orthophotos underneath the surveyed aircraft.
 const survey=await json(path.join(project,'artifacts/nice-airliners/placements.json'));
 for(const p of survey.placements){
  const [a,b]=[p.evidence.nosePixels,p.evidence.tailPixels],margin=Math.ceil(p.lengthMetres/2/.43);
  for(let x=Math.floor((Math.min(a[0],b[0])-margin)/256);x<=Math.floor((Math.max(a[0],b[0])+margin)/256);x++)for(let y=Math.floor((Math.min(a[1],b[1])-margin)/256);y<=Math.floor((Math.max(a[1],b[1])+margin)/256);y++){
   const file=prefix+`imagery/ign/18/${x}/${y}.jpg`;if(await optional(sitePath(source,file)))files.add(file);
  }
 }
 const entries=[];
 await parallel([...files],async file=>{
  assert(allowed(file));await safeParent(file);
  const bytes=await fs.readFile(sitePath(source,file)),old=await optional(sitePath(live,file)),oldGzip=await optional(sitePath(live,file+'.gz'));
  if(file.endsWith('.jpg')&&old)assert(old.equals(bytes),'Never replace a saved imagery original: '+file);
  const gzip=/\.(bin|json)$/.test(file)||oldGzip?gzipSync(bytes,{level:6,mtime:0}):null;
  if(gzip)assert(gunzipSync(gzip).equals(bytes));
  const changed=!old?.equals(bytes)||gzip&&(!oldGzip||!gunzipSync(oldGzip).equals(bytes));
  entries.push({file,hash:sha(bytes),oldHash:hash(old),gzipHash:hash(gzip),oldGzipHash:hash(oldGzip),changed:!!changed,bytes:bytes.length});
  if(changed){await put(path.join(release,'files'),file,bytes);if(gzip)await put(path.join(release,'files'),file+'.gz',gzip);if(old)await put(path.join(release,'backup'),file,old);if(oldGzip)await put(path.join(release,'backup'),file+'.gz',oldGzip);}
 },6);
 entries.sort((a,b)=>publicationPriority(a.file)-publicationPriority(b.file)||a.file.localeCompare(b.file));
 const m={version:1,scope:'nice-airliners',created:new Date().toISOString(),source,live,baseURL,aircraft:survey.placements.length,entries};
 await fs.mkdir(release,{recursive:true});await fs.writeFile(manifestFile,JSON.stringify(m,null,2));
 console.log(JSON.stringify({prepared:true,aircraft:m.aircraft,changedFiles:entries.filter(e=>e.changed).length,guardedFiles:entries.length,release}));
}else{
 const m=await json(manifestFile);assert.equal(m.scope,'nice-airliners');assert.equal(m.source,source);assert.equal(m.live,live);assert.equal(m.baseURL,baseURL);assert(m.entries.every(e=>allowed(e.file)));
 const entries=m.entries.filter(e=>e.changed);
 if(mode==='publish'){
  // Validate every dependency and live file before the first mutation.
  await parallel(m.entries,async e=>{await safeParent(e.file);assert.equal(sha(await fs.readFile(sitePath(source,e.file))),e.hash,'Source changed: '+e.file);assert.equal(hash(await optional(sitePath(live,e.file))),e.oldHash,'Live changed: '+e.file);assert.equal(hash(await optional(sitePath(live,e.file+'.gz'))),e.oldGzipHash,'Live gzip changed: '+e.file);if(e.changed){assert.equal(sha(await fs.readFile(sitePath(path.join(release,'files'),e.file))),e.hash);if(e.gzipHash)assert.equal(sha(await fs.readFile(sitePath(path.join(release,'files'),e.file+'.gz'))),e.gzipHash);}},6);
  for(const e of entries){
   for(const suffix of e.gzipHash?['','.gz']:['']){
    const file=e.file+suffix,target=sitePath(live,file);await fs.mkdir(path.dirname(target),{recursive:true});const tmp=target+'.airliners-'+process.pid+'.tmp';await fs.copyFile(sitePath(path.join(release,'files'),file),tmp);await fs.rename(tmp,target);assert.equal(sha(await fs.readFile(target)),suffix?e.gzipHash:e.hash);
   }
  }
  await fs.writeFile(path.join(release,'published.json'),JSON.stringify({published:new Date().toISOString(),aircraft:m.aircraft,files:entries.map(e=>e.file)},null,2));
  console.log(JSON.stringify({published:true,aircraft:m.aircraft,files:entries.length}));
 }else{
  const checks=[];
  await parallel(entries,async e=>{for(const encoding of e.gzipHash?['identity','gzip']:['identity']){
   const response=await fetch(baseURL+e.file,{headers:{'Accept-Encoding':encoding,'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,e.file);
   assert.equal(sha(Buffer.from(await response.arrayBuffer())),e.hash,'HTTPS mismatch: '+e.file+' '+encoding);checks.push({file:e.file,encoding,passed:true});
  }},4);
  await fs.writeFile(path.join(release,'https-validation.json'),JSON.stringify({verified:new Date().toISOString(),checks},null,2));console.log(JSON.stringify({https:'passed',aircraft:m.aircraft,requests:checks.length}));
 }
}
