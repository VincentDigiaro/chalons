import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {listPublicationFiles,listNiceModelPublicationFiles} from './publication-files.mjs';

// Retain coverage of the explicit legacy targeted scope on a disposable site.
const temp=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(temp,'nice-model-publication-'));
const source=path.join(root,'source'),live=path.join(root,'live'),artifacts=path.join(root,'releases');
const wrapper=fileURLToPath(new URL('./publish-code.mjs',import.meta.url)),publisher=fileURLToPath(new URL('./publish-buirette.mjs',import.meta.url));
const prefix='data/cities/nice/',folder=prefix+'nice-sheraton',packet=folder+'/walk/current.bin',registryFile=prefix+'custom-models.json';
const write=async(file,bytes)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
const requests=[];
const server=http.createServer(async(req,res)=>{const f=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),p=path.resolve(live,f);if(!p.startsWith(live+path.sep)){res.writeHead(403).end();return;}requests.push(f);try{res.end(await fs.readFile(p));}catch{res.writeHead(404).end();}});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const env={...process.env,CODE_PUBLICATION_SOURCE:source,CODE_PUBLICATION_ARTIFACTS:artifacts,BUIRETTE_LIVE:live,BUIRETTE_BASE_URL:`http://127.0.0.1:${server.address().port}/`};
 const run=(script,args=[],extra={})=>new Promise((resolve,reject)=>{const scope=script===wrapper&&!args.includes('--code-only')?['--with-models']:[];const child=spawn(process.execPath,[script,...scope,...args],{env:{...env,...extra},windowsHide:true});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});
 const good=async(script,args=[],extra={})=>{const r=await run(script,args,extra);assert.equal(r.code,0,r.output);return r;};
 const registry={version:1,models:[{id:'nice-sheraton',basePath:'./'+folder,excludeIds:[]}],walk:{version:1,materials:[{kind:12,texture:'../nice-sheraton/glass.webp'}],nodes:[['../nice-sheraton/walk/current.bin',0,0,20,20]]}};
 const selected=['app.js','custom-model-replacements.js',registryFile,folder+'/index.json',folder+'/mesh.bin',folder+'/glass.webp',packet].sort();
 await write(path.join(source,'app.js'),'import "./custom-model-replacements.js";');
 await write(path.join(source,'custom-model-replacements.js'),'export const ready=true;');
 await write(path.join(source,registryFile),JSON.stringify(registry));
 await write(path.join(source,folder,'index.json'),JSON.stringify({vertexCount:3,textures:['glass.webp']}));
 await write(path.join(source,folder,'mesh.bin'),Buffer.alloc(132,1));
 await write(path.join(source,folder,'glass.webp'),'texture fixture');
 await write(path.join(source,packet),'active pedestrian packet');
 await write(path.join(source,folder,'walk/stale.bin'),'obsolete packet');
 await write(path.join(source,folder,'mesh.bin.gz'),'stale gzip');
 await write(path.join(source,prefix,'terrain/sentinel.bin'),'local terrain must not publish');
 await write(path.join(source,prefix,'walk/index.json'),'local walk index must not publish');
 await write(path.join(live,prefix,'terrain/sentinel.bin'),'live terrain');
 await write(path.join(live,prefix,'walk/index.json'),'live walk index');
 assert.deepEqual((await listPublicationFiles(source,new Set(),{scope:'code-and-nice-models'})).sort(),selected);
 await good(wrapper);
 assert.deepEqual(requests.sort(),selected);
 const releases=await fs.readdir(artifacts),work=path.join(artifacts,releases[0]);
 const manifest=JSON.parse(await fs.readFile(path.join(work,'manifest.json')));
 assert.equal(manifest.scope,'code-and-models');assert.equal(manifest.files.at(-1).file,registryFile,'Activate the registry after meshes, walk packets and code');
 for(const file of selected)assert.deepEqual(await fs.readFile(path.join(live,file)),await fs.readFile(path.join(source,file)));
 assert.deepEqual(gunzipSync(await fs.readFile(path.join(live,folder,'mesh.bin.gz'))),await fs.readFile(path.join(source,folder,'mesh.bin')));
 assert.equal(await fs.readFile(path.join(live,prefix,'terrain/sentinel.bin'),'utf8'),'live terrain');
 assert.equal(await fs.readFile(path.join(live,prefix,'walk/index.json'),'utf8'),'live walk index');
 await assert.rejects(fs.access(path.join(live,folder,'walk/stale.bin')),{code:'ENOENT'});
 const requestCount=requests.length;await good(wrapper);assert.equal(requests.length,requestCount,'Identical releases do not retransmit payloads');
 // A missing active packet must fail before the real command publishes code.
 await fs.unlink(path.join(source,packet));await write(path.join(source,'app.js'),'new code');const missing=await run(wrapper);assert.notEqual(missing.code,0);assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'import "./custom-model-replacements.js";');
 // The explicit old scope still works even if the model tree is incomplete.
 await good(wrapper,['--code-only']);assert.equal(await fs.readFile(path.join(live,'app.js'),'utf8'),'new code');
 await write(path.join(source,packet),'updated pedestrian packet');
 const before=new Set(await fs.readdir(artifacts));await good(wrapper,['--prepare-only']);
 const prepared=path.join(artifacts,(await fs.readdir(artifacts)).find(f=>!before.has(f)));
 assert.equal(await fs.readFile(path.join(live,packet),'utf8'),'active pedestrian packet','Preparation is read-only on the site');
 const mfile=path.join(prepared,'manifest.json'),m=JSON.parse(await fs.readFile(mfile));
 await fs.writeFile(mfile,JSON.stringify({...m,files:[...m.files,{file:prefix+'terrain/sentinel.bin'}]}));
 const refused=await run(publisher,['publish'],{BUIRETTE_RELEASE:prepared});assert.notEqual(refused.code,0);assert.match(refused.output,/outside code and model dependencies/);
 await fs.writeFile(mfile,JSON.stringify(m));await write(path.join(live,packet),'concurrent edit');
 const conflict=await run(publisher,['publish'],{BUIRETTE_RELEASE:prepared});assert.notEqual(conflict.code,0);assert.match(conflict.output,/Live site changed/);
 // The actual five models and every referenced FPS packet are in the scope.
 const real=await listNiceModelPublicationFiles(path.resolve('dist'));
 const current=JSON.parse(await fs.readFile('dist/'+registryFile));
 for(const model of current.models){assert(real.includes(prefix+model.id+'/index.json'));assert(real.includes(prefix+model.id+'/mesh.bin'));}
 for(const [file]of current.walk.nodes)assert(real.includes(path.posix.normalize(prefix+'walk/'+file)));
 assert(!real.some(f=>/\/(terrain|imagery|facades|roofs|walk-downloads)\//.test(f)));
 console.log(JSON.stringify({publicationNiceModels:'passed',actualCommandTested:true,onlyTemporarySiteWritten:true,activeDependencies:real.length,modelCount:current.models.length,walkPackets:current.walk.nodes.length,registryPublishedLast:true,missingDependenciesRejected:true,unrelatedDataUntouched:true,concurrentChangesProtected:true,codeOnlyOption:true}));
}finally{
 await new Promise(resolve=>server.close(resolve));
 const resolved=path.resolve(root);assert(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('nice-model-publication-'));await fs.rm(resolved,{recursive:true,force:true});
}
