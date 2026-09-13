import fs from 'node:fs/promises';
import earcut from 'earcut';
const dir='dist/data/nerval',survey=JSON.parse(await fs.readFile(`${dir}/survey.json`,'utf8'));
const batches=new Map(),objects=[],pickTriangles=[],paintedPatches=new Map();let activePart=null;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len=a=>Math.hypot(...a),norm=a=>mul(a,1/len(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255);
function tri(points,material=0,color=[.79,.76,.69],uv=[[0,0],[0,0],[0,0]]){
 const n=cross(sub(points[1],points[0]),sub(points[2],points[0]));if(len(n)<1e-7)return;
 const normal=norm(n);if(!batches.has(material))batches.set(material,[]);const target=batches.get(material);
 if(activePart!==null && material<=1)pickTriangles.push({part:activePart,points});
 for(let i=0;i<3;i++)target.push(...points[i],...normal,...uv[i],...color);
}
function poly(points,material=0,color=[.79,.76,.69],uv=points.map(()=>[0,0])){
 if(points.length<3)return;
 const n=cross(sub(points[1],points[0]),sub(points[2],points[0]));const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
 const flat=points.flatMap(p=>p.filter((_,i)=>i!==axis));const indices=earcut(flat);
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3);tri(ids.map(j=>points[j]),material,color,ids.map(j=>uv[j]));}
}
function clip(points,fn){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],fa=fn(a),fb=fn(b),ia=fa>=-1e-8,ib=fb>=-1e-8;if(ia)out.push(a);if(ia!==ib)out.push(mix(a,b,fa/(fa-fb)));}return out;}
function box(c,u,v,w,d,z0,z1,color){
 const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>add(c,add(mul(u,w*a/2),mul(v,d*b/2))));
 for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];poly([[...a,z0],[...b,z0],[...b,z1],[...a,z1]],0,color);}
 poly(corners.map(p=>[...p,z1]),0,color);
}
function beam(a,b,width,color){const d=sub(b,a),horizontal=Math.hypot(d[0],d[1]);if(horizontal<1e-5){box(a.slice(0,2),[1,0],[0,1],width,width,a[2],b[2],color);return;}const u=norm(d),v=norm(cross(u,[0,0,1])),w=norm(cross(u,v));const corners=p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(p,add(mul(v,width*x/2),mul(w,width*y/2))));const aa=corners(a),bb=corners(b);for(let i=0;i<4;i++)poly([aa[i],aa[(i+1)%4],bb[(i+1)%4],bb[i]],0,color);poly(bb,0,color);}
const toXY=([lng,lat])=>[(lng-survey.origin[0])*survey.scale[0],(lat-survey.origin[1])*survey.scale[1]];
function roofUV(p){const lng=p[0]/survey.scale[0]+survey.origin[0],lat=p[1]/survey.scale[1]+survey.origin[1],n=2**survey.roofImagery.z;return [((lng+180)/360*n-survey.roofImagery.nw[0])*256/survey.roofImagery.size[0],((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n-survey.roofImagery.nw[1])*256/survey.roofImagery.size[1]];}
const parts=new Map(survey.parts.map(p=>[p.id,p]));
for(const part of survey.parts){
 activePart=part.id;
 const {u,v,center:c,bounds:[lo,hi],eaves:e,rise:r}=part;
 const local=p=>[dot(sub(p,c),u),dot(sub(p,c),v)];
 const world=([x,y])=>add(c,add(mul(u,x),mul(v,y)));
 const ring=part.ring.map(local);
 const axis=part.roof==='cross'?0:1;
 const planes=r<.01?[()=>e]:[p=>e+r*(p[axis]-lo[axis])/((hi[axis]-lo[axis])/2),p=>e+r*(hi[axis]-p[axis])/((hi[axis]-lo[axis])/2)];
 if(part.roof==='hip'){planes.push(p=>e+r*(p[0]-lo[0])/((hi[0]-lo[0])/2),p=>e+r*(hi[0]-p[0])/((hi[0]-lo[0])/2));}
 const height=p=>Math.max(e,Math.min(...planes.map(f=>f(p))));
 const color=part.color||rgb(part.photos.includes('02')?'#c8c5b7':part.photos.includes('10')?'#dfd9c7':'#d7d2c0');
 const indices=earcut(ring.flat());
 for(let i=0;i<indices.length;i+=3){const triangle=indices.slice(i,i+3).map(j=>ring[j]);for(const f of planes){let clipped=triangle;for(const g of planes){if(f!==g)clipped=clip(clipped,p=>g(p)-f(p));if(clipped.length<3)break;}if(clipped.length<3)continue;const points=clipped.map(p=>[...world(p),f(p)]);poly(points,1,[1,1,1],points.map(roofUV));
  for(const patch of part.patches.filter(p=>p.side==='roof')){
   if(f!==planes[0]||axis!==1)continue;
   const span=patch.span||[0,1],width=hi[0]-lo[0],a=lo[0]+width*span[0],b=lo[0]+width*span[1],mid=(lo[1]+hi[1])/2;
   const surface=clip(clip(clipped,p=>p[0]-a),p=>b-p[0]);if(surface.length<3)continue;
   poly(surface.map(p=>[...world(p),f(p)+.016]),2+patch.atlas,[1,1,1],surface.map(p=>[patch.uv[0]+(p[0]-a)/(b-a)*patch.uv[2],patch.uv[1]+(mid-p[1])/(mid-lo[1])*patch.uv[3]]));paintedPatches.set(patch.id,(paintedPatches.get(patch.id)||0)+surface.length-2);
  }
 }}
 // Exterior OSM walls with ridge intersections, then per-surface photo patches.
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];const ts=[0,1];
  for(let j=0;j<planes.length;j++)for(let k=j+1;k<planes.length;k++){const fa=planes[j](a)-planes[k](a),fb=planes[j](b)-planes[k](b);if(fa*fb<0)ts.push(fa/(fa-fb));}
  ts.sort((a,b)=>a-b);
  for(let j=0;j<ts.length-1;j++){
   const aa=mix(a,b,ts[j]),bb=mix(a,b,ts[j+1]),A=world(aa),B=world(bb),wall=[[...aa,0],[...bb,0],[...bb,height(bb)],[...aa,height(aa)]];
   poly(wall.map(p=>[...world(p),p[2]]),0,color);
   for(const patch of part.patches){
    if(['roof','dormer'].includes(patch.side))continue;
    const side=patch.side,dimension=side==='front'?0:1,depth=side==='front'?1:0;
    const edge=side==='front'?lo[1]+(patch.depth||0):side==='left'?lo[0]:hi[0];
    if(Math.abs(aa[depth]-edge)>.42||Math.abs(bb[depth]-edge)>.42)continue;
    const span=patch.span||[0,1],range=hi[dimension]-lo[dimension],start=lo[dimension]+range*span[0],end=lo[dimension]+range*span[1],bottom=patch.bottom,top=patch.height||e;
    let face=clip(clip(clip(clip(wall,p=>p[dimension]-start),p=>end-p[dimension]),p=>p[2]-bottom),p=>top-p[2]);if(face.length<3)continue;
    const bump=side==='front'?mul(v,-.018):mul(u,side==='left'?-.018:.018);
    const uv=face.map(p=>{const s=(p[dimension]-start)/(end-start);return [patch.uv[0]+s*patch.uv[2],patch.uv[1]+(top-p[2])/(top-bottom)*patch.uv[3]];});
    poly(face.map(p=>[...add(world(p),bump),p[2]]),2+patch.atlas,[1,1,1],uv);
    paintedPatches.set(patch.id,(paintedPatches.get(patch.id)||0)+face.length-2);
   }
  }
 }
 activePart=null;
 // A narrow gutter follows the real street-facing edge. It is a small estimated detail.
 const a=world([lo[0],lo[1]]),b=world([hi[0],lo[1]]);beam([...a,e+.03],[...b,e+.03],.105,rgb('#626461'));
 part.roofHeight=height;
 objects.push({id:part.osm_id,type:'building',group:part.group,height:e+r});
}
activePart=null;

