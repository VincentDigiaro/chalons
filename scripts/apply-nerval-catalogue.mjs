import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chooseFacade,wallMaterial,facadeRepeats} from './facade-policy.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const key=points=>points.flat().map(Math.fround).join(',');
const area=ring=>Math.abs(ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-p[1]*q[0];},0)/2);

/** Retexture only existing plain walls; never rebuild the detailed geometry. */
export async function applyNervalCatalogue({root='dist',output=root,updateWalk=false}={}){
 const read=async file=>fs.readFile(path.join(root,file));
 const [indexRaw,surveyRaw,mesh,cityRaw,catalogRaw]=await Promise.all(['data/nerval/index.json','data/nerval/survey.json','data/nerval/mesh.bin','data/buildings.geojson','data/facades/catalogue.json'].map(read));
 const index=JSON.parse(indexRaw),survey=JSON.parse(surveyRaw),catalog=JSON.parse(catalogRaw),city=new Map(JSON.parse(cityRaw).features.map(f=>[f.properties.osm_id,f.properties]));
 if(index.cityFacadeCatalogue){assert.equal(index.cityFacadeCatalogue.version,1);return {alreadyApplied:true};}
 const protectedIds=new Set([...survey.focusParts,...(survey.roundabout?.parts||[]),...survey.parts.filter(p=>p.focus).map(p=>p.id)]);
 const targets=new Map(survey.parts.filter(p=>!protectedIds.has(p.id)).map(p=>[p.id,p]));
 assert(targets.size>0);assert(survey.parts.filter(p=>protectedIds.has(p.id)).every(p=>p.patches.length===0),'A protected building still has photo patches');
 const eligible=new Map(index.pickTriangles.filter(t=>targets.has(t.part)).map(t=>[key(t.points),targets.get(t.part)]));
 const vertices=new Float32Array(mesh.buffer,mesh.byteOffset,mesh.byteLength/4),faces=new Map(),matched=new Map(),assignments=[];
 for(const range of index.ranges)if(range.material===0)for(let start=range.first;start<range.first+range.count;start+=3){
  const points=[0,1,2].map(i=>Array.from(vertices.subarray((start+i)*11,(start+i)*11+3))),part=eligible.get(key(points));
  if(!part||Math.abs(vertices[start*11+5])>.01)continue;
  const center=[0,1].map(i=>points.reduce((s,p)=>s+p[i],0)/3);
  let edge=-1,best=Infinity;
  for(let i=0;i<part.ring.length;i++){const a=part.ring[i],b=part.ring[(i+1)%part.ring.length],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);if(l<.1)continue;const d=Math.abs(dx*(center[1]-a[1])-dy*(center[0]-a[0]))/l;if(d<best){best=d;edge=i;}}
  assert(best<.002,`Wall does not match footprint ${part.id}`);
  const faceKey=part.id+'/'+edge;
  if(!faces.has(faceKey))faces.set(faceKey,{part,edge,top:0});
  faces.get(faceKey).top=Math.max(faces.get(faceKey).top,...points.map(p=>p[2]));matched.set(start,faceKey);
 }
 const partMaterials=new Map();
 for(const [id,part] of targets){
  const center=[0,1].map(i=>part.ring.reduce((s,p)=>s+p[i],0)/part.ring.length/survey.scale[i]+survey.origin[i]);
  const sector=[...catalog.sectors].sort((a,b)=>Math.hypot((a.center[0]-center[0])*73000,(a.center[1]-center[1])*111320)-Math.hypot((b.center[0]-center[0])*73000,(b.center[1]-center[1])*111320))[0];
  const p={...city.get(part.osm_id),height:part.eaves,min_height:0};
  partMaterials.set(id,chooseFacade(p,center,area(part.ring),sector,hash(part.osm_id),false));
 }
 const baseMaterialCount=index.materials.length,catalogueMaterials=new Map();
 const materialId=number=>{if(!catalogueMaterials.has(number)){const texture=index.textures.length;index.textures.push('../facades/textures/'+catalog.materials[number].id+'.webp');catalogueMaterials.set(number,index.materials.length);index.materials.push({kind:11,texture,repeat:true,catalogueIndex:number});}return catalogueMaterials.get(number);};
 for(const face of faces.values()){
  const {part,edge}=face,a=part.ring[edge],b=part.ring[(edge+1)%part.ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),longest=Math.max(...part.ring.map((a,i)=>Math.hypot(part.ring[(i+1)%part.ring.length][0]-a[0],part.ring[(i+1)%part.ring.length][1]-a[1])));
  const base=partMaterials.get(part.id),number=face.top>part.eaves+.08?14:wallMaterial(base,catalog.materials[base],length,longest,part.eaves,hash(part.osm_id+'/'+edge));
  const [repeatX,floors]=facadeRepeats(catalog.materials[number],length,part.eaves),signed=part.ring.reduce((s,a,i)=>{const b=part.ring[(i+1)%part.ring.length];return s+a[0]*b[1]-b[0]*a[1];},0),sign=Math.sign(signed)||1;
  const nx=dy/length*sign,ny=-dx/length*sign,tint=.96+(hash(part.osm_id+'tint')%81)/1000;
  Object.assign(face,{material:materialId(number),a,dx,dy,length,repeatX,floors,tint:Math.min(1,tint*(.80+.20*Math.max(0,nx*-.55+ny*.83)))});
  assignments.push({part:part.id,edge,material:number,texture:catalog.materials[number].id,repeatX,floors,gable:face.top>part.eaves+.08});
 }
 const photoMaterials=new Set(index.materials.map((m,i)=>m.texture!==undefined&&/^facades-\d+\.webp$/.test(index.textures[m.texture])?i:-1).filter(i=>i>=0));
 const groups=new Map(),unchanged=crypto.createHash('sha256'),retained=crypto.createHash('sha256');let removedVertices=0,retexturedVertices=0;
 for(const range of index.ranges)for(let start=range.first;start<range.first+range.count;start+=3){
  const original=mesh.subarray(start*44,(start+3)*44);
  if(photoMaterials.has(range.material)){removedVertices+=3;continue;}
  const face=matched.has(start)?faces.get(matched.get(start)):null;let bytes=original,material=range.material;
  if(face){bytes=Buffer.from(original);material=face.material;retexturedVertices+=3;
   for(let i=0;i<3;i++){const o=i*44,x=bytes.readFloatLE(o),y=bytes.readFloatLE(o+4),z=bytes.readFloatLE(o+8);bytes.writeFloatLE(((x-face.a[0])*face.dx+(y-face.a[1])*face.dy)/(face.length*face.length)*face.repeatX,o+24);bytes.writeFloatLE(1-z/face.part.eaves*face.floors,o+28);for(let k=0;k<3;k++)bytes.writeFloatLE(face.tint,o+32+k*4);assert(bytes.subarray(o,o+24).equals(original.subarray(o,o+24)),'Geometry changed');}
  }else{unchanged.update(String(material));unchanged.update(original);retained.update(String(material));retained.update(bytes);}
  if(!groups.has(material))groups.set(material,[]);groups.get(material).push(bytes);
 }
 assert(removedVertices>0&&retexturedVertices>0);
 const preservation=unchanged.digest('hex');assert.equal(preservation,retained.digest('hex'));
 const outputBuffers=[];index.ranges=[];let count=0;
 for(const [material,list] of [...groups].sort((a,b)=>a[0]-b[0])){const buffer=Buffer.concat(list);index.ranges.push({material,first:count,count:buffer.length/44});count+=buffer.length/44;outputBuffers.push(buffer);}
 const outputMesh=Buffer.concat(outputBuffers);index.vertexCount=count;index.stats.triangles=count/3;index.stats.photoPatches=0;index.stats.catalogueParts=targets.size;index.stats.catalogueFacades=faces.size;
 index.retiredPhotoPatches=index.paintedPatches;index.paintedPatches=[];
 index.cityFacadeCatalogue={version:1,baseMaterialCount,protectedParts:[...protectedIds].sort((a,b)=>a-b),parts:[...targets.keys()].sort((a,b)=>a-b),assignments,removedPhotoVertices:removedVertices,retexturedVertices,preservedTriangleSha256:preservation,sourceMeshSha256:sha(mesh),catalogueSha256:sha(catalogRaw)};
 const changed=new Map([['data/nerval/index.json',Buffer.from(JSON.stringify(index))],['data/nerval/mesh.bin',outputMesh]]);
 if(updateWalk){
  const walk=JSON.parse(await read('data/walk/index.json')),packs=new Map();
  for(const range of index.ranges)for(let first=range.first;first<range.first+range.count;first+=3){
   const bytes=outputMesh.subarray(first*44,(first+3)*44),points=[0,1,2].map(i=>[0,1,2].map(k=>bytes.readFloatLE(i*44+k*4))),x=points.reduce((s,p)=>s+p[0],0)/3,y=points.reduce((s,p)=>s+p[1],0)/3,name=`detail/detail-${Math.floor(x/20)}-${Math.floor(y/20)}.bin`;
   if(!packs.has(name))packs.set(name,{groups:new Map(),segments:[],bounds:[Infinity,Infinity,-Infinity,-Infinity]});
   const pack=packs.get(name),m=index.materials[range.material],material=m.catalogueIndex===undefined?range.material:walk.facadeBase+m.catalogueIndex;
   assert(walk.materials[material]);if(!pack.groups.has(material))pack.groups.set(material,[]);pack.groups.get(material).push(bytes);
   for(const p of points){pack.bounds[0]=Math.min(pack.bounds[0],p[0]);pack.bounds[1]=Math.min(pack.bounds[1],p[1]);pack.bounds[2]=Math.max(pack.bounds[2],p[0]);pack.bounds[3]=Math.max(pack.bounds[3],p[1]);}
   const intersections=[];for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3];if((a[2]>.65)!==(b[2]>.65)){const t=(.65-a[2])/(b[2]-a[2]);intersections.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
   if(intersections.length===2&&Math.hypot(intersections[1][0]-intersections[0][0],intersections[1][1]-intersections[0][1])>.015)pack.segments.push(intersections.flat().map(v=>+v.toFixed(3)));
  }
  const oldNodes=walk.nodes.filter(n=>n[0].startsWith('detail/')),newNodes=[];let oldBytes=0,newBytes=0;
  for(const n of oldNodes)oldBytes+=(await read('data/walk/'+n[0])).length;
  for(const [name,pack] of packs){let first=0;const ranges=[],buffers=[];for(const [material,triangles] of pack.groups){const b=Buffer.concat(triangles);ranges.push([material,first,b.length/44]);first+=b.length/44;buffers.push(b);}
   const header=Buffer.from(JSON.stringify({ranges,segments:pack.segments})),padded=Math.ceil(header.length/4)*4,buffer=Buffer.alloc(4+padded+first*44,32);buffer.writeUInt32LE(padded,0);header.copy(buffer,4);let offset=4+padded;for(const b of buffers){b.copy(buffer,offset);offset+=b.length;}
   const file='data/walk/'+name;let old=null;try{old=await read(file);}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!old?.equals(buffer))changed.set(file,buffer);newBytes+=buffer.length;newNodes.push([name,...pack.bounds.map((n,i)=>i<2?Math.floor(n*100)/100:Math.ceil(n*100)/100)]);
  }
  walk.nodes=[...walk.nodes.filter(n=>!n[0].startsWith('detail/')),...newNodes];walk.stats.vertices+=count-walk.stats.detailedVertices;walk.stats.detailedVertices=count;walk.stats.bytes+=newBytes-oldBytes;walk.stats.assets=walk.nodes.length;
  walk.sourceHashes['dist/data/nerval/index.json']=sha(changed.get('data/nerval/index.json'));walk.sourceHashes['dist/data/nerval/mesh.bin']=sha(outputMesh);
  changed.set('data/walk/index.json',Buffer.from(JSON.stringify(walk)));
 }
 const manifest=[];
 for(const [file,bytes] of changed){let before=null;try{before=await read(file);}catch(e){if(e.code!=='ENOENT')throw e;}await fs.mkdir(path.dirname(path.join(output,file)),{recursive:true});await fs.writeFile(path.join(output,file),bytes);manifest.push({file,before:before?sha(before):null,after:sha(bytes),bytes:bytes.length});}
 const report={targetParts:targets.size,protectedParts:protectedIds.size,facades:faces.size,removedPhotoVertices:removedVertices,retexturedVertices,unchangedVertices:count-retexturedVertices,preservedTriangleSha256:preservation,materials:catalogueMaterials.size,manifest};
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=process.argv[2]||'dist',output=process.argv[3]||root,report=await applyNervalCatalogue({root,output,updateWalk:process.argv.includes('--walk')});
 const reportPath=path.join(output,'nerval-catalogue-report.json');await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,manifest:report.manifest?.length}));
}
