import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const source=path.resolve(process.argv[2]||'../nice'),destination=path.resolve('dist/data/cities/nice');
const folders=['city-roads','facades','imagery','materials','roofs','terrain','walk'];
const files=['buildings.geojson','land.geojson','lines.geojson','places.geojson','manifest.json','imagery.json','custom-models.json'];
const manifest=JSON.parse(await fs.readFile(path.join(source,'dist/data/manifest.json')));
if(!manifest.title.startsWith('Nice')||manifest.bbox.west<7||manifest.bbox.east>8)throw Error('The source must contain the Nice data extraction.');
await fs.mkdir(destination,{recursive:true});
const report={city:'nice',source,importedAt:new Date().toISOString(),groups:{},metadataHashes:{}};
async function copyGroup(relative){
 const from=path.join(source,'dist/data',relative),target=path.join(destination,relative),entries=[];
 async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()&&/\.(json|geojson|bin|webp|png|jpg|jpeg)(\.gz)?$/i.test(entry.name))entries.push(file);}}
 const stat=await fs.stat(from);if(stat.isDirectory())await walk(from);else entries.push(from);
 let next=0,bytes=0;
 await Promise.all(Array.from({length:16},async()=>{while(next<entries.length){const file=entries[next++],to=stat.isDirectory()?path.join(target,path.relative(from,file)):target;await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(file,to);const size=(await fs.stat(file)).size;bytes+=size;}}));
 report.groups[relative]={files:entries.length,bytes};console.log(JSON.stringify({group:relative,...report.groups[relative]}));
}
for(const file of files)await copyGroup(file);
for(const folder of folders)await copyGroup(folder);
await fs.copyFile(path.join(source,'city.config.json'),path.join(destination,'source-city.config.json'));
for(const file of ['manifest.json','walk/index.json','terrain/index.json','source-city.config.json'])report.metadataHashes[file]=crypto.createHash('sha256').update(await fs.readFile(path.join(destination,file))).digest('hex');
await fs.writeFile(path.join(destination,'import.json'),JSON.stringify(report,null,2)+'\n');
console.log('Nice data imported. Shared engine, audio, sky and Hautvent retained from this project.');
