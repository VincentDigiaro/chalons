import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function buildCustomModelRegistry(root='dist'){
 const models=[];
 for(const entry of await fs.readdir(path.join(root,'data'),{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  let index;try{index=JSON.parse(await fs.readFile(path.join(root,'data',entry.name,'index.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(!index.vertexCount||!index.ranges||!index.excludeIds||!index.bounds||!index.origin||!index.materials||!index.textures)continue;
  models.push({id:entry.name,layerId:entry.name+'-detail',basePath:'./data/'+entry.name,label:index.name||entry.name,bounds:index.bounds,excludeIds:index.excludeIds});
 }
 models.sort((a,b)=>a.id.localeCompare(b.id));
 const registry={version:1,loadRadiusMeters:500,models};
 await fs.writeFile(path.join(root,'data/custom-models.json'),JSON.stringify(registry));return registry;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildCustomModelRegistry(process.argv[2]||'dist');