// Front boundary features follow each group's road-facing orientation. Positions
// and dimensions are visual estimates, recorded separately from OSM footprints.
const GROUPS=new Map(survey.groups.map(g=>[g.id,g]));
for(const fence of survey.fences){
 const group=GROUPS.get(fence.group),c=group.center,u=group.u,v=group.v;
 const vertices=group.parts.flatMap(id=>parts.get(id).ring),coords=vertices.map(p=>[dot(sub(p,c),u),dot(sub(p,c),v)]);
 const min=Math.min(...coords.map(p=>p[0]))-.8,max=Math.max(...coords.map(p=>p[0]))+.8;
 const world=x=>add(c,add(mul(u,x),mul(v,Math.min(...coords.map(p=>p[1]))-Math.min(fence.offset,Math.max(1,Math.abs(Math.min(...coords.map(p=>p[1]))))))));
 // Boundary aligned with façade; stop before the frontage's access opening.
 const at=(x,z)=>[...world(x),z],width=max-min,gate=Math.min(3,width*.25),gateCenter=min+width*.28,g0=gateCenter-gate/2,g1=gateCenter+gate/2,color=rgb(fence.color);
 for(const [a,b] of [[min,g0],[g1,max]]){
  const mid=world((a+b)/2);
  box(mid,u,v,b-a,fence.kind==='hedge'?.55:.22,0,.3,rgb('#bbb7a5'));
  if(fence.kind==='hedge'){box(mid,u,v,b-a,.72,.3,fence.height,color);continue;}
  if(fence.kind==='screen'){box(mid,u,v,b-a,.1,.3,fence.height,color);for(let z=.42;z<fence.height;z+=.15)beam(at(a,z),at(b,z),.025,rgb('#60675f'));continue;}
  const space=fence.kind==='wood'?.21:fence.kind==='white'?.18:.19;
  if(fence.kind==='rails'){for(let z=.45;z<=fence.height;z+=.29)beam(at(a,z),at(b,z),.075,color);}
  else {for(let x=a+.1;x<b;x+=space)beam(at(x,.28),at(x,fence.height),fence.kind==='bars'?.035:.08,color);for(const z of [.45,fence.height-.15])beam(at(a,z),at(b,z),.045,color);}
 }
 for(const x of [min,g0,g1,max])box(world(x),u,v,.3,.33,0,fence.height+.15,rgb('#c6c0a9'));
 const gateColor=fence.kind==='hedge'?rgb(group.photos.includes('12')?'#62373d':'#325349'):color;
 for(let x=g0+.1;x<g1;x+=.18)beam(at(x,.08),at(x,Math.min(1.5,fence.height)),.055,gateColor);
 for(const z of [.17,Math.min(1.5,fence.height)-.13])beam(at(g0,z),at(g1,z),.065,gateColor);
 // Small letterbox, visible on nearly all provided front boundaries.
 box(add(world(g1),mul(v,-.18)),u,v,.3,.17,.95,1.2,group.photos.includes('15')?rgb('#305849'):rgb('#8d8b77'));
 objects.push({id:group.id,type:'frontage',photo:fence.photo,positionAccuracy:'visual estimate'});
}

