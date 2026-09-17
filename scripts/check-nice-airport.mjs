import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {excludeReplacedWalkNodes} from '../dist/walk-replacements.js';
import {compileReplacements,maskCustomFacades,maskCustomRoofs} from '../dist/custom-model-replacements.js';
import {facadeHash} from '../dist/facade-layer.js';
import {prepareWalkGeometry} from '../dist/walk-preparation.js';
import {collisionGeometry,advancePlayer} from '../dist/walk-physics.js';
import {PLAYER_HEIGHT} from '../dist/walk-core.js';
const root='dist/data/cities/nice',json=async p=>JSON.parse(await fs.readFile(p));
const registry=await json(root+'/custom-models.json'),old=await json(root+'/walk/index.json'),active=excludeReplacedWalkNodes(old,registry),ids=new Set(registry.models.flatMap(m=>m.excludeIds)),mask=compileReplacements(registry);
assert.equal(registry.models.filter(m=>m.id.startsWith('nice-')).length,5);
assert.equal(active.customModelMaterialBase,old.materials.length);
assert.equal(active.materials.length,old.materials.length+3);
assert(active.nodes.length>old.nodes.length);
assert.equal(active.nodes.filter(([f])=>f.startsWith('roads/')).length,old.nodes.filter(([f])=>f.startsWith('roads/')).length);
for(const [file]of active.nodes){const m=/^\d+\/(way|relation)-(\d+)\.bin$/.exec(file);assert(!m||!ids.has(m[1]+'/'+m[2]));}
let triangles=0,packetVertices=0,maxDiagonal=0,wallSegments=0,roofSurfaces=0;
for(const m of registry.models.filter(m=>m.id.startsWith('nice-'))){const index=await json(root+'/'+m.id+'/index.json'),raw=await fs.readFile(root+'/'+m.id+'/mesh.bin'),a=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length));assert.equal(raw.length,index.vertexCount*44);assert.equal(index.ranges.reduce((n,r)=>n+r.count,0),index.vertexCount);assert.equal(index.ranges[0].first,0);for(let i=0;i<a.length;i+=11){for(let k=0;k<11;k++)assert(Number.isFinite(a[i+k]),'Non-finite model vertex');assert(Math.abs(Math.hypot(a[i+3],a[i+4],a[i+5])-1)<.002);const lon=index.origin[0]+a[i]/index.scale[0],lat=index.origin[1]+a[i+1]/index.scale[1];assert(lon>=m.bounds[0]-1e-7&&lon<=m.bounds[2]+1e-7&&lat>=m.bounds[1]-1e-7&&lat<=m.bounds[3]+1e-7);assert(a[i+2]>=0&&a[i+2]<45,'Model heights relative to terrain');}triangles+=index.vertexCount/3;
 if(m.id==='nice-sheraton'){
  assert.equal(index.parts.length,8);assert(index.siteDetails.some(d=>d.type==='rooftop-pool'));assert(index.siteDetails.some(d=>d.type==='oval-stair-crown'));
  const collision=collisionGeometry(a),wall=collision.segments.find(s=>s[4]<.01&&s[5]>2&&Math.hypot(s[2]-s[0],s[3]-s[1])>2),L=Math.hypot(wall[2]-wall[0],wall[3]-wall[1]),n=[-(wall[3]-wall[1])/L,(wall[2]-wall[0])/L],mid=[(wall[0]+wall[2])/2,(wall[1]+wall[3])/2];
  let body={position:mid.map((v,i)=>v+2*n[i]),feet:.022,verticalSpeed:0,grounded:true};
  for(let i=0;i<40;i++)body=advancePlayer(body,-n[0]*.1,-n[1]*.1,.05,{segments:[wall],surfaces:[]});
  assert((body.position[0]-mid[0])*n[0]+(body.position[1]-mid[1])*n[1]>.20,'Player stops in front of the actual façade');
  const p=index.siteDetails.find(d=>d.type==='rooftop-pool').position,scene={segments:[],surfaces:collision.surfaces.filter(s=>p[0]>=s.bounds[0]-.3&&p[0]<=s.bounds[2]+.3&&p[1]>=s.bounds[1]-.3&&p[1]<=s.bounds[3]+.3)};
  body={position:p.slice(0,2),feet:32,verticalSpeed:0,grounded:false};for(let i=0;i<80;i++)body=advancePlayer(body,0,0,.05,scene);
  assert(body.grounded&&body.feet>25.8&&body.feet<26.4,'Player lands on the actual rooftop surface');
  // Walk from the pavement through the open front of the east wing, using
  // the generated triangles, then jump against its real ceiling.
  const preau=index.siteDetails.find(d=>d.type==='open-preau'),[start,end]=preau.walkthrough;
  const bounds=[Math.min(start[0],end[0])-1,Math.min(start[1],end[1])-1,Math.max(start[0],end[0])+1,Math.max(start[1],end[1])+1];
  const overlaps=b=>b[0]<=bounds[2]&&b[2]>=bounds[0]&&b[1]<=bounds[3]&&b[3]>=bounds[1];
  const passage={segments:collision.segments.filter(s=>overlaps(s.bounds??[Math.min(s[0],s[2]),Math.min(s[1],s[3]),Math.max(s[0],s[2]),Math.max(s[1],s[3])])),surfaces:collision.surfaces.filter(s=>overlaps(s.bounds))};
  body={position:[...start],feet:.022,verticalSpeed:0,grounded:true};
  for(let i=0;i<120;i++)body=advancePlayer(body,(end[0]-start[0])/120,(end[1]-start[1])/120,.05,passage);
  assert(Math.hypot(body.position[0]-end[0],body.position[1]-end[1])<.02,'Open préau is traversable from the pavement');
  assert(body.grounded&&body.feet<.10,'Walking stays on the ground below the first floor');
  let peak=body.feet;
  for(let i=0;i<120;i++){body=advancePlayer(body,0,0,1/60,passage,i===0);peak=Math.max(peak,body.feet);}
  assert(peak>.5&&peak+PLAYER_HEIGHT<=preau.clearHeight+.002,'Préau ceiling blocks a jump');
  assert(body.grounded&&body.feet<.10,'Player returns to the préau floor');
  assert.equal(index.siteDetails.filter(d=>d.type==='terrace-table').length,6);
 }
 if(m.id==='nice-radar'){assert(ids.has('way/432744896'),'Retire the obsolete 39 m envelope');assert(index.siteDetails.some(d=>d.type==='radar-stack'&&d.antenna[1]===38));}
 if(m.id==='nice-pistes'){const markings=index.siteDetails.filter(d=>d.type==='threshold-marking');assert.equal(markings.length,4);for(const d of markings)assert.equal(d.label.slice(0,2),d.direction[1]>0?'04':'22','Runway number follows its direction, not OSM point order');}
}
for(const [file,...b]of registry.walk.nodes){const raw=await fs.readFile(path.join(root,'walk',file)),n=raw.readUInt32LE(0),header=JSON.parse(raw.toString('utf8',4,4+n)),a=new Float32Array(raw.buffer.slice(raw.byteOffset+4+n,raw.byteOffset+raw.length));assert(header.customModel);assert.equal(header.ranges.reduce((s,r)=>s+r[2],0),a.length/11);maxDiagonal=Math.max(maxDiagonal,Math.hypot(b[2]-b[0],b[3]-b[1]));assert(b[2]-b[0]<105&&b[3]-b[1]<105,'Bounded streamable packet');for(let i=0;i<a.length;i+=11){assert(a[i]>=b[0]-.001&&a[i]<=b[2]+.001&&a[i+1]>=b[1]-.001&&a[i+1]<=b[3]+.001);}packetVertices+=a.length/11;
 if(file.includes('nice-sheraton')||file.includes('nice-radar')){const iterator=prepareWalkGeometry(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length),active,'aerial');let r;do{r=iterator.next();}while(!r.done);assert(r.value.ranges.every(([m])=>m>=old.materials.length&&m<active.materials.length));wallSegments+=r.value.collision.segments.length;roofSurfaces+=r.value.collision.surfaces.filter(s=>s.p.every(p=>p[2]>20)).length;}
}
assert(wallSegments>100&&roofSurfaces>100,'Detailed collision walls and walkable roofs');
// Check masks against actual imported façade records and roof triangles.
const fac=await json(root+'/facades/index.json');let replacedFacades=0;
for(const t of fac.chunks.filter(t=>t.bounds[0]<7.217&&t.bounds[2]>7.20&&t.bounds[1]<43.670&&t.bounds[3]>43.655)){const raw=await fs.readFile(root+'/facades/'+t.file),copy=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length),d=new DataView(copy);maskCustomFacades(copy,mask);for(let at=0;at<raw.length;at+=52){if(mask.hashes.has(raw.readUInt32LE(at+48))){replacedFacades++;assert.equal(d.getFloat32(at,true),d.getFloat32(at+8,true));assert.equal(d.getFloat32(at+4,true),d.getFloat32(at+12,true));}else assert(raw.subarray(at,at+52).equals(Buffer.from(copy,at,52)),'Unrelated façade must remain byte-identical');}}
assert(replacedFacades>50);
const ri=await json(root+'/roofs/index.json'),rb=await fs.readFile(root+'/roofs/mesh.bin'),roofBuffer=rb.buffer.slice(rb.byteOffset,rb.byteOffset+rb.length);maskCustomRoofs(roofBuffer,ri,mask);const changed=Buffer.from(roofBuffer);let replacedRoofTriangles=0;for(let at=0;at<rb.length;at+=36)if(!rb.subarray(at,at+36).equals(changed.subarray(at,at+36))){replacedRoofTriangles++;assert(changed.subarray(at,at+12).equals(changed.subarray(at+12,at+24)));assert(changed.subarray(at,at+12).equals(changed.subarray(at+24,at+36)));}assert(replacedRoofTriangles>50);
// Old cities without the extension retain the exact previous behavior.
assert.deepEqual(excludeReplacedWalkNodes({nodes:[['1/way-1.bin'],['roads/a.bin']],materials:[]},{models:[{excludeIds:['way/1']}]}),{nodes:[['roads/a.bin']],materials:[]});
assert.equal(mask.hashes.has(facadeHash('way/1084319591')),true);
const result={passed:true,models:5,triangles,walkPackets:registry.walk.nodes.length,packetVertices,maxPacketDiagonalMeters:maxDiagonal,excludedBuildings:ids.size,replacedFacades,replacedRoofTriangles,wallSegments,roofSurfaces,originalWalkIndexUntouched:true};await fs.writeFile('artifacts/nice-airport-models/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
