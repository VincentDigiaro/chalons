import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';

// All writes and requests target a disposable fixture, never the real site.
const base=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'map-publication-scope-'));
const release=path.join(root,'code-release'),source=path.join(release,'source'),live=path.join(root,'live');
const publisher=fileURLToPath(new URL('./publish-buirette.mjs',import.meta.url));
const write=async(file,content)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);};
const requests=[];
const server=http.createServer(async(req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1),target=path.resolve(live,file);requests.push(file);
 if(!target.startsWith(live+path.sep)){res.writeHead(403).end();return;}
 try{res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}
});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 async function run(work,step,...flags){
  return new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[publisher,step,...flags],{env:{...process.env,BUIRETTE_RELEASE:work,BUIRETTE_LIVE:live,BUIRETTE_BASE_URL:`http://127.0.0.1:${server.address().port}/`},windowsHide:true});
   let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>resolve({code,output}));
  });
 }
 const good=async(work,step,...flags)=>{const r=await run(work,step,...flags);assert.equal(r.code,0,r.output);return r;};
 for(const folder of [source,live])await write(path.join(folder,'app.js'),'const unchanged = true;');
 await write(path.join(live,'app.js.gz'),gzipSync('const unchanged = true;'));
 await write(path.join(live,'style.css'),'body { color: black; }');
 await write(path.join(live,'style.css.gz'),gzipSync('body { color: black; }'));
 await write(path.join(source,'style.css'),'body { color: blue; }');
 await write(path.join(source,'new.js'),'export const added = true;');
 await write(path.join(source,'style.css.gz'),'stale generated gzip');
 await write(path.join(source,'catalogue-report.json'),'unrelated metadata');
 await write(path.join(source,'fonts','unused.pbf'),'font');
 await write(path.join(source,'vendor','unchanged.js'),'library');
 await write(path.join(source,'vendor','maplibre-gl.js'),'patched map engine');
 await write(path.join(source,'vendor','earcut.js'),'export default function earcut() {}');
 await write(path.join(source,'vendor','earcut.LICENSE'),'ISC license');
 await write(path.join(live,'vendor','maplibre-gl.js'),'previous map engine');
 await write(path.join(live,'data','sentinel.bin'),'unchanged data');
 await write(path.join(source,'data','sentinel.bin'),'must not be published');
 // No walk/index.json exists: a code release must not try to read one.
 await good(release,'prepare','--code-only');
 const manifestFile=path.join(release,'manifest.json'),manifest=JSON.parse(await fs.readFile(manifestFile));
 assert.equal(manifest.scope,'code');assert.deepEqual(manifest.files.map(f=>f.file).sort(),['new.js','style.css','vendor/earcut.LICENSE','vendor/earcut.js','vendor/maplibre-gl.js']);
 assert.deepEqual(Object.keys(manifest.sourceGuards).sort(),['app.js','new.js','style.css','vendor/earcut.LICENSE','vendor/earcut.js','vendor/maplibre-gl.js']);
 assert.equal(await fs.readFile(path.join(live,'style.css'),'utf8'),'body { color: black; }','Preparation must not publish');
 assert.equal(await fs.readFile(path.join(release,'backup/style.css'),'utf8'),'body { color: black; }');
 assert.equal(gunzipSync(await fs.readFile(path.join(release,'files/style.css.gz'))).toString(),'body { color: blue; }');
 const forbidden={...manifest,files:[...manifest.files,{file:'data/sentinel.bin'}]};await fs.writeFile(manifestFile,JSON.stringify(forbidden));
 const refusal=await run(release,'publish');assert.notEqual(refusal.code,0);assert.match(refusal.output,/Data excluded from code-only publication/);
 await fs.writeFile(manifestFile,JSON.stringify(manifest));
 await write(path.join(live,'style.css'),'independent change');
 const conflict=await run(release,'publish');assert.notEqual(conflict.code,0);assert.match(conflict.output,/Live site changed/);
 await assert.rejects(fs.access(path.join(live,'new.js')),{code:'ENOENT'});
 await write(path.join(live,'style.css'),'body { color: black; }');
 await good(release,'publish');await good(release,'verify-http');
 assert.equal(await fs.readFile(path.join(live,'data/sentinel.bin'),'utf8'),'unchanged data');
 assert.deepEqual(requests.sort(),['new.js','style.css','vendor/earcut.LICENSE','vendor/earcut.js','vendor/maplibre-gl.js']);
 assert.equal(await fs.readFile(path.join(live,'vendor/earcut.js'),'utf8'),'export default function earcut() {}');
 assert.equal(await fs.readFile(path.join(live,'vendor/earcut.LICENSE'),'utf8'),'ISC license');
 assert.equal(await fs.readFile(path.join(live,'vendor/maplibre-gl.js'),'utf8'),'patched map engine');
 assert.equal(gunzipSync(await fs.readFile(path.join(live,'vendor/maplibre-gl.js.gz'))).toString(),'patched map engine');
 assert.equal(await fs.readFile(path.join(live,'style.css'),'utf8'),'body { color: blue; }');
 // A second identical code release does not copy or verify any payload again.
 const repeat=path.join(root,'repeat-release');await fs.cp(source,path.join(repeat,'source'),{recursive:true});await good(repeat,'prepare','--code-only');
 const repeated=JSON.parse(await fs.readFile(path.join(repeat,'manifest.json')));assert.equal(repeated.files.length,0);
 await good(repeat,'publish');await good(repeat,'verify-http');assert.equal(requests.length,5);
 // Existing complete manifests without a scope field keep their old behavior.
 const full=path.join(root,'full-release');await fs.cp(source,path.join(full,'source'),{recursive:true});
 await write(path.join(full,'source/data/walk/index.json'),JSON.stringify({nodes:[['0/building.bin']],sourceHashes:{}}));
 await write(path.join(full,'source/data/walk/0/building.bin'),'new building');
 await good(full,'prepare');
 const fullFile=path.join(full,'manifest.json'),fullManifest=JSON.parse(await fs.readFile(fullFile));assert.equal(fullManifest.scope,'all');assert(fullManifest.files.some(f=>f.file==='data/walk/0/building.bin'));
 delete fullManifest.scope;await fs.writeFile(fullFile,JSON.stringify(fullManifest));await good(full,'publish');
 assert.equal(await fs.readFile(path.join(live,'data/walk/0/building.bin'),'utf8'),'new building');
 console.log(JSON.stringify({publicationScope:'passed',target:'temporary fixture only',dataExcludedFromCode:true,unchangedCodeSkipped:true,repeatCopies:0,httpChecksOnlyChangedCode:true,backupsAndGzip:true,concurrentEditsProtected:true,legacyFullManifestCompatible:true}));
}finally{
 await new Promise(resolve=>server.close(resolve));
 assert(root.startsWith(base+path.sep)&&path.basename(root).startsWith('map-publication-scope-'));
 await fs.rm(root,{recursive:true,force:true});
}
