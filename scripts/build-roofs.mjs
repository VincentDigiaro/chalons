import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import earcut, {flatten, deviation as areaDeviation} from 'earcut';
import {assignRoof,roofUV} from './roof-policy.mjs';
import {harmonizeRoofOverlaps} from './roof-overlaps.mjs';
import {detailedBuildingIds} from './detailed-buildings.mjs';

// Triangulate OSM roof footprints, preserving holes, then clip triangles to
// Web Mercator imagery tiles. Tile-local coordinates avoid float32 jitter.
const ZOOM=17,N=2**ZOOM;
const xy=([lon,lat])=>[(lon+180)/360*N,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*N];
function clip(poly,axis,edge,greater){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const aIn=greater?a[axis]>=edge:a[axis]<=edge,bIn=greater?b[axis]>=edge:b[axis]<=edge;
    if(aIn)out.push(a);
    if(aIn!==bIn){const t=(edge-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  }
  return out;
}
const data=JSON.parse(await fs.readFile('dist/data/buildings.geojson','utf8'));
const catalog=JSON.parse(await fs.readFile('scripts/roof-catalogue.json','utf8'));
const observations=JSON.parse(await fs.readFile('artifacts/roofs/observations.json','utf8')).buildings;
const assignments=[],materialCounts=Array(catalog.materials.length).fill(0);
const detailedIds=await detailedBuildingIds();
const excluded=new Set(detailedIds);
const generic=data.features.filter(f=>!excluded.has(f.properties.osm_id));
assignments.push(...generic.map(f=>assignRoof(f,catalog,observations[f.properties.osm_id])));
const overlaps=harmonizeRoofOverlaps(generic,assignments),byId=new Map(assignments.map(a=>[a.id,a]));
const tiles=new Map();let triangles=0,skipped=0,maxDeviation=0;
for(const f of data.features){
  if(excluded.has(f.properties.osm_id))continue;
  const assignment=byId.get(f.properties.osm_id);materialCounts[assignment.material]++;
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const rings of polygons){
    const projected=rings.map(r=>r.slice(0,-1).map(xy));
    const origin=projected[0][0];
    const local=projected.map(r=>r.map(p=>[p[0]-origin[0],p[1]-origin[1]]));
    const {vertices,holes,dimensions}=flatten(local),indices=earcut(vertices,holes,dimensions);
    const deviation=areaDeviation(vertices,holes,dimensions,indices);
    if(!Number.isFinite(deviation)||deviation>0.01){skipped++;continue;}
    maxDeviation=Math.max(maxDeviation,deviation);
    for(let i=0;i<indices.length;i+=3){
      const tri=indices.slice(i,i+3).map(j=>[vertices[j*2]+origin[0],vertices[j*2+1]+origin[1]]);
      const minX=Math.floor(Math.min(...tri.map(p=>p[0]))),maxX=Math.floor(Math.max(...tri.map(p=>p[0])));
      const minY=Math.floor(Math.min(...tri.map(p=>p[1]))),maxY=Math.floor(Math.max(...tri.map(p=>p[1])));
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
        let poly=clip(clip(clip(clip(tri,0,x,true),0,x+1,false),1,y,true),1,y+1,false);
        if(poly.length<3)continue;
        const key=`${x}/${y}`;if(!tiles.has(key))tiles.set(key,{x,y,vertices:[],surface:[]});const {vertices:target,surface}=tiles.get(key);
        for(let j=1;j<poly.length-1;j++){
          const points=[poly[0],poly[j],poly[j+1]];
          const area=Math.abs((points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[2][0]-points[0][0])*(points[1][1]-points[0][1]));
          if(area<1e-12)continue;
          for(const p of points){target.push(p[0]-x,p[1]-y,f.properties.height+0.08);surface.push(...roofUV(assignment,p),assignment.material,assignment.tint);}
          triangles++;
        }
      }
    }
  }
}
const index=[],buffer=new Float32Array(triangles*9),surfaceBytes=Buffer.alloc(triangles*3*12);let offset=0;
for(const t of tiles.values()){
  if(!t.vertices.length)continue;
  index.push({x:t.x,y:t.y,first:offset/3,count:t.vertices.length/3});buffer.set(t.vertices,offset);
  for(let i=0;i<t.surface.length;i+=4){const at=offset/3*12+i/4*12;surfaceBytes.writeFloatLE(t.surface[i],at);surfaceBytes.writeFloatLE(t.surface[i+1],at+4);surfaceBytes[at+8]=t.surface[i+2];surfaceBytes.fill(t.surface[i+3],at+9,at+12);}
  offset+=t.vertices.length;
}
await fs.mkdir('dist/data/roofs',{recursive:true});
await fs.writeFile('dist/data/roofs/mesh.bin',Buffer.from(buffer.buffer));
await fs.writeFile('dist/data/roofs/index.json',JSON.stringify({zoom:ZOOM,vertexFormat:'float32-le: tile_u, tile_v, height_m',vertexCount:offset/3,triangles,skippedPolygons:skipped,maxAreaDeviation:maxDeviation,excludedDetailedBuildings:detailedIds,tiles:index}));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),catalogBytes=JSON.stringify(catalog,null,2),assignmentBytes=JSON.stringify({method:catalog.method,buildings:assignments,excludedDetailedBuildings:detailedIds});
await fs.writeFile('dist/data/roofs/surface.bin',surfaceBytes);
await fs.writeFile('dist/data/roofs/catalogue.json',catalogBytes);
await fs.writeFile('dist/data/roofs/assignments.json',assignmentBytes);
await fs.writeFile('dist/data/roofs/catalogue-index.json',JSON.stringify({version:1,vertexCount:offset/3,surface:'surface.bin',surfaceStride:12,surfaceFormat:'float32-le u,v; uint8 material,r,g,b',geometrySha256:digest(Buffer.from(buffer.buffer)),surfaceSha256:digest(surfaceBytes),catalogueSha256:digest(catalogBytes),assignmentsSha256:digest(assignmentBytes),textureSize:[512,512],overviewSize:[128,128],textures:catalog.materials.map(m=>`textures/${m.id}.webp`),overviewTextures:catalog.materials.map(m=>`textures/low/${m.id}.webp`),stats:{buildings:assignments.length,photoEvidence:assignments.filter(a=>a.photoSamples>0).length,materialCounts,protectedNerval:detailedIds.length}}));
console.log(JSON.stringify({tiles:index.length,triangles,bytes:buffer.byteLength,skippedPolygons:skipped,maxAreaDeviation:maxDeviation,overlaps}));
