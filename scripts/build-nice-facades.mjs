// Nice-only rematerialisation. All geometry and non-facade vertex data are inputs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {materials,sectors,hash,nearestSector,chooseNiceFacade,niceWallMaterial,niceRepeats} from './nice-facade-policy.mjs';
const root='dist/data/cities/nice',out='artifacts/nice-textures/build',inputs={};
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=f=>{const b=fs.readFileSync(root+'/'+f);inputs[f]=sha(b);return b;};
const put=(f,b)=>{fs.mkdirSync(path.dirname(out+'/'+f),{recursive:true});fs.writeFileSync(out+'/'+f,b);};
const json=(f,o)=>put(f,JSON.stringify(o));
const source=JSON.parse(read('buildings.geojson')),features=new Map(source.features.map(f=>[f.properties.osm_id,f]));
const original=JSON.parse(read('facades/index.json')),assign=JSON.parse(read('facades/assignments.json')),walk=JSON.parse(read('walk/index.json'));
assert.equal(original.stride,52);assert.equal(original.textures.length,48);assert.equal(walk.facadeBase,1);assert.equal(walk.roofBase,49);
const survey=JSON.parse(fs.readFileSync('artifacts/nice-textures/survey.json'));
assert(survey.shots.length<=30);
for(const s of sectors)for(const r of s.refs)assert(survey.shots.some(v=>v.id===r&&v.usable!==false),'Missing usable survey '+r);
const catalogue={version:1,city:'nice',method:'Nice aerial survey; approximate family attribution by sector, building type, footprint, height and stable OSM hash. Not a measured reconstruction.',sectors,materials,referenceBase:'artifacts/nice-textures/',surveySha256:sha(Buffer.from(JSON.stringify(survey))),survey};
const lookup=new Map(),stats={...original.stats,materialCounts:Array(48).fill(0),sectorCounts:{}};
function footprint(f){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,area=0;for(const poly of polys)for(let r=0;r<poly.length;r++){const ring=poly[r];let a=0;const anchor=ring[0];for(let i=0;i<ring.length-1;i++){const p=ring[i],q=ring[i+1];minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);a+=(p[0]-anchor[0])*(q[1]-anchor[1])-(q[0]-anchor[0])*(p[1]-anchor[1]);}area+=(r? -1:1)*Math.abs(a)/2*80484*111320;}return {center:[(minX+maxX)/2,(minY+maxY)/2],area};}
for(const b of assign.buildings){
 const f=features.get(b.id);assert(f);const p=f.properties,{center,area}=footprint(f),sector=nearestSector(center),seed=hash(b.id),mat=chooseNiceFacade(p,center,area,sector,seed),longest=Math.max(...b.faces.map(v=>v[4]));
 b.material=mat;b.sector=sector.id;b.referenceDistanceM=Math.round(sector.distance);b.referenceUse=sector.distance<=2400?'sector-inspiration':'extrapolation';b.referencePhotos=sector.refs;b.family=materials[mat].family;
 stats.sectorCounts[sector.id]=(stats.sectorCounts[sector.id]||0)+1;
 assert(!lookup.has(seed),'Building hash collision');lookup.set(seed,{b,p,records:[],next:0,longest});
}
const toLocal=(x,y)=>[(x/65536*360-180-walk.origin[0])*walk.scale[0],(Math.atan(Math.sinh(Math.PI*(1-2*y/65536)))*180/Math.PI-walk.origin[1])*walk.scale[1]];
const key=v=>v.map(x=>Math.fround(x).toFixed(3)).join(',');
let faces=0;
for(const chunk of original.chunks){
 const before=read('facades/'+chunk.file),raw=Buffer.from(before);
 for(let at=0;at<raw.length;at+=52){
  const item=lookup.get(raw.readUInt32LE(at+48));assert(item);const face=item.b.faces[item.next++];assert(face,'Unexpected facade record');
  const values=Array.from({length:12},(_,i)=>raw.readFloatLE(at+i*4));
  const mat=niceWallMaterial(item.b.material,face[4],item.longest,values[5]-values[4],face[1],hash(item.b.id+'/'+face.slice(0,3).join('/'))),[u,v]=niceRepeats(mat,face[4],values[5]-values[4],item.p.levels);
  face[3]=mat;raw.writeFloatLE(u,at+24);raw.writeFloatLE(v,at+28);raw.writeFloatLE(mat,at+32);
  assert(before.subarray(at,at+24).equals(raw.subarray(at,at+24)));assert(before.subarray(at+36,at+52).equals(raw.subarray(at+36,at+52)));
  const a=toLocal(chunk.x+values[0],chunk.y+values[1]),b=toLocal(chunk.x+values[2],chunk.y+values[3]);
  item.records.push({key:key([...a,...b,values[4],values[5]]),mat,u,v});stats.materialCounts[mat]++;faces++;
 }
 put('facades/'+chunk.file,raw);
}
assert.equal(faces,original.stats.facades);
for(const item of lookup.values())assert.equal(item.next,item.b.faces.length,item.b.id);
const generation={city:'nice',version:1,policy:'nice-facades-v1',surveySha256:catalogue.surveySha256,createdAt:new Date().toISOString()};
const index={...original,textures:materials.map(m=>`textures/${m.id}.webp`),overviewTextures:materials.map(m=>`textures/low/${m.id}.webp`),stats,generation};
json('facades/catalogue.json',catalogue);json('facades/index.json',index);json('facades/assignments.json',{...assign,method:catalogue.method});
for(let i=0;i<48;i++)walk.materials[walk.facadeBase+i]={...walk.materials[walk.facadeBase+i],texture:'../facades/'+index.textures[i]};
let patched=0,matched=0,deltaBytes=0;
for(const [file] of walk.nodes){
 if(!/^\d+\/[^/]+\.bin$/.test(file))continue;
 const id=path.basename(file,'.bin').replace(/^(way|relation)-/,'$1/'),item=lookup.get(hash(id));if(!item)continue;assert.equal(item.b.id,id);
 const before=read('walk/'+file),padded=before.readUInt32LE(0),header=JSON.parse(before.subarray(4,4+padded)),payload=Buffer.from(before.subarray(4+padded));
 const byKey=new Map();for(const rec of item.records){if(!byKey.has(rec.key))byKey.set(rec.key,[]);byKey.get(rec.key).push(rec);}
 const ranges=[];let count=0;
 const push=(m,start,n)=>{const last=ranges.at(-1);if(last&&last[0]===m&&last[1]+last[2]===start)last[2]+=n;else ranges.push([m,start,n]);};
 for(const [mat,start,n] of header.ranges){
  if(mat<walk.facadeBase||mat>=walk.roofBase){push(mat,start,n);continue;}
  assert.equal(n%6,0);
  for(let vertex=start;vertex<start+n;vertex+=6){
   const at=vertex*44,get=(v,c)=>payload.readFloatLE(at+v*44+c*4),k=key([get(0,0),get(0,1),get(1,0),get(1,1),get(0,2),get(2,2)]),rec=byKey.get(k)?.shift();
   assert(rec,'No matching facade: '+id+' '+k);
   const uv=[[0,1],[rec.u,1],[rec.u,1-rec.v],[0,1],[rec.u,1-rec.v],[0,1-rec.v]];
   for(let i=0;i<6;i++){payload.writeFloatLE(uv[i][0],at+i*44+24);payload.writeFloatLE(uv[i][1],at+i*44+28);}
   push(walk.facadeBase+rec.mat,vertex,6);count++;
  }
 }
 assert.equal(count,item.records.length,'FPS face coverage: '+id);assert([...byKey.values()].every(v=>!v.length));
 // Prove all bytes except the facade UVs are identical, including roofs and collisions.
 const mask=Buffer.from(payload);for(const [m,s,n] of header.ranges)if(m>=walk.facadeBase&&m<walk.roofBase)for(let v=s;v<s+n;v++)before.copy(mask,v*44+24,4+padded+v*44+24,4+padded+v*44+32);
 assert(mask.equals(before.subarray(4+padded)),'Non-facade data changed');
 const nextHeader=Buffer.from(JSON.stringify({...header,ranges})),pad=Math.ceil(nextHeader.length/4)*4,raw=Buffer.alloc(4+pad+payload.length,32);raw.writeUInt32LE(pad);nextHeader.copy(raw,4);payload.copy(raw,4+pad);
 put('walk/'+file,raw);matched+=count;patched++;deltaBytes+=raw.length-before.length;
 if(patched%20000===0)console.log('FPS bâtiments préparés : '+patched);
}
assert.equal(matched,faces,'Map/FPS coverage mismatch');
walk.sourceHashes['dist/data/facades/index.json']=sha(fs.readFileSync(out+'/facades/index.json'));
walk.stats.bytes+=deltaBytes;walk.generation=generation;json('walk/index.json',walk);
json('texture-generation.json',{...generation,initialImportSha256:sha(read('import.json')),initialMetadataHashes:JSON.parse(read('import.json')).metadataHashes,generatedMetadataHashes:{'walk/index.json':sha(fs.readFileSync(out+'/walk/index.json'))},facadeIndexSha256:walk.sourceHashes['dist/data/facades/index.json'],buildings:patched,faces:matched,geometryPreserved:true,roofVerticesPreserved:true,collisionSegmentsPreserved:true});
fs.writeFileSync('artifacts/nice-textures/build-inputs.json',JSON.stringify(inputs));
fs.writeFileSync('artifacts/nice-textures/build-report.json',JSON.stringify({generation,buildings:patched,faces:matched,stats,nonFacadePayloadBytesPreserved:true,collisionSegmentsPreserved:true},null,2));
console.log(JSON.stringify({buildings:patched,faces:matched,materials:stats.materialCounts,output:out}));
