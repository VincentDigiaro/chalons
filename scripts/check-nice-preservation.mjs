import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const snapshot='artifacts/nice-textures/protected-before.json',mode=process.argv[2]||'verify';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function list(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=dir+'/'+e.name;if(/^dist\/data\/cities\/nice\/(facades|walk-downloads)(\/|$)/.test(p)||p==='dist/data/cities/nice/texture-generation.json'||/^dist\/data\/cities\/nice\/walk\/\d+(\/|$)/.test(p)||p==='dist/data/cities/nice/walk/index.json')return [];return e.isDirectory()?list(p):[p];});}
assert(['capture','verify'].includes(mode));
if(mode==='capture')assert(!fs.existsSync(snapshot),'Preservation baseline already exists');
const files=list('dist/data').sort(),current={};let n=0;
for(const f of files){current[f]=sha(f);if(++n%30000===0)console.log('Empreintes protégées : '+n);}
if(mode==='capture')fs.writeFileSync(snapshot,JSON.stringify(current));
else {const original=JSON.parse(fs.readFileSync(snapshot));let unchanged=0;for(const [f,h] of Object.entries(original)){if(f==='dist/data/cities/nice/walk/index.json.gz'){assert.deepEqual(gunzipSync(fs.readFileSync(f)),fs.readFileSync(f.slice(0,-3)));continue;}assert.equal(current[f],h,'Protected data changed: '+f);unchanged++;}const result={unchanged,verifiedAt:new Date().toISOString(),scope:'Châlons all data; Nice active roofs, terrain, roads, imagery, source data and non-building FPS geometry',authorizedMetadataSidecar:'Nice walk/index.json.gz verified against rebuilt JSON'};fs.writeFileSync('artifacts/nice-textures/preservation-result.json',JSON.stringify(result,null,2));console.log(result);}
console.log(mode+' : '+files.length+' fichiers');
