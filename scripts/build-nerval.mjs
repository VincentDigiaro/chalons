import fs from 'node:fs/promises';
import earcut from 'earcut';
import {curvedStreetlamp,street45Lamp} from './nerval-street-furniture.mjs';
import {buildEndSite} from './build-nerval-end-site.mjs';
import {landscapeTools,buildGardenDetails} from './nerval-landscape.mjs';
import {applyHouse42RearSurvey} from './build-nerval-house42-rear.mjs';
import {applyNervalRefinements,buildNervalRefinements,buildRefinedCourtIsland,frontBoundary} from './build-nerval-refinements.mjs';
import {applyEndCorrections,buildEndCorrections} from './build-nerval-end-corrections.mjs';
import {applyRoundaboutSurvey,buildRoundaboutDetails} from './build-nerval-roundabout.mjs';
import {applyNervalCatalogue} from './apply-nerval-catalogue.mjs';
import {resolveGroundSurfaces} from './nerval-ground-surfaces.mjs';
const dir='dist/data/nerval',survey=JSON.parse(await fs.readFile(`${dir}/survey.json`,'utf8'));
applyHouse42RearSurvey(survey);
await applyNervalRefinements(survey);
await applyEndCorrections(survey);
await applyRoundaboutSurvey(survey);
const FOCUS_WALL=2+survey.facadeAtlases,DETAIL_ROOF=FOCUS_WALL+1,HEDGE=FOCUS_WALL+2,ROAD=FOCUS_WALL+3,PAVE=FOCUS_WALL+4,GRASS=FOCUS_WALL+5,PAVERS=FOCUS_WALL+6,WIRE=FOCUS_WALL+7,DETAIL_PHOTO=FOCUS_WALL+8,HOUSE_GLASS=DETAIL_PHOTO+survey.facadeAtlases;
const batches=new Map(),objects=[],pickTriangles=[],paintedPatches=new Map();let activePart=null;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),len=a=>Math.hypot(...a),norm=a=>mul(a,1/len(a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const rgb=hex=>hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255);
function tri(points,material=0,color=[.79,.76,.69],uv=[[0,0],[0,0],[0,0]]){
 const n=cross(sub(points[1],points[0]),sub(points[2],points[0]));if(len(n)<1e-7)return;
 const normal=norm(n);if(!batches.has(material))batches.set(material,[]);const target=batches.get(material);
 if(activePart!==null && [0,1,FOCUS_WALL,DETAIL_ROOF].includes(material))pickTriangles.push({part:activePart,points});
 for(let i=0;i<3;i++)target.push(...points[i],...normal,...uv[i],...color);
}
function poly(points,material=0,color=[.79,.76,.69],uv=points.map(()=>[0,0])){
 if(points.length<3)return;
 const n=cross(sub(points[1],points[0]),sub(points[2],points[0]));const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
 const flat=points.flatMap(p=>p.filter((_,i)=>i!==axis));const indices=earcut(flat);
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3);tri(ids.map(j=>points[j]),material,color,ids.map(j=>uv[j]));}
}
function clip(points,fn){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],fa=fn(a),fb=fn(b),ia=fa>=-1e-8,ib=fb>=-1e-8;if(ia)out.push(a);if(ia!==ib)out.push(mix(a,b,fa/(fa-fb)));}return out;}
function box(c,u,v,w,d,z0,z1,color,material=0){
 const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>add(c,add(mul(u,w*a/2),mul(v,d*b/2))));
 for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4],edge=len(sub(a,b));poly([[...a,z0],[...b,z0],[...b,z1],[...a,z1]],material,color,[[0,z0/1.3],[edge/2,z0/1.3],[edge/2,z1/1.3],[0,z1/1.3]]);}
 poly(corners.map(p=>[...p,z1]),material,color,[[0,0],[w/2,0],[w/2,d/1.3],[0,d/1.3]]);
}
function beam(a,b,width,color){const d=sub(b,a),horizontal=Math.hypot(d[0],d[1]);if(horizontal<1e-5){box(a.slice(0,2),[1,0],[0,1],width,width,a[2],b[2],color);return;}const u=norm(d),v=norm(cross(u,[0,0,1])),w=norm(cross(u,v));const corners=p=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(p,add(mul(v,width*x/2),mul(w,width*y/2))));const aa=corners(a),bb=corners(b);for(let i=0;i<4;i++)poly([aa[i],aa[(i+1)%4],bb[(i+1)%4],bb[i]],0,color);poly(bb,0,color);}
const toXY=([lng,lat])=>[(lng-survey.origin[0])*survey.scale[0],(lat-survey.origin[1])*survey.scale[1]];
function roofUV(p){const lng=p[0]/survey.scale[0]+survey.origin[0],lat=p[1]/survey.scale[1]+survey.origin[1],n=2**survey.roofImagery.z;return [((lng+180)/360*n-survey.roofImagery.nw[0])*256/survey.roofImagery.size[0],((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n-survey.roofImagery.nw[1])*256/survey.roofImagery.size[1]];}
const parts=new Map(survey.parts.map(p=>[p.id,p]));
const landscapeContext={parts,survey,objects,poly,beam,box,rgb,add,sub,mul,norm,len,mix,toXY,materials:{wall:FOCUS_WALL,roof:DETAIL_ROOF,hedge:HEDGE,road:ROAD,pave:PAVE,grass:GRASS,pavers:PAVERS,wire:WIRE,glass:HOUSE_GLASS}};
const landscape=landscapeTools(landscapeContext);
function facadeOpening(part,o){
 const [lo,hi]=part.bounds,dim=['front','back'].includes(o.side)?0:1,depth=1-dim,edge=o.side==='front'?lo[1]+(o.depth||0):o.side==='back'?hi[1]-(o.depth||0):o.side==='left'?lo[0]+(o.depth||0):hi[0]-(o.depth||0);
 const extent=o.span||part.surfaceBounds[o.side]||[lo[dim],hi[dim]],s=['left','back'].includes(o.side)?1-o.along:o.along,middle=extent[0]+s*(extent[1]-extent[0]);
 const ring=part.ring.map(q=>[dot(sub(q,part.center),part.u),dot(sub(q,part.center),part.v)]);
 let anchor=[0,0];anchor[dim]=middle;anchor[depth]=edge;
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(Math.abs(a[depth]-edge)<.65&&Math.abs(b[depth]-edge)<.65&&(a[dim]-middle)*(b[dim]-middle)<=0&&Math.abs(b[dim]-a[dim])>.01)anchor=mix(a,b,(middle-a[dim])/(b[dim]-a[dim]));}
 return {dim,depth,edge,middle,anchor};
}
// Split the wall around each opening. Glazing is recessed behind these holes;
// frames and shutter leaves project out from the actual facade plane.
function cutOpenings(wall,part){
 let faces=[wall];
 for(const o of survey.openings.filter(o=>o.part===part.id)){
  const {dim,depth,edge,middle}=facadeOpening(part,o);
  if(Math.abs(wall[0][depth]-edge)>.65||Math.abs(wall[1][depth]-edge)>.65)continue;
  const x0=middle-o.width/2,x1=middle+o.width/2,z0=o.bottom,z1=o.bottom+o.height;
  const constraints=[q=>q[dim]-x0,q=>x1-q[dim],q=>q[2]-z0,q=>z1-q[2]],next=[];
  for(const face of faces){let inside=face;for(const fn of constraints){const outside=clip(inside,q=>-fn(q));if(outside.length>=3)next.push(outside);inside=clip(inside,fn);if(inside.length<3)break;}}
  faces=next;
 }
 return faces;
}
for(const part of survey.parts){
 activePart=part.id;
 const {u,v,center:c,bounds:[lo,hi],eaves:e,rise:r}=part;
 const local=p=>[dot(sub(p,c),u),dot(sub(p,c),v)];
 const world=([x,y])=>add(c,add(mul(u,x),mul(v,y)));
 const ring=part.ring.map(local);
 const axis=part.roofAxis??(part.roof==='cross'?0:1);
 const roofLo=part.roofStart??lo[axis],roofHi=part.roofEnd??hi[axis];
 const planes=r<.01?[()=>e]:part.roof==='lean-to'?[p=>e+r*(hi[axis]-p[axis])/(hi[axis]-lo[axis])]:[p=>e+r*(p[axis]-roofLo)/((roofHi-roofLo)/2),p=>e+r*(roofHi-p[axis])/((roofHi-roofLo)/2)];
 const rearPlanes=part.rearRoof?[p=>e+part.rearRise*(p[axis]-roofHi)/((hi[axis]-roofHi)/2),p=>e+part.rearRise*(hi[axis]-p[axis])/((hi[axis]-roofHi)/2)]:[];
 if(part.roof==='hip'){planes.push(p=>e+r*(p[0]-lo[0])/((hi[0]-lo[0])/2),p=>e+r*(hi[0]-p[0])/((hi[0]-lo[0])/2));}
 const cut=part.frontFlat?lo[1]+part.frontFlat:null;
 const sectionHeight=(s,p)=>s.eaves+s.rise*Math.max(0,1-Math.abs((p[1]-(lo[1]+hi[1])/2)/((hi[1]-lo[1])/2)));
 const sectionAt=x=>part.roofSections?.find(s=>x>=s.from-1e-5&&x<=s.to+1e-5)||part.roofSections?.at(-1);
 const height=p=>part.roofSections?sectionHeight(sectionAt(p[0]),p):part.rearRoof&&p[axis]>roofHi?Math.max(e,Math.min(...rearPlanes.map(f=>f(p)))):cut!==null&&p[1]<cut-1e-6?e:Math.max(e,Math.min(...planes.map(f=>f(p))));
 const color=part.color||rgb(part.photos.includes('02')?'#c8c5b7':part.photos.includes('10')?'#dfd9c7':'#d7d2c0');
 const wallMaterial=part.focus?FOCUS_WALL:0,roofMaterial=part.focus?DETAIL_ROOF:1;
 const detailUV=p=>{const mid=(roofHi+roofLo)/2,slope=Math.hypot(1,2*r/(roofHi-roofLo));return [p[1-axis]/1.65,Math.abs(p[axis]-mid)*slope/1.28];};
 const indices=earcut(ring.flat());
 if(part.roofSections){
  const mid=(lo[1]+hi[1])/2;
  for(const section of part.roofSections)for(let i=0;i<indices.length;i+=3)for(const sign of [-1,1]){
   let face=indices.slice(i,i+3).map(j=>ring[j]);face=clip(clip(clip(face,p=>p[0]-section.from),p=>section.to-p[0]),p=>sign*(p[1]-mid));
   poly(face.map(p=>[...world(p),sectionHeight(section,p)]),roofMaterial,part.roofTint||[1,1,1],face.map(p=>[p[0]/1.65,Math.abs(p[1]-mid)*Math.hypot(1,section.rise*2/(hi[1]-lo[1]))/1.28]));
  }
  for(let k=1;k<part.roofSections.length;k++){
   const a=part.roofSections[k-1],b=part.roofSections[k],x=b.from,ys=[];
   for(let j=0;j<ring.length;j++){const c=ring[j],d=ring[(j+1)%ring.length];if((c[0]-x)*(d[0]-x)<=0&&Math.abs(c[0]-d[0])>.001)ys.push(mix(c,d,(x-c[0])/(d[0]-c[0]))[1]);}
   if(ys.length>=2)for(const [y0,y1]of [[Math.min(...ys),mid],[mid,Math.max(...ys)]]){
    const aa=[x,y0],bb=[x,y1];poly([[...world(aa),sectionHeight(a,aa)],[...world(bb),sectionHeight(a,bb)],[...world(bb),sectionHeight(b,bb)],[...world(aa),sectionHeight(b,aa)]],wallMaterial,color);
   }
  }
 }
 if(!part.roofSections)
 for(let i=0;i<indices.length;i+=3){let triangle=indices.slice(i,i+3).map(j=>ring[j]);
  if(part.roofEnd!==undefined){const back=clip(triangle,p=>p[axis]-roofHi);
   if(part.rearRoof){for(const f of rearPlanes){let clipped=back;for(const g of rearPlanes)if(f!==g)clipped=clip(clipped,p=>g(p)-f(p));poly(clipped.map(p=>[...world(p),f(p)]),roofMaterial,part.roofTint||[1,1,1],clipped.map(detailUV));}}
   else poly(back.map(p=>[...world(p),e]),wallMaterial,rgb('#85867f'));
   triangle=clip(triangle,p=>roofHi-p[axis]);}
  if(cut!==null){const flat=clip(triangle,p=>cut-p[1]);poly(flat.map(p=>[...world(p),e]),wallMaterial,rgb('#92948b'));triangle=clip(triangle,p=>p[1]-cut);}
  for(const f of planes){let clipped=triangle;for(const g of planes){if(f!==g)clipped=clip(clipped,p=>g(p)-f(p));if(clipped.length<3)break;}if(clipped.length<3)continue;const points=clipped.map(p=>[...world(p),f(p)]);poly(points,roofMaterial,part.focus?(part.roofTint||[1,1,1]):[1,1,1],part.focus?clipped.map(detailUV):points.map(roofUV));
  for(const patch of part.patches.filter(p=>p.side==='roof')){
   if(f!==planes[0]||axis!==1)continue;
   const span=patch.span||[0,1],width=hi[0]-lo[0],a=lo[0]+width*span[0],b=lo[0]+width*span[1],mid=(lo[1]+hi[1])/2;
   const surface=clip(clip(clipped,p=>p[0]-a),p=>b-p[0]);if(surface.length<3)continue;
   poly(surface.map(p=>[...world(p),f(p)+.016]),2+patch.atlas,[1,1,1],surface.map(p=>[patch.uv[0]+(p[0]-a)/(b-a)*patch.uv[2],patch.uv[1]+(mid-p[1])/(mid-lo[1])*patch.uv[3]]));paintedPatches.set(patch.id,(paintedPatches.get(patch.id)||0)+surface.length-2);
  }
 }}
 // Exterior OSM walls with ridge intersections, then per-surface photo patches.
 for(let i=0;i<ring.length;i++){
  if(part.openStructure)continue;
  const a=ring[i],b=ring[(i+1)%ring.length];const ts=[0,1];
  if(part.roofSections){for(const s of part.roofSections)if((a[0]-s.to)*(b[0]-s.to)<0)ts.push((s.to-a[0])/(b[0]-a[0]));const mid=(lo[1]+hi[1])/2;if((a[1]-mid)*(b[1]-mid)<0)ts.push((mid-a[1])/(b[1]-a[1]));}
  if(cut!==null&&(a[1]-cut)*(b[1]-cut)<0)ts.push((cut-a[1])/(b[1]-a[1]));
  if(part.roofEnd!==undefined&&(a[axis]-roofHi)*(b[axis]-roofHi)<0)ts.push((roofHi-a[axis])/(b[axis]-a[axis]));
  if(part.rearRoof){const mid=(roofHi+hi[axis])/2;if((a[axis]-mid)*(b[axis]-mid)<0)ts.push((mid-a[axis])/(b[axis]-a[axis]));}
  for(let j=0;j<planes.length;j++)for(let k=j+1;k<planes.length;k++){const fa=planes[j](a)-planes[k](a),fb=planes[j](b)-planes[k](b);if(fa*fb<0)ts.push(fa/(fa-fb));}
  ts.sort((a,b)=>a-b);
  for(let j=0;j<ts.length-1;j++){
   const aa=mix(a,b,ts[j]),bb=mix(a,b,ts[j+1]),flat=cut!==null&&(aa[1]+bb[1])/2<cut-1e-6,section=sectionAt((aa[0]+bb[0])/2),h=q=>section?sectionHeight(section,q):height(q),wall=[[...aa,0],[...bb,0],[...bb,flat?e:h(bb)],[...aa,flat?e:h(aa)]];
   for(const face of part.focus?cutOpenings(wall,part):[wall])poly(face.map(p=>[...world(p),p[2]]),wallMaterial,color);
   for(const patch of part.patches){
    if(['roof','dormer'].includes(patch.side))continue;
    const side=patch.side,dimension=side==='front'?0:1,depth=side==='front'?1:0;
    const edge=side==='front'?lo[1]+(patch.depth||0):side==='left'?lo[0]:hi[0];
    const tolerance=part.focus?.65:.42;if(Math.abs(aa[depth]-edge)>tolerance||Math.abs(bb[depth]-edge)>tolerance)continue;
    const extent=part.focus&&part.surfaceBounds?.[side]&&!(patch.depth>0)?part.surfaceBounds[side]:[lo[dimension],hi[dimension]];
    const span=patch.span||[0,1],range=extent[1]-extent[0],start=extent[0]+range*span[0],end=extent[0]+range*span[1],bottom=patch.bottom,top=patch.height||e;
    let face=clip(clip(clip(clip(wall,p=>p[dimension]-start),p=>end-p[dimension]),p=>p[2]-bottom),p=>top-p[2]);if(face.length<3)continue;
    const offset=part.focus?.024+part.patches.indexOf(patch)*.006:.018;
    const bump=side==='front'?mul(v,-offset):mul(u,side==='left'?-offset:offset);
    const uv=face.map(p=>{let s=(p[dimension]-start)/(end-start);if(part.focus&&side==='left')s=1-s;return [patch.uv[0]+s*patch.uv[2],patch.uv[1]+(top-p[2])/(top-bottom)*patch.uv[3]];});
    poly(face.map(p=>[...add(world(p),bump),p[2]]),(part.focus?DETAIL_PHOTO:2)+patch.atlas,part.focus?color:[1,1,1],uv);
    paintedPatches.set(patch.id,(paintedPatches.get(patch.id)||0)+face.length-2);
   }
  }
 }
 if(cut!==null){
  // The roof starts behind the flat extension; its gable is a separate wall.
  const xs=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a[1]-cut)*(b[1]-cut)<=0&&Math.abs(a[1]-b[1])>1e-6)xs.push(mix(a,b,(cut-a[1])/(b[1]-a[1]))[0]);}
  if(xs.length>=2){const a=Math.min(...xs),b=Math.max(...xs),mid=(lo[0]+hi[0])/2;poly([[...world([a,cut]),e],[...world([b,cut]),e],[...world([b,cut]),height([b,cut])],[...world([mid,cut]),height([mid,cut])],[...world([a,cut]),height([a,cut])]],wallMaterial,color);}
 }
 activePart=null;
 // A narrow gutter follows the real street-facing edge. It is a small estimated detail.
 if(!part.openStructure&&!part.roofSections){
  if(part.focus){
   for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    if(Math.abs(a[1]-lo[1])>.65||Math.abs(b[1]-lo[1])>.65||len(sub(a,b))<.3)continue;
    const aa=world(a),bb=world(b);beam([...aa,e+.03],[...bb,e+.03],.105,rgb('#626461'));
    objects.push({type:'supported-gutter',part:part.id,start:aa,end:bb});
   }
  }else{const a=world([lo[0],lo[1]]),b=world([hi[0],lo[1]]);beam([...a,e+.03],[...b,e+.03],.105,rgb('#626461'));}
 }
 if(part.focus&&!part.openStructure&&!part.roofSections&&![112,115].includes(part.id)){const extent=part.surfaceBounds.front||[lo[0],hi[0]];for(const x of [extent[0]+.14,extent[1]-.14]){const q=world([x,lo[1]-.09]);beam([...q,.20],[...q,e-.03],.065,rgb('#787d76'));}}
 if(part.focus && r>.1 && part.roof!=='lean-to'&&!part.roofSections){
  const mid=(roofLo+roofHi)/2,intersections=[];
  for(let j=0;j<ring.length;j++){const a=ring[j],b=ring[(j+1)%ring.length];if((a[axis]-mid)*(b[axis]-mid)<=0&&Math.abs(a[axis]-b[axis])>1e-6)intersections.push(mix(a,b,(mid-a[axis])/(b[axis]-a[axis])));}
  intersections.sort((a,b)=>a[1-axis]-b[1-axis]);
  if(intersections.length>=2){let aa=intersections[0],bb=intersections.at(-1);if(cut!==null){aa[1]=Math.max(aa[1],cut);bb[1]=Math.max(bb[1],cut);}beam([...world(aa),e+r+.05],[...world(bb),e+r+.05],.14,rgb('#71685e'));}
  // Rake trims follow actual exterior edges, including L-shaped extensions.
  // A bounding-box triangle would leave unsupported bars above recessed roofs.
  if(axis===1)for(let j=0;j<ring.length;j++){
   const a=ring[j],b=ring[(j+1)%ring.length];if(Math.abs(a[0]-b[0])>.35||Math.abs(a[1]-b[1])<.3)continue;
   const splits=[0,1];for(const yy of [(lo[1]+roofHi)/2,roofHi,...(part.rearRoof?[(roofHi+hi[1])/2]:[])])if((a[1]-yy)*(b[1]-yy)<0)splits.push((yy-a[1])/(b[1]-a[1]));
   splits.sort((x,y)=>x-y);for(let k=0;k<splits.length-1;k++){const aa=mix(a,b,splits[k]),bb=mix(a,b,splits[k+1]);beam([...world(aa),height(aa)+.02],[...world(bb),height(bb)+.02],.085,rgb('#b4afa0'));}
  }
 }
 if(part.roofSections)for(const s of part.roofSections){
  const y=(lo[1]+hi[1])/2;
  beam([...world([s.from,y]),s.eaves+s.rise+.035],[...world([s.to,y]),s.eaves+s.rise+.035],.12,rgb('#786f61'));
  // Gutters and downpipes use actual façade-edge segments inside this section.
  for(let j=0;j<ring.length;j++){
   const a=ring[j],b=ring[(j+1)%ring.length];if(Math.abs(a[1]-lo[1])>.65||Math.abs(b[1]-lo[1])>.65||Math.abs(a[0]-b[0])<.1)continue;
   const min=Math.max(Math.min(a[0],b[0]),s.from),max=Math.min(Math.max(a[0],b[0]),s.to);if(max<=min)continue;
   const aa=mix(a,b,(min-a[0])/(b[0]-a[0])),bb=mix(a,b,(max-a[0])/(b[0]-a[0]));
   beam([...world(aa),s.eaves+.03],[...world(bb),s.eaves+.03],.10,rgb('#686e64'));objects.push({type:'supported-gutter',part:part.id,start:world(aa),end:world(bb)});
   if(!survey.roundabout?.parts.includes(part.id)||min<Math.max(s.from,part.surfaceBounds.front[0])+.18){const q=world([min+.10,aa[1]-.08]);beam([...q,.15],[...q,s.eaves-.02],.06,rgb('#747d71'));}
  }
 }
 part.roofHeight=height;part.roofAxis=axis;part.world=world;
 objects.push({id:part.osm_id,type:'building',group:part.group,height:e+r});
}
activePart=null;

