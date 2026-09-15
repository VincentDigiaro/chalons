import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
// Keep the existing house/detail packets and their material IDs untouched.
export async function integrateCityRoads(index,{root='dist',outputRoot=root}={}){
 const file=path.join(root,'data/city-roads/index.json');let raw;
 try{raw=await fs.readFile(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
 const roads=JSON.parse(raw);
 if(index.cityRoadMaterialBase!==undefined)index.materials.length=index.cityRoadMaterialBase;
 index.cityRoadMaterialBase=index.materials.length;
 index.materials.push(...roads.materials);
 index.nodes=index.nodes.filter(n=>!n[0].startsWith('roads/'));
 index.stats.vertices-=index.stats.cityRoadVertices||0;index.stats.bytes-=index.stats.cityRoadBytes||0;
 await fs.mkdir(path.join(outputRoot,'data/walk/roads'),{recursive:true});
 for(const [name,...bounds] of roads.nodes){
  const target='roads/'+path.basename(name);await fs.copyFile(path.join(root,'data/city-roads',name),path.join(outputRoot,'data/walk',target));
  index.nodes.push([target,...bounds]);
 }
 index.stats.cityRoadVertices=roads.stats.vertices;index.stats.cityRoadBytes=roads.stats.bytes;
 index.stats.vertices+=roads.stats.vertices;index.stats.bytes+=roads.stats.bytes;index.stats.assets=index.nodes.length;
 index.sourceHashes['dist/data/city-roads/index.json']=crypto.createHash('sha256').update(raw).digest('hex');
}
