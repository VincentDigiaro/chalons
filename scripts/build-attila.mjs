import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import earcut from 'earcut';
import {observations} from './attila-survey.mjs';
import {cornerEntrance,buildAttilaStreets} from './attila-entrance-road.mjs';
import {meshTools,add,sub,mul,dot,len,norm,mix,rgb,clip} from './attila-geometry.mjs';

const out='dist/data/attila',origin=[4.3728,48.9651],scale=[111320*Math.cos(origin[1]*Math.PI/180),111320];
const local=p=>p.map((v,i)=>(v-origin[i])*scale[i]),lngLat=p=>p.map((v,i)=>v/scale[i]+origin[i]);
const source=JSON.parse(await fs.readFile('artifacts/attila/footprints-area.geojson','utf8'));
const mesh=meshTools(),{poly,box,beam,crown}=mesh,parts=[],openings=[],roofAreas=[],details=[];
const streetU=norm([.88,.475]),streetV=[-streetU[1],streetU[0]],white=rgb('#e9e7df'),metal=rgb('#646c68'),dark=rgb('#253534');
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0]},0))/2;
await fs.mkdir(out,{recursive:true});
// These are neutral material swatches, never flattened Street View photographs.
const textures=['tiles-detail.webp','hedge-albedo-v2.webp','ground-asphalt-v1.webp','ground-grass-v1.webp'];
for(const file of textures)await fs.copyFile('dist/data/nerval/'+file,out+'/'+file);
const materials=[{name:'Enduit',kind:2},{name:'Tuiles',kind:4,texture:0,repeat:true},{name:'Végétation',kind:5,texture:1,repeat:true},{name:'Vitrage en retrait',kind:12},{name:'Chaussée · enrobé',kind:14,texture:2,repeat:true},{name:'Trottoir · enrobé clair',kind:15,texture:2,repeat:true},{name:'Jardin',kind:16,texture:3,repeat:true},{name:'Grillage',kind:10},{name:'Menuiserie',kind:2}];

function railing(a,b,z0,z1,col=metal,spacing=.15){beam([...a,z0],[...b,z0],.04,col,8);beam([...a,z1],[...b,z1],.045,col,8);const n=Math.ceil(len(sub(b,a))/spacing);for(let i=0;i<=n;i++){const p=mix(a,b,i/n);beam([...p,z0],[...p,z1],.024,col,8);}}
function fence(a,b,height=1.15,col=metal,base=.32){const d=norm(sub(b,a)),v=[-d[1],d[0]],l=len(sub(b,a));if(base)box(mix(a,b,.5),d,v,l,.22,0,base,rgb('#b5ad9b'));railing(a,b,base+.06,height,col,.17);for(let i=0;i<=Math.ceil(l/3);i++)box(mix(a,b,i/Math.ceil(l/3)),d,v,.22,.25,0,height+.12,rgb('#d2cbbb'));}
function hedge(a,b,h=1.3,w=.7){const u=norm(sub(b,a)),v=[-u[1],u[0]];box(mix(a,b,.5),u,v,len(sub(b,a)),w,.05,h,rgb('#6c8550'),2);}
function tree(p,r=2.1,h=5.5,seed=0){beam([...p,0],[...p,h-1],.22,rgb('#72634c'));crown([...p,h],r,rgb('#76915b'),seed);crown([...add(p,[r*.4,0]),h-.5],r*.8,rgb('#68864e'),seed+1);}

