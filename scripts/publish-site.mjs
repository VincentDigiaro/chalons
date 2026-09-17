// Incremental publication of the complete dist tree. No per-feature allowlist.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {sha,sitePath,listSiteFiles,parallel,optional,fingerprint,same,validateSiteFiles,publicationPriority} from './publication-site-files.mjs';

const project=fileURLToPath(new URL('..',import.meta.url)),mode=process.argv[2];
assert(['prepare','publish','verify-http'].includes(mode)&&process.argv.length<=4,'Use prepare, publish or verify-http [release-directory]');
assert(process.argv[3]||process.env.BUIRETTE_RELEASE,'Missing release directory');
const work=path.resolve(process.argv[3]||process.env.BUIRETTE_RELEASE),manifestFile=path.join(work,'manifest.json');
const prepared=mode==='prepare'?null:JSON.parse(await fs.readFile(manifestFile));
if(prepared)assert.equal(prepared.scope,'site','Use the publisher matching this release');
const source=path.resolve(prepared?.source||process.env.CODE_PUBLICATION_SOURCE||path.join(project,'dist'));
const live=path.resolve(prepared?.live||process.env.BUIRETTE_LIVE||'C:/nginx/html/chalons');
const baseURL=prepared?.url||(process.env.BUIRETTE_BASE_URL||'https://digiaro.duckdns.org/chalons/').replace(/\/?$/,'/');
const stage=path.join(work,'files'),backup=path.join(work,'backup');
assert(source!==live&&!source.startsWith(live+path.sep)&&!live.startsWith(source+path.sep)&&!work.startsWith(source+path.sep)&&!work.startsWith(live+path.sep),'Overlapping publication folders');
const cacheFile=path.join(path.dirname(work),'.publication-comparisons-'+sha(source+'\n'+live).slice(0,16)+'.json');
const pendingFile=path.join(path.dirname(work),'.publication-http-pending-'+sha(source+'\n'+live+'\n'+baseURL).slice(0,16)+'.json');
async function readPending(){
 const bytes=await optional(pendingFile),entries=bytes?JSON.parse(bytes):[];
 assert(Array.isArray(entries),'Invalid pending HTTP checks');
 for(const f of entries){sitePath(source,f.file);assert(/^[a-f0-9]{64}$/.test(f.hash),'Invalid pending HTTP hash');}
 return entries;
}
async function writePending(entries){
 const temp=pendingFile+'.'+process.pid+'.tmp';await fs.writeFile(temp,JSON.stringify(entries));await fs.rename(temp,pendingFile);
}
async function rememberPending(files){
 const pending=new Map((await readPending()).map(f=>[f.file,f]));
 for(const {file,hash} of files)pending.set(file,{file,hash});
 await writePending([...pending.values()]);
}
const digest=bytes=>bytes===null?null:sha(bytes);
async function put(root,file,bytes){const target=sitePath(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
const checkedParents=new Map();
async function checkParent(root,file){
 const folder=path.dirname(sitePath(root,file)),key=root+'\n'+folder;
 if(!checkedParents.has(key))checkedParents.set(key,(async()=>{
  let current=root;
  for(const part of path.relative(root,folder).split(path.sep).filter(Boolean)){
   current=path.join(current,part);const entry=await fs.lstat(current).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
   if(!entry)break;assert(entry.isDirectory()&&!entry.isSymbolicLink(),'Redirected publication folder: '+current);
  }
 })());
 await checkedParents.get(key);
}
async function state(file){
 await checkParent(live,file);
 const [s,l,g]=await Promise.all([fingerprint(sitePath(source,file)),fingerprint(sitePath(live,file)),fingerprint(sitePath(live,file+'.gz'))]);
 return {s,l,g};
}
async function checkGuards(guards){
 assert.deepEqual(await listSiteFiles(source),Object.keys(guards).sort(),'Source file list changed; prepare again');
 checkedParents.clear();
 await parallel(Object.keys(guards),async file=>{const now=await state(file),old=guards[file];assert(same(now.s,old.s),'Local source changed: '+file);assert(same(now.l,old.l)&&same(now.g,old.g),'Live site changed: '+file);});
}
async function validateManifest(m){
 assert.equal(m.version,1);assert.equal(m.source,source);assert.equal(m.live,live);
 const seen=new Set();
 for(const f of m.files){
  sitePath(source,f.file);assert(!f.file.endsWith('.gz')&&!seen.has(f.file),'Invalid or duplicate manifest file');seen.add(f.file);
  assert(Object.hasOwn(m.guards,f.file),'File outside prepared inventory: '+f.file);
  for(const key of ['hash','oldHash','oldGzipHash','gzipHash'])assert(f[key]===null||/^[a-f0-9]{64}$/.test(f[key]),'Invalid manifest hash');
 }
}
await fs.access(live);
for(const root of [source,live])assert.equal(path.resolve(await fs.realpath(root)).toLowerCase(),root.toLowerCase(),'Redirected site root');

if(mode==='prepare'){
 assert(!await optional(manifestFile),'This prepared release already exists');
 const started=Date.now(),files=await listSiteFiles(source);
 console.log('Publication automatique : '+files.length+' fichiers dans dist ; seuls les écarts seront copiés.');
 await validateSiteFiles(source,files);
 let cache={};try{cache=JSON.parse((await optional(cacheFile))||'{}')||{};}catch{/* An interrupted cache write only costs a fresh comparison. */}
 const nextCache=Object.create(null),guards=Object.create(null),changed=[];
 let scanned=0,cached=0,lastProgress=Date.now();
 await parallel(files,async file=>{
  const before=await state(file);assert(before.s,'Source disappeared: '+file);guards[file]=before;
  if(before.l&&same(cache[file],before)){cached++;nextCache[file]=before;}
  else{
   const [bytes,old,oldGzip]=await Promise.all([fs.readFile(sitePath(source,file)),optional(sitePath(live,file)),optional(sitePath(live,file+'.gz'))]);
   let equal=old?.equals(bytes)||false;
   if(equal&&oldGzip)try{equal=gunzipSync(oldGzip).equals(bytes);}catch{equal=false;}
   if(equal)nextCache[file]=before;
   else{
    const gz=/\.(?:bin|json|geojson|m?js|css|html|svg|pbf|txt|wasm)$/.test(file)||oldGzip?gzipSync(bytes,{level:6}):null;
    await put(stage,file,bytes);if(gz)await put(stage,file+'.gz',gz);
    if(old)await put(backup,file,old);if(oldGzip)await put(backup,file+'.gz',oldGzip);
    changed.push({file,hash:sha(bytes),oldHash:digest(old),oldGzipHash:digest(oldGzip),gzipHash:digest(gz),bytes:bytes.length,gzipBytes:gz?.length||0});
   }
  }
  scanned++;if(scanned%10000===0||Date.now()-lastProgress>15000){lastProgress=Date.now();console.log('Comparés : '+scanned+' / '+files.length+' ; différences : '+changed.length);}
 });
 // Revalidate after collecting metadata too: a generator may have run between
 // the initial dependency check and the first per-file comparison.
 await validateSiteFiles(source,files);
 await checkGuards(guards);
 changed.sort((a,b)=>publicationPriority(a.file)-publicationPriority(b.file)||a.file.localeCompare(b.file));
 const summary={scanned,unchanged:files.length-changed.length,cached,changed:changed.length,rawBytes:changed.reduce((n,f)=>n+f.bytes,0),seconds:(Date.now()-started)/1000};
 await fs.mkdir(work,{recursive:true});
 await fs.writeFile(manifestFile,JSON.stringify({version:1,scope:'site',created:new Date().toISOString(),source,live,url:baseURL,summary,guards,files:changed}));
 // Cache only comparisons actually proven equal. Published changes are checked
 // from disk on their next run; metadata includes ctime, inode, size and mtime.
 await fs.writeFile(cacheFile,JSON.stringify(nextCache));
 await fs.writeFile(path.join(work,'summary.json'),JSON.stringify({...summary,files:changed},null,2));
 console.log(JSON.stringify({prepared:true,...summary}));
}else if(mode==='publish'){
 const m=prepared;await validateManifest(m);await checkGuards(m.guards);
 // Every preflight completes before the first live write.
 await parallel(m.files,async f=>{
  assert.equal(digest(await optional(sitePath(live,f.file))),f.oldHash,'Concurrent change: '+f.file);
  assert.equal(digest(await optional(sitePath(live,f.file+'.gz'))),f.oldGzipHash,'Concurrent gzip change: '+f.file);
  assert.equal(sha(await fs.readFile(sitePath(stage,f.file))),f.hash,'Staged file changed: '+f.file);
  assert.equal(sha(await fs.readFile(sitePath(source,f.file))),f.hash,'Source changed: '+f.file);
  if(f.gzipHash)assert.equal(sha(await fs.readFile(sitePath(stage,f.file+'.gz'))),f.gzipHash,'Staged gzip changed: '+f.file);
 });
 // A failed HTTP check must survive the next command, even when there are no
 // disk differences left to publish. Persist it before the first live write.
 await rememberPending(m.files);
 async function replace(file){
  const target=sitePath(live,file);await fs.mkdir(path.dirname(target),{recursive:true});
  const parent=path.resolve(await fs.realpath(path.dirname(target))).toLowerCase(),root=live.toLowerCase();
  assert(parent===root||parent.startsWith(root+path.sep),'Redirected publication target');
  const temp=target+'.publication-tmp';await fs.copyFile(sitePath(stage,file),temp);await fs.rename(temp,target);
 }
 for(let priority=1;priority<=7;priority++){
  const group=m.files.filter(f=>publicationPriority(f.file)===priority);
  await parallel(group,async f=>{await replace(f.file);if(f.gzipHash)await replace(f.file+'.gz');});
  if(group.length)console.log('Publiés, groupe '+priority+' : '+group.length);
 }
 await parallel(m.files,async f=>{
  assert.equal(sha(await fs.readFile(sitePath(live,f.file))),f.hash,'Published file mismatch: '+f.file);
  if(f.gzipHash)assert.equal(sha(await fs.readFile(sitePath(live,f.file+'.gz'))),f.gzipHash,'Published gzip mismatch: '+f.file);
 });
 const result={published:true,files:m.files.length,url:baseURL,backup,finished:new Date().toISOString()};
 await fs.writeFile(path.join(work,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else{
 await validateManifest(prepared);
 const expected=new Map((await readPending()).map(f=>[f.file,f]));
 for(const {file,hash} of prepared.files)expected.set(file,{file,hash});
 await rememberPending([...expected.values()]);
 const report=[],errors=[],verified=new Map();let completed=0,lastProgress=Date.now();
 console.log('Vérification HTTP : '+expected.size+' fichiers, réponses normales et gzip.');
 await parallel([...expected.values()],async f=>{
  // Fetch decodes gzip automatically; both negotiated representations must
  // contain the new bytes, including when nginx serves gzip_static.
  let valid=true;
  for(const encoding of ['identity','gzip'])try{
   const url=new URL(f.file.split('/').map(encodeURIComponent).join('/'),baseURL);
   const response=await fetch(url,{headers:{'Cache-Control':'no-cache','Accept-Encoding':encoding},signal:AbortSignal.timeout(45000)});
   assert(response.ok,'HTTP '+response.status+': '+f.file);
   assert.equal(sha(Buffer.from(await response.arrayBuffer())),f.hash,'HTTP mismatch ('+encoding+'): '+f.file);
   report.push({file:f.file,status:response.status,requested:encoding,encoding:response.headers.get('content-encoding')});
  }catch(error){valid=false;errors.push({file:f.file,requested:encoding,error:error.message});}
  if(valid)verified.set(f.file,f.hash);
  completed++;if(completed%1000===0||Date.now()-lastProgress>15000){lastProgress=Date.now();console.log('Vérifiés HTTP : '+completed+' / '+expected.size+' ; erreurs : '+errors.length);}
 });
 await fs.writeFile(path.join(work,'https-validation.json'),JSON.stringify({checked:new Date().toISOString(),files:report,errors},null,2));
 // Keep checks from a newer concurrent release and every failed file.
 await writePending((await readPending()).filter(f=>verified.get(f.file)!==f.hash));
 if(errors.length){
  console.error('Copie terminée, mais '+errors.length+' contrôle(s) HTTP ont échoué. Les fichiers en échec seront revérifiés au prochain lancement.');
  for(const error of errors.slice(0,10))console.error(error.error);
  console.error('Rapport : '+path.join(work,'https-validation.json'));process.exitCode=1;
 }else console.log(JSON.stringify({http:'passed',files:expected.size,requests:report.length}));
}