// Local roadway details at the observed junctions, using approximate positions.
const roadPhotos=['01','27','04','26','25','05','06','07','08','19','09','10','11','12','13','17','14'].map(id=>survey.photos.find(p=>p.id===id));
const route=roadPhotos.map(p=>toXY([p.longitude,p.latitude]));
for(let i=0;i<route.length-1;i++){
 const a=route[i],b=route[i+1],u=norm(sub(b,a)),v=[-u[1],u[0]],d=len(sub(b,a));
 if(['25','06','07','14'].includes(roadPhotos[i].id)||['25','06','07','14'].includes(roadPhotos[i+1].id))continue;
 for(const sign of [-1,1]){
  const c=add(mix(a,b,.5),mul(v,sign*3.85));box(c,u,v,d,1.25,.005,.125,rgb('#8a8980'));
  beam([...add(a,mul(v,sign*3.2)),.15],[...add(b,mul(v,sign*3.2)),.15],.19,rgb('#b1afa1'));
 }
}
const roadColor=rgb('#275545');
for(const [id,side] of [['04',1],['05',-1],['06',-1],['08',1],['10',-1],['11',1],['12',-1],['13',1],['14',1],['17',-1]]){
 const index=roadPhotos.findIndex(p=>p.id===id),p=route[index],d=norm(sub(route[Math.min(index+1,route.length-1)],route[Math.max(index-1,0)])),n=[-d[1],d[0]],base=add(p,mul(n,side*4.0));
 beam([...base,.15],[...base,5.2],.10,roadColor);const tip=add(base,mul(n,-side*.85));beam([...base,5.2],[...tip,5.5],.08,roadColor);box(tip,d,n,.35,.65,5.37,5.49,rgb('#a8b4a3'));
}

