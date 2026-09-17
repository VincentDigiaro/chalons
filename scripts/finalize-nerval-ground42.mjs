import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import assert from 'node:assert/strict';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=(await fs.readFile('artifacts/nerval-ground42-current.txt','utf8')).trim();
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const walk=await read('dist/data/walk/index.json'),oldWalk=await read(path.join(root,'backup/dist/data/walk/index.json'));
assert.deepEqual(walk.nodes.filter(n=>!n[0].startsWith('detail/')),oldWalk.nodes.filter(n=>!n[0].startsWith('detail/')));
const download='dist/data/walk-downloads/index.json',d=await read(download),oldD=await read(path.join(root,'backup',download));
assert.deepEqual(d.packs,oldD.packs,'Generic download packs changed');
d.sourceHash=sha(await fs.readFile('dist/data/walk/index.json'));await fs.writeFile(download,JSON.stringify(d));
const files=['dist/nerval-ground-materials.js','dist/data/nerval/index.json','dist/data/nerval/mesh.bin','dist/data/nerval/survey.json','dist/data/walk/index.json',download,...walk.nodes.filter(n=>n[0].startsWith('detail/')).map(n=>'dist/data/walk/'+n[0])];
for(const file of files){try{const raw=await fs.readFile(file),gz=await fs.readFile(file+'.gz');if(!zlib.gunzipSync(gz).equals(raw))await fs.writeFile(file+'.gz',zlib.gzipSync(raw,{level:9}));}catch(e){if(e.code!=='ENOENT')throw e;}}
const backup=await read(path.join(root,'backup-manifest.json')),changes=[],unrelated=[];
const inScope=p=>/^dist\/data\/(nerval\/(index\.json|survey\.json|mesh\.bin|buildings\.geojson)|walk\/(index\.json|detail\/[^/]+)|walk-downloads\/index\.json)(\.gz)?$/.test(p)||['scripts/build-nerval.mjs','scripts/build-nerval-house42.mjs','scripts/build-nerval-end-site.mjs','scripts/README-nerval.md','dist/nerval-ground-materials.js','dist/nerval-ground-materials.js.gz'].includes(p);
for(const entry of backup.files){let b;try{b=await fs.readFile(entry.path);}catch(e){if(e.code==='ENOENT')continue;throw e;}const hash=sha(b);if(hash!==entry.sha256)(inScope(entry.path)?changes:unrelated).push({path:entry.path,before:entry.sha256,after:hash,bytes:b.length});}
for(const file of ['scripts/nerval-house42-ground.mjs','scripts/check-nerval-house42-ground.mjs','scripts/finalize-nerval-ground42.mjs']){const b=await fs.readFile(file);changes.push({path:file,before:null,after:sha(b),bytes:b.length});}
await fs.writeFile(path.join(root,'changed-files.json'),JSON.stringify({files:changes,unrelatedChangesPreserved:unrelated.map(x=>x.path)},null,2));
console.log(JSON.stringify({synchronized:true,changedFiles:changes.length,unrelatedFilesPreserved:unrelated.length}));
