import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CITY,cityDataURL} from '../dist/city-config.js';
import {loadTerrain} from '../dist/terrain.js';
import {mapGroundHeight} from '../dist/terrain-map.js';
import {prepareMapRoads} from '../dist/map-roads.js';
const read=async url=>{const b=await fs.readFile('dist/'+url.slice(2));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
await loadTerrain({fetchBuffer:read});
const index=JSON.parse(new TextDecoder().decode(await read(cityDataURL('city-roads/index.json'))));
// East of Châlons, and sharp ridges/roads on Mont Boron in Nice.
const centre=CITY.id==='nice'?[7.3005,43.6908]:[4.43,48.96],x=(centre[0]-CITY.origin[0])*CITY.scale[0],y=(centre[1]-CITY.origin[1])*CITY.scale[1];
const nodes=index.nodes.filter(([,w,s,e,n])=>w<x+350&&e>x-350&&s<y+350&&n>y-350).slice(0,30);
let triangles=0;
for(const [file] of nodes){
 const raw=await read(cityDataURL('city-roads/'+file)),size=new DataView(raw).getUint32(0,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,size))),source=new Float32Array(raw,4+size),original=source.slice();
 const {vertices:v,ranges}=prepareMapRoads(source,header.ranges,{origin:index.origin,scale:index.scale}),samples=new Map();
 assert.deepEqual(source,original);assert.deepEqual(ranges.map(r=>r[0]),header.ranges.map(r=>r[0]));assert.equal(ranges.reduce((sum,r)=>sum+r[2],0),v.length/11);
 for(let i=0;i<v.length;i+=33){
  // Vertical kerb walls and their bottoms are allowed to meet the ground.
  if(v[i+5]<.7||v[i+2]-mapGroundHeight(v[i],v[i+1],samples)<.07)continue;
  triangles++;
  for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5]]){
   const coord=axis=>weights.reduce((sum,w,k)=>sum+w*v[i+k*11+axis],0),gap=coord(2)-mapGroundHeight(coord(0),coord(1),samples);
   assert(gap>=-.001,`${CITY.id}/${file}: road under terrain by ${-gap} m`);
  }
 }
}
assert(triangles>1000);console.log(JSON.stringify({mapRoads:'passed',city:CITY.id,sectors:nodes.length,triangles,sourceMeshesUnchanged:true,slopedRoadsAboveTerrain:true}));
if(CITY.id==='chalons')console.log(execFileSync(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,MAP_CITY:'nice'},encoding:'utf8'}).trim());
