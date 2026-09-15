import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import earcut from 'earcut';
import {meshTools,add,sub,mul,dot,len,norm,mix,rgb,clip} from './attila-geometry.mjs';
import {toLocal,toLngLat,SCALE} from '../dist/walk-core.js';
import {buildCustomModelRegistry} from './build-custom-model-registry.mjs';

// The user coordinate is a street landmark. The photo sequence and the IGN
// roof/setback pattern identify the footprints; BAN alone falls on the neighbor.
const out='dist/data/camp127',anchor=[-412,2110],origin=toLngLat(anchor),scale=SCALE;
const u=norm([.852,.524]),v=[-u[1],u[0]],world=(x,y,z=0)=>[u[0]*x+v[0]*y,u[1]*x+v[1]*y,z];
const geo=p=>toLngLat(add(p.slice(0,2),anchor)),frame=g=>{const p=sub(toLocal(g),anchor);return[dot(p,u),dot(p,v)];};
const source=JSON.parse(await fs.readFile('dist/data/buildings.geojson','utf8'));
const att=JSON.parse(await fs.readFile('dist/data/attila/index.json','utf8'));
const mesh=meshTools(),parts=[],openings=[],details=[],roofAreas=[];
const C={white:rgb('#e4e2d8'),plaster:rgb('#c6c3b5'),sage:rgb('#a8b098'),brick:rgb('#a65e40'),mortar:rgb('#aaa38d'),stone:rgb('#c7bca0'),cream:rgb('#d4ccb3'),metal:rgb('#394955'),glass:rgb('#9baeb4'),trim:rgb('#e0e1d8')};
const face=(p,m=8,c=C.white,uv,pick=false)=>mesh.poly(p.map(q=>world(...q)),m,c,uv,pick);
const B=(a,b,w=.05,c=C.metal,m=8)=>mesh.beam(world(...a),world(...b),w,c,m);
const box=(x,y,w,d,z0,z1,c=C.white,m=8)=>mesh.box(world(x,y).slice(0,2),u,v,w,d,z0,z1,c,m);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
const record=(type,position,extra={})=>details.push({type,center:world(...position),estimated:true,...extra});
const rng=n=>{const t=Math.sin(n*127.1+311.7)*43758.5453;return t-Math.floor(t);};
const frontage={leftPillar:[1.12,1.49],gateLeft:[7.40,1.49],gateRight:[8.72,1.49],returnEnd:[7.82,6.56]};

function rail(a,b,z0,z1,step=.15,color=C.metal){
 B([...a,z0],[...b,z0],.045,color);B([...a,z1-.08],[...b,z1-.08],.055,color);
 const n=Math.ceil(len(sub(b,a))/step);for(let i=0;i<=n;i++){const p=mix(a,b,i/n);B([...p,z0],[...p,z1],.024,color);}
}
function guard(a,b,floor,color=C.metal){
 B([...a,floor+.96],[...b,floor+.96],.045,color);B([...a,floor+.48],[...b,floor+.48],.033,color);
 const n=Math.ceil(len(sub(b,a))/1.08);for(let i=0;i<=n;i++){const q=mix(a,b,i/n);B([...q,floor],[...q,floor+.96],.037,color);}
}
function slab(outline,z,thickness,color){
 face(outline.map(p=>[...p,z]),8,color);face([...outline].reverse().map(p=>[...p,z-thickness]),8,mul(color,.86));
 for(let i=0;i<outline.length;i++)face([[...outline[i],z-thickness],[...outline[(i+1)%outline.length],z-thickness],[...outline[(i+1)%outline.length],z],[...outline[i],z]],8,color);
}
function stair(x0,x1,y,width,height,color=C.white){
 const n=Math.ceil(height/.175),dx=(x1-x0)/n;
 for(let i=0;i<n;i++){const top=height*(i+1)/n;box(x0+dx*(i+.5),y,Math.abs(dx)+.003,width,Math.max(0,top-.20),top-.018,color);box(x0+dx*(i+.5),y,Math.abs(dx)+.012,width+.025,top-.018,top,mul(color,.94));}
 for(const sy of [-1,1])face([[x0,y+sy*width/2,0],[x1,y+sy*width/2,height-.17],[x1,y+sy*width/2,height],[x0,y+sy*width/2,.17]],8,color);
 face([[x0,y-width/2,0],[x1,y-width/2,height-.17],[x1,y+width/2,height-.17],[x0,y+width/2,0]],8,mul(color,.83));
 for(const sy of [-1,1]){const yy=y+sy*(width/2+.025);B([x0,yy,.95],[x1,yy,height+.95],.045,C.metal);B([x0,yy,.48],[x1,yy,height+.48],.032,C.metal);for(let i=0;i<=n;i+=3)B([x0+dx*i,yy,height*i/n],[x0+dx*i,yy,height*i/n+.95],.035,C.metal);}
 record('exterior-stair',[x0,y,0],{top:[x1,y,height],steps:n,width,frameStart:[x0,y],frameTop:[x1,y],height});
}
function downpipe(x,y,z){B([x,y,.12],[x,y,z-.20],.075,rgb('#7e8885'));B([x,y,z-.20],[x,y+.14,z],.075,rgb('#7e8885'));}
function chimney(x,y,z,color=C.brick){box(x,y,.64,.67,z,z+1.10,color);for(let h=z+.1;h<z+1.06;h+=.095){box(x,y,.65,.68,h,h+.012,C.mortar);}box(x,y,.79,.82,z+1.10,z+1.21,rgb('#666a61'));box(x-.15,y,.18,.20,z+1.20,z+1.35,rgb('#484a42'));record('chimney',[x,y,z]);}
function plant(x,y,h=1.4,r=.6,pot=false){
 if(pot){box(x,y,.52,.48,0,.48,rgb('#a35443'));box(x,y,.58,.54,.43,.50,rgb('#b46a53'));}
 B([x,y,.18],[x,y,h*.75],.065,rgb('#6c614a'));
 for(let k=0;k<7;k++){const a=k*2.4,p=[x+Math.cos(a)*r*.55,y+Math.sin(a)*r*.55,h*(.75+.10*Math.sin(k))];B([x,y,h*.45],p,.025,rgb('#776650'));mesh.crown(world(...p),r*.48,rgb(k%2?'#7b9461':'#668052'),k);}
}
function flowers(x,y,z,w){box(x,y,w,.24,z,z+.18,rgb('#a46d50'));for(let i=0;i<Math.ceil(w/.11);i++){const xx=x-w/2+.06+i*.11;B([xx,y,z+.15],[xx,y,z+.37],.012,rgb('#6e8655'));mesh.crown(world(xx,y,z+.28),.105,rgb('#6a8050'),i);for(let k=0;k<3;k++){const a=k*2.4;box(xx+.055*Math.cos(a),y+.055*Math.sin(a),.045,.045,z+.33+k*.018,z+.375+k*.018,rgb(i%3?'#d5aea0':'#a95a76'));}}}

