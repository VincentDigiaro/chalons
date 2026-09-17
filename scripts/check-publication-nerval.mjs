import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {listNervalPublicationFiles} from './publication-nerval.mjs';

// The explicit legacy targeted scope runs against an isolated site.
const temp=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'nerval-publication-'));
const source=path.join(root,'source'),live=path.join(root,'live'),artifacts=path.join(root,'releases');
const wrapper=fileURLToPath(new URL('./publish-code.mjs',import.meta.url)),publisher=fileURLToPath(new URL('./publish-buirette.mjs',import.meta.url));
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const packet='data/walk/detail/current.bin',walkFile='data/walk/index.json',downloadFile='data/walk-downloads/index.json';
const requests=[],server=http.createServer(async(req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),target=path.resolve(live,file);
 if(!target.startsWith(live+path.sep)){res.writeHead(403).end();return;}
 requests.push(file);try{res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}
});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const env={...process.env,CODE_PUBLICATION_SOURCE:source,CODE_PUBLICATION_ARTIFACTS:artifacts,BUIRETTE_LIVE:live,BUIRETTE_BASE_URL:`http://127.0.0.1:${server.address().port}/`};
 const run=(script,args=[],extra={})=>new Promise((resolve,reject)=>{
  const scope=script===wrapper&&!args.includes('--code-only')?['--with-models']:[];
  const child=spawn(process.execPath,[script,...scope,...args],{env:{...env,...extra},windowsHide:true});let output='';
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>resolve({code,output}));
 });
 const good=async(script,args=[],extra={})=>{const r=await run(script,args,extra);assert.equal(r.code,0,r.output);return r;};
 const model={vertexCount:6,textures:['tiles.webp','../facades/textures/shared.webp']};
 const walk={version:1,origin:[4.3815,48.9475],materials:[{kind:0}],nodes:[['detail/current.bin',0,0,10,10],['0/generic.bin',20,20,30,30]],sourceHashes:{'dist/data/buildings.geojson':sha('generic data')},stats:{assets:2,vertices:9,bytes:396,detailedVertices:6,attilaVertices:0}};
 for(const folder of [source,live]){
  await write(path.join(folder,'data/nerval/index.json'),JSON.stringify(model));
  await write(path.join(folder,'data/nerval/mesh.bin'),Buffer.alloc(264,folder===source?1:0));
  await write(path.join(folder,'data/nerval/survey.json'),JSON.stringify({version:folder===source?2:1}));
  await write(path.join(folder,'data/nerval/buildings.geojson'),'{}');
  await write(path.join(folder,'data/nerval/tiles.webp'),'tile texture');
  await write(path.join(folder,'data/facades/textures/shared.webp'),'shared texture');
  await write(path.join(folder,packet),folder===source?'new southern houses':'old southern houses');
  await write(path.join(folder,'data/walk/0/generic.bin'),'untouched generic packet');
  await write(path.join(folder,'data/buildings.geojson'),'generic data');
  const w=structuredClone(walk);
  for(const name of ['index.json','mesh.bin','survey.json'])w.sourceHashes['dist/data/nerval/'+name]=sha(await fs.readFile(path.join(folder,'data/nerval/'+name)));
  await write(path.join(folder,walkFile),JSON.stringify(w));
  await write(path.join(folder,downloadFile),JSON.stringify({version:1,encoding:'gzip',sourceHash:sha(JSON.stringify(w)),packs:[{file:'existing.pack',entries:[['0/generic.bin',0,4,4]]}]}));
 }
 await write(path.join(source,'app.js'),'new application code');await write(path.join(live,'app.js'),'old application code');
 await write(path.join(source,'data/walk/detail/obsolete.bin'),'must not publish');
 await write(path.join(source,'data/imagery/sentinel.bin'),'must not publish imagery');
 await write(path.join(live,'data/imagery/sentinel.bin'),'live imagery');
 await write(path.join(source,'data/walk-downloads/existing.pack'),'must not publish generic archives');
 await write(path.join(live,'data/walk-downloads/existing.pack'),'live generic archive');
 const selected=await listNervalPublicationFiles(source);assert(selected.includes(packet)&&selected.includes(downloadFile));assert(!selected.some(f=>f.includes('obsolete')||f.endsWith('.pack')||f.includes('imagery')||f.includes('/0/')));
 await good(wrapper);
 const work=path.join(artifacts,(await fs.readdir(artifacts))[0]),manifest=await read(path.join(work,'manifest.json'));
 assert.equal(manifest.scope,'code-and-models');
 assert.deepEqual(manifest.files.slice(-2).map(f=>f.file),[walkFile,downloadFile],'Activate FPS indices after all resources');
 for(const file of [...selected,'app.js'])assert.deepEqual(await fs.readFile(path.join(live,file)),await fs.readFile(path.join(source,file)));
 assert.equal(await fs.readFile(path.join(work,'backup',packet),'utf8'),'old southern houses');
 assert.equal(gunzipSync(await fs.readFile(path.join(live,packet+'.gz'))).toString(),'new southern houses');
 assert.equal(await fs.readFile(path.join(live,'data/imagery/sentinel.bin'),'utf8'),'live imagery');
 assert.equal(await fs.readFile(path.join(live,'data/walk-downloads/existing.pack'),'utf8'),'live generic archive');
 assert.equal(await fs.readFile(path.join(live,'data/walk/0/generic.bin'),'utf8'),'untouched generic packet');
 await assert.rejects(fs.access(path.join(live,'data/walk/detail/obsolete.bin')),{code:'ENOENT'});
 assert.deepEqual([...requests].sort(),manifest.files.map(f=>f.file).sort());
 const count=requests.length;await good(wrapper);assert.equal(requests.length,count,'Unchanged resources must not be retransmitted');
 // Missing active geometry aborts the wrapper before any code goes live.
 await fs.unlink(path.join(source,packet));await write(path.join(source,'app.js'),'next code');
 assert.notEqual((await run(wrapper)).code,0);assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'new application code');
 await good(wrapper,['--code-only']);assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'next code');
 await write(path.join(source,packet),'next southern houses');
 const downloads=await read(path.join(source,downloadFile));
 await write(path.join(source,downloadFile),JSON.stringify({...downloads,sourceHash:'stale'}));
 assert.match((await run(wrapper)).output,/Rebuild the FPS download index/);
 await write(path.join(source,downloadFile),JSON.stringify({...downloads,packs:[]}));
 assert.match((await run(wrapper)).output,/Generic download packs differ/);
 await write(path.join(source,downloadFile),JSON.stringify(downloads));
 const originalWalk=await fs.readFile(path.join(source,walkFile)),changedWalk=JSON.parse(originalWalk);
 changedWalk.nodes.push(['0/another.bin',40,40,50,50]);const changedBytes=JSON.stringify(changedWalk);
 await write(path.join(source,walkFile),changedBytes);await write(path.join(source,downloadFile),JSON.stringify({...downloads,sourceHash:sha(changedBytes)}));
 assert.match((await run(wrapper)).output,/FPS data outside Nerval differs/);
 await write(path.join(source,walkFile),originalWalk);await write(path.join(source,downloadFile),JSON.stringify(downloads));
 const before=new Set(await fs.readdir(artifacts));await good(wrapper,['--prepare-only']);
 const prepared=path.join(artifacts,(await fs.readdir(artifacts)).find(f=>!before.has(f))),mfile=path.join(prepared,'manifest.json'),m=await read(mfile);
 assert.equal(await fs.readFile(path.join(live,packet),'utf8'),'new southern houses','Preparation does not publish');
 await write(mfile,JSON.stringify({...m,files:[...m.files,{file:'data/imagery/sentinel.bin'}]}));
 assert.match((await run(publisher,['publish'],{BUIRETTE_RELEASE:prepared})).output,/outside code and model dependencies/);
 await write(mfile,JSON.stringify(m));await write(path.join(live,packet),'concurrent edit');
 assert.match((await run(publisher,['publish'],{BUIRETTE_RELEASE:prepared})).output,/Live site changed/);
 // Validate coverage against the actual generated Nerval model.
 const real=await listNervalPublicationFiles(path.resolve('dist')),current=await read('dist/'+walkFile);
 for(const [file]of current.nodes.filter(n=>n[0].startsWith('detail/')))assert(real.includes('data/walk/'+file));
 console.log(JSON.stringify({publicationNerval:'passed',actualCommandTested:true,onlyTemporarySiteWritten:true,activeDependencies:real.length,backupsAndGzip:true,missingPacketsRejected:true,staleDownloadsRejected:true,foreignIndicesProtected:true,concurrentChangesProtected:true,unchangedResourcesSkipped:true,codeOnlyOption:true}));
}finally{
 await new Promise(resolve=>server.close(resolve));
 const resolved=path.resolve(root);assert(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('nerval-publication-'));await fs.rm(resolved,{recursive:true,force:true});
}