// Front boundary features follow each group's road-facing orientation. Positions
// and dimensions are visual estimates, recorded separately from OSM footprints.
const GROUPS=new Map(survey.groups.map(g=>[g.id,g]));
for(const fence of survey.fences){
 const group=GROUPS.get(fence.group),c=group.center,u=group.u,v=group.v;
 if(group.parts.includes(112))continue; // The end garden has its own surveyed layout.
 if(survey.refinements.customFrontages.includes(group.id))continue;
 const detailed=group.parts.some(id=>parts.get(id).focus);
 const vertices=group.parts.flatMap(id=>parts.get(id).ring),coords=vertices.map(p=>[dot(sub(p,c),u),dot(sub(p,c),v)]);
 const min=Math.min(...coords.map(p=>p[0]))-.8,max=Math.max(...coords.map(p=>p[0]))+.8;
 const frontY=Math.min(...coords.map(p=>p[1])),world=x=>add(c,add(mul(u,x),mul(v,detailed?frontBoundary(group,x,frontY,survey.refinements.streetPaths):frontY-Math.min(fence.offset,Math.max(1,Math.abs(frontY))))));
 // Boundary aligned with façade; stop before the frontage's access opening.
 const at=(x,z)=>[...world(x),z],width=max-min,gate=group.parts.includes(114)?1.3:Math.min(3,width*.25),gateCenter=group.parts.includes(114)?.75:min+width*.28,g0=gateCenter-gate/2,g1=gateCenter+gate/2,color=rgb(fence.color);
 if(detailed){
  const depth=Math.min(fence.offset,Math.max(1,Math.abs(Math.min(...coords.map(p=>p[1])))));
  for(const [a,b,mat,col] of [[min,g0,GRASS,[.36,.43,.23]],[g0,g1,PAVERS,[.66,.63,.56]],[g1,max,GRASS,[.36,.43,.23]]]){
   const aa=world(a),bb=world(b);landscape.ground([aa,bb,add(bb,mul(v,depth)),add(aa,mul(v,depth))],mat,col,mat===PAVERS?.050:.025);
  }
 }
 for(const [a,b] of [[min,g0],[g1,max]]){
  const mid=world((a+b)/2);
  box(mid,u,v,b-a,fence.kind==='hedge'?.55:.22,0,.3,rgb('#bbb7a5'));
  if(fence.kind==='hedge'){
   if(detailed)landscape.hedge([world(a),world(b)],fence.height,.82,[.78,.83,.69],`${group.id}-front`);
   else box(mid,u,v,b-a,.72,.3,fence.height,color);continue;}
  if(fence.kind==='screen'){box(mid,u,v,b-a,.1,.3,fence.height,color);for(let z=.42;z<fence.height;z+=.15)beam(at(a,z),at(b,z),.025,rgb('#60675f'));continue;}
  const space=fence.kind==='wood'?.21:fence.kind==='white'?.18:.19;
  if(fence.kind==='rails'){for(let z=.45;z<=fence.height;z+=.29)beam(at(a,z),at(b,z),.075,color);}
  else {for(let x=a+.1;x<b;x+=space)beam(at(x,.28),at(x,fence.height),fence.kind==='bars'?(detailed?.018:.035):.08,color);for(const z of [.45,fence.height-.15])beam(at(a,z),at(b,z),.045,color);}
 }
 for(const x of [min,g0,g1,max])box(world(x),u,v,.3,.33,0,fence.height+.15,rgb('#c6c0a9'));
 if(detailed&&group.parts.includes(112)){
  for(const x of [g0,g1]){
   const c=world(x);box(c,u,v,.44,.44,0,1.8,rgb('#9d8260'),FOCUS_WALL);
   for(let z=.10;z<1.78;z+=.13){const color=z% .39<.14?'#c1a16d':'#8a7050';box(c,u,v,.448,.448,z,z+.025,rgb('#b5aa90'),FOCUS_WALL);for(const sign of [-1,1]){const mid=add(c,mul(v,sign*.226));box(add(mid,mul(u,(Math.round(z/.13)%2?-.10:.10))),u,v,.18,.018,z+.025,z+.12,rgb(color),FOCUS_WALL);}}
   box(c,u,v,.53,.53,1.79,1.87,rgb('#c0ad8a'),FOCUS_WALL);
  }
 }
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
 if(a[0]<-28&&b[0]<-28)continue;
 if(['25','06','07','14'].includes(roadPhotos[i].id)||['25','06','07','14'].includes(roadPhotos[i+1].id))continue;
 for(const sign of [-1,1]){
  const c=add(mix(a,b,.5),mul(v,sign*3.85));box(c,u,v,d,1.25,.005,.125,rgb('#8a8980'));
  beam([...add(a,mul(v,sign*3.2)),.15],[...add(b,mul(v,sign*3.2)),.15],.19,rgb('#b1afa1'));
 }
}
// The simple asphalt surface covers the whole Rue Gerard-de-Nerval.
// Its centreline is OSM geometry, not the positions of panorama cameras.
const streetInventory=JSON.parse(await fs.readFile('scripts/nerval-footprints.json','utf8'));
function ribbon(path,inner,outer,z,material,color,closed=false,skipEntrance=false){
 const pts=closed?path.slice(0,-1):path,offset=(i,w)=>{
  const prev=pts[(i-1+pts.length)%pts.length],cur=pts[i],next=pts[(i+1)%pts.length];
  const d0=!closed&&i===0?norm(sub(next,cur)):norm(sub(cur,prev)),d1=!closed&&i===pts.length-1?d0:norm(sub(next,cur));
  const n0=[-d0[1],d0[0]],n1=[-d1[1],d1[0]],n=norm(add(n0,n1));return add(cur,mul(n,w/Math.max(.5,dot(n,n1))));};
 for(let i=0;i<(closed?pts.length:pts.length-1);i++){
  const j=(i+1)%pts.length,mid=mix(pts[i],pts[j],.5);if(skipEntrance&&mid[0]>-59&&mid[0]<-49)continue;
  const a=offset(i,inner),b=offset(j,inner),c=offset(j,outer),d=offset(i,outer);poly([[...a,z],[...b,z],[...c,z],[...d,z]],material,color);
  if(material===PAVE){poly([[...a,.022],[...b,.022],[...b,z],[...a,z]],FOCUS_WALL,[.68,.67,.60]);}
 }
}
for(const feature of streetInventory.streets){
 const pts=feature.geometry.coordinates.map(toXY),closed=len(sub(pts[0],pts.at(-1)))<.1;
 if(pts.length<2)continue;
 const branch=pts.length===2,width=branch?2.65:closed?2.5:3.1;
 ribbon(pts,-width,width,.021,ROAD,[.43,.44,.425],closed);
 if(closed)poly(pts.slice(0,-1).map(p=>[...p,.021]),ROAD,[.43,.44,.425]);
 objects.push({type:'road-surface',osm_id:feature.properties.osm_id,centerline:feature.geometry.coordinates,widthEstimated:width*2});
 // Curbs and sidewalks remain confined to the photographed end of the street.
 const detailPts=pts.filter(p=>p[0]<=-28);
 // The last three metres are built as a rounded, continuous junction with
 // the footpath; straight sidewalk caps must not block that connection.
 if(!closed&&!branch&&detailPts.length>1&&len(sub(detailPts[0],[-112.734760386425,-117.442600000102]))<.01)detailPts[0]=add(detailPts[0],mul(norm(sub(detailPts[1],detailPts[0])),3));
 if(!branch&&detailPts.length>=2){if(!closed)ribbon(detailPts,width,width+1.25,.14,PAVE,[.57,.57,.535],false,true);ribbon(detailPts,-width,-width-1.25,.14,PAVE,[.57,.57,.535],closed);}
}
// The loop is a turning/parking court around a small planted island, not a
// grass disk filling the entire OSM circle. Geometry follows the aerial view.
const courtCenter=[-64.1,-59.5];
buildRefinedCourtIsland(landscapeContext);
// Main-street side of the corner property's hedge, distinct from its loop frontage.
// The rounded corner hedge is generated with the other garden returns.
const roadColor=rgb('#275545');
const corrected45Lamp=street45Lamp(survey);curvedStreetlamp(landscapeContext,corrected45Lamp.center,corrected45Lamp.arm,{type:'repositioned-streetlamp',reference:'user-nerval-furniture-20260914-3'});
for(const [id,side] of [['05',-1],['06',-1],['08',1],['10',-1],['11',1],['12',-1],['13',1],['14',1],['17',-1]]){
 const index=roadPhotos.findIndex(p=>p.id===id),p=route[index],d=norm(sub(route[Math.min(index+1,route.length-1)],route[Math.max(index-1,0)])),n=[-d[1],d[0]],base=add(p,mul(n,side*4.0));
 beam([...base,.15],[...base,5.2],.10,roadColor);const tip=add(base,mul(n,-side*.85));beam([...base,5.2],[...tip,5.5],.08,roadColor);box(tip,d,n,.35,.65,5.37,5.49,rgb('#a8b4a3'));
}

