import fs from 'node:fs/promises';
import earcut, {flatten, deviation as areaDeviation} from 'earcut';

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
const tiles=new Map();let triangles=0,skipped=0,maxDeviation=0;
for(const f of data.features){
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
        const key=`${x}/${y}`;if(!tiles.has(key))tiles.set(key,{x,y,vertices:[]});const target=tiles.get(key).vertices;
        for(let j=1;j<poly.length-1;j++){
          const points=[poly[0],poly[j],poly[j+1]];
          const area=Math.abs((points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[2][0]-points[0][0])*(points[1][1]-points[0][1]));
          if(area<1e-12)continue;
          for(const p of points)target.push(p[0]-x,p[1]-y,f.properties.height+0.08);
          triangles++;
        }
      }
    }
  }
}
const index=[],buffer=new Float32Array(triangles*9);let offset=0;
for(const t of tiles.values()){
  if(!t.vertices.length)continue;
  index.push({x:t.x,y:t.y,first:offset/3,count:t.vertices.length/3});buffer.set(t.vertices,offset);offset+=t.vertices.length;
}
await fs.mkdir('dist/data/roofs',{recursive:true});
await fs.writeFile('dist/data/roofs/mesh.bin',Buffer.from(buffer.buffer));
await fs.writeFile('dist/data/roofs/index.json',JSON.stringify({zoom:ZOOM,vertexFormat:'float32-le: tile_u, tile_v, height_m',vertexCount:offset/3,triangles,skippedPolygons:skipped,maxAreaDeviation:maxDeviation,tiles:index}));
console.log(JSON.stringify({tiles:index.length,triangles,bytes:buffer.byteLength,skippedPolygons:skipped,maxAreaDeviation:maxDeviation}));
