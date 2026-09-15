import {assertPreserved} from './check-preservation.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {localImageryURL as imageryURL} from '../dist/imagery.js';
for(const file of ['dist/roof-textures.js','dist/roof-catalogue-layer.js','dist/roof-catalogue.js','dist/imagery.js','scripts/roof-policy.mjs','scripts/build-roofs.mjs','scripts/record-imagery.mjs'])execFileSync(process.execPath,['--check',file]);
const index=JSON.parse(await fs.readFile('dist/data/roofs/index.json','utf8'));
const raw=await fs.readFile('dist/data/roofs/mesh.bin');const vertices=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
assert.equal(vertices.length,index.vertexCount*3);assert.equal(index.triangles,index.vertexCount/3);assert.equal(index.skippedPolygons,0);
let first=0,meshArea=0;
for(const tile of index.tiles){
  assert.equal(tile.first,first);assert.equal(tile.count%3,0);assert(tile.count>0);first+=tile.count;
  for(let i=tile.first*3;i<(tile.first+tile.count)*3;i+=3){assert(vertices[i]>=0&&vertices[i]<=1);assert(vertices[i+1]>=0&&vertices[i+1]<=1);assert(vertices[i+2]>0&&vertices[i+2]<300);}
  for(let i=tile.first*3;i<(tile.first+tile.count)*3;i+=9)meshArea+=Math.abs((vertices[i+3]-vertices[i])*(vertices[i+7]-vertices[i+1])-(vertices[i+6]-vertices[i])*(vertices[i+4]-vertices[i+1]))/2;
}
assert.equal(first,index.vertexCount);
const n=2**index.zoom,xy=([lon,lat])=>[(lon+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];
const ringArea=ring=>{const points=ring.map(xy),[ox,oy]=points[0];let a=0;for(let i=0;i<points.length-1;i++)a+=(points[i][0]-ox)*(points[i+1][1]-oy)-(points[i+1][0]-ox)*(points[i][1]-oy);return Math.abs(a/2);};
const osm=JSON.parse(await fs.readFile('dist/data/buildings.geojson','utf8'));let footprintArea=0,holes=0;
for(const feature of osm.features){if(index.excludedDetailedBuildings?.includes(feature.properties.osm_id))continue;const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;for(const rings of polygons){footprintArea+=ringArea(rings[0])-rings.slice(1).reduce((sum,r)=>sum+ringArea(r),0);holes+=rings.length-1;}}
const relativeAreaError=Math.abs(meshArea-footprintArea)/footprintArea;
assert(relativeAreaError<0.00001,`Roof clipping changed total footprint area: ${relativeAreaError}`);
assert(holes>0,'Dataset should include courtyards');
const url=new URL(imageryURL(17,67124,45037),'https://example.test/chalons/');assert.equal(url.hostname,'example.test');assert.equal(url.pathname,'/chalons/data/imagery/ign/17/67124/45037.jpg');assert(!url.href.includes('{'));
await fs.access('dist/data/imagery.json');
const root='dist/data/roofs/',catalog=JSON.parse(await fs.readFile(root+'catalogue.json')),meta=JSON.parse(await fs.readFile(root+'catalogue-index.json')),surface=await fs.readFile(root+'surface.bin');
const assignmentRaw=await fs.readFile(root+'assignments.json'),assignments=JSON.parse(assignmentRaw),excluded=new Set(index.excludedDetailedBuildings),seen=new Set();
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(catalog.materials.length,32);assert.equal(meta.vertexCount,index.vertexCount);assert.equal(surface.length,index.vertexCount*12);
assert.equal(meta.geometrySha256,digest(raw));assert.equal(meta.surfaceSha256,digest(surface));assert.equal(meta.assignmentsSha256,digest(assignmentRaw));assert.equal(meta.catalogueSha256,digest(await fs.readFile(root+'catalogue.json')));
const counts=Array(32).fill(0);
for(const a of assignments.buildings){assert(!excluded.has(a.id),'Nerval roof modified');assert(!seen.has(a.id));seen.add(a.id);assert(a.uvTransform.every(Number.isFinite));assert(a.material>=0&&a.material<32);counts[a.material]++;assert(a.photoSamples>0);}
assert.equal(seen.size,osm.features.length-excluded.size);assert.deepEqual(counts,meta.stats.materialCounts);assert(counts.every(n=>n>0));
const byId=new Map(assignments.buildings.map(a=>[a.id,a]));
for(const a of assignments.buildings)if(a.sharedRoofWith){const shared=byId.get(a.sharedRoofWith);assert(shared);assert.equal(a.material,shared.material);assert.equal(a.tint,shared.tint);assert.deepEqual(a.uvTransform,shared.uvTransform);}
for(const tile of index.tiles){
 const lat=Math.atan(Math.sinh(Math.PI*(1-2*(tile.y+.5)/n)))*180/Math.PI,scale=40075016.68557849*Math.cos(lat*Math.PI/180)/n;
 for(let first=tile.first;first<tile.first+tile.count;first+=3){
  const mat=surface[first*12+8],size=catalog.materials[mat]?.size;assert(size);
  for(let j=0;j<3;j++){const at=(first+j)*12;assert.equal(surface[at+8],mat);assert(Number.isFinite(surface.readFloatLE(at))&&Number.isFinite(surface.readFloatLE(at+4)));assert(surface[at+9]>=245&&surface[at+9]===surface[at+10]&&surface[at+9]===surface[at+11]);}
  for(let j=1;j<3;j++){
   const a=first*12,b=(first+j)*12,uvLength=Math.hypot((surface.readFloatLE(b)-surface.readFloatLE(a))*size[0],(surface.readFloatLE(b+4)-surface.readFloatLE(a+4))*size[1]);
   const worldLength=Math.hypot(vertices[(first+j)*3]-vertices[first*3],vertices[(first+j)*3+1]-vertices[first*3+1])*scale;
   assert(Math.abs(uvLength-worldLength)<.01+worldLength*.005,'Roof material stretched or broken across a tile');
  }
 }
}
function webpSize(b){const kind=b.toString('ascii',12,16);if(kind==='VP8 ')return[b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];if(kind==='VP8X')return[1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];throw Error('Invalid WebP');}
let detailBytes=0,overviewBytes=0;
for(let i=0;i<32;i++){const high=await fs.readFile(root+meta.textures[i]),low=await fs.readFile(root+meta.overviewTextures[i]);assert.deepEqual(webpSize(high),[512,512]);assert.deepEqual(webpSize(low),[128,128]);detailBytes+=high.length;overviewBytes+=low.length;}
assert(detailBytes<4000000&&overviewBytes<300000,'Roof texture budget exceeded');
const baseline=JSON.parse(await fs.readFile('artifacts/roofs/preservation.json'));
for(const [file,hash] of Object.entries(baseline))await assertPreserved(file,hash);
const result={roofChecks:'passed',catalogue:32,buildings:seen.size,protectedDetailedBuildings:excluded.size,tiles:index.tiles.length,triangles:index.triangles,courtyardHoles:holes,relativeAreaError,binaryMB:+(raw.length/1e6).toFixed(2),detailBytes,overviewBytes,geometry:'OSM footprints preserved; detailed models excluded',facades:'catalogue preserved'};
await fs.writeFile('artifacts/roofs/validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
