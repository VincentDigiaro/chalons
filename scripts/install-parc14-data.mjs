import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {facadeHash} from '../dist/facade-layer.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Apply the replacement to either the working game or a public-version overlay.
// Unrelated vertices, material IDs and model packets are retained byte for byte.
export async function installParc14Data({root='dist',output=root,modelRoot='dist'}={}){
 const read=f=>fs.readFile(path.join(root,f)),json=async f=>JSON.parse(await read(f)),changed=[];
 const put=async(f,b)=>{if(typeof b!=='string'&&!Buffer.isBuffer(b))b=JSON.stringify(b);b=Buffer.from(b);let old;try{old=await read(f);}catch(e){if(e.code!=='ENOENT')throw e;}if(old?.equals(b))return;await fs.mkdir(path.dirname(path.join(output,f)),{recursive:true});await fs.writeFile(path.join(output,f),b);changed.push({file:f,before:old?sha(old):null,after:sha(b)});};
 const model=JSON.parse(await fs.readFile(path.join(modelRoot,'data/parc14/index.json'))),ids=new Set(model.excludeIds),hashes=new Set([...ids].map(facadeHash));
 const fac=await json('data/facades/index.json'),assign=await json('data/facades/assignments.json'),removed=assign.buildings.filter(b=>ids.has(b.id));let removedRecords=0;
 for(const chunk of fac.chunks){const raw=await read('data/facades/'+chunk.file),keep=[],removedHashes=new Set();for(let at=0;at<raw.length;at+=52){if(hashes.has(raw.readUInt32LE(at+48))){removedRecords++;removedHashes.add(raw.readUInt32LE(at+48));}else keep.push(raw.subarray(at,at+52));}if(removedHashes.size){const b=Buffer.concat(keep);await put('data/facades/'+chunk.file,b);chunk.count=b.length/52;chunk.bytes=b.length;chunk.buildings-=removedHashes.size;}}
 fac.protectedIds=[...new Set([...fac.protectedIds,...ids])].sort();fac.stats.texturedBuildings-=removed.length;fac.stats.facades-=removedRecords;fac.stats.geometryBytes-=removedRecords*52;fac.stats.excludedParc14=(fac.stats.excludedParc14||0)+removed.length;
 for(const r of removed){fac.stats.sectorCounts[r.sector]--;for(const f of r.faces)fac.stats.materialCounts[f[3]]--;}
 assign.buildings=assign.buildings.filter(b=>!ids.has(b.id));for(const id of ids)if(!assign.excluded.some(e=>e.id===id))assign.excluded.push({id,reason:'parc14'});
 await put('data/facades/index.json',fac);await put('data/facades/assignments.json',assign);

 const roof=await json('data/roofs/index.json'),meta=await json('data/roofs/catalogue-index.json'),ra=await json('data/roofs/assignments.json');
 const raw=await read('data/roofs/mesh.bin'),surface=await read('data/roofs/surface.bin'),n=2**roof.zoom;
 const xy=([lng,lat])=>[(lng+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];
 const polygons=model.parts.map(p=>p.footprint.slice(0,-1).map(xy));
 const inside=(p,ring)=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 const pBounds=polygons.map(p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))]);
 const vertices=[],surfaces=[],tiles=[];let atOut=0,removedTriangles=0;
 for(const tile of roof.tiles){const first=atOut/12;for(let i=tile.first;i<tile.first+tile.count;i+=3){const at=i*12,p=[tile.x+(raw.readFloatLE(at)+raw.readFloatLE(at+12)+raw.readFloatLE(at+24))/3,tile.y+(raw.readFloatLE(at+4)+raw.readFloatLE(at+16)+raw.readFloatLE(at+28))/3];if(polygons.some((ring,k)=>p[0]>=pBounds[k][0]&&p[0]<=pBounds[k][2]&&p[1]>=pBounds[k][1]&&p[1]<=pBounds[k][3]&&inside(p,ring))){removedTriangles++;continue;}vertices.push(raw.subarray(at,at+36));surfaces.push(surface.subarray(at,at+36));atOut+=36;}if(atOut/12>first)tiles.push({...tile,first,count:atOut/12-first});}
 const rb=Buffer.concat(vertices),sb=Buffer.concat(surfaces);roof.tiles=tiles;roof.vertexCount=rb.length/12;roof.triangles=roof.vertexCount/3;roof.excludedDetailedBuildings=[...new Set([...roof.excludedDetailedBuildings,...ids])];
 ra.buildings=ra.buildings.filter(b=>!ids.has(b.id));for(const a of ra.buildings)if(ids.has(a.sharedRoofWith))delete a.sharedRoofWith;ra.excludedDetailedBuildings=roof.excludedDetailedBuildings;
 const raBytes=Buffer.from(JSON.stringify(ra));meta.vertexCount=roof.vertexCount;meta.geometrySha256=sha(rb);meta.surfaceSha256=sha(sb);meta.assignmentsSha256=sha(raBytes);meta.stats.buildings=ra.buildings.length;meta.stats.photoEvidence=ra.buildings.filter(b=>b.photoSamples>0).length;meta.stats.materialCounts=Array(meta.textures.length).fill(0);for(const a of ra.buildings)meta.stats.materialCounts[a.material]++;meta.stats.protectedNerval=roof.excludedDetailedBuildings.length;
 await put('data/roofs/mesh.bin',rb);await put('data/roofs/surface.bin',sb);await put('data/roofs/index.json',roof);await put('data/roofs/assignments.json',raBytes);await put('data/roofs/catalogue-index.json',meta);

 const walk=await json('data/walk/index.json'),base=walk.attilaBase,att=await json('data/attila/index.json');assert.deepEqual(model.materials,att.materials,'Reuse the same material table');
 const preserved=[],old=[];for(const node of walk.nodes){const name=path.basename(node[0],'.bin').replace('-','/');(node[0].startsWith('parc14/')||ids.has(name)?old:preserved).push(node);}
 let byteCount=walk.stats.bytes,vertexCount=walk.stats.vertices;for(const node of old){const b=await read('data/walk/'+node[0]);byteCount-=b.length;vertexCount-=(b.length-4-b.readUInt32LE(0))/44;}
 const bytes=await fs.readFile(path.join(modelRoot,'data/parc14/mesh.bin')),a=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),packs=new Map();
 for(const range of model.ranges)for(let first=range.first;first<range.first+range.count;first+=3){const points=Array.from({length:3},(_,k)=>Array.from(a.subarray((first+k)*11,(first+k+1)*11)));for(const p of points){const geo=[model.origin[0]+p[0]/model.scale[0],model.origin[1]+p[1]/model.scale[1]];p[0]=(geo[0]-walk.origin[0])*walk.scale[0];p[1]=(geo[1]-walk.origin[1])*walk.scale[1];}
  const x=points.reduce((s,p)=>s+p[0],0)/3,y=points.reduce((s,p)=>s+p[1],0)/3,key=`parc14-${Math.floor(x/20)}-${Math.floor(y/20)}`;
  if(!packs.has(key))packs.set(key,{groups:new Map(),segments:[]});const pack=packs.get(key),mat=base+range.material;if(!pack.groups.has(mat))pack.groups.set(mat,[]);pack.groups.get(mat).push(...points.flat());
  const hit=[];for(let i=0;i<3;i++){const p=points[i],q=points[(i+1)%3];if((p[2]>.65)!==(q[2]>.65)){const t=(.65-p[2])/(q[2]-p[2]);hit.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}if(hit.length===2&&Math.hypot(hit[1][0]-hit[0][0],hit[1][1]-hit[0][1])>.015)pack.segments.push(hit.flat());
 }
 const nodes=[...preserved];for(const [key,pack]of packs){const ranges=[],arrays=[],bounds=[Infinity,Infinity,-Infinity,-Infinity];let first=0;for(const [mat,data]of pack.groups){ranges.push([mat,first,data.length/11]);first+=data.length/11;const arr=new Float32Array(data);arrays.push(Buffer.from(arr.buffer));for(let i=0;i<arr.length;i+=11){bounds[0]=Math.min(bounds[0],arr[i]);bounds[1]=Math.min(bounds[1],arr[i+1]);bounds[2]=Math.max(bounds[2],arr[i]);bounds[3]=Math.max(bounds[3],arr[i+1]);}}
  const header=Buffer.from(JSON.stringify({ranges,segments:pack.segments.map(s=>s.map(n=>+n.toFixed(3)))})),padded=Math.ceil(header.length/4)*4,buf=Buffer.alloc(4+padded,32);buf.writeUInt32LE(padded);header.copy(buf,4);const b=Buffer.concat([buf,...arrays]),file='parc14/'+key+'.bin';await put('data/walk/'+file,b);nodes.push([file,...bounds.map((n,i)=>i<2?Math.floor(n*100)/100:Math.ceil(n*100)/100)]);byteCount+=b.length;vertexCount+=first;
 }
 walk.nodes=nodes;walk.stats={...walk.stats,assets:nodes.length,bytes:byteCount,vertices:vertexCount,parc14Vertices:model.vertexCount};
 for(const file of ['data/facades/index.json','data/roofs/catalogue-index.json','data/roofs/assignments.json']){let b;try{b=await fs.readFile(path.join(output,file));}catch(e){if(e.code!=='ENOENT')throw e;b=await read(file);}walk.sourceHashes['dist/'+file]=sha(b);}
 walk.sourceHashes['dist/data/parc14/index.json']=sha(await fs.readFile(path.join(modelRoot,'data/parc14/index.json')));walk.sourceHashes['dist/data/parc14/mesh.bin']=sha(bytes);
 // Old FPS sessions may still reference a superseded generic packet. Leave a
 // valid empty packet at that URL so legacy clients cannot resurrect the house
 // or retry a missing file forever. Active nodes never include these packets.
 const retired=new Set(walk.retiredNodes||[]),emptyHeader=Buffer.from(JSON.stringify({ranges:[],segments:[],replacedBy:'parc14'}));
 const emptyLength=Math.ceil(emptyHeader.length/4)*4,empty=Buffer.alloc(4+emptyLength,32);empty.writeUInt32LE(emptyLength);emptyHeader.copy(empty,4);
 for(const id of ids){
  const match=/^(way|relation)\/(\d+)$/.exec(id);assert(match,'Unexpected OSM identifier');
  const file=String(Number(match[2])%100)+'/'+id.replace('/','-')+'.bin';
  assert(!nodes.some(n=>n[0]===file),'Cannot retire an active packet');
  await put('data/walk/'+file,empty);retired.add(file);
 }
 for(const [file]of old)if(file.startsWith('parc14/')&&!nodes.some(n=>n[0]===file)){await put('data/walk/'+file,empty);retired.add(file);}
 walk.retiredNodes=[...retired].sort();
 await put('data/walk/index.json',walk);
 const registry={version:1,loadRadiusMeters:500,models:[]};
 for(const dir of await fs.readdir(path.join(root,'data'),{withFileTypes:true})){if(!dir.isDirectory()||dir.name==='parc14')continue;let index;try{index=await json('data/'+dir.name+'/index.json');}catch(e){if(e.code==='ENOENT')continue;throw e;}if(index.vertexCount&&index.ranges&&index.excludeIds&&index.bounds&&index.origin&&index.materials&&index.textures)registry.models.push({id:dir.name,layerId:dir.name+'-detail',basePath:'./data/'+dir.name,label:index.name||dir.name,bounds:index.bounds,excludeIds:index.excludeIds});}
 registry.models.push({id:'parc14',layerId:'parc14-detail',basePath:'./data/parc14',label:model.name,bounds:model.bounds,excludeIds:model.excludeIds});registry.models.sort((a,b)=>a.id.localeCompare(b.id));await put('data/custom-models.json',registry);
 return {changed,removedFacadeRecords:removedRecords,removedRoofTriangles:removedTriangles,preservedWalkNodes:preserved.length,parc14Nodes:packs.size};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const report=await installParc14Data();await fs.mkdir('artifacts/parc14',{recursive:true});await fs.writeFile('artifacts/parc14/installation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,changed:report.changed.length}));}

