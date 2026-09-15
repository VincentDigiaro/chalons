import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import earcut,{flatten} from 'earcut';
import {EYE_HEIGHT,LOAD_RADIUS,ORIGIN,SCALE,SPAWN,SPAWN_YAW,toLocal,toLngLat,tileBounds} from '../dist/walk-core.js';
import {facadeHash} from '../dist/facade-layer.js';
import {roofUV} from './roof-policy.mjs';
import {integrateCityRoads} from './city-roads-walk.mjs';

const output='dist/data/walk',sourceHashes={};
async function read(file,json=true){const raw=await fs.readFile(file);sourceHashes[file]=crypto.createHash('sha256').update(raw).digest('hex');return json?JSON.parse(raw):raw;}
const [source,detail,survey,detailRaw,facades]=await Promise.all([read('dist/data/buildings.geojson'),read('dist/data/nerval/index.json'),read('dist/data/nerval/survey.json'),read('dist/data/nerval/mesh.bin',false),read('dist/data/facades/index.json')]);
const [buirette,buiretteRaw]=await Promise.all([read('dist/data/buirette/index.json'),read('dist/data/buirette/mesh.bin',false)]);
const [parc14,parc14Raw]=await Promise.all([read('dist/data/parc14/index.json'),read('dist/data/parc14/mesh.bin',false)]);
const [camp127,camp127Raw]=await Promise.all([read('dist/data/camp127/index.json'),read('dist/data/camp127/mesh.bin',false)]);
const [attila,attilaRaw]=await Promise.all([read('dist/data/attila/index.json'),read('dist/data/attila/mesh.bin',false)]);
const [roofs,roofAssignments]=await Promise.all([read('dist/data/roofs/catalogue-index.json'),read('dist/data/roofs/assignments.json')]);
const roofById=new Map(roofAssignments.buildings.map(a=>[a.id,a]));
await fs.mkdir(output,{recursive:true});
const attilaBase=detail.cityFacadeCatalogue?.baseMaterialCount??detail.materials.length;
if(JSON.stringify(buirette.materials)!==JSON.stringify(attila.materials))throw Error('Buirette material mapping differs from Attila');
if(JSON.stringify(parc14.materials)!==JSON.stringify(attila.materials))throw Error('Parc14 material mapping differs from Attila');
if(JSON.stringify(camp127.materials)!==JSON.stringify(attila.materials))throw Error('Camp127 material mapping differs from Attila');
const materials=[...detail.materials.slice(0,attilaBase).map(m=>({...m,texture:m.texture===undefined?null:`../nerval/${detail.textures[m.texture]}`})),...attila.materials.map(m=>({...m,texture:m.texture===undefined?null:`../attila/${attila.textures[m.texture]}`})),{kind:0}];
const plain=materials.length-1,facadeBase=materials.length;
for(const file of facades.textures)materials.push({kind:11,repeat:true,texture:`../facades/${file}`});
const roofBase=materials.length;
for(const file of roofs.textures)materials.push({kind:11,repeat:true,texture:`../roofs/${file}`});
const packs=new Map(),excluded=new Set([...detail.excludeIds,...attila.excludeIds,...buirette.excludeIds,...parc14.excludeIds,...camp127.excludeIds]),hashes=new Map(source.features.map(f=>[facadeHash(f.properties.osm_id),f.properties.osm_id]));
let previous=null;
if(process.argv.includes('--detail-only'))try{previous=JSON.parse(await fs.readFile(output+'/index.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const expectedKeys=new Set(source.features.filter(f=>!excluded.has(f.properties.osm_id)&&f.properties.kind!=='no').map(f=>f.properties.osm_id.replace('/','-')));
const previousGeneric=previous?.nodes.filter(n=>!n[0].startsWith('detail/')&&!n[0].startsWith('attila/')&&!n[0].startsWith('buirette/')&&!n[0].startsWith('parc14/')&&!n[0].startsWith('camp127/')&&!n[0].startsWith('roads/'));
const reuse=previous&&previous.roofModeVersion===1&&previous.facadeBase===facadeBase&&previous.roofBase===roofBase&&JSON.stringify(previous.materials.slice(facadeBase,previous.cityRoadMaterialBase))===JSON.stringify(materials.slice(facadeBase))&&['dist/data/buildings.geojson','dist/data/facades/index.json','dist/data/roofs/catalogue-index.json','dist/data/roofs/assignments.json'].every(file=>previous.sourceHashes[file]===sourceHashes[file])&&previousGeneric.length===expectedKeys.size&&previousGeneric.every(n=>expectedKeys.has(path.basename(n[0],'.bin')));
function packet(key){if(!packs.has(key))packs.set(key,{key,groups:new Map(),segments:[],aerial:[]});return packs.get(key);}
function triangle(pack,material,points,aerial){if(!pack.groups.has(material))pack.groups.set(material,[]);const data=pack.groups.get(material);if(aerial){const first=data.length/11,last=pack.aerial.at(-1);if(last&&last.material===material&&last.tile===aerial&&last.first+last.count===first)last.count+=3;else pack.aerial.push({material,tile:aerial,first,count:3});}data.push(...points.flat());}
function vertex(p,n=[0,0,1],uv=[0,0],color=[1,1,1]){return [...p,...n,...uv,...color];}
function quad(pack,mat,points,normal,color=[1,1,1],uv=[[0,1],[1,1],[1,0],[0,0]]){const v=points.map((p,i)=>vertex(p,normal,uv[i],color));triangle(pack,mat,[v[0],v[1],v[2]]);triangle(pack,mat,[v[0],v[2],v[3]]);}
function clip(poly,axis,edge,greater){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ai=greater?a[axis]>=edge:a[axis]<=edge,bi=greater?b[axis]>=edge:b[axis]<=edge;if(ai)out.push(a);if(ai!==bi){const t=(edge-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}return out;}
const merc=([lng,lat],n)=>[(lng+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];
const unmerc=(x,y,n)=>toLocal([x/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI]);
for(const feature of reuse?[]:source.features){
 const p=feature.properties;if(excluded.has(p.osm_id)||p.kind==='no')continue;
 const roof=roofById.get(p.osm_id);if(!roof)throw Error('Missing roof assignment: '+p.osm_id);
 const pack=packet(p.osm_id.replace('/','-')),polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 for(const poly of polys){
  const rings=poly.map(r=>r.slice(0,-1).map(toLocal));
  for(const ring of rings)for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.001)continue;
   quad(pack,plain,[[...a,p.min_height],[...b,p.min_height],[...b,p.height],[...a,p.height]],[(b[1]-a[1])/len,(a[0]-b[0])/len,0],[.816,.796,.753]);
   if(p.min_height<.65)pack.segments.push([...a,...b]);
  }
  const projected=poly.map(r=>r.slice(0,-1).map(p=>merc(p,2**17))),flat=flatten(projected),indices=earcut(flat.vertices,flat.holes,2);
  for(let i=0;i<indices.length;i+=3){
   const tri=indices.slice(i,i+3).map(j=>flat.vertices.slice(j*2,j*2+2)),xs=tri.map(p=>p[0]),ys=tri.map(p=>p[1]);
   for(let x=Math.floor(Math.min(...xs));x<=Math.floor(Math.max(...xs));x++)for(let y=Math.floor(Math.min(...ys));y<=Math.floor(Math.max(...ys));y++){
    const clipped=clip(clip(clip(clip(tri,0,x,true),0,x+1,false),1,y,true),1,y+1,false);
    for(let j=1;j<clipped.length-1;j++)triangle(pack,roofBase+roof.material,[clipped[0],clipped[j],clipped[j+1]].map(q=>vertex([...unmerc(...q,2**17),p.height+.08],[0,0,1],roofUV(roof,q),Array(3).fill(roof.tint/255))),`ign/17/${x}/${y}`);
   }
  }
 }
}
// Reuse the existing catalogue wall records exactly, including repeats and tint.
for(const chunk of reuse?[]:facades.chunks){
 const raw=await fs.readFile('dist/data/facades/'+chunk.file);
 for(let offset=0;offset<raw.length;offset+=52){
  const id=hashes.get(raw.readUInt32LE(offset+48));if(!id||excluded.has(id))continue;
  const a=Array.from({length:12},(_,i)=>raw.readFloatLE(offset+i*4)),p=unmerc(chunk.x+a[0],chunk.y+a[1],2**16),q=unmerc(chunk.x+a[2],chunk.y+a[3],2**16),len=Math.hypot(q[0]-p[0],q[1]-p[1]);
  quad(packet(id.replace('/','-')),facadeBase+a[8],[[...p,a[4]],[...q,a[4]],[...q,a[5]],[...p,a[5]]],[(q[1]-p[1])/len,(p[0]-q[0])/len,0],Array(3).fill(a[9]*a[10]),[[0,1],[a[6],1],[a[6],1-a[7]],[0,1-a[7]]]);
 }
}
// Partition the original detailed mesh without altering any vertex or material.
for(const model of [{index:detail,raw:detailRaw,base:0,prefix:'detail'},{index:attila,raw:attilaRaw,base:attilaBase,prefix:'attila'},{index:buirette,raw:buiretteRaw,base:attilaBase,prefix:'buirette'},{index:parc14,raw:parc14Raw,base:attilaBase,prefix:'parc14'},{index:camp127,raw:camp127Raw,base:attilaBase,prefix:'camp127'}]){
const detailedVertices=new Float32Array(model.raw.buffer,model.raw.byteOffset,model.raw.byteLength/4);
for(const range of model.index.ranges)for(let first=range.first;first<range.first+range.count;first+=3){
 const points=Array.from({length:3},(_,i)=>Array.from(detailedVertices.subarray((first+i)*11,(first+i+1)*11)));
 if(model.prefix!=='detail')for(const p of points){const q=toLocal([model.index.origin[0]+p[0]/model.index.scale[0],model.index.origin[1]+p[1]/model.index.scale[1]]);p[0]=q[0];p[1]=q[1];}
 const x=points.reduce((n,p)=>n+p[0],0)/3,y=points.reduce((n,p)=>n+p[1],0)/3,pack=packet(`${model.prefix}-${Math.floor(x/20)}-${Math.floor(y/20)}`);
 const catalogueIndex=model.index.materials[range.material].catalogueIndex;
 triangle(pack,catalogueIndex===undefined?model.base+range.material:facadeBase+catalogueIndex,points);
 // Slice vertical obstacles at shin height: house walls, low walls and hedges.
 const intersections=[];
 for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3];if((a[2]>.65)!==(b[2]>.65)){const t=(.65-a[2])/(b[2]-a[2]);intersections.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
 if(intersections.length===2&&Math.hypot(intersections[1][0]-intersections[0][0],intersections[1][1]-intersections[0][1])>.015)pack.segments.push(intersections.flat());
}
}
const nodes=reuse?[...previousGeneric]:[];let bytes=reuse?previous.stats.bytes-(previous.stats.cityRoadBytes||0):0,vertices=reuse?previous.stats.vertices-previous.stats.detailedVertices-(previous.stats.attilaVertices||0)-(previous.stats.buiretteVertices||0)-(previous.stats.parc14Vertices||0)-(previous.stats.camp127Vertices||0)-(previous.stats.cityRoadVertices||0):0;
if(reuse)for(const n of previous.nodes.filter(n=>n[0].startsWith('detail/')||n[0].startsWith('attila/')||n[0].startsWith('buirette/')||n[0].startsWith('parc14/')||n[0].startsWith('camp127/')))bytes-=(await fs.stat(path.join(output,n[0]))).size;
for(const pack of packs.values()){
 const ranges=[],arrays=[],bounds=[Infinity,Infinity,-Infinity,-Infinity];let first=0;
 for(const [material,data] of pack.groups){if(!data.length)continue;ranges.push([material,first,data.length/11]);first+=data.length/11;arrays.push(new Float32Array(data));for(let i=0;i<data.length;i+=11){bounds[0]=Math.min(bounds[0],data[i]);bounds[1]=Math.min(bounds[1],data[i+1]);bounds[2]=Math.max(bounds[2],data[i]);bounds[3]=Math.max(bounds[3],data[i+1]);}}
 if(!first)continue;
 const offsets=new Map(ranges.map(([material,start])=>[material,start]));
 const aerialRoofs=pack.aerial.length?pack.aerial.map(a=>[a.tile,offsets.get(a.material)+a.first,a.count]):undefined;
 const header=Buffer.from(JSON.stringify({ranges,aerialRoofs,segments:pack.segments.map(s=>s.map(v=>+v.toFixed(3)))})),padded=Math.ceil(header.length/4)*4,buffer=Buffer.alloc(4+padded+first*44,32);buffer.writeUInt32LE(padded,0);header.copy(buffer,4);let at=4+padded;
 for(const array of arrays){Buffer.from(array.buffer).copy(buffer,at);at+=array.byteLength;}
 const folder=pack.key.startsWith('detail-')?'detail':pack.key.startsWith('attila-')?'attila':pack.key.startsWith('buirette-')?'buirette':pack.key.startsWith('parc14-')?'parc14':pack.key.startsWith('camp127-')?'camp127':String(Number(pack.key.split('-')[1])%100),file=`${folder}/${pack.key}.bin`;
 await fs.mkdir(path.join(output,folder),{recursive:true});await fs.writeFile(path.join(output,file),buffer);
 nodes.push([file,...bounds.map((n,i)=>i<2?Math.floor(n*100)/100:Math.ceil(n*100)/100)]);bytes+=buffer.length;vertices+=first;
}
const index={version:1,roofModeVersion:1,roofCount:roofs.textures.length,origin:ORIGIN,scale:SCALE,eyeHeight:EYE_HEIGHT,radius:LOAD_RADIUS,spawn:SPAWN,yaw:SPAWN_YAW,materials,attilaBase,facadeBase,roofBase,nodes,sourceHashes,stats:{assets:nodes.length,vertices,bytes,detailedVertices:detail.vertexCount,attilaVertices:attila.vertexCount,buiretteVertices:buirette.vertexCount,parc14Vertices:parc14.vertexCount,camp127Vertices:camp127.vertexCount}};
await integrateCityRoads(index);
// Full builds retain the list of empty legacy replacement URLs.
try{const old=JSON.parse(await fs.readFile(path.join(output,'index.json'),'utf8')),active=new Set(nodes.map(n=>n[0]));index.retiredNodes=(old.retiredNodes||[]).filter(file=>!active.has(file));}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.writeFile(path.join(output,'index.json'),JSON.stringify(index));
console.log(JSON.stringify(index.stats));
