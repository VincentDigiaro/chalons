import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {imageryURL} from '../dist/imagery.js';
for(const file of ['dist/roof-textures.js','dist/imagery.js','scripts/build-roofs.mjs','scripts/record-imagery.mjs'])execFileSync(process.execPath,['--check',file]);
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
for(const feature of osm.features){const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;for(const rings of polygons){footprintArea+=ringArea(rings[0])-rings.slice(1).reduce((sum,r)=>sum+ringArea(r),0);holes+=rings.length-1;}}
const relativeAreaError=Math.abs(meshArea-footprintArea)/footprintArea;
assert(relativeAreaError<0.00001,`Roof clipping changed total footprint area: ${relativeAreaError}`);
assert(holes>0,'Dataset should include courtyards');
const url=new URL(imageryURL(17,67124,45037));assert.equal(url.hostname,'data.geopf.fr');assert.equal(url.searchParams.get('TILEMATRIXSET'),'PM_0_19');assert.equal(url.searchParams.get('TILECOL'),'67124');assert.equal(url.searchParams.get('TILEROW'),'45037');assert(!url.href.includes('{'));
await fs.access('dist/data/imagery.json');
console.log(JSON.stringify({roofChecks:'passed',tiles:index.tiles.length,triangles:index.triangles,courtyardHoles:holes,relativeAreaError,binaryMB:+(raw.length/1e6).toFixed(2)}));
