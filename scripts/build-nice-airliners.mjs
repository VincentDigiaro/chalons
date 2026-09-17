// Place an original reusable airliner at each visually surveyed IGN silhouette.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.MAP_CITY='nice';
const {CITY}=await import('../dist/city-config.js');
const {Terrain}=await import('../dist/terrain.js');
assert.equal(CITY.id,'nice');
const root='dist/data/cities/nice',art='artifacts/nice-airliners',read=async p=>JSON.parse(await fs.readFile(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const metadata=await read(art+'/airliner.json'),survey=await read(art+'/placements.json');
const raw=await fs.readFile(art+'/airliner.bin'),original=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length));
assert.equal(sha(raw),metadata.meshSha256);assert.equal(sha(await fs.readFile(metadata.source)),metadata.sourceSha256);
const terrainRaw=await fs.readFile(root+'/terrain/elevations.bin'),terrain=new Terrain(await read(root+'/terrain/index.json'),terrainRaw.buffer.slice(terrainRaw.byteOffset,terrainRaw.byteOffset+terrainRaw.length));
const regPath=root+'/custom-models.json',regBytes=await fs.readFile(regPath),registry=JSON.parse(regBytes);
await fs.mkdir(art+'/before',{recursive:true});
try{await fs.writeFile(art+'/before/custom-models.json',regBytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
assert.equal(registry.walk.materials[0].kind,2);
const material=[{name:'Avions de ligne — peinture, métal et hublots',kind:2}];
const plans=[];const allNodes=[];const reports=[];
for(const group of [...new Set(survey.placements.map(p=>p.group))]){
 const planes=survey.placements.filter(p=>p.group===group),id='airport-airliners-'+group,folder=root+'/'+id;
 await fs.mkdir(folder+'/walk',{recursive:true});
 const origin=planes.reduce((sum,p)=>sum.map((v,i)=>v+p.coordinates[i]/planes.length),[0,0]);
 const scale=[111320*Math.cos(origin[1]*Math.PI/180),111320],values=[],parts=[],objects=[],pickTriangles=[],nodes=[],instanceMetadata=[];
 const bounds=[Infinity,Infinity,-Infinity,-Infinity],packs=new Map();
 const putTriangle=points=>{
  const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%3][0],p[1]-points[(i+1)%3][1])),long=lengths.indexOf(Math.max(...lengths));
  if(lengths[long]>24){const a=points[long],b=points[(long+1)%3],c=points[(long+2)%3],mid=a.map((v,i)=>(v+b[i])/2);const length=Math.hypot(...mid.slice(3,6));for(let i=3;i<6;i++)mid[i]/=length;putTriangle([a,mid,c]);putTriangle([mid,b,c]);return;}
  const key=Math.floor(points.reduce((s,p)=>s+p[0],0)/3/48)+'_'+Math.floor(points.reduce((s,p)=>s+p[1],0)/3/48);
  if(!packs.has(key))packs.set(key,[]);packs.get(key).push(...points.flat());
 };
 for(const plane of planes){
  const factor=plane.lengthMetres/metadata.length,angle=plane.headingDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const cx=(plane.coordinates[0]-CITY.origin[0])*CITY.scale[0],cy=(plane.coordinates[1]-CITY.origin[1])*CITY.scale[1];
  const xy=(x,y)=>[cx+x*c+y*s,cy-x*s+y*c];
  const height=(x,y)=>terrain.height(...xy(x,y));
  const left=height(-2.25*factor,-2.5*factor),right=height(2.25*factor,-2.5*factor),nose=height(0,12.2*factor);
  const ax=(right-left)/(4.5*factor),ay=(nose-(left+right)/2)/(14.7*factor),ground=(left+right)/2+ay*2.5*factor;
  // Subtract only the engine's later terrain drape, so the fuselage stays
  // straight while its landing gear follows the local parking-plane slope.
  const transform=p=>{
   const x=p[0]*factor,y=p[1]*factor,[wx,wy]=xy(x,y),lng=CITY.origin[0]+wx/CITY.scale[0],lat=CITY.origin[1]+wy/CITY.scale[1];
   const px=(lng-origin[0])*scale[0],py=(lat-origin[1])*scale[1];
   const z=p[2]*factor+ground+ax*x+ay*y-terrain.height(wx,wy);
   const nx=p[3]-ax*p[5],ny=p[4]-ay*p[5],n=[nx*c+ny*s,-nx*s+ny*c,p[5]],nl=Math.hypot(...n);
   return {map:[px,py,z,...n.map(v=>v/nl),...p.slice(6)],walk:[wx,wy,z,...n.map(v=>v/nl),...p.slice(6)],lng,lat};
  };
  const first=values.length/11,part=parts.length+1;
  for(let at=0;at<original.length;at+=33){
   const triangle=[];
   for(let k=0;k<3;k++){
    const p=transform(Array.from(original.subarray(at+k*11,at+(k+1)*11)));values.push(...p.map);triangle.push(p.walk);
    bounds[0]=Math.min(bounds[0],p.lng);bounds[1]=Math.min(bounds[1],p.lat);bounds[2]=Math.max(bounds[2],p.lng);bounds[3]=Math.max(bounds[3],p.lat);
   }
   putTriangle(triangle);
  }
  const footprint=[[-1.9,-18.8],[1.9,-18.8],[1.9,18.8],[-1.9,18.8],[-1.9,-18.8]].map(([x,y])=>{const [wx,wy]=xy(x*factor,y*factor);return [CITY.origin[0]+wx/CITY.scale[0],CITY.origin[1]+wy/CITY.scale[1]];});
  parts.push({id:part,label:`Avion de ligne ${plane.id}`,height:metadata.height*factor,footprint,description:'Avion original placé sur la silhouette de la photographie aérienne.'});
  objects.push({part,material:0,first,count:values.length/11-first});
  const corners=[[-1.9,-15,2],[1.9,-15,2],[1.9,15,2],[-1.9,15,2],[-1.9,-15,5.4],[1.9,-15,5.4],[1.9,15,5.4],[-1.9,15,5.4]].map(p=>transform([...p,0,0,1,0,0,1,1,1]).map.slice(0,3));
  for(const [a,b,d,e]of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]])for(const ids of [[a,b,d],[a,d,e]])pickTriangles.push({part,points:ids.map(i=>corners[i])});
  instanceMetadata.push({...plane,scale:factor,groundPlane:{altitude:ground,slopeRight:ax,slopeForward:ay},vertexFirst:first,vertexCount:values.length/11-first});
 }
 const vertices=new Float32Array(values),mesh=Buffer.from(vertices.buffer);
 const index={version:1,name:'Aéroport · Avions de ligne · '+group,origin,scale,bounds,vertexCount:vertices.length/11,materials:material,textures:[],ranges:[{material:0,first:0,count:vertices.length/11}],excludeIds:[],parts,objectRanges:objects,pickTriangles,instances:instanceMetadata,stats:{aircraft:planes.length,triangles:vertices.length/33},meshSha256:sha(mesh),provenance:{model:metadata.source,modelSha256:metadata.sourceSha256,survey:art+'/placements.json',surveySha256:sha(await fs.readFile(art+'/placements.json')),source:'Emplacements relevés sur la texture aérienne IGN ; modèle original de 37,6 m redimensionné pour chaque silhouette.'}};
 await fs.writeFile(folder+'/mesh.bin',mesh);await fs.writeFile(folder+'/index.json',JSON.stringify(index));
 for(const [key,data] of packs){
  const a=new Float32Array(data),b=[Infinity,Infinity,-Infinity,-Infinity];
  for(let i=0;i<a.length;i+=11){b[0]=Math.min(b[0],a[i]);b[1]=Math.min(b[1],a[i+1]);b[2]=Math.max(b[2],a[i]);b[3]=Math.max(b[3],a[i+1]);}
  const header=Buffer.from(JSON.stringify({customModel:true,ranges:[[0,0,a.length/11]],segments:[]})),n=Math.ceil(header.length/4)*4,head=Buffer.alloc(n+4,32);head.writeUInt32LE(n);header.copy(head,4);
  const bytes=Buffer.concat([head,Buffer.from(a.buffer)]),file=`walk/${key}-${sha(bytes).slice(0,12)}.bin`;await fs.writeFile(folder+'/'+file,bytes);
  nodes.push(['../'+id+'/'+file,...b.map((v,i)=>(i<2?Math.floor(v*100):Math.ceil(v*100))/100)]);
 }
 allNodes.push(...nodes);plans.push({id,layerId:id+'-detail',basePath:'./data/cities/nice/'+id,label:index.name,bounds,excludeIds:[],replacementGeometries:[],view:{center:origin,zoom:17.6,pitch:60,bearing:30}});
 reports.push({id,aircraft:planes.length,triangles:vertices.length/33,bytes:mesh.length,walkPackets:nodes.length});
 console.log(JSON.stringify(reports.at(-1)));
}
const ours=new Set(plans.map(p=>p.id));registry.models=[...registry.models.filter(m=>!ours.has(m.id)),...plans];
registry.walk.nodes=[...registry.walk.nodes.filter(([file])=>!file.startsWith('../airport-airliners-')),...allNodes];
assert.equal(sha(await fs.readFile(regPath)),sha(regBytes),'Registry changed during build');
await fs.writeFile(regPath,JSON.stringify(registry));
await fs.writeFile(art+'/build.json',JSON.stringify({aircraft:survey.placements.length,models:reports,walkPackets:allNodes.length,registryBeforeSha256:sha(regBytes),registryAfterSha256:sha(await fs.readFile(regPath))},null,2));
