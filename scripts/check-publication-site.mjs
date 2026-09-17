import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {listSiteFiles,sha} from './publication-site-files.mjs';
import {highwindRequestHandler} from './highwind-auto-export.mjs';

const temp=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'map-publication-site-'));
const source=path.join(root,'source'),live=path.join(root,'live'),artifacts=path.join(root,'releases');
const wrapper=fileURLToPath(new URL('./publish-code.mjs',import.meta.url)),publisher=fileURLToPath(new URL('./publish-site.mjs',import.meta.url));
const write=async(root,file,bytes)=>{const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);};
const json=async file=>JSON.parse(await fs.readFile(file));
const requests=[];let serveStaleGzip=false;
// Use the real dynamic route as nginx does; a purely static test server missed
// the 404 on old-but-published Highwind textures.
const highwind=highwindRequestHandler({root,ensure:async()=>{}});
const server=http.createServer(async(req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),target=path.resolve(live,file);
 if(!target.startsWith(live+path.sep)){res.writeHead(403).end();return;}
 requests.push({file,encoding:req.headers['accept-encoding']});
 if(await highwind(req,res))return;
 try{
  if(req.headers['accept-encoding']==='gzip'){
   const gzip=await fs.readFile(target+'.gz').catch(()=>null);
   if(gzip){res.setHeader('Content-Encoding','gzip');res.end(serveStaleGzip?gzipSync('stale response'):gzip);return;}
  }
  res.end(await fs.readFile(target));
 }catch{res.writeHead(404).end();}
});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const env={...process.env,CODE_PUBLICATION_SOURCE:source,CODE_PUBLICATION_ARTIFACTS:artifacts,BUIRETTE_LIVE:live,BUIRETTE_BASE_URL:`http://127.0.0.1:${server.address().port}/`};
 const run=(script,args=[])=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script,...args],{env,windowsHide:true});let output='';
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>resolve({code,output}));
 });
 const good=async(script,args=[])=>{const result=await run(script,args);assert.equal(result.code,0,result.output);return result;};
 const release=async args=>{
  const before=new Set(await fs.readdir(artifacts).catch(()=>[]));await good(wrapper,args);
  const added=(await fs.readdir(artifacts)).filter(f=>f.startsWith('publication-code-')&&!before.has(f));assert.equal(added.length,1);
  const work=path.join(artifacts,added[0]);return {work,m:await json(path.join(work,'manifest.json'))};
 };
 await write(source,'app.js','export const first = true;');await write(live,'app.js','old app');
 await write(live,'only-on-server.bin','preserve me');
 await release([]);
 // A completely new model and city must work without registering any new paths
 // in the publisher, including nested code, fonts, audio and unknown extensions.
 const model='data/vehicles/future-craft/v42',city='data/cities/future-city';
 const added={
  [model+'/index.json']:JSON.stringify({mesh:'mesh.bin',vertexCount:3,stride:44,textures:[{file:'paint.png'}]}),
  [model+'/mesh.bin']:Buffer.alloc(132,5),[model+'/paint.png']:'new paint',
  [city+'/walk/chunks/new.bin']:'new geometry',
  [city+'/walk/index.json']:JSON.stringify({nodes:[['chunks/new.bin']],sourceHashes:{}}),
  'modules/new-feature.mjs':'export const enabled=true;',
  'vendor/future-lib/worker.js':'postMessage("ready");',
  'fonts/new.woff2':'font','data/audio/new.ogg':'audio','data/future/new.payload':'unknown format',
  'index.html':'<script type="module" src="./app.js"></script>'
 };
 const walk=added[city+'/walk/index.json'];
 added['data/highwind/v77/index.json']=JSON.stringify({mesh:'mesh.bin',vertexCount:3,stride:44,textures:[{file:'current.png'}]});
 added['data/highwind/v77/mesh.bin']=Buffer.alloc(132,7);
 added['data/highwind/v77/current.png']='current texture';
 added['data/highwind/v77/previous.png']='previous texture still present in dist';
 added[city+'/walk-downloads/index.json']=JSON.stringify({sourceHash:sha(walk),packs:[{file:'new.pack'}]});
 added[city+'/walk-downloads/new.pack']='pack';
 for(const [file,bytes]of Object.entries(added))await write(source,file,bytes);
 // The export service serves the local dist tree, independently of nginx's copy.
 await fs.mkdir(path.join(root,'dist'),{recursive:true});
 await fs.cp(path.join(source,'data/highwind'),path.join(root,'dist/data/highwind'),{recursive:true});
 await write(source,model+'/mesh.bin.gz','stale local gzip');await write(source,'.private/token','never publish');
 await write(live,'app.js.gz',gzipSync('old compressed app'));
 const {work,m}=await release([]);
 assert.equal(m.scope,'site');assert.deepEqual(m.files.map(f=>f.file).sort(),[...Object.keys(added),'app.js'].sort());
 assert.equal(m.files.at(-1).file,'index.html');
 assert(m.files.findIndex(f=>f.file===model+'/mesh.bin')<m.files.findIndex(f=>f.file===model+'/index.json'));
 assert(m.files.findIndex(f=>f.file===city+'/walk/chunks/new.bin')<m.files.findIndex(f=>f.file===city+'/walk/index.json'));
 for(const file of Object.keys(added))assert.deepEqual(await fs.readFile(path.join(live,file)),await fs.readFile(path.join(source,file)));
 assert.equal(gunzipSync(await fs.readFile(path.join(live,'app.js.gz'))).toString(),'export const first = true;');
 assert.equal(gunzipSync(await fs.readFile(path.join(work,'backup/app.js.gz'))).toString(),'old compressed app');
 assert.deepEqual(gunzipSync(await fs.readFile(path.join(live,model,'mesh.bin.gz'))),Buffer.alloc(132,5));
 assert.equal(await fs.readFile(path.join(live,'only-on-server.bin'),'utf8'),'preserve me');
 await assert.rejects(fs.access(path.join(work,'source')),{code:'ENOENT'},'No full-tree snapshot');
 const report=await json(path.join(work,'https-validation.json'));assert.equal(report.files.length,m.files.length*2);
 assert(report.files.some(f=>f.encoding==='gzip')&&report.files.some(f=>f.requested==='identity'));
 const count=requests.length;assert.equal((await release([])).m.files.length,0);assert.equal(requests.length,count);
 const cached=(await release([])).m;assert.equal(cached.summary.cached,cached.summary.scanned);
 // Same-size changes must not be missed by the incremental comparison cache.
 const originalStat=await fs.stat(path.join(source,'data/audio/new.ogg'));
 await write(source,'data/audio/new.ogg','AUDIO');await fs.utimes(path.join(source,'data/audio/new.ogg'),originalStat.atime,originalStat.mtime);
 assert.deepEqual((await release([])).m.files.map(f=>f.file),['data/audio/new.ogg']);
 // Missing dependencies stop the default command before it changes any code.
 await fs.unlink(path.join(source,model,'paint.png'));await write(source,'app.js','next app');
 const missing=await run(wrapper);assert.notEqual(missing.code,0);assert.match(missing.output,/Missing dependency/);
 assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'export const first = true;');
 await write(source,model+'/paint.png','new paint');
 const prepared=await release(['--prepare-only']);
 assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'export const first = true;');
 await write(live,'fonts/new.woff2','concurrent edit to an unchanged dependency');
 const conflict=await run(publisher,['publish',prepared.work]);assert.notEqual(conflict.code,0);assert.match(conflict.output,/Live site changed/);
 assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'export const first = true;');
 const prepared2=await release(['--prepare-only']);await write(source,'late-addition.js','added after prepare');
 assert.match((await run(publisher,['publish',prepared2.work])).output,/Source file list changed/);
 const prepared3=await release(['--prepare-only']);await write(path.join(prepared3.work,'files'),'app.js','tampered stage');
 assert.match((await run(publisher,['publish',prepared3.work])).output,/Staged file changed/);
 const latest=await release([]);serveStaleGzip=true;
 const wrongHttp=await run(publisher,['verify-http',latest.work]);assert.notEqual(wrongHttp.code,0);assert.match(wrongHttp.output,/HTTP mismatch \(gzip\)/);
 // Re-running publish must not report success just because all disk copies are
 // already identical: retry the failed HTTP checks from the previous release.
 const stillWrong=await run(wrapper);assert.notEqual(stillWrong.code,0);assert.match(stillWrong.output,/HTTP mismatch \(gzip\)/);
 assert((await json(path.join(latest.work,'https-validation.json'))).errors.length>0);
 serveStaleGzip=false;const retried=await release([]);assert.equal(retried.m.files.length,0);
 assert((await json(path.join(retried.work,'https-validation.json'))).files.length>0);
 await fs.symlink(path.join(root,'live'),path.join(source,'linked-site'),'junction');
 await assert.rejects(listSiteFiles(source),/Unexpected symlink/);await fs.unlink(path.join(source,'linked-site'));
 // The actual Orca is covered by the same unfiltered inventory as any new asset.
 const real=await listSiteFiles(path.resolve('dist'));
 for(const file of ['data/orca/v1/index.json','data/orca/v1/mesh.bin','data/orca/v1/orca-colors.png'])assert(real.includes(file));
 console.log(JSON.stringify({publicationSite:'passed',newModelsAndCitiesAutomatic:true,nestedCodeFontsAudioIncluded:true,incrementalAndCached:true,staleGzipRepaired:true,httpIdentityAndGzipChecked:true,missingDependenciesAndConcurrentChangesRejected:true,actualFiles:real.length}));
}finally{
 await new Promise(resolve=>server.close(resolve));
 assert(root.startsWith(temp+path.sep)&&path.basename(root).startsWith('map-publication-site-'));await fs.rm(root,{recursive:true,force:true});
}