// Chimneys and dormers only for roofs where those details are visible.
for(const id of [10,14,18,21,34,40,48,54,59,62,70,82,88,93,96,100,104,111,114,117,108,99,83]){
 if(survey.roundabout?.parts.includes(id))continue;
 const p=parts.get(id),[lo,hi]=p.bounds;const q=[lo[0]+(hi[0]-lo[0])*.26,(lo[1]+hi[1])/2],c=add(p.center,add(mul(p.u,q[0]),mul(p.v,q[1]))),z=p.roofHeight(q);
 box(c,p.u,p.v,.5,.5,z-.2,z+1.1,rgb('#bfb9a5'));box(c,p.u,p.v,.62,.62,z+1.08,z+1.2,rgb('#5e605b'));
}
for(const [id,width,offset] of [[10,4,.6],[54,1.45,.44],[24,2.4,.58]]){
 const p=parts.get(id),[lo,hi]=p.bounds;const q=[lo[0]+(hi[0]-lo[0])*offset,lo[1]+(hi[1]-lo[1])*.25],c=add(p.center,add(mul(p.u,q[0]),mul(p.v,q[1]))),z=p.roofHeight(q);
 box(c,p.u,p.v,width,1.45,z-.15,z+1.55,rgb('#d4cebb'));const front=add(c,mul(p.v,-.74));box(front,p.u,p.v,width*.52,.04,z+.05,z+1.30,rgb('#a9b4b0'));
 const roof=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[...add(c,add(mul(p.u,a*(width+.2)/2),mul(p.v,b*.86))),z+1.65]);poly(roof,1,[1,1,1],roof.map(roofUV));
 const patch=p.patches.find(p=>p.side==='dormer');if(patch){const a=add(front,mul(p.u,-width/2)),b=add(front,mul(p.u,width/2)),uv=patch.uv;poly([[...a,z+1.55],[...b,z+1.55],[...b,z-.15],[...a,z-.15]],2+patch.atlas,[1,1,1],[[uv[0],uv[1]],[uv[0]+uv[2],uv[1]],[uv[0]+uv[2],uv[1]+uv[3]],[uv[0],uv[1]+uv[3]]]);paintedPatches.set(patch.id,2);}
}
for(const [id,along,down,width,height,side=-1] of survey.skylights){
 const p=parts.get(id),[lo,hi]=p.bounds,axis=p.roofAxis,mid=(lo[axis]+hi[axis])/2;
 const q=[];q[1-axis]=lo[1-axis]+(hi[1-axis]-lo[1-axis])*along;q[axis]=mid+side*(mid-lo[axis])*down;
 const slope=Math.hypot(1,2*p.rise/(hi[axis]-lo[axis]));
 const quad=(w,h,raise)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const pt=[...q];pt[1-axis]+=a*w/2;pt[axis]+=b*h/(2*slope);return [...p.world(pt),p.roofHeight(pt)+raise];});
 poly(quad(width+.14,height+.14,.045),FOCUS_WALL,[.32,.34,.34]);poly(quad(width,height,.07),FOCUS_WALL,p.id===115?[.39,.46,.47]:[.51,.60,.64]);
 const frame=quad(width,height,.08);for(let i=0;i<4;i++)beam(frame[i],frame[(i+1)%4],.055,rgb(p.id===115?'#646c65':'#c3c4bd'));
}

