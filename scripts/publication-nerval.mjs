import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function optionalJSON(root,file){try{return JSON.parse(await fs.readFile(path.join(root,file),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const walkFile='data/walk/index.json',downloadFile='data/walk-downloads/index.json';

// Copy the active Nerval model and its pedestrian packets, not the whole city.
export async function listNervalPublicationFiles(source){
 const model=await optionalJSON(source,'data/nerval/index.json');
 if(!model)return [];
 const files=new Set();
 async function include(file){
  assert(!file.includes('\\')&&!file.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')),'Invalid Nerval dependency: '+file);
  assert(file.startsWith('data/nerval/')||file.startsWith('data/facades/textures/')||file===walkFile||file===downloadFile||/^data\/walk\/detail\/[^/]+\.bin$/.test(file),'Dependency outside Nerval scope: '+file);
  let current=source;
  for(const segment of file.split('/')){current=path.join(current,segment);assert(!(await fs.lstat(current)).isSymbolicLink(),'Unexpected symlink: '+file);}
  assert((await fs.stat(current)).isFile(),'Missing Nerval dependency: '+file);files.add(file);return current;
 }
 for(const name of ['index.json','mesh.bin','survey.json','buildings.geojson'])await include('data/nerval/'+name);
 assert.equal((await fs.stat(path.join(source,'data/nerval/mesh.bin'))).size,model.vertexCount*44,'Truncated Nerval mesh');
 assert(Array.isArray(model.textures),'Missing Nerval texture table');
 for(const texture of model.textures){assert(typeof texture==='string'&&!path.posix.isAbsolute(texture)&&!texture.includes('\\'),'Invalid Nerval texture');await include(path.posix.normalize('data/nerval/'+texture));}
 const walkBytes=await fs.readFile(await include(walkFile)),walk=JSON.parse(walkBytes);
 assert(Array.isArray(walk.nodes),'Missing Nerval pedestrian index');
 const details=walk.nodes.filter(n=>n[0].startsWith('detail/'));
 assert(details.length>0,'Missing Nerval pedestrian packets');
 for(const [file]of details)await include('data/walk/'+file);
 for(const name of ['index.json','mesh.bin','survey.json']){
  const file='data/nerval/'+name;
  assert.equal(sha(await fs.readFile(path.join(source,file))),walk.sourceHashes?.['dist/'+file],'Rebuild Nerval FPS data: '+file);
 }
 const downloads=JSON.parse(await fs.readFile(await include(downloadFile)));
 assert.equal(downloads.sourceHash,sha(walkBytes),'Rebuild the FPS download index');
 assert(Array.isArray(downloads.packs)&&downloads.packs.every(p=>p.entries.every(([file])=>!file.startsWith('detail/'))),'Nerval packets must remain separate from generic download packs');
 return [...files].sort();
}

// Shared indices may be replaced only when all omitted city data stays the same.
// This prevents a partial release from activating missing/older generic packets.
export async function checkNervalPublicationCompatibility(source,live){
 if(!await optionalJSON(source,'data/nerval/index.json'))return;
 const a=await optionalJSON(source,walkFile),b=await optionalJSON(live,walkFile);
 assert(a&&b,'Nerval publication requires an existing FPS index on the site');
 const foreign=w=>{
  const {nodes,sourceHashes,stats,retiredNodes=[],...rest}=w;
  const {assets,vertices,bytes,detailedVertices,...otherStats}=stats;
  return {...rest,nodes:nodes.filter(n=>!n[0].startsWith('detail/')),retiredNodes:retiredNodes.filter(f=>!f.startsWith('detail/')),sourceHashes:Object.fromEntries(Object.entries(sourceHashes).filter(([f])=>!f.startsWith('dist/data/nerval/'))),stats:otherStats};
 };
 assert.deepEqual(foreign(a),foreign(b),'FPS data outside Nerval differs; use a publication including those data');
 const da=await optionalJSON(source,downloadFile),db=await optionalJSON(live,downloadFile);
 assert(da&&db,'Missing FPS download index');
 const {sourceHash:sa,...pa}=da,{sourceHash:sb,...pb}=db;
 assert.deepEqual(pa,pb,'Generic download packs differ; publish them together with their index');
}
