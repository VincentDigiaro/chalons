import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// The existing building files and index records stay authoritative. Packs only
// change transport, so model replacements can still exclude individual IDs.
export async function buildWalkPacks({root='dist',output=root,configFile='walk-pack-config.json'}={}){
 const config=JSON.parse(await fs.readFile(configFile,'utf8'));
 assert.deepEqual(Object.keys(config).sort(),['tailleMaxPaquetOctets','tailleZoneMetres']);
 assert(Number.isFinite(config.tailleZoneMetres)&&config.tailleZoneMetres>0);
 assert(Number.isSafeInteger(config.tailleMaxPaquetOctets)&&config.tailleMaxPaquetOctets>=8);
 const read=async file=>{try{return await fs.readFile(path.join(output,file));}catch(e){if(e.code!=='ENOENT'||path.resolve(root)===path.resolve(output))throw e;return fs.readFile(path.join(root,file));}};
 const index=JSON.parse(await read('data/walk/index.json')),cells=new Map();
 for(const node of index.nodes){
  if(node[0].startsWith('roads/'))continue;
  const [file,w,s,e,n]=node,key=[Math.floor((w+e)/2/config.tailleZoneMetres),Math.floor((s+n)/2/config.tailleZoneMetres)].join('_');
  if(!cells.has(key))cells.set(key,[]);cells.get(key).push(file);
 }
 const files=[];let buildingBytes=0,buildings=0;
 const put=async(file,bytes)=>{
  let old;try{old=await read(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old?.equals(bytes))return;
  await fs.mkdir(path.dirname(path.join(output,file)),{recursive:true});await fs.writeFile(path.join(output,file),bytes);
 };
 for(const [cell,names] of [...cells].sort(([a],[b])=>a.localeCompare(b))){
  let arrays=[],entries=[],size=8,part=0;
  const flush=async()=>{
   if(!entries.length)return;
   const header=Buffer.alloc(8);header.writeUInt32LE(0x314b5057,0);header.writeUInt32LE(entries.length,4);
   const bytes=Buffer.concat([header,...arrays]),hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,24);
   const file=`packs/${cell.replace('_','-')}-${part++}-${hash}.bin`;
   await put('data/walk/'+file,bytes);files.push({file,bytes:bytes.length,entries});
   arrays=[];entries=[];size=8;
  };
  for(const file of names.sort()){
   const bytes=await read('data/walk/'+file);assert(bytes.length>=4&&bytes.length%4===0,'Unaligned geometry: '+file);
   if(entries.length&&size+bytes.length>config.tailleMaxPaquetOctets)await flush();
   entries.push([file,size,bytes.length]);arrays.push(bytes);size+=bytes.length;buildingBytes+=bytes.length;buildings++;
  }
  await flush();
 }
 index.geometryPacks={version:1,config,files,stats:{buildings,packets:files.length,buildingBytes,packedBytes:buildingBytes+8*files.length}};
 await put('data/walk/index.json',Buffer.from(JSON.stringify(index)));
 return index.geometryPacks.stats;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){const key={'--root':'root','--output':'output','--config':'configFile'}[args[i]];assert(key&&args[i+1],'Use --root, --output, or --config followed by a path.');options[key]=args[i+1];}
 console.log(JSON.stringify(await buildWalkPacks(options)));
}