for(const o of observations){
 const f=source.features.find(f=>f.properties.survey_id===o.id),ring=f.geometry.coordinates[0].slice(0,-1).map(local);
 // Align each house to its actual surveyed footprint, keeping every OSM vertex.
 let u=streetU,best=0;for(let i=0;i<ring.length;i++){let d=sub(ring[(i+1)%ring.length],ring[i]);if(len(d)<1)continue;d=norm(d);const score=Math.abs(dot(d,streetU));if(score>best){best=score;u=dot(d,streetU)<0?mul(d,-1):d;}}
 const v=[-u[1],u[0]],xy=ring.map(p=>[dot(p,u),dot(p,v)]),lo=[Math.min(...xy.map(p=>p[0])),Math.min(...xy.map(p=>p[1]))],hi=[Math.max(...xy.map(p=>p[0])),Math.max(...xy.map(p=>p[1]))],w=hi[0]-lo[0],d=hi[1]-lo[1],mid=mix(lo,hi,.5),world=(x,y,z)=>[...add(mul(u,x),mul(v,y)),z],P=(x,y)=>world(x,y,0).slice(0,2),frontY=o.front>0?hi[1]:lo[1],backY=o.front>0?lo[1]:hi[1];
 mesh.setPart(o.id);
 const color=rgb(o.color),roofColor=rgb(o.type==='red-gable'||o.type==='steps-house'?'#a3977c':'#f6c5ad');
 const planes=[];let compound=false;
 if(o.roof==='flat')planes.push([0,0,o.rise]);
 else if(o.roof==='lean')planes.push([0,o.rise/d,-lo[1]*o.rise/d]);
 else if(o.roof==='cross'||o.roof==='paired'){planes.push([2*o.rise/w,0,-2*o.rise/w*lo[0]],[-2*o.rise/w,0,2*o.rise/w*hi[0]]);}
 else {planes.push([0,2*o.rise/d,-2*o.rise/d*lo[1]],[0,-2*o.rise/d,2*o.rise/d*hi[1]]);
  if(o.roof==='hip'){const run=Math.min(w/2,d/2);planes.push([o.rise/run,0,-o.rise/run*lo[0]],[-o.rise/run,0,o.rise/run*hi[0]]);}
  if(o.roof==='front-gable'){const a=lo[0]+w*o.gableFrom,b=lo[0]+w*o.gableTo;planes.push([2*o.rise/(b-a),0,-2*o.rise/(b-a)*a],[-2*o.rise/(b-a),0,2*o.rise/(b-a)*b]);compound=true;}
 }
 const value=(p,q)=>p[0]*q[0]+p[1]*q[1]+p[2],rh=q=>o.eaves+(compound?Math.max(Math.min(...planes.slice(0,2).map(p=>value(p,q))),Math.min(...planes.slice(2).map(p=>value(p,q)))):Math.min(...planes.map(p=>value(p,q))));
 const splitLines=[];for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++)splitLines.push(planes[i].map((x,k)=>x-planes[j][k]));
 const ix=earcut(xy.flat());let covered=0;
 for(let i=0;i<ix.length;i+=3){let cells=[ix.slice(i,i+3).map(j=>xy[j])];for(const line of splitLines){if(Math.hypot(line[0],line[1])<1e-8)continue;cells=cells.flatMap(cell=>[clip(cell,q=>value(line,q)),clip(cell,q=>-value(line,q))].filter(p=>p.length>=3&&area(p)>1e-7));}
  for(const cell of cells){covered+=area(cell);poly(cell.map(q=>world(...q,rh(q))),1,roofColor,cell.map(q=>[q[0]/1.3,q[1]/1.3]),true);}
 }
 roofAreas.push({id:o.id,footprint:area(xy),roofProjected:covered});
 function specification(rear=false){const a=[],win=(x,z,ww=1.2,hh=1.35,shutter=null,closed=false)=>a.push({x:lo[0]+x*w,z,w:ww,h:hh,shutter,closed,kind:'window'}),door=(x,z=.15,ww=.9,hh=2.1,c='#d8d9cc')=>a.push({x:lo[0]+x*w,z,w:ww,h:hh,kind:'door',color:c});
  if(rear){if(o.type==='simple'||o.type==='garage')return a;
   if(o.type==='terrace'){const narrow=o.address==='76';win(.23,1.15,narrow?.7:1.2,1.25);win(.77,1.1,1.1,1.35);win(.23,4.4,narrow?.65:1.1,1.35);win(.75,4.4,1.1,1.35);door(.5,.15,.8,2.05,'#d6d6cb');if(o.address==='78')win(.52,2.65,.8,.5);return a;}
   win(.25,1,1.05,1.1);win(.75,1,1.1,1.1);if(o.eaves>5){win(.25,4.4,1.1,1.35);win(.75,4.4,1.1,1.35);}door(.52,.15,.75,2,'#c4cdc1');return a;}
  switch(o.type){
   case 'terrace':if(o.id===3){win(.23,1.06,1.20,1.46,null,true);door(.72,.48,.94,2.13,'#424941');win(.55,1.37,.31,1.18);win(.88,1.34,.50,1.25);win(.23,4.10,1.24,1.65,null,true);for(const x of [.55,.715,.88])win(x,4.34,.37,1.43);break;}win(.25,1.1,1.35,1.45,null,o.address!=='72');door(.72,.18,.85,2.12,o.address==='76'?'#3a4c69':'#d0d2c6');win(.57,1.2,.34,1.45);win(.87,1.2,.34,1.45);win(.25,4.35,1.2,1.4,null,o.address!=='72');for(const x of [.57,.72,.87])win(x,4.35,.37,1.5);break;
   case 'raised':for(const x of [.18,.45,.72]){win(x,2.2,1.2,1.35,'#98502d');win(x,.45,.85,.48);}win(.92,2.4,.55,.8);break;
   case 'ornate':for(const x of [.26,.73])win(x,4.8,1.25,1.8);win(.26,.9,1.25,2);door(.73,.1,1,2.8,'#8d8e6a');break;
   case 'garage-upper':door(.5,.06,w*.8,2.6,'#c2c5b8');win(.52,4.1,1.4,1.8);break;
   case 'steps-house':door(.14,1.3,.95,2,'#775542');for(const x of [.44,.7,.9])win(x,1.8,1.05,1.5,'#7c543b');door(.63,.1,1.1,1.2,'#785735');break;
   case 'red-gable':win(.085,.65,.45,1);door(.25,.12,.9,2.2,'#9b3835');win(.17,4.2,1.25,1.4,'#83302d');win(.69,.85,1.25,1.85,'#983e3a',true);win(.69,4.2,1.25,1.85,'#983e3a',true);break;
   case 'stone-gable':door(.25,.15,.95,2.15,'#926e42');win(.28,3.6,.55,1.45);win(.73,3.7,1.25,1.45,null,true);win(.72,.75,1.65,1.4,null,true);break;
   case 'green':win(.27,4.3,2.05,1.55,'#617b6d');win(.79,4.3,1.25,1.55,'#617b6d',true);door(.15,.15,.8,2.15);win(.41,.85,1.4,1.5);win(.79,.85,1.25,1.5);break;
   case 'burgundy':win(.25,4.35,1.25,1.5);win(.73,4.35,1.25,1.5);door(.23,.15,.95,2.1,'#986e49');win(.73,.9,1.55,1.5);break;
   case 'timber-gable':win(.285,4.3,1.35,1.6);win(.285,1,1.35,1.5);break;
   case 'white-shutters':for(const x of [.2,.51,.82]){win(x,3.5,1.3,1.35,'#ddded4',true);win(x,.7,1.3,1.35);}break;
   case 'paired':door(o.address==='92'?.23:.77,.14,.95,2.2);win(o.address==='92'?.7:.3,1,1.35,1.4);win(o.address==='92'?.7:.3,3.8,1.15,1.3,null,true);win(o.address==='92'?.22:.78,4.3,.42,.58);break;
   case 'garage':door(.5,.06,w*.76,2.4,'#d5d6cb');break;
  }return a;
 }
 const specs=[specification(),specification(true)];
 // Join almost straight wall runs so an OSM intermediate node cannot erase a garage door.
 const wallRing=ring.map(p=>[...p]);let changed=true;
 while(changed&&wallRing.length>3){changed=false;for(let i=0;i<wallRing.length;i++){const a=wallRing[(i+wallRing.length-1)%wallRing.length],b=wallRing[i],c=wallRing[(i+1)%wallRing.length],ac=sub(c,a),ab=sub(b,a),t=dot(ab,ac)/dot(ac,ac);if(t>0&&t<1&&len(sub(ab,mul(ac,t)))<.08){wallRing.splice(i,1);changed=true;break;}}}
 for(let i=0;i<wallRing.length;i++){
  const a=wallRing[i],b=wallRing[(i+1)%wallRing.length],delta=sub(b,a),l=len(delta);if(l<.01)continue;const t=norm(delta),normal=[t[1],-t[0]];const signed=ring.reduce((s,a,j)=>{const b=ring[(j+1)%ring.length];return s+a[0]*b[1]-a[1]*b[0]},0);if(signed<0){normal[0]*=-1;normal[1]*=-1;}
  const isFront=dot(normal,mul(v,o.front))>.88,isRear=dot(normal,mul(v,-o.front))>.88,oa=[dot(a,u),dot(a,v)],ob=[dot(b,u),dot(b,v)];
  const candidates=isFront?specs[0]:isRear?specs[1]:[],os=[];
  for(const spec of candidates){const fraction=(spec.x-oa[0])/(ob[0]-oa[0]),center=fraction*l;if(center-spec.w/2<.12||center+spec.w/2>l-.12||spec.z+spec.h>o.eaves-.2)continue;os.push({...spec,s:center});}
  const point=(s,z,inset=0)=>[...add(add(a,mul(t,s)),mul(normal,-inset)),z];
  const xs=[0,l,...os.flatMap(s=>[s.s-s.w/2,s.s+s.w/2])].sort((a,b)=>a-b),zs=[0,o.eaves,...os.flatMap(s=>[s.z,s.z+s.h])].sort((a,b)=>a-b);
  for(let x=0;x<xs.length-1;x++)for(let z=0;z<zs.length-1;z++){if(os.some(s=>(xs[x]+xs[x+1])/2>s.s-s.w/2&&(xs[x]+xs[x+1])/2<s.s+s.w/2&&(zs[z]+zs[z+1])/2>s.z&&(zs[z]+zs[z+1])/2<s.z+s.h))continue;poly([point(xs[x],zs[z]),point(xs[x+1],zs[z]),point(xs[x+1],zs[z+1]),point(xs[x],zs[z+1])],0,color,undefined,true);}
  // Split gable edges at every change of roof slope, avoiding a flat cap.
  const stops=[0,1];for(const line of splitLines){const av=value(line,oa),bv=value(line,ob);if(av*bv<0)stops.push(av/(av-bv));}stops.sort((a,b)=>a-b);
  for(let j=0;j<stops.length-1;j++){const ta=stops[j],tb=stops[j+1];poly([point(ta*l,o.eaves),point(tb*l,o.eaves),point(tb*l,rh(mix(oa,ob,tb))),point(ta*l,rh(mix(oa,ob,ta)))],0,color,undefined,true);beam(point(ta*l,rh(mix(oa,ob,ta))+.02,-.10),point(tb*l,rh(mix(oa,ob,tb))+.02,-.10),.14,white,8);}
  if(isFront||isRear){beam(point(0,o.eaves,-.14),point(l,o.eaves,-.14),.095,metal,8);if(l>3)beam(point(l-.15,.1,-.09),point(l-.15,o.eaves,-.09),.075,metal,8);beam(point(0,.28,-.025),point(l,.28,-.025),.17,rgb('#adaca0'));}
  for(const s of os){
   const x0=s.s-s.w/2,x1=s.s+s.w/2,z0=s.z,z1=s.z+s.h,depth=o.id===3&&isFront?.24:.14;
   poly([point(x0,z0,depth),point(x1,z0,depth),point(x1,z1,depth),point(x0,z1,depth)],s.kind==='door'?8:3,s.kind==='door'?rgb(s.color):rgb('#8caaaa'),[[0,0],[1,0],[1,1],[0,1]]);
   for(const [sa,za,sb,zb]of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]]){poly([point(sa,za),point(sb,zb),point(sb,zb,depth),point(sa,za,depth)],0,mul(color,.7));beam(point(sa,za,o.id===3&&isFront?depth-.035:-.035),point(sb,zb,o.id===3&&isFront?depth-.035:-.035),o.type==='ornate'?.17:o.id===3?.045:.075,white,8);}
   beam(point(x0-.1,z0,-.11),point(x1+.1,z0,-.11),.11,rgb('#dcd7c8'),8);
   if(s.kind==='window'&&!s.closed&&s.w>.7){beam(point(s.s,z0,depth-.02),point(s.s,z1,depth-.02),.04,white,8);}
   if(s.kind==='door'&&o.id===3&&isFront){const col=rgb('#636a60');for(const z of [z0+.17,z0+1.57,z0+1.74,z0+1.92])beam(point(x0+.10,z,depth-.022),point(x1-.10,z,depth-.022),.022,col,8);for(const x of [x0+.10,x1-.10])beam(point(x,z0+.17,depth-.022),point(x,z0+1.57,depth-.022),.022,col,8);}
   if(s.kind==='door'){beam(point(x1-.15,z0+.95,depth-.05),point(x1-.15,z0+1.1,depth-.05),.035,metal);if(s.h>2.2)for(let k=1;k<5;k++)beam(point(x0+.08,z0+k*s.h/5,depth-.025),point(x1-.08,z0+k*s.h/5,depth-.025),.018,mul(rgb(s.color),.8));}
   if(s.closed||s.shutter){const col=rgb(s.shutter||'#c5c7bd');const boards=s.closed?[[x0,x1]]:[[x0-s.w*.43,x0-.03],[x1+.03,x1+s.w*.43]];for(const [a,b]of boards){poly([point(a,z0,-.07),point(b,z0,-.07),point(b,z1,-.07),point(a,z1,-.07)],8,col);for(let z=z0+.08;z<z1;z+=.085)beam(point(a,z,-.085),point(b,z,-.085),.014,mul(col,.78),8);}}
   if(['ornate','red-gable','burgundy','timber-gable'].includes(o.type)&&s.kind==='window'&&s.z>2.5){railing(point(x0-.1,z0,-.27).slice(0,2),point(x1+.1,z0,-.27).slice(0,2),z0,z0+.43,o.type==='ornate'?dark:rgb('#8a4240'),.12);}
   if(o.type==='ornate'){for(const z of [z0-.15,z1+.12])beam(point(x0-.15,z,-.05),point(x1+.15,z,-.05),.13,rgb('#b8ac8d'));}
   openings.push({part:o.id,side:isFront?'street':'rear',kind:s.kind,center:point(s.s,s.z+s.h/2),width:s.w,height:s.h,depth,observation:isRear&&o.type!=='terrace'?'inferred':o.confidence||'observed'});
  }
  if(o.type==='stone-gable'&&isFront){for(let z=.45;z<2.45;z+=.32)for(let x=(Math.round(z*3)%2)*.33;x<l;x+=.7){if(os.some(s=>Math.abs(x-s.s)<s.w/2+.35&&z>s.z-.2&&z<s.z+s.h+.2))continue;beam(point(x,z,-.035),point(Math.min(x+.64,l),z,-.035),.035,rgb('#928a73'));}}
 }
 // Chimneys, caps and a modeled rear roof light on each terraced house.
 if(o.eaves>3.5&&o.type!=='garage'){const c=[lo[0]+w*.18,mid[1]],z=rh(c);box(P(...c),u,v,.42,.48,z-.2,z+.9,rgb('#b8afa0'));box(P(...c),u,v,.58,.61,z+.87,z+1.02,rgb('#817e70'));}
 if(o.type==='terrace'){const c=[mid[0],mid[1]-d*.26],qs=[[c[0]-.32,c[1]-.35],[c[0]+.32,c[1]-.35],[c[0]+.32,c[1]+.35],[c[0]-.32,c[1]+.35]].map(q=>world(...q,rh(q)+.045));poly(qs,3,rgb('#658791'),[[0,0],[1,0],[1,1],[0,1]]);for(let i=0;i<4;i++)beam(qs[i],qs[(i+1)%4],.08,metal);}
 if(o.type==='ornate'){for(const h of [3.5,7.25])beam(world(lo[0],frontY-.08,h),world(hi[0],frontY-.08,h),.17,rgb('#c4b99b'));}
 if(o.type==='timber-gable'){const y=frontY-.12;beam(world(mid[0],y,o.eaves),world(mid[0],y,o.eaves+o.rise),.15,white);beam(world(lo[0],y,o.eaves),world(hi[0],y,o.eaves),.15,white);}
 if(o.type==='steps-house'){const x=lo[0]+w*.14,y=frontY-.2;for(let k=0;k<8;k++)box(P(x,y-2.7+k*.34),u,v,1.05,.36,0,.16*(k+1),rgb('#aca897'));railing(P(x-.6,y-2.7),P(x-.6,y-.05),.95,2.2,white,.22);}
 if(o.id===3)cornerEntrance({mesh,o,u,v,lo,hi,frontY,P,details});
 parts.push({...o,refs:o.id===3?[...o.refs,'user-20260914-corner-house-reference']:o.refs,osmId:f.properties.osm_id,footprint:f.geometry.coordinates[0],center:lngLat(P(...mid)),dimensions:{width:w,depth:d,eaves:o.eaves,ridge:o.eaves+o.rise},frame:{u,v,lo,hi},roofArea:covered});
}