// Wall coordinates use distance along each original edge. Openings cut out
// both the plaster and masonry; frames, shutters, glass and reveals are 3-D.
function wall(a,b,h0,h1,os,part,color,style='plaster',base=0){
 const d=sub(b,a),L=len(d),normal=norm([d[1],-d[0]]),P=(s,z,depth=0)=>{const q=add(mix(a,b,s/L),mul(normal,-depth));return[...q,z];},H=s=>h0+(h1-h0)*s/L;
 const cuts=[0,L,...os.flatMap(o=>[o.s-o.w/2,o.s+o.w/2])].sort((a,b)=>a-b);
 function band(lo,hi,z0,z1,c,depth=0){
  if(hi-lo<1e-5||z1-z0<1e-5)return;
  face([P(lo,Math.min(z0,H(lo)),depth),P(hi,Math.min(z0,H(hi)),depth),P(hi,Math.min(z1,H(hi)),depth),P(lo,Math.min(z1,H(lo)),depth)],0,c,undefined,true);
 }
 for(let i=0;i<cuts.length-1;i++){const lo=cuts[i],hi=cuts[i+1],active=os.filter(o=>Math.abs((lo+hi)/2-o.s)<o.w/2),zs=[base,...active.flatMap(o=>[o.z,o.z+o.h]),Math.max(h0,h1)].sort((a,b)=>a-b);for(let j=0;j<zs.length-1;j++){if(zs[j]<base||active.some(o=>(zs[j]+zs[j+1])/2>o.z&&(zs[j]+zs[j+1])/2<o.z+o.h))continue;band(lo,hi,zs[j],zs[j+1],style==='stone'?C.mortar:color);}}
 if(style==='stone'){
  for(let row=0,z=base;z<Math.max(h0,h1)-.02;row++,z+=.245){let col=0;for(let s=-.24*(row%2);s<L;s+=.49,col++){
   const lo=Math.max(.012,s+.018),hi=Math.min(L-.012,s+.46),z0=z+.012,z1=Math.min(z+.223,H(lo)-.005,H(hi)-.005);if(hi<=lo||z1<=z0)continue;
   let cells=[[[lo,z0],[hi,z0],[hi,z1],[lo,z1]]];
   for(const o of os){const l=o.s-o.w/2,r=o.s+o.w/2,t=o.z+o.h;cells=cells.flatMap(p=>{const xmin=Math.min(...p.map(q=>q[0])),xmax=Math.max(...p.map(q=>q[0])),ymin=p[0][1],ymax=p[2][1];if(xmax<=l||xmin>=r||ymax<=o.z||ymin>=t)return[p];const out=[];if(xmin<l)out.push([[xmin,ymin],[l,ymin],[l,ymax],[xmin,ymax]]);if(xmax>r)out.push([[r,ymin],[xmax,ymin],[xmax,ymax],[r,ymax]]);const a=Math.max(xmin,l),b=Math.min(xmax,r);if(ymin<o.z)out.push([[a,ymin],[b,ymin],[b,o.z],[a,o.z]]);if(ymax>t)out.push([[a,t],[b,t],[b,ymax],[a,ymax]]);return out;});}
   for(const cell of cells){const c=mul(C.stone,.91+.15*rng(row*61+col*7)),dep=-.016-.009*rng(col+row);face(cell.map(([s,z])=>P(s,z,dep)),8,c,undefined,true);}
  }}
 }
 const line=(s0,z0,s1,z1,w,c,dep=-.03)=>mesh.beam(world(...P(s0,z0,dep)),world(...P(s1,z1,dep)),w,c,8);
 if(style==='stone'){
  // Every brick course uses the very same oblique facade frame as the stone.
  // Keep the upper yellow band out of the red arch and stone springer areas.
  const arches=os.filter(o=>o.arch).map(o=>[o.s-o.w/2-.35,o.s+o.w/2+.35]);
  for(const [z,h]of [[2.12,.12],[4.84,.12]])for(let s=.012;s<L-.01;s+=.17){
   let spans=[[s,Math.min(s+.145,L-.012)]];
   if(z>4)for(const [lo,hi]of arches)spans=spans.flatMap(([a,b])=>b<=lo||a>=hi?[[a,b]]:[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([a,b])=>b>a));
   for(const [a,b]of spans)band(a,b,z,z+h,z<3?C.brick:rgb('#ba9e68'),-.055);
  }
  for(const o of os.filter(o=>o.arch&&o.kind!=='door'))for(let row=0;row<4;row++){
   const cols=Math.ceil(o.w/.195),width=o.w/cols;
   for(let i=0;i<cols;i++)band(o.s-o.w/2+i*width+.007,o.s-o.w/2+(i+1)*width-.007,2.23+row*.105,2.315+row*.105,rgb('#c6ab79'),-.055);
  }
  record('stone-trim-aligned',[...mix(a,b,.5),0],{facade:[world(...a),world(...b)],minimumProjection:.04,stoneMaximumProjection:.025,upperCourseAvoidsArches:true});
 }
 for(const o of os){
  const x0=o.s-o.w/2,x1=o.s+o.w/2,t=o.z+o.h,dep=.17,col=o.color||C.trim;
  face([P(x0,o.z,dep),P(x1,o.z,dep),P(x1,t,dep),P(x0,t,dep)],o.kind==='garage'||o.solid?8:3,o.kind==='garage'||o.solid?col:C.glass,[[0,0],[1,0],[1,1],[0,1]],true);
  for(const [s0,z0,s1,z1]of [[x0,o.z,x1,o.z],[x1,o.z,x1,t],[x1,t,x0,t],[x0,t,x0,o.z]]){face([P(s0,z0),P(s1,z1),P(s1,z1,dep),P(s0,z0,dep)],0,color);line(s0,z0,s1,z1,.07,col,dep-.03);}
  if(o.kind==='garage'){
   if(o.vertical)for(let s=x0+.07;s<x1;s+=.105)line(s,o.z+.03,s,t-.03,.012,mul(col,.72),dep-.045);
   else for(let z=o.z+.24;z<t;z+=.28)line(x0+.03,z,x1-.03,z,.018,mul(col,.76),dep-.045);
   line(o.s-.09,o.z+o.h*.47,o.s+.09,o.z+o.h*.47,.032,C.metal,dep-.05);
  }else if(o.kind==='door'){
   const dark=o.dark;face([P(x0+.06,o.z+.06,.15),P(x1-.06,o.z+.06,.15),P(x1-.06,t-.06,.15),P(x0+.06,t-.06,.15)],8,dark?rgb('#343d42'):col);
   for(let k=0;k<(dark?4:1);k++){const z=o.z+.18+k*.46;face([P(x0+.19,z,.13),P(x1-.19,z,.13),P(x1-.19,dark?z+.31:t-.42,.13),P(x0+.19,dark?z+.31:t-.42,.13)],3,C.glass,[[0,0],[1,0],[1,1],[0,1]]);}
   line(x1-.13,o.z+.88,x1-.13,o.z+1.07,.028,rgb('#777d79'),.11);
  }else{
   const panes=o.panes||2;for(let i=1;i<panes;i++)line(x0+o.w*i/panes,o.z,x0+o.w*i/panes,t,.043,col,dep-.04);
   if(o.transoms)for(const f of o.transoms)line(x0,o.z+o.h*f,x1,o.z+o.h*f,.037,col,dep-.04);
   if(o.roller){const bottom=t-o.h*o.roller;face([P(x0,bottom,.11),P(x1,bottom,.11),P(x1,t,.11),P(x0,t,.11)],8,rgb('#d1d5cc'));for(let z=bottom;z<t;z+=.055)line(x0,z,x1,z,.009,rgb('#a9b0a8'),.099);}
  }
  if(o.shutters)for(const side of [-1,1]){const ww=o.w*.46,c=o.s+side*(o.w*.76),l=c-ww/2,r=c+ww/2;face([P(l,o.z,-.06),P(r,o.z,-.06),P(r,t,-.06),P(l,t,-.06)],8,C.sage);for(let s=l+.06;s<r;s+=.095)line(s,o.z+.04,s,t-.04,.008,mul(C.sage,.73),-.073);for(const z of [o.z+.15,t-.15])line(l,z,r,z,.075,mul(C.sage,.92),-.10);line(l+.02,o.z+.20,r-.02,t-.20,.037,mul(C.sage,.80),-.10);for(const z of [o.z+.26,t-.27])line(c-side*ww*.43,z,c-side*ww*.17,z,.027,rgb('#3a4238'),-.12);}
  if(o.brick){
   for(const xx of [x0-.125,x1+.125])for(let z=o.z;z<t;z+=.105)band(xx-.11,xx+.11,z,Math.min(z+.089,t),mul(C.brick,.93+.12*rng(z*16)), -.035);
   const n=Math.ceil((o.w+.48)/.13);for(let k=0;k<n;k++){const s=x0-.24+k*(o.w+.48)/n;band(s,s+(o.w+.48)/n-.017,t+.01,t+.25,mul(C.brick,.93+.1*rng(k)), -.035);}
  }
  if(o.arch){const n=Math.ceil(o.w/.13)+4,span=o.w/2+.20;
   for(let k=0;k<n;k++){const l=-span+2*span*k/n,r=-span+2*span*(k+1)/n-.015,curve=x=>.20*(1-(x/span)**2);face([P(o.s+l,t+.015+curve(l),-.04),P(o.s+r,t+.015+curve(r),-.04),P(o.s+r,t+.27+curve(r),-.04),P(o.s+l,t+.27+curve(l),-.04)],8,k%3?C.brick:rgb('#c79b68'));}
   for(const xx of [x0-.21,x1+.21])band(xx-.13,xx+.13,t+.01,t+.29,C.cream,-.04);
  }
  if(o.kind!=='door'&&o.kind!=='garage'){line(x0-.12,o.z-.045,x1+.12,o.z-.045,.105,C.trim,-.115);}
  openings.push({part,kind:o.kind||'window',side:o.side||'front',center:world(...P(o.s,o.z+o.h/2)),width:o.w,height:o.h,depth:dep,reference:o.ref,observed:o.observed!==false,dimensions:'estimated',shutters:!!o.shutters,roller:o.roller||0});
 }
}

