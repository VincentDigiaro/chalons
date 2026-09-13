import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Wall-only overlay. Existing GeoJSON, roof imagery and Nerval assets are inputs,
// never outputs. GPU instance records are partitioned into small geographic cells.
const OUTPUT='dist/data/facades', ZOOM=16, N=2**ZOOM, CIRCUMFERENCE=40075016.68557849;
const sourceBytes=await fs.readFile('dist/data/buildings.geojson');
const source=JSON.parse(sourceBytes), catalog=JSON.parse(await fs.readFile('scripts/facade-catalogue.json','utf8'));
const detailed=JSON.parse(await fs.readFile('dist/data/nerval/index.json','utf8'));
const land=JSON.parse(await fs.readFile('dist/data/land.geojson','utf8'));
const merc=([lng,lat])=>[(lng+180)/360,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2];
const lngLat=([x,y])=>[x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
const polygons=f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
function boundsOf(rings){const b=[Infinity,Infinity,-Infinity,-Infinity];for(const ring of rings)for(const p of ring){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}return b;}
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function inRing(p,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const inPolygon=(p,rings)=>inRing(p,rings[0])&&!rings.slice(1).some(r=>inRing(p,r));
const activity=land.features.filter(f=>['industrial','commercial','retail','railway','farmyard','military'].includes(f.properties.kind)).flatMap(f=>polygons(f).map(rings=>({rings,bounds:boundsOf(rings),kind:f.properties.kind})));
const excludedIds=new Set(detailed.excludeIds),[w,s,e,n]=detailed.bounds;
const protectedBounds=[w-15/(111320*Math.cos(s*Math.PI/180)),s-15/111320,e+15/(111320*Math.cos(s*Math.PI/180)),n+15/111320];
const protectedHashes=Object.fromEntries(await Promise.all(['dist/data/buildings.geojson','dist/data/roofs/mesh.bin','dist/data/roofs/index.json'].map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const stats={sourceBuildings:source.features.length,texturedBuildings:0,facades:0,excludedNerval:0,excludedExisting:0,excludedNonWalls:0,shortEdges:0,materialCounts:Array(16).fill(0),sectorCounts:{}};
const chunks=new Map(), assignments=[], excluded=[];
function pick(weights,seed){let x=(seed/4294967296)*weights.reduce((a,p)=>a+p[1],0);for(const [id,weight] of weights){x-=weight;if(x<0)return id;}return weights.at(-1)[0];}
function nearestSector(center){let best=null,dist=Infinity;for(const sector of catalog.sectors){const d=((center[0]-sector.center[0])*73000)**2+((center[1]-sector.center[1])*111320)**2;if(d<dist){dist=d;best=sector;}}return {...best,distance:Math.sqrt(dist)};}
function areaM2(rings,k){let area=0;for(let r=0;r<rings.length;r++){const pts=rings[r].map(merc);let a=0;for(let i=0;i<pts.length-1;i++)a+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];area+=(r===0?1:-1)*Math.abs(a)*.5*k*k;}return Math.max(area,0);}
function chooseMaterial(p,center,area,sector,seed){
  const kind=p.kind, tall=p.height-p.min_height, inActivity=activity.some(a=>intersects(a.bounds,[...center,...center])&&inPolygon(center,a.rings));
  if(['church','cathedral','chapel','temple'].includes(kind))return 15;
  if(['garage','garages','shed','service','kiosk'].includes(kind)||area<24)return 13;
  if(['industrial','warehouse','barn','farm_auxiliary','silo','retail','commercial'].includes(kind)||(inActivity&&area>260&&tall<18))return 12;
  if(['school','hospital','public','government','office','civic','train_station','transportation','sports_centre','stadium'].includes(kind))return 11;
  if(['apartments','dormitory'].includes(kind)||tall>=15||(area>420&&[3,5,9].includes(sector.id)&&tall>=9))return pick([[8,58],[9,24],[10,18]],seed);
  if(area>900&&tall<12&&sector.id!==4)return 12;
  // The old centre is bounded; its vocabulary is not spread into distant villages.
  const oldCentre=center[0]>4.350&&center[0]<4.374&&center[1]>48.950&&center[1]<48.968;
  if(oldCentre)return pick(catalog.sectors.find(s=>s.id===4).weights,seed);
  if(sector.distance>2400)return pick([[0,45],[1,32],[2,15],[5,8]],seed);
  const weights=sector.id===4?[[0,25],[1,20],[4,15],[5,32],[6,8]]:sector.weights;
  return pick(weights,seed);
}
function simplifyRing(input,k){
  let points=input.slice(0,-1).map(merc);if(points.length<3)return [];
  // Remove only near-collinear intermediate points (2 cm); retain footprint detail.
  let changed=true;while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++){const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length],dx=c[0]-a[0],dy=c[1]-a[1],l=Math.hypot(dx,dy);const t=l?((b[0]-a[0])*dx+(b[1]-a[1])*dy)/(l*l):0;const distance=l?Math.abs(dx*(a[1]-b[1])-(a[0]-b[0])*dy)/l*k:0;if(distance<.02&&t>=0&&t<=1){points.splice(i,1);changed=true;break;}}}return points;
}
for(const f of [...source.features].sort((a,b)=>a.properties.osm_id.localeCompare(b.properties.osm_id))){
  const p=f.properties,id=p.osm_id, polys=polygons(f), bb=boundsOf(polys.flat());
  if(excludedIds.has(id)||intersects(bb,protectedBounds)){stats.excludedNerval++;excluded.push({id,reason:'nerval'});continue;}
  if(Object.entries(p).some(([key,value])=>value&&/^(facade_texture|wall_texture|texture|textured|material_map|facade:.*texture|building:.*texture)$/.test(key))){stats.excludedExisting++;excluded.push({id,reason:'existing-texture'});continue;}
  if(['no','roof','greenhouse','construction'].includes(p.kind)||!Number.isFinite(p.height)||p.height<=p.min_height){stats.excludedNonWalls++;excluded.push({id,reason:'non-wall'});continue;}
  const center=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2], k=CIRCUMFERENCE*Math.cos(center[1]*Math.PI/180), area=polys.reduce((a,r)=>a+areaM2(r,k),0), sector=nearestSector(center), seed=hash(id), material=chooseMaterial(p,center,area,sector,seed);
  const c=merc(center), x=Math.floor(c[0]*N),y=Math.floor(c[1]*N),key=`${x}-${y}`;
  if(!chunks.has(key))chunks.set(key,{key,x,y,bounds:[...bb],records:[],buildings:0});
  const chunk=chunks.get(key);chunk.bounds=[Math.min(chunk.bounds[0],bb[0]),Math.min(chunk.bounds[1],bb[1]),Math.max(chunk.bounds[2],bb[2]),Math.max(chunk.bounds[3],bb[3])];
  const faces=[], startCount=chunk.records.length;
  for(let pi=0;pi<polys.length;pi++)for(let ri=0;ri<polys[pi].length;ri++){
    const points=simplifyRing(polys[pi][ri],k);if(points.length<3)continue;
    const lengths=points.map((a,i)=>Math.hypot(points[(i+1)%points.length][0]-a[0],points[(i+1)%points.length][1]-a[1])*k),longest=Math.max(...lengths);
    let signed=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];signed+=a[0]*b[1]-b[0]*a[1];}
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],length=lengths[i];if(length<.12){stats.shortEdges++;continue;}
      let mat=material;const family=catalog.materials[material].family;
      if(family==='house'&&length<longest*.6&&length<7&&hash(`${id}/${pi}/${ri}/${i}`)%3!==0)mat=14;
      if(family==='garage'&&(length>longest*.85?false:true))mat=14;
      if(length<1.6&&!['industrial','blank'].includes(family))mat=family==='town'?15:14;
      const m=catalog.materials[mat],height=p.height-p.min_height;
      const floors=m.family==='garage'?1:Math.max(1,Math.round(height/m.floorHeight));
      let repeatX=['blank','industrial'].includes(m.family)?length/m.moduleWidth:Math.max(.5,Math.round(length/(m.moduleWidth/2))/2);
      if(m.family==='garage')repeatX=Math.max(1,Math.round(length/m.moduleWidth));
      const dx=(b[0]-a[0])*k/length,dy=(b[1]-a[1])*k/length;
      const sign=(signed>=0?1:-1)*(ri===0?1:-1),nx=dy*sign,ny=-dx*sign,offset=.07/k;
      const light=.80+.20*Math.max(0,nx*-.55+ny*-.83),tint=.96+(hash(id+'tint')%81)/1000;
      chunk.records.push({values:[(a[0]+nx*offset)*N-x,(a[1]+ny*offset)*N-y,(b[0]+nx*offset)*N-x,(b[1]+ny*offset)*N-y,p.min_height,p.height,repeatX,floors,mat,light,tint,0],id:seed});
      faces.push([pi,ri,i,mat,+length.toFixed(2)]);stats.materialCounts[mat]++;stats.facades++;
    }
  }
  if(chunk.records.length===startCount)continue;
  chunk.buildings++;stats.texturedBuildings++;stats.sectorCounts[sector.id]=(stats.sectorCounts[sector.id]||0)+1;
  assignments.push({id,sector:sector.id,referenceDistanceM:Math.round(sector.distance),referenceUse:sector.distance<=2400?'sector-inspiration':'extrapolation',material,faces});
}
await fs.mkdir(path.join(OUTPUT,'chunks'),{recursive:true});
const chunkIndex=[];
for(const chunk of [...chunks.values()].sort((a,b)=>a.key.localeCompare(b.key))){
  if(!chunk.records.length)continue;
  const buffer=Buffer.alloc(chunk.records.length*52);
  chunk.records.forEach((record,i)=>{record.values.forEach((v,j)=>buffer.writeFloatLE(v,i*52+j*4));buffer.writeUInt32LE(record.id,i*52+48);});
  const file=`chunks/${chunk.key}.bin`;await fs.writeFile(path.join(OUTPUT,file),buffer);
  const latitude=lngLat([0,(chunk.y+.5)/N])[1];
  chunkIndex.push({file,x:chunk.x,y:chunk.y,bounds:chunk.bounds,count:chunk.records.length,buildings:chunk.buildings,bytes:buffer.length,zScale:1/(CIRCUMFERENCE*Math.cos(latitude*Math.PI/180))});
}
const index={version:1,zoom:ZOOM,stride:52,vertexFormat:'12 float32-le: ax,ay,bx,by,base_m,top_m,repeat_u,repeat_v,material,light,tint,reserved; uint32-le: building_hash',catalogue:'catalogue.json',textureSize:[512,256],textures:catalog.materials.map(m=>`textures/${m.id}.webp`),protectedBounds,protectedIds:[...excludedIds].sort(),sourceSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),stats:{...stats,chunks:chunkIndex.length,geometryBytes:chunkIndex.reduce((a,c)=>a+c.bytes,0)},chunks:chunkIndex};
index.overviewSize=[128,64];index.overviewTextures=catalog.materials.map(m=>`textures/low/${m.id}.webp`);
await fs.writeFile(path.join(OUTPUT,'index.json'),JSON.stringify(index));
await fs.writeFile(path.join(OUTPUT,'catalogue.json'),JSON.stringify(catalog,null,2));
await fs.writeFile(path.join(OUTPUT,'assignments.json'),JSON.stringify({method:catalog.method,faceFormat:'polygon,ring,edge,materialIndex,lengthM',buildings:assignments,excluded}));
await fs.mkdir('artifacts/facades',{recursive:true});
await fs.writeFile('artifacts/facades/preservation.json',JSON.stringify({protectedHashes,sourceSha256:index.sourceSha256,protectedBounds,protectedIds:index.protectedIds},null,2));
console.log(JSON.stringify(index.stats,null,2));
