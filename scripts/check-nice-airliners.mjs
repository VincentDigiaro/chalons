import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
process.env.MAP_CITY='nice';
const {CITY}=await import('../dist/city-config.js');
const {loadTerrain,terrainBaseHeight}=await import('../dist/terrain.js');
const {prepareWalkGeometry}=await import('../dist/walk-preparation.js');
const {excludeReplacedWalkNodes}=await import('../dist/walk-replacements.js');
const json=async p=>JSON.parse(await fs.readFile(p));
const root='dist/data/cities/nice',art='artifacts/nice-airliners';
const registry=await json(root+'/custom-models.json'),before=await json(art+'/before/custom-models.json');
assert.deepEqual(registry.models.filter(m=>!m.id.startsWith('airport-airliners-')),before.models.filter(m=>!m.id.startsWith('airport-airliners-')));
assert.deepEqual(registry.walk.materials,before.walk.materials);
assert.deepEqual(registry.walk.nodes.filter(([f])=>!f.startsWith('../airport-airliners-')),before.walk.nodes.filter(([f])=>!f.startsWith('../airport-airliners-')));
const survey=await json(art+'/placements.json'),byId=new Map(survey.placements.map(p=>[p.id,p]));assert.equal(byId.size,survey.placements.length);assert.equal(byId.size,95);
await loadTerrain({fetchBuffer:async url=>{const bytes=await fs.readFile(path.join('dist',url));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);}});
const active=excludeReplacedWalkNodes(await json(root+'/walk/index.json'),registry);
let aircraft=0,triangles=0,maxEndpointError=0,maxGearError=0,maxSlope=0,packetVertices=0,collisionFaces=0;
for(const model of registry.models.filter(m=>m.id.startsWith('airport-airliners-'))){
 const index=await json(root+'/'+model.id+'/index.json'),raw=await fs.readFile(root+'/'+model.id+'/mesh.bin'),a=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length));
 assert.equal(raw.length,index.vertexCount*44);assert.equal(index.ranges.length,1);assert.equal(index.ranges[0].count,index.vertexCount);
 assert.equal(index.instances.length,index.parts.length);assert.equal(index.objectRanges.length,index.instances.length);assert.equal(model.excludeIds.length,0);
 for(let i=0;i<a.length;i+=11){
  for(let k=0;k<11;k++)assert(Number.isFinite(a[i+k]));assert(Math.abs(Math.hypot(...a.subarray(i+3,i+6))-1)<.001);
  const lng=index.origin[0]+a[i]/index.scale[0],lat=index.origin[1]+a[i+1]/index.scale[1];
  assert(lng>=model.bounds[0]-1e-7&&lng<=model.bounds[2]+1e-7&&lat>=model.bounds[1]-1e-7&&lat<=model.bounds[3]+1e-7);
 }
 for(const p of index.instances){
  const source=byId.get(p.id);assert(source);byId.delete(p.id);aircraft++;
  const rad=p.headingDegrees*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),cx=(p.coordinates[0]-CITY.origin[0])*CITY.scale[0],cy=(p.coordinates[1]-CITY.origin[1])*CITY.scale[1];
  const xy=(x,y)=>[cx+x*c+y*s,cy-x*s+y*c];
  for(const sign of [-1,1]){
   const geo=source.evidence[sign===1?'noseCoordinates':'tailCoordinates'],expected=[(geo[0]-CITY.origin[0])*CITY.scale[0],(geo[1]-CITY.origin[1])*CITY.scale[1]],actual=xy(0,sign*p.lengthMetres/2);
   maxEndpointError=Math.max(maxEndpointError,Math.hypot(actual[0]-expected[0],actual[1]-expected[1]));
  }
  for(const [x,y] of [[-2.25,-2.5],[2.25,-2.5],[0,12.2]]){
   const sx=x*p.scale,sy=y*p.scale,world=xy(sx,sy),predicted=p.groundPlane.altitude+p.groundPlane.slopeRight*sx+p.groundPlane.slopeForward*sy;
   maxGearError=Math.max(maxGearError,Math.abs(predicted-terrainBaseHeight(...world)));
  }
  maxSlope=Math.max(maxSlope,Math.hypot(p.groundPlane.slopeRight,p.groundPlane.slopeForward));
 }
 triangles+=a.length/33;
}
assert.equal(byId.size,0);assert(maxEndpointError<.07,'The nose and tail must follow the texture');assert(maxGearError<.001,'All three gear supports rest on the ground');assert(maxSlope<.15);
const packets=registry.walk.nodes.filter(([f])=>f.startsWith('../airport-airliners-'));
for(const [file,...bounds] of packets){
 const raw=await fs.readFile(path.join(root,'walk',file)),head=raw.readUInt32LE(0),header=JSON.parse(raw.toString('utf8',4,head+4));
 assert(header.customModel);assert.deepEqual(header.ranges.map(r=>r[0]),[0]);
 const a=new Float32Array(raw.buffer.slice(raw.byteOffset+4+head,raw.byteOffset+raw.length));assert.equal(a.length/11,header.ranges[0][2]);
 assert(bounds[2]-bounds[0]<105&&bounds[3]-bounds[1]<105);
 for(let i=0;i<a.length;i+=11)assert(a[i]>=bounds[0]-.001&&a[i]<=bounds[2]+.001&&a[i+1]>=bounds[1]-.001&&a[i+1]<=bounds[3]+.001);
 packetVertices+=a.length/11;
 if(collisionFaces===0){const iterator=prepareWalkGeometry(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length),active,'aerial');let step;do{step=iterator.next();}while(!step.done);assert.equal(step.value.ranges[0][0],active.customModelMaterialBase);collisionFaces+=step.value.collision.surfaces.length+step.value.collision.segments.length;}
}
assert(packetVertices>=triangles*3);assert(collisionFaces>0);
const result={passed:true,aircraft,triangles,walkPackets:packets.length,packetVertices,maxEndpointErrorMetres:maxEndpointError,maxLandingGearErrorMetres:maxGearError,maxParkingSlope:maxSlope,collisionFaces,existingModelsAndMaterialsPreserved:true};
await fs.writeFile(art+'/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