const defs=[
 {id:125,osm:'way/156703677',label:'Voisine aux volets vert sauge',style:'sage',refs:['02','01','04']},
 {id:1251,osm:'way/156703371',label:'Annexe arrière de la voisine',style:'annex',refs:['aerial']},
 {id:127,osm:'way/156676458',label:'127 · maison blanche et garage',style:'white',refs:['01','02','04']},
 {id:129,osm:'way/156704157',label:'Voisine en pierre · escalier extérieur',style:'stone',refs:['03','01','04']},
 {id:400,osm:'way/156684633',label:'Bâtiment en face · pignon et toiture rouge',style:'opposite',refs:['04','aerial']},
 {id:401,osm:'way/156681188',label:'Long bâtiment voisin en face · même style',style:'opposite',refs:['04','aerial'],styleFrom:400}
];
for(const def of defs){
 const f=source.features.find(f=>f.properties.osm_id===def.osm);if(!f)throw Error('Missing footprint '+def.osm);
 const p=f.geometry.coordinates[0].slice(0,-1).map(frame);mesh.setPart(def.id);
 const lo=[0,1].map(i=>Math.min(...p.map(q=>q[i]))),hi=[0,1].map(i=>Math.max(...p.map(q=>q[i]))),cx=(lo[0]+hi[0])/2,cy=(lo[1]+hi[1])/2;
 let axis=def.style==='stone'||def.style==='opposite'?0:1,cuts=[axis===0?cx:cy],base=def.style==='opposite'?1.75:0;
 const streetCenter=def.style==='opposite'?mix(p[1],p[2],.5):[cx,lo[1]],backCenter=def.style==='opposite'?mix(p[0],p[3],.5):[cx,hi[1]],ridgeX=y=>streetCenter[0]+(backCenter[0]-streetCenter[0])*(y-streetCenter[1])/(backCenter[1]-streetCenter[1]),ridgeSide=q=>q[0]-ridgeX(q[1]);
 let H=(x,y)=>def.style==='sage'?6.30+1.25*(1-Math.abs(y-cy)/(hi[1]-lo[1])*2):def.style==='stone'?7.40+2.45*(1-Math.abs(x-cx)/(hi[0]-lo[0])*2):def.style==='opposite'?5.10+2.10*(1-Math.abs(x-cx)/(hi[0]-lo[0])*2):3.05;
 if(def.style==='white'){axis=0;cuts=[7.73];H=(x,y)=>x<7.73?6.80+.07*(y-8.5):y<10.65?4.53+.025*(y-6.6):6.12+.12*(y-10.65);}
 if(def.style==='opposite'){const halfWidth=Math.max(...p.map(q=>Math.abs(ridgeSide(q))));cuts=[];H=(x,y)=>5.10+2.10*Math.max(0,1-Math.abs(x-ridgeX(y))/halfWidth);}
 const whiteSide=q=>q[0]-(p[3][0]+(p[2][0]-p[3][0])*(q[1]-p[3][1])/(p[2][1]-p[3][1]));
 if(def.style==='white'){cuts=[];H=(x,y)=>whiteSide([x,y])<0?6.80+.07*(y-8.5):y<10.65?4.53+.025*(y-6.6):6.12+.12*(y-10.65);}
 const triangles=earcut(p.flat());let covered=0;
 // Separate roof planes meet on the exact polygon; the white garage is lower.
 for(let i=0;i<triangles.length;i+=3){let cells=[triangles.slice(i,i+3).map(j=>p[j])];for(const cut of cuts)cells=cells.flatMap(q=>[clip(q,a=>a[axis]-cut),clip(q,a=>cut-a[axis])]).filter(q=>q.length>2&&area(q)>1e-7);
  if(def.style==='white'){cells=cells.flatMap(q=>[clip(q,whiteSide),clip(q,a=>-whiteSide(a))]).filter(q=>q.length>2&&area(q)>1e-7);cells=cells.flatMap(q=>q.every(a=>whiteSide(a)>=-1e-5)?[clip(q,a=>a[1]-10.65),clip(q,a=>10.65-a[1])]:[q]).filter(q=>q.length>2&&area(q)>1e-7);}
  if(def.style==='opposite')cells=cells.flatMap(q=>[clip(q,ridgeSide),clip(q,a=>-ridgeSide(a))]).filter(q=>q.length>2&&area(q)>1e-7);
  for(const q of cells){covered+=area(q);const mid=q.reduce((s,a)=>add(s,mul(a,1/q.length)),[0,0]);const height=(x,y)=>def.style==='white'?(whiteSide(mid)<0?6.80+.07*(y-8.5):mid[1]<10.65?4.53+.025*(y-6.6):6.12+.12*(y-10.65)):H(x,y);face(q.map(a=>[...a,height(...a)]),['white','annex'].includes(def.style)?8:1,def.style==='white'?rgb('#777e72'):def.style==='sage'?rgb('#918879'):rgb('#c5a28a'),q.map(a=>[a[0]/1.25,a[1]/1.25]),true);}
 }
 roofAreas.push({id:def.id,footprint:area(p),roofProjected:covered});
 const color=def.style==='sage'?C.plaster:def.style==='stone'?C.stone:def.style==='opposite'?rgb('#d4c7a7'):C.white;
 for(let i=0;i<p.length;i++){
  if(def.style==='sage'&&i===6)continue;
  const a=p[i],b=def.style==='sage'&&i===5?p[0]:p[(i+1)%p.length],L=len(sub(b,a)),front=def.style==='opposite'?a[1]>hi[1]-2&&b[1]>hi[1]-2:Math.abs(a[1]-b[1])<.9&&a[1]<lo[1]+2.2;
  const span=(x,z,w,h,extra={})=>({s:(x-a[0])/(b[0]-a[0])*L,z,w,h,ref:def.refs[0],...extra});let os=[];
  if(def.style==='sage'&&front&&L>6){const left=Math.min(a[0],b[0]);os=[span(left+1.85,.08,2.95,2.45,{kind:'garage',color:C.sage,vertical:true,brick:true}),span(left+5.62,.08,1.03,2.48,{kind:'door',color:C.trim,brick:true}),span(left+7.39,.79,1.05,1.54,{shutters:true,brick:true}),span(left+2.3,3.86,1.27,1.68,{shutters:true}),span(left+6.54,3.86,1.22,1.68,{shutters:true})];}
  if(def.style==='white'&&front){if(L>5.8)os=[span(2.13,3.02,.46,.66),span(3.62,2.04,.88,2.18,{kind:'door',dark:true,color:rgb('#354047')}),span(6.05,2.31,1.76,1.84,{roller:.15}),span(3.63,5.08,.62,1.30,{roller:1}),span(6.16,5.02,1.23,1.39,{roller:.70})];else if(L>4)os=[span(9.95,.08,3.34,1.96,{kind:'garage'}),span(9.95,2.26,3.18,2.04,{panes:2,transoms:[.27,.60],roller:.055})];}
  if(def.style==='stone'&&front)os=[span(cx-2.12,.72,1.00,1.20),span(cx+2.23,.72,1.00,1.20),span(cx-2.15,2.72,1.77,1.86,{roller:.51,arch:true}),span(cx,2.19,.95,2.46,{kind:'door',arch:true}),span(cx+2.26,2.72,1.83,1.86,{roller:.51,arch:true}),span(cx-2.14,5.62,1.11,1.38,{roller:.75}),span(cx,5.60,.66,1.42,{roller:1}),span(cx+2.17,5.62,1.14,1.38,{roller:.75})];
  if(def.style==='opposite'&&front)os=[span(streetCenter[0]-3.8,2.13,1.30,2.18,{brick:true,observed:!def.styleFrom}),span(streetCenter[0],2.05,1.22,2.35,{kind:'door',color:rgb('#846951'),brick:true,observed:!def.styleFrom}),span(streetCenter[0]+3.8,2.13,1.30,2.18,{brick:true,observed:!def.styleFrom})];
  os=os.filter(o=>o.s-o.w/2>.04&&o.s+o.w/2<L-.04);
  const stops=[0,1];for(const cut of cuts){const t=(cut-a[axis])/(b[axis]-a[axis]);if(t>0&&t<1)stops.push(t);}if(def.style==='white'){const t=(10.65-a[1])/(b[1]-a[1]);if(t>0&&t<1)stops.push(t);}stops.sort((a,b)=>a-b);
  if(def.style==='white'&&whiteSide(a)*whiteSide(b)<-1e-8){stops.push(whiteSide(a)/(whiteSide(a)-whiteSide(b)));stops.sort((a,b)=>a-b);}
  if(def.style==='opposite'&&ridgeSide(a)*ridgeSide(b)<0){stops.push(ridgeSide(a)/(ridgeSide(a)-ridgeSide(b)));stops.sort((a,b)=>a-b);}
  const gabled=def.style==='stone'||def.style==='opposite',eave=def.style==='stone'?7.40:5.10;
  if(gabled)wall(a,b,eave,eave,os,def.id,color,front&&def.style==='stone'?'stone':'plaster',base);
  if(base)wall(a,b,base,base,[],def.id,C.mortar,'plaster',0);
  for(let j=0;j<stops.length-1;j++){const aa=mix(a,b,stops[j]),bb=mix(a,b,stops[j+1]),mid=mix(aa,bb,.5),h=q=>def.style==='white'?(whiteSide(mid)<0?6.80+.07*(q[1]-8.5):mid[1]<10.65?4.53+.025*(q[1]-6.6):6.12+.12*(q[1]-10.65)):H(...q);const start=stops[j]*L,end=stops[j+1]*L;if(gabled)face([[...aa,eave],[...bb,eave],[...bb,H(...bb)],[...aa,H(...aa)]],0,def.style==='stone'?C.cream:color,undefined,true);else wall(aa,bb,h(aa),h(bb),os.filter(o=>o.s-o.w/2>=start-.001&&o.s+o.w/2<=end+.001).map(o=>({...o,s:o.s-start})),def.id,color,'plaster',base);B([...aa,h(aa)+.045],[...bb,h(bb)+.045],.105,rgb('#818b82'));}
 }
 if(def.style==='white'){
  // Upper side wall at the garage/house junction and rear wall over low roof.
  face([[7.73,8.28,4.57],[7.73,10.65,4.63],[7.73,10.65,6.95],[7.73,8.28,6.80]],0,C.white);
  wall([12.3,10.65],[7.73,10.65],6.12,6.12,[{s:2.1,z:5.09,w:1.22,h:.85,roller:1,ref:'01'}],def.id,C.white,'plaster',4.63);
  // A continuous quarter-turn entrance: the flight ends at the left edge of
  // the front landing, which returns along the facade to the door.
  const landing=[[4.30,6.15],[5.42,6.15],[5.42,8.36],[2.25,8.36],[2.25,7.25],[4.30,7.25]],level=2.02;
  slab(landing,level,.19,C.white);stair(1.25,4.30,6.70,1.10,level,rgb('#cbd0c9'));
  for(const [a,b]of [[[4.30,6.15],[5.42,6.15]],[[5.42,6.15],[5.42,8.36]],[[2.25,8.36],[2.25,7.25]],[[2.25,7.25],[4.30,7.25]]])guard(a,b,level);
  box(5.31,8.00,.16,.18,0,level-.19,C.white);box(2.35,8.04,.16,.18,0,level-.19,C.white);
  box(3.62,8.35,1.04,.24,1.99,2.04,C.trim);
  record('connected-entrance-landing',[4.30,6.70,level],{part:127,frameOutline:landing,flightEntry:[[4.30,6.15],[4.30,7.25]],door:[3.62,8.35],height:level,clearEntryWidth:1.10});
  box(3.10,8.02,3.10,.75,4.38,4.52,C.white);for(let x=1.59;x<4.65;x+=.13)box(x,7.65,.105,.10,4.36,4.52,C.brick);
  for(const y of [8.33,6.57]){const x=y>8?1.15:7.72;downpipe(x-.06,y-.11,y>8?6.8:4.5);}
  for(const x of [1.28,7.58])for(const z of [2.9,5.20])for(let k=0;k<5;k++)box(x,8.27,.23,.045,z+k*.11,z+k*.11+.085,C.brick);
  box(4.26,1.49,5.89,.22,0,.63,C.white);box(4.26,1.48,5.89,.30,.63,.69,rgb('#a8a89b'));rail([1.315,1.49],[7.205,1.49],.72,1.90);
  for(const x of [1.12,7.40,8.72]){box(x,1.49,.39,.44,0,1.97,C.cream);box(x,1.49,.50,.55,1.97,2.05,rgb('#a8a694'));for(let z=.26;z<1.9;z+=.26)box(x,1.49,.395,.445,z,z+.015,C.mortar);}
  rail([7.62,1.49],[8.49,1.49],.28,1.85);box(8.05,1.49,.88,.07,.12,.52,C.metal);B([7.62,1.49,.14],[7.62,1.49,1.88],.06);B([8.49,1.49,.14],[8.49,1.49,1.88],.06);
  // The gate opens to the house garden. Its RIGHT pillar carries the return
  // to the left jamb of the garage; the drive stays outside this enclosure.
  rail(frontage.gateRight,frontage.returnEnd,.16,1.77);box(6.64,1.31,.56,.24,.94,1.35,C.metal);box(6.64,1.17,.24,.018,1.26,1.28,rgb('#afbab3'));
  // Small blue enamel number plate, geometrically drawn 127.
  box(7.40,1.25,.22,.028,1.67,1.82,rgb('#304b68'));
  const yy=1.229,zz=1.70;for(const [a,b]of [[[7.325,zz],[7.325,zz+.09]],[[7.365,zz+.09],[7.407,zz+.09]],[[7.407,zz+.09],[7.365,zz]],[[7.365,zz],[7.407,zz]],[[7.44,zz+.09],[7.482,zz+.09]],[[7.482,zz+.09],[7.45,zz]]])B([a[0],yy,a[1]],[b[0],yy,b[1]],.008,C.trim);
  box(6.31,4.12,.80,.60,.02,.18,rgb('#987c64'));plant(6.32,4.13,2.50,1.02,true);plant(2.22,2.50,1.40,.70,true);plant(6.60,6.65,1.25,.61,true);flowers(6.05,8.08,2.25,.69);
  box(1.68,8.19,.11,.11,3.29,3.53,C.metal);box(4.24,8.18,.13,.11,3.43,3.65,C.metal);
  face([[1.40,1.72,.026],[12.32,1.72,.026],[12.32,6.54,.026],[7.73,6.54,.026],[7.73,8.27,.026],[1.40,8.27,.026]],5,rgb('#a1a398'));
  record('white-house-recessed-front',[4.4,8.4,0],{reference:'01',frontSetback:6.7,garageFront:6.6});record('front-fence-and-gate',[4.5,1.49,0],{reference:'01',frameLayout:frontage,returnFrom:'right-gate-pillar',gardenInsideGate:true});
 }
 if(def.style==='sage'){
  const y=2.02;
  // Brick string courses follow the actual front (slightly oblique in OSM).
  const a=p[5],b=p[0],at=x=>a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  for(const [z,h]of [[3.13,.28],[5.94,.35]])for(let row=0;row<Math.ceil(h/.10);row++)for(let x=-6.94+.12*(row%2);x<1.40;x+=.25){const xx=Math.min(x+.23,1.44);face([[x,at(x)-.025,z+row*.10],[xx,at(xx)-.025,z+row*.10],[xx,at(xx)-.025,z+row*.10+.082],[x,at(x)-.025,z+row*.10+.082]],8,mul(C.brick,.93+.13*rng(x+row)));}
  const dx=p[5][0]+5.62,dy=at(dx);face([[dx-.67,dy-.80,2.73],[dx+.67,dy-.80,2.73],[dx+.67,dy,2.89],[dx-.67,dy,2.89]],3,rgb('#b0b3a5'),[[0,0],[1,0],[1,1],[0,1]]);for(const sx of [-.67,.67]){B([dx+sx,dy,2.48],[dx+sx,dy-.80,2.73],.036);B([dx+sx,dy-.80,2.73],[dx+sx,dy,2.89],.038);}
  downpipe(-7.03,1.58,6.30);chimney(-1.0,8.20,7.25,rgb('#ae9774'));plant(.33,1.24,1.1,.28,true);box(dx-1.18,dy-.16,.63,.25,1.12,1.45,C.trim);
  record('sage-shutters-and-brick-bands',[cx,y,0],{reference:'02'});
 }
 if(def.style==='stone'){
  const fy=(p[1][1]+p[2][1])/2,frontY=x=>p[1][1]+(p[2][1]-p[1][1])*(x-p[1][0])/(p[2][0]-p[1][0]);
  // Cream triangular timber-faced pediment above rubble-stone masonry.
  for(let x=lo[0]+.22;x<hi[0];x+=.37){const z=H(x,frontY(x));if(z>7.62)B([x,frontY(x)-.065,7.54],[x,frontY(x)-.065,z-.18],.022,mul(C.cream,.86));}
  B([lo[0]-.18,frontY(lo[0]-.18)-.18,7.35],[cx,frontY(cx)-.18,9.96],.16,C.trim);B([cx,frontY(cx)-.18,9.96],[hi[0]+.18,frontY(hi[0]+.18)-.18,7.35],.16,C.trim);
  for(const x of [cx-2.15,cx+2.26])flowers(x,frontY(x)-.24,2.59,1.42);
  const landingLeft=cx-.82,landingRight=cx+.82,flightY=fy-.94,level=2.19,landing=[[landingLeft,flightY-.525],[landingRight,flightY-.525],[landingRight,fy+.02],[landingLeft,fy+.02]];
  slab(landing,level,.21,C.cream);stair(cx-3.88,landingLeft,flightY,1.05,level,C.cream);
  guard([landingLeft,flightY-.525],[landingRight,flightY-.525],level);guard([landingRight,flightY-.525],[landingRight,fy-.03],level);guard([landingLeft,flightY+.525],[landingLeft,fy-.03],level);
  for(const x of [landingLeft,landingRight])box(x,flightY-.525,.13,.15,level-.06,level+.98,C.cream);
  box(cx,fy-.02,1.08,.21,2.15,2.21,C.trim);
  record('connected-entrance-landing',[landingLeft,flightY,level],{part:129,frameOutline:landing,flightEntry:[[landingLeft,flightY-.525],[landingLeft,flightY+.525]],door:[cx,fy],height:level,clearEntryWidth:1.05});
  downpipe(lo[0]-.06,frontY(lo[0])-.03,7.35);downpipe(hi[0]+.08,frontY(hi[0])-.03,7.35);chimney(lo[0]+1.33,10.5,H(lo[0]+1.33,10.5)-.14);
  box(cx+.96,fy-.14,.40,.25,.78,1.15,rgb('#7c6353'));box(cx+2.30,fy-1.31,.68,.71,.03,1.18,rgb('#3b6445'));box(cx+2.30,fy-1.31,.74,.77,1.18,1.26,rgb('#355f40'));
  record('stone-gable-brick-arches',[cx,fy,0],{reference:'03'});
 }
 if(def.style==='opposite'){
  const fy=hi[1],p0=p[1],p1=p[2];
  // Photo 04 documents only the street end; side/rear elevations stay plain.
  const x=streetCenter[0],z=6.53,r=.32,frontY=x=>p[2][1]+(p[1][1]-p[2][1])*(x-p[2][0])/(p[1][0]-p[2][0]);for(let k=0;k<36;k++){const a=k*Math.PI/18,b=(k+1)*Math.PI/18,xa=x+r*Math.cos(a),xb=x+r*Math.cos(b);B([xa,frontY(xa)+.05,z+r*Math.sin(a)],[xb,frontY(xb)+.05,z+r*Math.sin(b)],.074,C.brick);}
  face(Array.from({length:32},(_,i)=>{const xx=x+.27*Math.cos(i*Math.PI/16);return[xx,frontY(xx)+.03,6.53+.27*Math.sin(i*Math.PI/16)];}),8,rgb('#bbb198'));
  record('opposite-street-gable',[x,frontY(x),base],{part:def.id,reference:'04',unseenFacades:'plain',...(def.styleFrom?{styleFrom:def.styleFrom,requestedByUser:true}:{} )});
 }
 parts.push({id:def.id,osmId:def.osm,label:def.label,address:def.id===127?'127':null,footprint:f.geometry.coordinates[0],refs:def.refs,...(def.styleFrom?{styleFrom:def.styleFrom}:{}),confidence:def.styleFrom?'Emprise OSM conservée ; même style que le bâtiment voisin à la demande de l’utilisateur.':'Emprise OSM et correspondance de la séquence photo/orthophoto ; dimensions estimées.'});
}