// Chimneys and dormers only for roofs where those details are visible.
for(const id of [10,14,18,21,34,40,48,54,59,62,70,82,88,93,96,100,104,111,114,117,108,99,83]){
 const p=parts.get(id),[lo,hi]=p.bounds;const q=[lo[0]+(hi[0]-lo[0])*.26,(lo[1]+hi[1])/2],c=add(p.center,add(mul(p.u,q[0]),mul(p.v,q[1]))),z=p.roofHeight(q);
 box(c,p.u,p.v,.5,.5,z-.2,z+1.1,rgb('#bfb9a5'));box(c,p.u,p.v,.62,.62,z+1.08,z+1.2,rgb('#5e605b'));
}
for(const [id,width,offset] of [[10,4,.6],[54,1.45,.44],[24,2.4,.58]]){
 const p=parts.get(id),[lo,hi]=p.bounds;const q=[lo[0]+(hi[0]-lo[0])*offset,lo[1]+(hi[1]-lo[1])*.25],c=add(p.center,add(mul(p.u,q[0]),mul(p.v,q[1]))),z=p.roofHeight(q);
 box(c,p.u,p.v,width,1.45,z-.15,z+1.55,rgb('#d4cebb'));const front=add(c,mul(p.v,-.74));box(front,p.u,p.v,width*.52,.04,z+.05,z+1.30,rgb('#a9b4b0'));
 const roof=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[...add(c,add(mul(p.u,a*(width+.2)/2),mul(p.v,b*.86))),z+1.65]);poly(roof,1,[1,1,1],roof.map(roofUV));
 const patch=p.patches.find(p=>p.side==='dormer');if(patch){const a=add(front,mul(p.u,-width/2)),b=add(front,mul(p.u,width/2)),uv=patch.uv;poly([[...a,z+1.55],[...b,z+1.55],[...b,z-.15],[...a,z-.15]],2+patch.atlas,[1,1,1],[[uv[0],uv[1]],[uv[0]+uv[2],uv[1]],[uv[0]+uv[2],uv[1]+uv[3]],[uv[0],uv[1]+uv[3]]]);paintedPatches.set(patch.id,2);}
}

// Documented vegetation: birch at no. 33, conifer at the junction, central tree.
function tree(partId,along,height,radius,color){const p=parts.get(partId),[lo,hi]=p.bounds,q=[lo[0]+(hi[0]-lo[0])*along,lo[1]-2],c=add(p.center,add(mul(p.u,q[0]),mul(p.v,q[1])));beam([...c,.1],[...c,height*.75],.18,rgb('#aba38b'));const bands=8,slices=12;for(let j=0;j<bands;j++)for(let k=0;k<slices;k++){const point=(a,b)=>[c[0]+radius*Math.sin(a)*Math.cos(b),c[1]+radius*.8*Math.sin(a)*Math.sin(b),height-radius*1.25+radius*1.25*Math.cos(a)];const a=j/bands*Math.PI,b=k/slices*Math.PI*2,aa=(j+1)/bands*Math.PI,bb=(k+1)/slices*Math.PI*2;poly([point(a,b),point(aa,b),point(aa,bb),point(a,bb)],0,rgb(color));}}
tree(96,.63,8.5,2.5,'#586c3c');tree(93,.25,8,1.1,'#4b5e37');tree(62,.12,4.9,1.8,'#65804a');