mesh.setPart(null);
// Public street and rear-garden layout, measured approximately against IGN.
const {roadU,roadV,roadA,roadB,junction,W}=buildAttilaStreets({mesh,local,parts,details});
for(const p of parts){const {u,v,lo,hi}=p.frame,w=hi[0]-lo[0],mid=mix(lo,hi,.5),P=(x,y)=>add(mul(u,x),mul(v,y)),frontY=p.front>0?hi[1]:lo[1];
 if(p.type==='terrace'){
  const by=lo[1]-14;box(P(mid[0],lo[1]-7),u,v,w-.15,14,.01,.055,rgb('#6d8057'),6);box(P(mid[0]+w*.25,lo[1]-6.5),u,v,1.1,13,.06,.09,rgb('#a5a191'),5);
  hedge(P(lo[0],lo[1]-.2),P(lo[0],by),1.55,.45);fence(P(lo[0],by),P(hi[0],by),1.35,rgb('#858d7f'),.2);
  if(p.address==='78')fence(P(hi[0],lo[1]),P(hi[0],by),1.75,rgb('#b5b5a6'),1.55);
  if(p.address==='74'||p.address==='72')tree(P(mid[0]-w*.18,lo[1]-9),1.9,4.5,p.id);
  if(p.address==='72'){const c=P(mid[0]-.3,lo[1]-12.1),points=Array.from({length:32},(_,k)=>add(c,[1.45*Math.cos(k*Math.PI/16),1.45*Math.sin(k*Math.PI/16)]));poly(points.map(q=>[...q,.88]),8,rgb('#53a8bd'));for(let i=0;i<32;i++){const a=points[i],b=points[(i+1)%32];poly([[...a,.08],[...b,.08],[...b,1],[...a,1]],8,rgb('#3e85a9'));beam([...a,1],[...b,1],.06,white);}}
  if(p.id===3)continue;
  const fy=frontY+1.7;box(P(mid[0],frontY+.8),u,v,w,1.6,0,.07,rgb('#7d8963'),6);hedge(P(lo[0],fy),P(mid[0],fy),.85,.35);fence(P(mid[0]+.3,fy),P(hi[0]-.2,fy),1,rgb(p.address==='76'?'#648064':'#a2a794'),.25);
 }
 if(['stone-gable','green','burgundy','timber-gable','paired','raised'].includes(p.type)){const inset=p.context?9:p.type==='raised'?3:1.65,fy=frontY+p.front*inset;box(P(mid[0],frontY+p.front*inset/2),u,v,w,inset,0,.05,rgb('#768362'),6);const gate=1.4;fence(P(lo[0],fy),P(mid[0]-gate/2,fy),1.18,rgb(p.type==='burgundy'?'#844643':'#687c72'),.35);fence(P(mid[0]+gate/2,fy),P(hi[0],fy),1.18,rgb('#697d72'),.35);railing(P(mid[0]-gate/2,fy),P(mid[0]+gate/2,fy),.12,1.25,rgb(p.type==='raised'?'#935f60':'#526d62'));
  if(p.context){tree(P(lo[0]+1.6,fy-p.front*3),1.5,3.1,p.id);hedge(P(hi[0]-.5,frontY),P(hi[0]-.5,fy),1.6,.7);}
 }
}
for(const [p,r,h]of [[[4.37269,48.965101],2.4,5.6],[[4.37244,48.965023],2.3,5.6]])tree(local(p),r,h,21);
for(const station of [-31,16]){const p=W(station,4.9);details.push({type:'streetlamp',center:p,sidewalk:true});beam([...p,.1],[...p,6.7],.10,rgb('#675b49'));beam([...p,6.6],[...add(p,mul(roadV,-1)),7],.10,rgb('#675b49'));box(add(p,mul(roadV,-1)),roadU,roadV,.7,.35,6.95,7.1,rgb('#c8c1a5'));}
const finished=mesh.finish(),positions=JSON.parse(await fs.readFile('artifacts/attila/captures/positions.json','utf8'));
const index={version:1,name:'Rue du Camp d’Attila · 70–90',origin,scale,bounds:[4.37195,48.96472,4.37365,48.9656],vertexCount:finished.vertices.length/11,textures,materials,ranges:finished.ranges,excludeIds:parts.map(p=>p.osmId),parts,objectRanges:finished.objects,siteDetails:details,pickTriangles:finished.pickTriangles,stats:{buildingParts:parts.length,mainBuildings:parts.filter(p=>!['simple','garage','garage-upper'].includes(p.type)).length,modelledOpenings:openings.length,referencePhotos:positions.length+4,triangles:finished.vertices.length/33},provenance:{footprints:'© OpenStreetMap contributors · existing project extract',references:'Google Street View juillet 2024 / juillet 2022, captured in the user’s Chrome tab; two images supplied by user. © Google',dimensions:'Estimated from facade observations and OSM footprints; not a measured architectural survey.',limit90:'Google Maps labels its 90 address pin imprecise. Visible 92 and 94 retained as explicitly labelled boundary context.'}};
await fs.writeFile(out+'/mesh.bin',Buffer.from(finished.vertices.buffer));await fs.writeFile(out+'/index.json',JSON.stringify(index));await fs.writeFile(out+'/survey.json',JSON.stringify({origin,scale,parts,openings,roofAreas,positions,details},null,2));
console.log(JSON.stringify(index.stats));