// Architectural elements inferred from the reference photos. The geometry,
// including reveals and separate shutter leaves, works from every viewpoint.
for(const opening of survey.openings){
 const p=parts.get(opening.part),[lo,hi]=p.bounds,{side,width:w,height:h,bottom:z}=opening;
 if([112,115].includes(p.id)&&opening.kind==='entrance'){objects.push({type:'modelled-opening',kind:'entrance',part:p.id,photo:String(opening.photo).padStart(2,'0'),dimensions:'estimated',visibility:'Véranda vitrée reconstruite séparément'});continue;}
 const q=facadeOpening(p,opening).anchor;
 const center=p.world(q),horizontal=side==='front'?p.u:side==='back'?mul(p.u,-1):side==='left'?mul(p.v,-1):p.v,normal=side==='front'?mul(p.v,-1):side==='back'?p.v:mul(p.u,side==='left'?-1:1);
 const at=(x,y,d=.08)=>[...add(center,add(mul(horizontal,x),mul(normal,d))),z+y];
 const panel=(x0,x1,y0,y1,d,color)=>poly([at(x0,y0,d),at(x1,y0,d),at(x1,y1,d),at(x0,y1,d)],FOCUS_WALL,rgb(color));
 const kind=opening.kind||'window',frame=opening.frame==='wood'?'#544333':opening.frame==='metal'?'#767e7b':kind==='door'?(opening.color||'#726450'):'#e2e3da';
 const corners=[[-w/2,0],[w/2,0],[w/2,h],[-w/2,h]];
 for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];poly([at(...a,-.16),at(...b,-.16),at(...b,.01),at(...a,.01)],FOCUS_WALL,rgb(i===2?'#989990':'#c1c0b5'));}
 panel(-w/2,w/2,0,h,-.145,kind==='garage'||kind==='door'?(opening.color||'#736c5d'):frame);
 if(kind==='garage'){
  if(opening.garageStyle==='panels'){
   for(let row=0;row<4;row++)for(let col=0;col<3;col++){
    const x0=-w/2+.12+col*(w-.16)/3,x1=x0+(w-.16)/3-.09,y0=.12+row*(h-.18)/4,y1=y0+(h-.18)/4-.09;
    panel(x0,x1,y0,y1,-.119,'#bec3b7');panel(x0+.03,x1-.03,y0+.03,y1-.03,-.108,'#d4d7cd');
   }
  }else for(let x=-w/2+.12;x<w/2;x+=.12)beam(at(x,.05,-.10),at(x,h-.05,-.10),.013,rgb('#45433c'));
  if(opening.garageLights)for(let i=0;i<opening.garageLights;i++){const cx=-w/2+(i+.5)*w/opening.garageLights,ww=w/opening.garageLights*.40;panel(cx-ww/2-.035,cx+ww/2+.035,h-.41,h-.13,-.075,'#aaa991');panel(cx-ww/2,cx+ww/2,h-.38,h-.16,-.07,'#53645c');}
  beam(at(-.15,h*.46,-.06),at(.15,h*.46,-.06),.032,rgb('#343b3c'));
 }else if(kind!=='door'||opening.glazed){
  const leaves=opening.leaves||(kind==='door'||opening.awning?1:2),bottom=kind==='door'?h*.35:.075;
  for(let i=0;i<leaves;i++){const a=-w/2+i*w/leaves+.075,b=-w/2+(i+1)*w/leaves-.075;
   if(opening.awning){poly([at(a,bottom,.16),at(b,bottom,.16),at(b,h-.085,-.10),at(a,h-.085,-.10)],FOCUS_WALL,rgb('#a4b4b5'));poly([at(a,bottom,.163),at(a+(b-a)*.52,bottom,.163),at(b,h-.085,-.097),at(a,h-.085,-.097)],FOCUS_WALL,rgb('#c6d1ce'));}
   else if(opening.glassMaterial){poly([at(a,bottom,-.12),at(b,bottom,-.12),at(b,h-.085,-.12),at(a,h-.085,-.12)],HOUSE_GLASS,rgb('#95aaa5'),[[0,0],[1,0],[1,1],[0,1]]);}
   else{panel(a,b,bottom,h-.085,-.12,'#4e6265');panel(a,b,h*.62,h-.085,-.118,'#809493');}
   if(opening.grid)for(let y=bottom+.35;y<h-.2;y+=.38)beam(at(a,y,-.08),at(b,y,-.08),.025,rgb(frame));
  }
  for(let i=1;i<leaves;i++)beam(at(-w/2+i*w/leaves,0,-.075),at(-w/2+i*w/leaves,h,-.075),.065,rgb(frame));
  if(kind==='door')for(const y of [.16,h*.30])beam(at(-w/2+.08,y,-.09),at(w/2-.08,y,-.09),.035,rgb('#483c2d'));
 }
 if(kind==='door'&&opening.woodPanels){
  for(const [y0,y1]of [[.18,.84],[1.00,h-.17]]){panel(-w/2+.13,w/2-.13,y0,y1,-.115,opening.woodPanelColors?.[0]||'#59412e');panel(-w/2+.17,w/2-.17,y0+.04,y1-.04,-.10,opening.woodPanelColors?.[1]||'#876345');}
  for(let x=-w/2+.08;x<w/2;x+=.075)beam(at(x,.06,-.098),at(x,h-.06,-.098),.007,rgb(opening.woodPanelColors?.[0]||'#604832'));
 }
 for(const x of [-w/2,w/2])beam(at(x,0,.015),at(x,h,.015),.085,rgb(frame));
 for(const y of [0,h])beam(at(-w/2,y,.015),at(w/2,y,.015),.085,rgb(frame));
 beam(at(-w/2-.09,-.045,.07),at(w/2+.09,-.045,.07),.10,rgb('#d0cec0'));
 if(kind==='door'||kind==='patio')beam(at(opening.handleOffset??(w/2-.17),h*.44,-.045),at(opening.handleOffset??(w/2-.17),h*.52,-.045),.032,rgb('#c1bba8'));
 if(opening.lintel)beam(at(-w/2-.22,h+.18,.08),at(w/2+.22,h+.18,.08),.16,rgb('#61564c'));
 if(opening.roller){const drop=opening.rollerDrop??.28;panel(-w/2+.03,w/2-.03,h*(1-drop),h,-.035,opening.rollerColor||'#c8ccc3');for(let y=h*(1-drop)+.025;y<h;y+=.05)beam(at(-w/2+.03,y,-.025),at(w/2-.03,y,-.025),.009,rgb('#777e79'));}
 if(opening.shutters){
  const sw=opening.closed?w/2:w*.43,col=({blue:'#3c7e9f',red:'#8c3540',ochre:'#986137',white:'#e3e5d5',slate:'#424f55'})[opening.shutters]||'#574333',brace=({blue:'#285e76',white:'#b8bfad',slate:'#303b40'})[opening.shutters]||'#3a2e27';
  for(const sign of [-1,1]){const a=opening.closed?0:sign*(w/2+.08),b=opening.closed?sign*w/2:sign*(w/2+.08+sw),left=Math.min(a,b),right=Math.max(a,b);
   box(add(center,add(mul(horizontal,(left+right)/2),mul(normal,.075))),horizontal,normal,right-left,.075,z,z+h,rgb(col),FOCUS_WALL);
   if(opening.shutterStyle==='louvres'){for(let y=.04;y<h-.02;y+=.07)beam(at(left+.025,y,.12),at(right-.025,y,.12),.032,rgb(brace));}
   else for(let x=left+.09;x<right;x+=.09)beam(at(x,.025,.101),at(x,h-.025,.101),.009,rgb(brace));
   for(const y of [.16,h-.16])beam(at(left+.035,y,.12),at(right-.035,y,.12),.038,rgb(brace));
   if(opening.shutterStyle!=='louvres'&&!opening.barred)beam(at(left+.035,.16,.12),at(right-.035,h-.16,.12),.038,rgb(brace));
  }
 }
 if(opening.rail){for(let x=-w/2;x<=w/2+.01;x+=.16)beam(at(x,.02,.25),at(x,.68,.25),.016,rgb('#414746'));for(const y of [.04,.68])beam(at(-w/2-.05,y,.25),at(w/2+.05,y,.25),.026,rgb('#414746'));}
 if((p.id===113&&kind==='window')||opening.rack){for(const x of [-.35,.35]){beam(at(x,-.07,.08),at(x,-.30,.32),.023,rgb('#4d5651'));beam(at(x,-.30,.08),at(x,-.30,.32),.023,rgb('#4d5651'));}beam(at(-.35,-.30,.32),at(.35,-.30,.32),.022,rgb('#4d5651'));}
 objects.push({type:'modelled-opening',kind,part:p.id,side,anchor:q,width:w,height:h,bottom:z,...(opening.reference?{reference:opening.reference}:{photo:String(opening.photo).padStart(2,'0')}),dimensions:'estimated',visibility:opening.visibility||'Contours visibles'});
}
function tree(partId,along,height,radius,color){const p=parts.get(partId),[lo,hi]=p.bounds,q=[lo[0]+(hi[0]-lo[0])*along,lo[1]-2],c=add(p.center,add(mul(p.u,q[0]),mul(p.v,q[1])));beam([...c,.1],[...c,height*.75],.18,rgb('#aba38b'));const bands=8,slices=12;for(let j=0;j<bands;j++)for(let k=0;k<slices;k++){const point=(a,b)=>[c[0]+radius*Math.sin(a)*Math.cos(b),c[1]+radius*.8*Math.sin(a)*Math.sin(b),height-radius*1.25+radius*1.25*Math.cos(a)];const a=j/bands*Math.PI,b=k/slices*Math.PI*2,aa=(j+1)/bands*Math.PI,bb=(k+1)/slices*Math.PI*2;poly([point(a,b),point(aa,b),point(aa,bb),point(a,bb)],0,rgb(color));}}
tree(96,.63,8.5,2.5,'#586c3c');tree(93,.25,8,1.1,'#4b5e37');tree(62,.12,4.9,1.8,'#65804a');
// A branched tree with separate crown clusters replaces the flat aerial crown.
function crown(center,radius,tone,seed){
 const bands=7,slices=11,point=(j,k)=>{const a=j/bands*Math.PI,b=k/slices*Math.PI*2,rr=radius*(1+.075*Math.sin(k*13+j*7+seed));return [center[0]+rr*Math.sin(a)*Math.cos(b),center[1]+rr*Math.sin(a)*Math.sin(b),center[2]+rr*.88*Math.cos(a)];};
 for(let j=0;j<bands;j++)for(let k=0;k<slices;k++){const col=mul(tone,.9+.10*(.5+.5*Math.sin(j*7+k*11+seed)));poly([point(j,k),point(j+1,k),point(j+1,k+1),point(j,k+1)],FOCUS_WALL,col);}
}
await buildEndSite({...landscapeContext,crown});
buildGardenDetails({...landscapeContext,crown});
buildNervalRefinements({...landscapeContext,crown});
buildEndCorrections({...landscapeContext,crown});
buildRoundaboutDetails({...landscapeContext,crown});

