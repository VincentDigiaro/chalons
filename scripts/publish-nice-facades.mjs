// An explicit allowlist publishes Nice facades only, with before-images and guards.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const work=path.resolve('artifacts/nice-textures/publication'),source=path.resolve('dist'),live=path.resolve('C:/nginx/html/chalons');
const prefix='data/cities/nice/',base='https://digiaro.duckdns.org/chalons/',mode=process.argv[2];
assert(['prepare','publish','verify-http'].includes(mode),'Use prepare, publish or verify-http');
const sha=b=>b===null?null:createHash('sha256').update(b).digest('hex');
const optional=f=>fs.existsSync(f)?fs.readFileSync(f):null;
const put=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);};
const child=(root,f)=>{const base=path.resolve(root),p=path.resolve(base,f);assert(p.startsWith(base+path.sep));return p;};
const allowed=f=>/^data\/cities\/nice\/(facades\/(chunks\/[^/]+\.bin|textures\/(low\/)?nice-[^/]+\.webp|index\.json|catalogue\.json|assignments\.json)|walk\/(\d+\/[^/]+\.bin|index\.json)|walk-downloads\/([a-f0-9]{64}\.pack|index\.json)|texture-generation\.json)$/.test(f);
const stage=work+'/files',backup=work+'/backup',manifestFile=work+'/manifest.json';
const guardNames=['facades/index.json','walk/index.json','walk-downloads/index.json','import.json','roofs/index.json','roofs/catalogue-index.json','terrain/index.json'].map(f=>prefix+f);
const guards=root=>Object.fromEntries(guardNames.map(f=>[f,sha(optional(child(root,f)))]));
const protectedList=JSON.parse(fs.readFileSync('artifacts/nice-textures/protected-before.json'));
function protectedLive(){const result={};for(const f of Object.keys(protectedList)){if(f==='dist/data/cities/nice/walk/index.json.gz')continue;const relative=f.replace(/^dist\//,'');result[relative]=sha(optional(child(live,relative)));}return result;}
if(mode==='prepare'){
 assert(!fs.existsSync(manifestFile),'Release already prepared');
 assert(fs.existsSync('artifacts/nice-textures/validation.json'),'Run validation first');
 const installed=JSON.parse(fs.readFileSync('artifacts/nice-textures/local-backup/installed.json'));
 const packs=JSON.parse(fs.readFileSync(source+'/'+prefix+'walk-downloads/index.json'));
 const files=[...new Set([...installed.files.map(f=>prefix+f.file),prefix+'walk-downloads/index.json',...packs.packs.map(p=>prefix+'walk-downloads/'+p.file)])];
 const sourceGuards=guards(source),liveGuards=guards(live),protectedBefore=protectedLive(),changed=[];
 for(const f of files){
  assert(allowed(f),'Outside Nice facade release: '+f);
  const bytes=fs.readFileSync(child(source,f)),old=optional(child(live,f)),oldGz=optional(child(live,f+'.gz'));
  if(old?.equals(bytes))continue;
  const gz=/\.(bin|json)$/.test(f)?gzipSync(bytes,{level:6}):null;
  put(child(stage,f),bytes);if(gz)put(child(stage,f+'.gz'),gz);
  if(old)put(child(backup,f),old);if(oldGz)put(child(backup,f+'.gz'),oldGz);
  changed.push({file:f,hash:sha(bytes),oldHash:sha(old),oldGzipHash:sha(oldGz),gzipHash:sha(gz),bytes:bytes.length});
  if(changed.length%20000===0)console.log('Publication préparée : '+changed.length);
 }
 assert.deepEqual(guards(source),sourceGuards,'Local indices changed during preparation');assert.deepEqual(guards(live),liveGuards,'Live indices changed during preparation');
 put(work+'/protected-live-before.json',JSON.stringify(protectedBefore));
 put(manifestFile,JSON.stringify({createdAt:new Date().toISOString(),scope:'Nice facades and corresponding FPS only; roofs excluded',source,live,sourceGuards,liveGuards,files:changed}));
 console.log(JSON.stringify({prepared:true,files:changed.length,bytes:changed.reduce((s,f)=>s+f.bytes,0)}));
}else{
 const m=JSON.parse(fs.readFileSync(manifestFile));assert.equal(m.source,source);assert.equal(m.live,live);m.files.forEach(f=>assert(allowed(f.file)));
 if(mode==='publish'){
  assert.equal(fs.realpathSync(live).toLowerCase(),live.toLowerCase());
  assert.deepEqual(guards(source),m.sourceGuards,'Source changed');assert.deepEqual(guards(live),m.liveGuards,'Live changed');
  for(const f of m.files){assert.equal(sha(optional(child(live,f.file))),f.oldHash,'Concurrent change: '+f.file);assert.equal(sha(optional(child(live,f.file+'.gz'))),f.oldGzipHash);assert.equal(sha(fs.readFileSync(child(source,f.file))),f.hash);assert.equal(sha(fs.readFileSync(child(stage,f.file))),f.hash);if(f.gzipHash)assert.equal(sha(fs.readFileSync(child(stage,f.file+'.gz'))),f.gzipHash);}
  const priority=f=>f.endsWith('/index.json')||f.endsWith('/texture-generation.json')?1:0;
  function replace(f){const target=child(live,f);fs.mkdirSync(path.dirname(target),{recursive:true});assert(fs.realpathSync(path.dirname(target)).toLowerCase().startsWith(live.toLowerCase()+path.sep));const tmp=target+'.nice-textures-tmp';fs.copyFileSync(child(stage,f),tmp);fs.renameSync(tmp,target);}
  let n=0;
  for(const f of [...m.files].sort((a,b)=>priority(a.file)-priority(b.file)||a.file.localeCompare(b.file))){
   assert.equal(sha(optional(child(live,f.file))),f.oldHash,'Concurrent replacement: '+f.file);
   assert.equal(sha(optional(child(live,f.file+'.gz'))),f.oldGzipHash,'Concurrent gzip replacement');
   replace(f.file);if(f.gzipHash)replace(f.file+'.gz');
   if(++n%20000===0)console.log('Publié : '+n);
  }
  for(const f of m.files){assert.equal(sha(fs.readFileSync(child(live,f.file))),f.hash);if(f.gzipHash)assert.equal(sha(fs.readFileSync(child(live,f.file+'.gz'))),f.gzipHash);}
  assert.deepEqual(protectedLive(),JSON.parse(fs.readFileSync(work+'/protected-live-before.json')),'Protected live data changed');
  put(work+'/result.json',JSON.stringify({published:true,files:m.files.length,finishedAt:new Date().toISOString(),backup,url:base+'?ville=nice',protectedLiveUnchanged:true},null,2));
  console.log('Publication Nice vérifiée : '+m.files.length+' fichiers');
 }else{
  const walk=m.files.filter(f=>/\/walk\/\d+\//.test(f.file)),chunks=m.files.filter(f=>f.file.includes('/facades/chunks/')),packs=m.files.filter(f=>f.file.endsWith('.pack'));
  const sample=a=>a.filter((_,i)=>i%Math.max(1,Math.floor(a.length/10))===0);
  const selected=[...m.files.filter(f=>f.file.endsWith('.json')||f.file.endsWith('.webp')),...sample(walk),...sample(chunks),...sample(packs)];
  let next=0;await Promise.all(Array.from({length:6},async()=>{while(next<selected.length){const f=selected[next++],r=await fetch(base+f.file+'?nice-textures='+f.hash.slice(0,12));assert.equal(r.status,200,f.file);assert.equal(sha(Buffer.from(await r.arrayBuffer())),f.hash,'HTTPS hash mismatch: '+f.file);}}));
  put(work+'/https-result.json',JSON.stringify({verifiedAt:new Date().toISOString(),files:selected.length,all48FacadeTexturesInBothResolutions:true,url:base+'?ville=nice'},null,2));
  console.log('Livraison HTTPS vérifiée : '+selected.length+' fichiers');
 }
}