// Traffic island and signs visible in references 06, 07, 21 and 22.
// Coordinates were read from the aerial reference; pole heights are estimated.
const island=[-8,-44],islandRing=Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2;return [island[0]+Math.cos(a)*2.5,island[1]+Math.sin(a)*2.0];});
poly(islandRing.map(p=>[...p,.19]),0,rgb('#bab3a0'));for(let i=0;i<32;i++)poly([[...islandRing[i],0],[...islandRing[(i+1)%32],0],[...islandRing[(i+1)%32],.19],[...islandRing[i],.19]],0,rgb('#c0bcae'));
function sign(center,direction,kind){const u=[-direction[1],direction[0]],at=(x,z,depth=0)=>[...add(center,add(mul(u,x),mul(direction,depth))),z];beam([...center,0],[...center,2.2],.065,rgb('#aaaead'));
 if(kind==='yield'){const red=[at(-.40,2.55),at(.40,2.55),at(0,1.83)],white=[at(-.30,2.49,.015),at(.30,2.49,.015),at(0,1.96,.015)];poly(red,0,rgb('#b13a38'));poly(white,0,rgb('#f2f0e2'));}
 else {const ring=Array.from({length:24},(_,i)=>at(.32*Math.cos(i/24*Math.PI*2),1.5+.32*Math.sin(i/24*Math.PI*2)));poly(ring,0,rgb('#296fa2'));poly([at(-.2,1.45,.02),at(.07,1.45,.02),at(.07,1.34,.02),at(.24,1.5,.02),at(.07,1.66,.02),at(.07,1.55,.02),at(-.2,1.55,.02)],0,rgb('#f2f1e9'));}}
sign([-9,-43],[.7,.714],'round');sign([9,-45],[-.7,-.714],'yield');sign([-15,-36],[.4,-.916],'yield');sign([-24,-54],[.7,.714],'yield');

const ranges=[];let total=0;for(const [material,vertices] of [...batches].sort((a,b)=>a[0]-b[0])){ranges.push({material,first:total/11,count:vertices.length/11});total+=vertices.length;}
const buffer=new Float32Array(total);let offset=0;for(const [material,vertices] of [...batches].sort((a,b)=>a[0]-b[0])){buffer.set(vertices,offset);offset+=vertices.length;}
await fs.writeFile(`${dir}/mesh.bin`,Buffer.from(buffer.buffer));
const index={origin:survey.origin,vertexFormat:'float32-le: east_m,north_m,up_m,nx,ny,nz,u,v,r,g,b',stride:44,vertexCount:total/11,ranges,textures:['roofs.webp',...Array.from({length:survey.facadeAtlases},(_,i)=>`facades-${i}.webp`)],bounds:[4.3796,48.94615,4.383,48.94885],excludeIds:survey.parts.map(p=>p.osm_id),stats:{buildingGroups:survey.groups.length,buildingParts:survey.parts.length,photoPatches:paintedPatches.size,referencePhotos:27,triangles:total/33,frontages:survey.fences.length},objects,paintedPatches:[...paintedPatches.keys()],pickTriangles};
await fs.writeFile(`${dir}/index.json`,JSON.stringify(index));
const geojson={type:'FeatureCollection',features:survey.parts.map(p=>({type:'Feature',properties:{part_id:p.id,osm_id:p.osm_id,group:p.group,eaves:p.eaves,height:p.eaves+p.rise,description:p.description,photos:[...new Set([...p.patches.map(q=>String(q.photo).padStart(2,'0')),...p.photos])].join(','),textured:p.patches.length>0,confidence:p.patches.some(q=>!['roof','dormer'].includes(q.side))?'Façade observée ; dimensions estimées':'Volume interprété ; façade peu visible'},geometry:{type:'Polygon',coordinates:[[...p.ring,p.ring[0]].map(p=>[p[0]/survey.scale[0]+survey.origin[0],p[1]/survey.scale[1]+survey.origin[1]])]}}))};
await fs.writeFile(`${dir}/buildings.geojson`,JSON.stringify(geojson));
console.log(JSON.stringify({...index.stats,meshBytes:buffer.byteLength}));