// Traffic island and signs visible in references 06, 07, 21 and 22.
// Coordinates were read from the aerial reference; pole heights are estimated.
const island=[-8,-44],islandRing=Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2;return [island[0]+Math.cos(a)*2.5,island[1]+Math.sin(a)*2.0];});
poly(islandRing.map(p=>[...p,.19]),0,rgb('#bab3a0'));for(let i=0;i<32;i++)poly([[...islandRing[i],0],[...islandRing[(i+1)%32],0],[...islandRing[(i+1)%32],.19],[...islandRing[i],.19]],0,rgb('#c0bcae'));
function sign(center,direction,kind){const u=[-direction[1],direction[0]],at=(x,z,depth=0)=>[...add(center,add(mul(u,x),mul(direction,depth))),z];beam([...center,0],[...center,2.2],.065,rgb('#aaaead'));
 if(kind==='yield'){const red=[at(-.40,2.55),at(.40,2.55),at(0,1.83)],white=[at(-.30,2.49,.015),at(.30,2.49,.015),at(0,1.96,.015)];poly(red,0,rgb('#b13a38'));poly(white,0,rgb('#f2f0e2'));}
 else {const ring=Array.from({length:24},(_,i)=>at(.32*Math.cos(i/24*Math.PI*2),1.5+.32*Math.sin(i/24*Math.PI*2)));poly(ring,0,rgb('#296fa2'));poly([at(-.2,1.45,.02),at(.07,1.45,.02),at(.07,1.34,.02),at(.24,1.5,.02),at(.07,1.66,.02),at(.07,1.55,.02),at(-.2,1.55,.02)],0,rgb('#f2f1e9'));}}