// The street-facing fence is separate from the building footprint. Its
// raised foundation, masonry, brick piers and grass bank are visible in 04.
mesh.setPart(400);
const fenceY=-9.6;
box(10,fenceY,61,.42,.45,1.96,C.mortar);
for(let row=0;row<5;row++)for(let x=-20.5+.27*(row%2);x<40.5;x+=.55)box(x,fenceY+.223,.51,.055,.46+row*.29,.71+row*.29,mul(C.stone,.89+.15*rng(x+row)));
box(10,fenceY,61,.53,1.96,2.05,rgb('#777e68'));
rail([-20.5,fenceY],[40.5,fenceY],2.10,3.73,.18,rgb('#3f5147'));
for(const x of [-20.5,-6.5,7.4,24.1,40.5]){box(x,fenceY,.48,.53,.45,3.88,C.brick);for(let z=.56;z<3.82;z+=.105)box(x,fenceY,.49,.54,z,z+.014,C.mortar);box(x,fenceY,.64,.69,3.88,4.01,rgb('#6f7667'));}
box(10,-7.82,61,.20,.03,.44,rgb('#c0baa3'));
face([[-20.5,-7.91,.45],[40.5,-7.91,.45],[40.5,-9.35,1.34],[-20.5,-9.35,1.34]],6,rgb('#9d9f70'));
record('opposite-raised-fence',[10,fenceY,0],{reference:'04',length:61,extension:'Same enclosure continued along the newly requested building'});
// Two period lanterns, on the sidewalk, away from the carriageway.
for(const [x,y]of [[7.2,-6.72],[30,-6.72]]){B([x,y,.03],[x,y,6.95],.065,rgb('#65574a'));B([x,y,6.87],[x-.85,y,6.87],.046,rgb('#504c41'));box(x-.80,y,.27,.27,6.22,6.69,rgb('#b8bca6'));for(const dx of [-.15,.15])for(const dy of [-.15,.15])B([x-.80+dx,y+dy,6.22],[x-.80+dx*1.25,y+dy*1.25,6.69],.022,rgb('#454b42'));box(x-.8,y,.42,.42,6.69,6.77,rgb('#454b42'));for(const d of [[-.21,-.21],[.21,-.21],[.21,.21],[-.21,.21]])B([x-.8+d[0],y+d[1],6.77],[x-.8,y,7.02],.07,rgb('#454b42'));}
// Only the known foreground courts are surfaced. City road geometry remains
// the source of the carriageway and both continuous sidewalks.
await fs.mkdir(out+'/references',{recursive:true});for(const file of att.textures)await fs.copyFile('dist/data/attila/'+file,out+'/'+file);
const titles=['Maison blanche, escalier, garage et clôture','Voisine aux volets vert sauge et bandeaux de briques','Voisine en pierre, pignon et escalier','Alignement et bâtiment en face'];
const references=[];for(let i=1;i<=4;i++){const id=String(i).padStart(2,'0'),raw=await fs.readFile('references_camp127/'+id+'.png'),file='references/'+id+'.png';await fs.writeFile(out+'/'+file,raw);references.push({id,title:titles[i-1],file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),source:'Capture Google Maps / Street View fournie par l’utilisateur'});}
await fs.mkdir(out+'/corrections',{recursive:true});
const correctionReferences=[];for(const file of ['01-stair.png','02-bricks.png','03-gate.png']){const raw=await fs.readFile('references_camp127/corrections/'+file);await fs.writeFile(out+'/corrections/'+file,raw);correctionReferences.push({file:'corrections/'+file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),role:'User screenshot identifying a correction, not a reference facade photograph'});}
const result=mesh.finish(),a=result.vertices,bounds=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=11){const p=geo([a[i],a[i+1]]);bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}
const index={version:1,name:'127 · rue du Camp d’Attila et voisinage',origin,scale,bounds,gameAnchor:anchor,frame:{u,v},vertexCount:a.length/11,materials:att.materials,textures:att.textures,ranges:result.ranges,excludeIds:parts.map(p=>p.osmId),parts,objectRanges:result.objects,pickTriangles:result.pickTriangles,siteDetails:details,stats:{buildingParts:parts.length,mainBuildings:5,modelledOpenings:openings.length,triangles:a.length/33,referencePhotos:4},provenance:{footprints:'© OpenStreetMap contributors · existing project extract',aerial:'IGN BD ORTHO · Licence Ouverte 2.0 · local six-tile survey',references:'Four user-supplied Google Maps / Street View screenshots',dimensions:'Visually estimated; hidden elevations remain simple.',placement:'Photo order, facade setbacks and aerial roof pattern. The BAN address point is offset onto the left neighbor; it does not override the observed layout.'}};
await fs.writeFile(out+'/mesh.bin',Buffer.from(a.buffer));await fs.writeFile(out+'/index.json',JSON.stringify(index));await fs.writeFile(out+'/survey.json',JSON.stringify({origin,scale,gameAnchor:anchor,parts,openings,roofAreas,details,references,correctionReferences},null,2));
await buildCustomModelRegistry();console.log(JSON.stringify(index.stats));
