import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {installParc14Data} from './install-parc14-data.mjs';

const work='artifacts/parc14-highwind-release/publication',source=work+'/source',live='C:/nginx/html/chalons',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=(root,file)=>fs.readFile(path.join(root,file)),json=async(root,file)=>JSON.parse(await read(root,file));
const modules=['app.js','walk-mode.js','highwind-touch-camera.js','parc14-ui.js','parc14-preview.html','parc14-references.html'];
// Check that the existing runtime dependencies agree before replacing a module.
for(const f of ['highwind-flight.js','highwind-ui.js','walk-core.js','walk-config.js','nerval-layer.js'])assert.equal(sha(await read(live,f)),sha(await read('dist',f)),'Public dependency differs: '+f);
const unchanged=['data/nerval/index.json','data/nerval/mesh.bin','data/attila/index.json','data/attila/mesh.bin','data/buirette/index.json','data/buirette/mesh.bin'];
const preservedHashes=Object.fromEntries(await Promise.all(unchanged.map(async f=>[f,sha(await read(live,f))])));
await fs.mkdir(source,{recursive:true});
const installation=await installParc14Data({root:live,output:source});
await fs.cp('dist/data/parc14',source+'/data/parc14',{recursive:true});
for(const f of modules)await fs.copyFile('dist/'+f,source+'/'+f);
const before=await json(live,'data/walk/index.json'),after=await json(source,'data/walk/index.json'),model=await json(source,'data/parc14/index.json');
assert.deepEqual(after.materials,before.materials);assert.deepEqual(after.origin,before.origin);assert.deepEqual(after.scale,before.scale);
const isRetired=file=>model.excludeIds.some(id=>file.endsWith('/'+id.replace('/','-')+'.bin'));
assert.deepEqual(after.nodes.filter(n=>!n[0].startsWith('parc14/')),before.nodes.filter(n=>!n[0].startsWith('parc14/')&&!isRetired(n[0])));
const nodes=after.nodes.filter(n=>n[0].startsWith('parc14/'));
for(const [file]of nodes)assert.equal(sha(await read(source,'data/walk/'+file)),sha(await read('dist','data/walk/'+file)),'Released model differs from the validated local geometry');
for(const [f,hash]of Object.entries(preservedHashes))assert.equal(sha(await read(live,f)),hash,'Public model changed while preparing');
await fs.writeFile(work+'/installation.json',JSON.stringify({...installation,preservedHashes,publicOtherWalkNodesPreserved:true,publicMaterialsPreserved:true,localAndReleasedModelIdentical:true},null,2));
console.log(JSON.stringify({prepared:true,source,parc14Packets:nodes.length,preservedPublicModels:unchanged.length}));
