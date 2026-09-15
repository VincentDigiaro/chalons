import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {installBuiretteData} from './install-buirette-data.mjs';
const work=process.env.BUIRETTE_RELEASE||'artifacts/buirette-overlap-fix/publication',source=work+'/source',live='C:/nginx/html/chalons';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(await fs.readFile(path.join(path.dirname(work),'baseline.json'))),localBefore=baseline.local||baseline.dist,publicBefore=baseline.public||baseline[live];
// The shared modules were identical when this task began. Never overwrite a
// newer public edit or substitute the different local Nerval model.
for(const file of ['app.js','nerval-layer.js']){
 assert.equal(localBefore[file],publicBefore[file]);
 assert.equal(sha(await fs.readFile(path.join(live,file))),publicBefore[file],'Public module changed: '+file);
}
await fs.mkdir(source,{recursive:true});
const report=await installBuiretteData({root:live,output:source});
await fs.cp('dist/data/buirette',source+'/data/buirette',{recursive:true});
for(const file of ['app.js','nerval-layer.js','custom-model-residency.js','buirette-ui.js','buirette-references.html','walk-renderer.js','walk-loading.js','walk-replacements.js'])await fs.copyFile('dist/'+file,source+'/'+file);
const before=JSON.parse(await fs.readFile(live+'/data/walk/index.json')),after=JSON.parse(await fs.readFile(source+'/data/walk/index.json'));
const model=JSON.parse(await fs.readFile(source+'/data/buirette/index.json'));
assert.deepEqual(after.materials,before.materials);
assert.deepEqual(after.nodes.filter(n=>!n[0].startsWith('buirette/')),before.nodes.filter(n=>!n[0].startsWith('buirette/')&&!model.excludeIds.some(id=>n[0].endsWith('/'+id.replace('/','-')+'.bin'))));
for(const file of ['data/nerval/index.json','data/nerval/mesh.bin','data/attila/index.json','data/attila/mesh.bin'])assert.equal(sha(await fs.readFile(live+'/'+file)),publicBefore[file]);
await fs.writeFile(work+'/installation.json',JSON.stringify({...report,publicMaterialsPreserved:true,publicOtherWalkNodesPreserved:true},null,2));
console.log(JSON.stringify({...report,changed:report.changed.length,source}));
