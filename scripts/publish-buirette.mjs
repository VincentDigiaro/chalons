// Publish the current, validated local site to the user's existing /chalons route.
// Back up every replaced file; preserve live-only files, including imagery cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import {listPublicationFiles,isCodePublicationFile} from './publication-files.mjs';
import {checkNervalPublicationCompatibility} from './publication-nerval.mjs';

const work=path.resolve(process.env.BUIRETTE_RELEASE||'artifacts/buirette-overlap-fix/publication');
const source=path.join(work,'source'),live=path.resolve(process.env.BUIRETTE_LIVE||'C:/nginx/html/chalons');
const baseURL=(process.env.BUIRETTE_BASE_URL||'https://digiaro.duckdns.org/chalons/').replace(/\/?$/,'/');
const stage=path.join(work,'files'),backup=path.join(work,'backup');
const manifestFile=path.join(work,'manifest.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function child(root,file){const p=path.resolve(root,file);assert(p.startsWith(root+path.sep),'Path outside target: '+file);return p;}
async function optional(file){try{return await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const digest=b=>b?hash(b):null;
async function parallel(items,fn){let next=0;await Promise.all(Array.from({length:12},async()=>{while(next<items.length){const i=next++;await fn(items[i],i);}}));}
async function put(root,file,bytes){const target=child(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
const mode=process.argv[2];
assert(['prepare','publish','verify-http'].includes(mode),'Use prepare, publish, or verify-http');
const flags=process.argv.slice(3);
assert(flags.length<=1&&flags.every(flag=>['--code-only','--with-nice-models','--with-models'].includes(flag))&&(mode==='prepare'||!flags.length),'Use --code-only, --with-nice-models or --with-models with prepare; publish uses the prepared scope');
let preparedManifest;
if(mode!=='prepare'){
 const bytes=await optional(manifestFile);
 assert(bytes,'Préparation absente ou incomplète : relancer node scripts/publish-buirette.mjs prepare et attendre sa réussite. Manifeste attendu : '+manifestFile);
 preparedManifest=JSON.parse(bytes);
}
const scope=mode==='prepare'?(flags.includes('--code-only')?'code':flags.includes('--with-models')?'code-and-models':flags.includes('--with-nice-models')?'code-and-nice-models':'all'):(preparedManifest.scope??'all');
assert(['all','code','code-and-nice-models','code-and-models'].includes(scope),'Unknown publication scope');
if(scope==='code'&&preparedManifest){
 for(const file of [...preparedManifest.files.map(f=>f.file),...Object.keys(preparedManifest.sourceGuards),...Object.keys(preparedManifest.liveGuards)])assert(isCodePublicationFile(file),'Data excluded from code-only publication: '+file);
}
const withNerval=scope==='code-and-models'&&!!await optional(child(source,'data/nerval/index.json'));
const walk=scope==='all'||withNerval?JSON.parse(await fs.readFile(child(source,'data/walk/index.json'))):{nodes:[],sourceHashes:{}};
const activeWalk=new Set([...walk.nodes.map(n=>'data/walk/'+n[0]),...(walk.retiredNodes||[]).map(file=>'data/walk/'+file)]);
async function checkInputs(){for(const [file,expected] of Object.entries(walk.sourceHashes))assert.equal(hash((await optional(child(source,file.replace(/^dist\//,''))))??await fs.readFile(child(live,file.replace(/^dist\//,'')))),expected,'Rebuild walk: '+file);}
const guardFiles=scope!=='all'?await listPublicationFiles(source,activeWalk,{scope}):[...(await fs.readdir(source,{withFileTypes:true})).filter(e=>e.isFile()&&!e.name.endsWith('.gz')).map(e=>e.name),'data/nerval/index.json','data/nerval/mesh.bin','data/attila/index.json','data/attila/mesh.bin','data/walk/index.json','data/facades/index.json','data/roofs/index.json'];
if(['code-and-nice-models','code-and-models'].includes(scope)&&preparedManifest){
 const allowed=new Set(guardFiles);
 for(const file of [...preparedManifest.files.map(f=>f.file),...Object.keys(preparedManifest.sourceGuards),...Object.keys(preparedManifest.liveGuards)])assert(allowed.has(file),'File outside code and model dependencies: '+file);
 assert.deepEqual(Object.keys(preparedManifest.sourceGuards).sort(),[...allowed].sort(),'Incomplete model dependency guards');
 assert.deepEqual(Object.keys(preparedManifest.liveGuards).sort(),[...allowed].sort(),'Incomplete live dependency guards');
}
async function guards(root){const result={};for(const file of guardFiles)result[file]=digest(await optional(child(root,file)));return result;}
const priority=f=>f==='data/walk-downloads/index.json'?7:f==='data/walk/index.json'?6:f==='data/cities/nice/custom-models.json'?5:f==='index.html'||f==='app.js'?4:f.endsWith('/index.json')||f==='data/custom-models.json'?3:!f.includes('/')?2:1;
if(withNerval)await checkNervalPublicationCompatibility(source,live);
await checkInputs();
if(mode==='prepare'){
 assert(!(await optional(manifestFile)),'This prepared release already exists');
 const started=Date.now(),sourceGuards=await guards(source),liveGuards=await guards(live),files=await listPublicationFiles(source,activeWalk,{scope});
 console.log(scope==='code'?'Code uniquement : '+files.length+' fichiers ; données exclues.':scope==='code-and-nice-models'||scope==='code-and-models'?'Code et modèles ciblés : '+files.length+' fichiers à comparer.':'Publication complète : '+files.length+' fichiers à comparer.');
 const changed=[];let scanned=0;
 await parallel(files,async file=>{
  const bytes=await fs.readFile(child(source,file)),old=await optional(child(live,file)),oldGzip=await optional(child(live,file+'.gz'));
  let gzipValid=true;if(old?.equals(bytes)&&oldGzip)try{gzipValid=gunzipSync(oldGzip).equals(bytes);}catch{gzipValid=false;}
  if(!old?.equals(bytes)||!gzipValid){
   const gz=/\.(?:bin|json|geojson|js|css|html|svg|pbf|txt)$/.test(file)||oldGzip?gzipSync(bytes,{level:6}):null;
   await put(stage,file,bytes);if(gz)await put(stage,file+'.gz',gz);
   if(old)await put(backup,file,old);if(oldGzip)await put(backup,file+'.gz',oldGzip);
   changed.push({file,hash:hash(bytes),oldHash:digest(old),oldGzipHash:digest(oldGzip),gzipHash:digest(gz),bytes:bytes.length,gzipBytes:gz?.length||0});
  }
  if(++scanned%10000===0)console.log('Compared '+scanned+' / '+files.length+' files');
 });
 assert.deepEqual(await guards(source),sourceGuards,'Local scene changed while preparing');
 assert.deepEqual(await guards(live),liveGuards,'Live site changed while preparing');
 changed.sort((a,b)=>priority(a.file)-priority(b.file)||a.file.localeCompare(b.file));
 await fs.mkdir(work,{recursive:true});await fs.writeFile(manifestFile,JSON.stringify({created:new Date().toISOString(),scope,source,live,sourceGuards,liveGuards,files:changed},null,2));
 console.log(JSON.stringify({prepared:true,scope,scanned,changed:changed.length,rawBytes:changed.reduce((n,f)=>n+f.bytes,0),gzipBytes:changed.reduce((n,f)=>n+f.gzipBytes,0),seconds:(Date.now()-started)/1000}));
}else if(mode==='publish'){
 const m=preparedManifest;assert.equal(m.source,source);assert.equal(m.live,live);
 assert.equal(path.resolve(await fs.realpath(live)).toLowerCase(),live.toLowerCase(),'Redirected publication target');
 assert.deepEqual(await guards(source),m.sourceGuards,'Local source changed');assert.deepEqual(await guards(live),m.liveGuards,'Live site changed');
 // All preflight checks finish before any live write.
 await parallel(m.files,async f=>{
  assert.equal(digest(await optional(child(live,f.file))),f.oldHash,'Concurrent change: '+f.file);
  assert.equal(digest(await optional(child(live,f.file+'.gz'))),f.oldGzipHash,'Concurrent gzip change: '+f.file);
  assert.equal(hash(await fs.readFile(child(source,f.file))),f.hash,'Source changed: '+f.file);
  assert.equal(hash(await fs.readFile(child(stage,f.file))),f.hash,'Stage changed: '+f.file);
  if(f.gzipHash)assert.equal(hash(await fs.readFile(child(stage,f.file+'.gz'))),f.gzipHash);
 });
 async function replace(file){
  const target=child(live,file);await fs.mkdir(path.dirname(target),{recursive:true});
  const parent=path.resolve(await fs.realpath(path.dirname(target))).toLowerCase(),base=live.toLowerCase();
  assert(parent===base||parent.startsWith(base+path.sep),'Redirected parent');
  const temp=target+'.buirette-tmp';await fs.copyFile(child(stage,file),temp);await fs.rename(temp,target);
 }
 for(const p of [1,2,3,4,5,6,7]){
  const group=m.files.filter(f=>priority(f.file)===p);
  await parallel(group,async f=>{await replace(f.file);if(f.gzipHash)await replace(f.file+'.gz');});
  console.log('Published group '+p+': '+group.length+' files');
 }
 await parallel(m.files,async f=>{
  assert.equal(hash(await fs.readFile(child(live,f.file))),f.hash,'Published mismatch: '+f.file);
  if(f.gzipHash)assert.equal(hash(await fs.readFile(child(live,f.file+'.gz'))),f.gzipHash,'Published gzip mismatch: '+f.file);
 });
 const result={published:true,scope,files:m.files.length,finished:new Date().toISOString(),url:baseURL,backup};
 await fs.writeFile(path.join(work,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else if(mode==='verify-http'){
 const m=preparedManifest;
 // Verify only the files changed by this prepared release, including its scope.
 const expectedHashes=new Map(m.files.map(f=>[f.file,f.hash]));
 const report=[];await parallel([...expectedHashes],async([file,expected])=>{
  const response=await fetch(new URL(file,baseURL),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(response.ok,'HTTP '+response.status+': '+file);assert.equal(hash(Buffer.from(await response.arrayBuffer())),expected,'HTTPS mismatch: '+file);
  report.push({file,status:response.status,encoding:response.headers.get('content-encoding')});
 });
 await fs.writeFile(path.join(work,'https-validation.json'),JSON.stringify({checked:new Date().toISOString(),files:report},null,2));console.log(JSON.stringify({https:'passed',files:report.length}));
}else throw Error('Use prepare, publish, or verify-http');
