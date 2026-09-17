import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHighwindExporter,highwindRequestHandler} from './highwind-auto-export.mjs';
import {FPS_CONFIG,validateFPSConfig,highwindModel} from '../dist/walk-config.js';
import {fetchWalkBuffer} from '../dist/walk-loading.js';
const project=fileURLToPath(new URL('..',import.meta.url));
for(const version of ['v1','v5','v6','v37','v12345']){
 assert.equal(validateFPSConfig({...FPS_CONFIG,highwind:{...FPS_CONFIG.highwind,modele:version}}).highwind.modele,version);
 assert.equal(highwindModel(version).directory,version+'/');
}
for(const version of ['v0','v01','v-1','../v5','v5/../../','V5','foo',null,{},'constructor'])assert.equal(highwindModel(version),null);
const parent=path.join(project,'artifacts/highwind-auto-tests');await fs.mkdir(parent,{recursive:true});
const root=await fs.mkdtemp(path.join(parent,'run-'));
for(const dir of ['scripts','assets/Highwind'])await fs.mkdir(path.join(root,dir),{recursive:true});
await fs.copyFile(path.join(project,'scripts/export-highwind-blend.py'),path.join(root,'scripts/export-highwind-blend.py'));
const source=path.join(root,'assets/Highwind/Highwind-v37.blend');
await fs.copyFile(path.join(project,'assets/Highwind/Highwind-v5.blend'),source);
const events=[],ensure=createHighwindExporter({root,log:line=>events.push(line)}),handle=highwindRequestHandler({root,ensure});
const server=http.createServer(async(req,res)=>{if(!await handle(req,res))res.writeHead(404).end();});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/data/highwind/`;
try{
 const results=await Promise.all(Array.from({length:3},()=>fetch(base+'v37/index.json').then(async r=>{assert.equal(r.status,200);return r.json();})));
 const index=results[0];assert(results.every(x=>x.meshSha256===index.meshSha256));
 assert.equal(index.name,'Highwind v37');assert.equal(index.objects.length,7);assert.equal(events.filter(x=>x.startsWith('Préparation')).length,1,'Concurrent requests share one Blender export');
 for(const file of [index.mesh,...index.textures.map(t=>t.file)]){const r=await fetch(base+'v37/'+file);assert.equal(r.status,200,file);assert((await r.arrayBuffer()).byteLength>0);}
 await fetch(base+'v37/index.json');assert.equal(events.filter(x=>x.startsWith('Préparation')).length,1,'Reuse the existing export');
 const head=await fetch(base+'v37/index.json',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(base+'v37/unknown.png')).status,404);
 const missing=await fetch(base+'v999/index.json');assert.equal(missing.status,404);assert.match((await missing.json()).error,/Highwind-v999.blend/);
 await assert.rejects(fetchWalkBuffer(base+'v999/index.json',{signal:new AbortController().signal,fatalStatuses:[404,422]}),/Highwind-v999.blend/);
 await assert.rejects(ensure('../v37'),/Version Highwind invalide/);
 // A later save under the same version refreshes the export automatically.
 await fs.copyFile(path.join(project,'assets/Highwind/Highwind-v4.blend'),source);
 const changed=await fetch(base+'v37/index.json').then(r=>r.json());
 assert.equal(changed.objects.length,16);assert.notEqual(changed.sourceSha256,index.sourceSha256);assert.equal(events.filter(x=>x.startsWith('Préparation')).length,2);
 assert.equal((await fetch(base+'v37/index.json',{method:'POST'})).status,405);
 // Local preview and Nginx can request the same new version in separate services.
 await fs.copyFile(source,path.join(root,'assets/Highwind/Highwind-v38.blend'));
 const other=createHighwindExporter({root,log:()=>{}});
 const outputs=await Promise.all([ensure('v38'),other('v38')]);assert.equal(outputs[0],outputs[1]);
 assert.equal(JSON.parse(await fs.readFile(path.join(outputs[0],'index.json'),'utf8')).objects.length,16);
 console.log(JSON.stringify({automaticHighwind:'passed',unlistedVersion:'v37',actualBlenderExports:3,deduplicated:true,twoServicesSafe:true,allTexturesLoaded:true,sourceChangesDetected:true,missingFileDoesNotBlockGame:true}));
}finally{await new Promise(resolve=>server.close(resolve));}
