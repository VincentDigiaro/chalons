// Default: publish every changed deployable file, without a model/city allowlist.
// Explicit narrow scopes remain available for existing release workflows.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {listPublicationFiles} from './publication-files.mjs';

const flags=process.argv.slice(2);
assert(flags.every(f=>['--code-only','--with-models','--prepare-only'].includes(f)),'Use --code-only, --with-models or --prepare-only');
assert(!(flags.includes('--code-only')&&flags.includes('--with-models')),'Choose only one publication scope');
const scope=flags.includes('--code-only')?'code':flags.includes('--with-models')?'code-and-models':'site';
const project=fileURLToPath(new URL('..',import.meta.url)),artifacts=path.resolve(process.env.CODE_PUBLICATION_ARTIFACTS||path.join(project,'artifacts'));
await fs.mkdir(artifacts,{recursive:true});
const release=await fs.mkdtemp(path.join(artifacts,'publication-code-')),source=path.join(release,'source');
if(scope!=='site'){
 await fs.mkdir(source);
 const dist=path.resolve(process.env.CODE_PUBLICATION_SOURCE||path.join(project,'dist')),files=await listPublicationFiles(dist,new Set(),{scope});
 for(const file of files){await fs.mkdir(path.dirname(path.join(source,file)),{recursive:true});await fs.copyFile(path.join(dist,file),path.join(source,file));}
 console.log('Portée restreinte explicite : '+scope+' ('+files.length+' fichiers sélectionnés).');
}
console.log('Publication : '+release);
for(const step of flags.includes('--prepare-only')?['prepare']:['prepare','publish','verify-http']){
 const code=await new Promise((resolve,reject)=>{
  const script=scope==='site'?'publish-site.mjs':'publish-buirette.mjs';
  const child=spawn(process.execPath,[path.join(project,'scripts',script),step,...(step==='prepare'&&scope!=='site'?[scope==='code'?'--code-only':'--with-models']:[])],{cwd:project,env:{...process.env,BUIRETTE_RELEASE:release},stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('exit',(code,signal)=>resolve(signal?1:code??1));
 });
 if(code!==0){console.error('Échec de '+step+' ; les étapes suivantes ne seront pas lancées. Dossier : '+release);process.exitCode=code;break;}
}