sign([-9,-43],[.7,.714],'round');sign([9,-45],[-.7,-.714],'yield');sign([-15,-36],[.4,-.916],'yield');sign([-24,-54],[.7,.714],'yield');

const groundCleanup=resolveGroundSurfaces(batches,new Set([ROAD,PAVE,GRASS,PAVERS]));
console.log(JSON.stringify({groundCleanup}));
const ranges=[];let total=0;for(const [material,vertices] of [...batches].sort((a,b)=>a[0]-b[0])){ranges.push({material,first:total/11,count:vertices.length/11});total+=vertices.length;}
const buffer=new Float32Array(total);let offset=0;for(const [material,vertices] of [...batches].sort((a,b)=>a[0]-b[0])){buffer.set(vertices,offset);offset+=vertices.length;}
await fs.writeFile(`${dir}/mesh.bin`,Buffer.from(buffer.buffer));
const groundTexture=3+survey.facadeAtlases;
const materials=[{kind:0},{kind:1,texture:0},...Array.from({length:survey.facadeAtlases},(_,i)=>({kind:1,texture:i+1})),{kind:2},{kind:4,texture:1+survey.facadeAtlases,repeat:true},{kind:5,texture:2+survey.facadeAtlases,repeat:true},{kind:6,texture:groundTexture,repeat:true,mirror:true},{kind:7,texture:groundTexture,repeat:true,mirror:true},{kind:8,texture:groundTexture+1,repeat:true,mirror:true},{kind:9,texture:groundTexture+2,repeat:true,mirror:true},{kind:10},...Array.from({length:survey.facadeAtlases},(_,i)=>({kind:3,texture:i+1}))];
const index={origin:survey.origin,vertexFormat:'float32-le: east_m,north_m,up_m,nx,ny,nz,u,v,r,g,b',stride:44,vertexCount:total/11,ranges,materials,textures:['roofs.webp',...Array.from({length:survey.facadeAtlases},(_,i)=>`facades-${i}.webp`),'tiles-detail.webp','hedge-albedo-v2.webp'],bounds:[Math.min(4.3796,...survey.parts.flatMap(p=>p.ring.map(q=>q[0]/survey.scale[0]+survey.origin[0]))),Math.min(48.94615,...survey.parts.flatMap(p=>p.ring.map(q=>q[1]/survey.scale[1]+survey.origin[1]))),4.383,48.94885],excludeIds:survey.parts.map(p=>p.osm_id),stats:{buildingGroups:survey.groups.length,buildingParts:survey.parts.length,photoPatches:paintedPatches.size,referencePhotos:survey.photos.length,triangles:total/33,frontages:survey.fences.length,refinedParts:survey.focusParts.length,modelledOpenings:survey.openings.length,focusPhotoDecals:0},objects,paintedPatches:[...paintedPatches.keys()],pickTriangles};
index.materials.push({kind:12});
index.textures.push('ground-asphalt-v1.webp','ground-grass-v1.webp','ground-pavers-v1.webp');
await fs.writeFile(`${dir}/index.json`,JSON.stringify(index));
await fs.writeFile(`${dir}/survey.json`,JSON.stringify(survey));
const geojson={type:'FeatureCollection',features:survey.parts.map(p=>({type:'Feature',properties:{part_id:p.id,osm_id:p.osm_id,group:p.group,eaves:p.eaves,height:p.eaves+p.rise,description:p.description,photos:[...new Set([...survey.openings.filter(o=>o.part===p.id&&o.photo!==undefined).map(o=>String(o.photo).padStart(2,'0')),...p.patches.map(q=>String(q.photo).padStart(2,'0')),...p.photos])].join(','),supplementaryReferences:[...new Set(survey.openings.filter(o=>o.part===p.id&&o.reference).map(o=>o.reference))].join(','),textured:p.patches.length>0,confidence:p.focus?(survey.openings.some(o=>o.part===p.id)?'Ouvertures et volets en 3D d’après les clichés ; dimensions estimées':'Volume interprété ; façade peu visible'):(p.patches.some(q=>!['roof','dormer'].includes(q.side))?'Façade observée ; dimensions estimées':'Volume interprété ; façade peu visible')},geometry:{type:'Polygon',coordinates:[[...p.ring,p.ring[0]].map(p=>[p[0]/survey.scale[0]+survey.origin[0],p[1]/survey.scale[1]+survey.origin[1]])]}}))};
await fs.writeFile(`${dir}/buildings.geojson`,JSON.stringify(geojson));
console.log(JSON.stringify({...index.stats,meshBytes:buffer.byteLength}));
console.log(JSON.stringify(await applyNervalCatalogue({root:'dist'}),(_key,value)=>_key==='manifest'?value.length:value));
