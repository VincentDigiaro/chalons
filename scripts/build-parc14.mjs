import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import earcut from 'earcut';
import {meshTools,add,sub,mul,dot,len,norm,mix,rgb,clip} from './attila-geometry.mjs';
import {toLocal,toLngLat,SCALE} from '../dist/walk-core.js';
import {buildCustomModelRegistry} from './build-custom-model-registry.mjs';

// House frame: x points to the right when looking at the front; y into the garden.
// The supplied game coordinate is kept exactly. OSM outlines stay georeferenced.
const out='dist/data/parc14',anchor=[-413,2800],origin=toLngLat(anchor),scale=SCALE;
const u=norm([-.951,-.309]),v=[-u[1],u[0]],world=(x,y,z=0)=>[u[0]*x+v[0]*y,u[1]*x+v[1]*y,z];
const geo=p=>toLngLat(add(p.slice(0,2),anchor));
const frame=g=>{const p=sub(toLocal(g),anchor);return[dot(p,u),dot(p,v)];};
const source=JSON.parse(await fs.readFile('dist/data/buildings.geojson','utf8'));
const att=JSON.parse(await fs.readFile('dist/data/attila/index.json','utf8'));
const mesh=meshTools(),{poly,tri,beam}=mesh,parts=[],openings=[],details=[],roofAreas=[];
const C={wall:rgb('#d7d3c6'),wood:rgb('#4c3437'),trim:rgb('#463638'),glass:rgb('#9bacae'),stone:rgb('#b5ae9e'),roof:rgb('#8c8993')};
const W=(p,z)=>world(p[0],p[1],z),B=(a,b,w,c=C.wood,m=8)=>beam(world(...a),world(...b),w,c,m);
const box=(x,y,w,d,z0,z1,c,m=8)=>mesh.box(world(x,y).slice(0,2),u,v,w,d,z0,z1,c,m);
const face=(p,m,c,uv,pick=false)=>poly(p.map(q=>world(...q)),m,c,uv,pick);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0))/2;
const ell=(x,y,rx,ry,n=32)=>Array.from({length:n},(_,i)=>[x+rx*Math.cos(i/n*2*Math.PI),y+ry*Math.sin(i/n*2*Math.PI)]);
function subtract(p,hole){if([0,1].some(k=>Math.max(...p.map(q=>q[k]))<=Math.min(...hole.map(q=>q[k]))||Math.min(...p.map(q=>q[k]))>=Math.max(...hole.map(q=>q[k]))))return[p];let signed=0;for(let i=0;i<hole.length;i++){const a=hole[i],b=hole[(i+1)%hole.length];signed+=a[0]*b[1]-b[0]*a[1];}let rest=p,kept=[];for(let i=0;i<hole.length&&rest.length>2;i++){const a=hole[i],b=hole[(i+1)%hole.length],fn=q=>Math.sign(signed)*((b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0]));const outer=clip(rest,q=>-fn(q));if(outer.length>2&&area(outer)>1e-8)kept.push(outer);rest=clip(rest,fn);}return kept;}
const groundMasks=new WeakMap(),streetHoles=[];
function triangles(ring){if(!groundMasks.has(ring)){const ix=earcut(ring.flat()),cells=[];for(let i=0;i<ix.length;i+=3)cells.push(ix.slice(i,i+3).map(j=>ring[j]));groundMasks.set(ring,cells);}return groundMasks.get(ring);}
function surface(points,z,m,c,holes=[]){let cells=triangles(points);for(const h of [...holes,...streetHoles])for(const triangle of triangles(h))cells=cells.flatMap(p=>subtract(p,triangle));for(const cell of cells)poly(cell.map(p=>W(p,z)),m,c,cell.map(p=>[p[0]/2,p[1]/2]));}
function record(type,p,extra={}){details.push({type,center:world(...p),estimated:true,...extra});}

// Rounded forms with continuous silhouettes, actual branches and mottled lobes.
function ellipsoid(x,y,z,rx,ry,rz,c,m=2,seed=0,rough=.035,steps=18,bands=10){
 const pt=(j,k)=>{const a=j/bands*Math.PI,b=k/steps*Math.PI*2,r=1+rough*(Math.sin(b*5+seed)*Math.sin(a*3)+.45*Math.cos(b*9-a*4+seed));return[x+rx*Math.sin(a)*Math.cos(b)*r,y+ry*Math.sin(a)*Math.sin(b)*r,z+rz*Math.cos(a)*r];};
 for(let j=0;j<bands;j++)for(let k=0;k<steps;k++){const tint=mul(c,.96+.06*Math.sin(j*7+k*13+seed)),uv=[[k/steps*rx*4,j/bands*rz*3],[k/steps*rx*4,(j+1)/bands*rz*3],[(k+1)/steps*rx*4,(j+1)/bands*rz*3],[(k+1)/steps*rx*4,j/bands*rz*3]];face([pt(j,k),pt(j+1,k),pt(j+1,k+1),pt(j,k+1)],m,tint,uv);}
}
function shrub(x,y,rx,ry,h,col='#9caa79',seed=0){
 const tint=seed===9?[1.30,.63,.76]:seed===5?[1.05,1.12,.87]:rgb(col);
 B([x,y,.06],[x,y,h*.62],.08,rgb('#685a43'));
 ellipsoid(x,y,h*.51,rx,ry,h*.49,tint,2,seed,.018,28,17);
 // Small surface lobes break up the silhouette without making an angular blob.
 for(let i=0;i<19;i++){const a=i*2.39996,b=.45+(i%6)*.31;ellipsoid(x+rx*.94*Math.sin(b)*Math.cos(a),y+ry*.94*Math.sin(b)*Math.sin(a),h*.51+h*.45*Math.cos(b),rx*.10,ry*.095,h*.055,tint,2,seed+i,.04,7,5);}
 if(seed===5||seed===9)for(let i=0;i<1150;i++){const angle=i*2.39996,z=1-2*(i+.5)/1150,r=Math.sqrt(1-z*z),a=[x+rx*1.013*r*Math.cos(angle),y+ry*1.013*r*Math.sin(angle),h*.51+h*.495*z],s=seed===5?.010:.012,c=rgb(i%5?'#a74830':'#b58a45');face([[a[0]-s,a[1],a[2]-s],[a[0]+s,a[1],a[2]-s],[a[0],a[1]-.012,a[2]+s]],8,c);}
 record('clipped-shrub',[x,y,0],{height:h,radii:[rx,ry],reference:['01','02','06']});
}
function hedge(points,h=.95,w=.72,c='#9caa79'){
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],d=sub(b,a),L=len(d),t=norm(d),normal=[-t[1],t[0]],n=Math.ceil(L/.55),profile=[[-.50,.03],[-.54,.67],[-.48,.88],[-.32,.98],[0,1.02],[.32,.98],[.48,.88],[.54,.67],[.50,.03]],at=(s,k)=>{const p=mix(a,b,s/n),[side,z]=profile[k],rough=.018*Math.sin(s*1.2+i);return[p[0]+normal[0]*side*w,p[1]+normal[1]*side*w,h*z+rough];};for(let j=0;j<n;j++)for(let k=0;k<profile.length-1;k++)face([at(j,k),at(j+1,k),at(j+1,k+1),at(j,k+1)],2,rgb(c),[[j*.55,k*.24],[(j+1)*.55,k*.24],[(j+1)*.55,(k+1)*.24],[j*.55,(k+1)*.24]]);for(const j of [0,n])face(profile.map((_,k)=>at(j,k)),2,rgb(c),profile.map(([side,z])=>[side*w,z*h]));}
 details.push({type:'hedge',points:points.map(p=>world(...p)),height:h,estimated:true});
}
function tree(x,y,h,r,seed=0,conifer=false){
 const bark=rgb('#766b56');B([x,y,.03],[x+.12,y,h*.87],h*.028,bark);
 if(conifer){for(let j=0;j<9;j++){const z=h*(.19+j*.084),rr=r*(1-j*.095);for(let k=0;k<6;k++){const a=k*Math.PI/3+j*.67,dx=Math.cos(a)*rr,dy=Math.sin(a)*rr;B([x,y,z+.30],[x+dx,y+dy,z-.20],.035,bark);ellipsoid(x+dx*.55,y+dy*.55,z,rr*.62,rr*.58,h*.06,rgb('#81998e'),2,seed+j+k,.16,9,5);}}}
 else{for(let j=0;j<8;j++){const a=j*2.4,dx=Math.cos(a)*r*.6,dy=Math.sin(a)*r*.6,z=h*.67+.55*Math.sin(j);B([x,y,h*.37],[x+dx,y+dy,z],h*.009,bark);ellipsoid(x+dx,y+dy,z,r*.67,r*.67,h*.23,rgb(j%3?'#96a779':'#a7ab6b'),2,seed+j,.11,13,8);}ellipsoid(x,y,h*.86,r*.55,r*.52,h*.14,rgb('#a5b38a'),2,seed,.08,13,8);}
 record(conifer?'conifer':'garden-tree',[x,y,0],{height:h,crownRadius:r,reference:conifer?'07':['03','04']});
}

// Join round tapered sections: used for the weathered stone statue and urn.
function lathe(x,y,rows,c=C.stone,segments=32,fold=0){
 const pt=(row,k)=>{const [z,rx,ry=rx,dx=0,dy=0]=row,a=k/segments*Math.PI*2,r=1+fold*Math.cos(a*11+z*2);return[x+dx+rx*r*Math.cos(a),y+dy+ry*r*Math.sin(a),z];};
 for(let j=0;j<rows.length-1;j++)for(let k=0;k<segments;k++)face([pt(rows[j],k),pt(rows[j],k+1),pt(rows[j+1],k+1),pt(rows[j+1],k)],8,mul(c,.96+.035*Math.sin(k*3+j)),undefined);
 face(Array.from({length:segments},(_,k)=>pt(rows.at(-1),k)),8,c);
}
function roundLimb(a,b,r0,r1,c){const aa=world(...a),bb=world(...b),d=norm(sub(bb,aa)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=norm(Math.abs(d[2])>.95?cross(d,[1,0,0]):cross(d,[0,0,1])),n=cross(d,t),p=(c,r,i)=>add(c,add(mul(t,r*Math.cos(i*Math.PI/6)),mul(n,r*Math.sin(i*Math.PI/6))));for(let i=0;i<12;i++)poly([p(aa,r0,i),p(aa,r0,i+1),p(bb,r1,i+1),p(bb,r1,i)],8,c);}
function statue(x,y){
 const stone=rgb('#c4bdad');lathe(x,y,[[.05,.46],[.10,.50],[.15,.50],[.18,.43],[.46,.43],[.49,.48],[.56,.48],[.59,.37]],stone);
 for(let i=0;i<14;i++){const a=i*Math.PI/7;ellipsoid(x+.435*Math.cos(a),y+.435*Math.sin(a),.31,.055,.055,.09,mul(stone,.9),8,i,0,8,6);}
 lathe(x,y,[[.58,.26,.18],[.63,.25,.18],[.82,.18,.15,-.025],[1.00,.15,.12,-.03],[1.16,.17,.12],[1.28,.14,.10,.04],[1.41,.20,.115,.04],[1.52,.17,.10,.035],[1.58,.075,.065,.05]],stone,40,.105);
 ellipsoid(x+.08,y-.01,1.70,.098,.087,.13,stone,8,0,.015,18,12);
 ellipsoid(x+.095,y+.048,1.715,.108,.075,.12,mul(stone,.83),8,0,.045,16,10);
 ellipsoid(x+.08,y-.099,1.685,.024,.035,.038,stone,8,0,0,10,7);
 // One arm bends upward underneath the planter; the other rests at the waist.
 const limb=(a,b,r0,r1)=>roundLimb([x+a[0],y+a[1],a[2]],[x+b[0],y+b[1],b[2]],r0,r1,stone);
 limb([-.12,0,1.47],[-.26,-.01,1.32],.080,.065);limb([-.26,-.01,1.32],[-.30,-.07,1.66],.065,.045);
 limb([.18,0,1.48],[.28,-.02,1.25],.08,.06);limb([.28,-.02,1.25],[.12,-.16,1.17],.06,.045);
 ellipsoid(x-.31,y-.075,1.67,.07,.06,.055,stone,8,1,0,12,8);
 ellipsoid(x+.12,y-.16,1.17,.06,.034,.05,stone,8,2,0,10,7);
 // Drapery, belt, two feet and a small trailing stone support.
 for(let i=0;i<8;i++){const a=i*.42;B([x-.15+i*.04,y-.13,1.16],[x-.22+i*.061,y-.17,.67],.018,mul(stone,.83));}
 lathe(x+.01,y,[[1.17,.172,.122],[1.20,.169,.12]],mul(stone,.87),32);
 ellipsoid(x-.12,y-.14,.62,.078,.14,.045,stone,8,0,0,12,7);ellipsoid(x+.13,y-.15,.62,.073,.135,.045,stone,8,0,0,12,7);
 limb([.12,.04,.64],[.28,.06,1.04],.08,.06);
 lathe(x-.25,y-.06,[[1.62,.12],[1.65,.17],[1.72,.20],[1.88,.24],[1.92,.25],[1.95,.25]],stone,36);
 face(ell(x-.25,y-.06,.214,.214).map(p=>[...p,1.953]),8,rgb('#59523a'));
 for(let i=0;i<7;i++){const a=i*2.4;B([x-.25,y-.06,1.94],[x-.25+Math.cos(a)*.14,y-.06+Math.sin(a)*.14,2.06+(i%3)*.04],.012,rgb('#798450'));ellipsoid(x-.25+Math.cos(a)*.13,y-.06+Math.sin(a)*.13,2.03+(i%3)*.04,.055,.055,.06,rgb('#b0be86'),2,i,.1,7,5);}
 record('stone-statue-with-planter',[x,y,0],{height:2.13,reference:'05',description:'Figure drapée sur socle rond décoré, un bras portant une vasque plantée.'});
}

const mainFront=-3.96,mainBack=5.37,ridge=(mainFront+mainBack)/2,eaves=3.12,rise=4.92;
const roofH=y=>eaves+rise*(1-Math.abs(y-ridge)/((mainBack-mainFront)/2));
const dormerBase=roofH(-3.05)+.045;
const dormers=[-5.83,-.97,3.78].map((x,i)=>({x,y:-3.05,w:2.50,z:dormerBase,top:dormerBase+1.65,ref:'06',side:'front',id:'front-'+i}));
const rearDormers=[-5.45,3.56].map((x,i)=>({x,y:4.45,w:2.08,z:roofH(4.45)+.045,top:6.03,ref:'03',side:'rear',id:'rear-'+i}));
function dormerHole(d){const back=d.side==='front'?mainFront+(d.top-eaves)/rise*(ridge-mainFront):mainBack-(d.top-eaves)/rise*(mainBack-ridge);return[[d.x-d.w/2,d.y],[d.x+d.w/2,d.y],[d.x,back]];}
function dormer(d){const [l,r,b]=dormerHole(d),front=[d.x,d.y,d.top],col=C.wood;
 face([[...l,d.z],[...r,d.z],front],3,C.glass,[[0,0],[1,0],[.5,1]],true);
 face([[...l,d.z],front,[...b,d.top]],1,C.roof,[[0,0],[1,0],[1,1]],true);face([front,[...r,d.z],[...b,d.top]],1,C.roof,[[0,0],[1,0],[0,1]],true);
 const normal=d.side==='front'?-.045:.045,Y=d.y+normal;
 for(const [a,b]of [[[d.x-d.w/2,Y,d.z],[d.x,Y,d.top]],[[d.x,Y,d.top],[d.x+d.w/2,Y,d.z]],[[d.x-d.w/2,Y,d.z],[d.x+d.w/2,Y,d.z]]])B(a,b,.135,col);
 const topAt=x=>d.top-(d.top-d.z)*Math.abs(x-d.x)/(d.w/2);
 const transoms=d.side==='front'?[.45,.70,.86]:Array.from({length:Math.floor((d.top-d.z-.12)/.39)},(_,i)=>(i+1)*.39/(d.top-d.z));
 const mullions=d.side==='front'?[-2/3,-1/3,1/3,2/3]:Array.from({length:Math.floor((d.w-.12)/.28)},(_,i)=>-1+(i+1)*.56/d.w);
 for(const t of mullions){const x=d.x+t*d.w/2;B([x,Y,d.z+.04],[x,Y,topAt(x)-.045],.043,col);}
 for(const [i,t]of transoms.entries()){const z=d.z+t*(d.top-d.z),half=d.w/2*(1-t);B([d.x-half+.03,Y,z],[d.x+half-.03,Y,z],i===0?.056:.036,col);}
 B([d.x,Y,d.z],[d.x,Y,d.top-.07],.066,col);
 record('triangular-dormer',[d.x,d.y,d.z],{side:d.side,width:d.w,height:d.top-d.z,transomHeightRatios:transoms,lowerPaneCount:d.side==='front'?6:null,reference:d.ref,roofOpening:dormerHole(d)});
}

// Cut wall openings instead of laying window pictures on solid walls.
function wall(a,b,h0,h1,os,part,col=C.wall){
 const d=sub(b,a),length=len(d),point=(s,z,inset=0)=>{const p=mix(a,b,s/length),normal=norm([d[1],-d[0]]);return[p[0]-normal[0]*inset,p[1]-normal[1]*inset,z];};
 const cuts=[0,length,...os.flatMap(o=>[o.s-o.w/2,o.s+o.w/2])].sort((a,b)=>a-b);
 for(let k=0;k<cuts.length-1;k++){const lo=cuts[k],hi=cuts[k+1],at=(lo+hi)/2,active=os.filter(o=>Math.abs(at-o.s)<o.w/2),zs=[0,...active.flatMap(o=>[o.z,o.z+o.h]),Math.max(h0,h1)].sort((a,b)=>a-b);const H=s=>h0+(h1-h0)*s/length;
  for(let j=0;j<zs.length-1;j++){const z0=zs[j],z1=zs[j+1];if(z1<=z0||active.some(o=>(z0+z1)/2>o.z&&(z0+z1)/2<o.z+o.h))continue;face([point(lo,Math.min(z0,H(lo))),point(hi,Math.min(z0,H(hi))),point(hi,Math.min(z1,H(hi))),point(lo,Math.min(z1,H(lo)))],0,col,undefined,true);}
 }
 for(const o of os){const x0=o.s-o.w/2,x1=o.s+o.w/2,z1=o.z+o.h,dep=.17;
  const solid=o.kind==='garage'||o.closed,wood=o.color||C.wood,frameColor=o.kind==='garage'?wood:rgb('#deded4');
  face([point(x0,o.z,dep),point(x1,o.z,dep),point(x1,z1,dep),point(x0,z1,dep)],solid?8:3,solid?wood:C.glass,[[0,0],[1,0],[1,1],[0,1]],true);
  for(const [sa,za,sb,zb]of [[x0,o.z,x1,o.z],[x1,o.z,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,o.z]]){face([point(sa,za),point(sb,zb),point(sb,zb,dep),point(sa,za,dep)],0,C.wall);beam(world(...point(sa,za,dep-.025)),world(...point(sb,zb,dep-.025)),.065,frameColor,8);}
  if(solid){const step=o.kind==='garage'?.22:.095;for(let z=o.z+.08;z<z1;z+=step)beam(world(...point(x0+.025,z,dep-.017)),world(...point(x1-.025,z,dep-.017)),o.kind==='garage'?.014:.029,mul(wood,.77),8);for(let s=x0+o.w/(o.kind==='garage'?5:4);s<x1-.05;s+=o.w/(o.kind==='garage'?5:4))beam(world(...point(s,o.z+.04,dep-.045)),world(...point(s,z1-.04,dep-.045)),.042,mul(wood,1.05),8);}
  else{beam(world(...point(o.s,o.z,dep-.02)),world(...point(o.s,z1,dep-.02)),.054,frameColor,8);for(let z=o.z+.40;z<z1-.12;z+=.43)beam(world(...point(x0,z,dep-.02)),world(...point(x1,z,dep-.02)),.027,frameColor,8);}
  if(o.shutters&&!solid)for(const side of [-1,1]){const c=o.s+side*(o.w*.76),ww=o.w*.46;face([point(c-ww/2,o.z,-.04),point(c+ww/2,o.z,-.04),point(c+ww/2,z1,-.04),point(c-ww/2,z1,-.04)],8,wood);for(let z=o.z+.09;z<z1;z+=.10)beam(world(...point(c-ww/2,z,-.057)),world(...point(c+ww/2,z,-.057)),.023,mul(wood,.8),8);}
  const cp=point(o.s,o.z+Math.min(1,o.h*.5),dep-.06);beam(world(cp[0]-.03,cp[1]-.04,cp[2]),world(cp[0]-.03,cp[1]-.04,cp[2]+.13),.025,rgb('#3f403b'),8);
  openings.push({part,kind:o.kind||'window',side:o.side||'front',center:world(...point(o.s,o.z+o.h/2)),width:o.w,height:o.h,depth:dep,reference:o.ref||'06',observed:o.observed!==false,dimensions:'estimated'});
 }
}

const definitions=[{id:14,osm:'way/156707307',label:'14 · maison aux trois lucarnes',main:true},{id:140,osm:'way/156685169',label:'14 · prolongement arrière vitré',annex:true},{id:16,osm:'way/156699365',label:'Voisine à droite · pignon et balcon',neighbor:true,style:'balcony'},{id:12,osm:'way/156676243',label:'Voisine à gauche · deux lucarnes',neighbor:true,style:'dormers'},{id:120,osm:'way/156684861',label:'Voisine à gauche · petite annexe',annex:true,neighbor:true}];
for(const def of definitions){
 const f=source.features.find(f=>f.properties.osm_id===def.osm),p=f.geometry.coordinates[0].slice(0,-1).map(frame);mesh.setPart(def.id);
 const lo=[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1]))],hi=[Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
 const neighborHeight=def.style==='balcony'?4.20:3.08,neighborRise=def.style==='balcony'?3.3:3.55;
 const nRoof=(x,y)=>def.style==='balcony'?neighborHeight+neighborRise*(1-Math.abs(x-(lo[0]+hi[0])/2)/((hi[0]-lo[0])/2)):neighborHeight+neighborRise*(1-Math.abs(y-(lo[1]+hi[1])/2)/((hi[1]-lo[1])/2));
 const h=(x,y)=>def.annex?2.55+.11*(hi[1]-y):def.main?(y<mainFront?2.70+(y+5.43)*.30:y>mainBack?2.56+.10*(8.10-y):roofH(y)):nRoof(x,y);
 const cuts=def.main?[mainFront,ridge,mainBack]:def.annex?[]:[(def.style==='balcony'?lo[0]+hi[0]:lo[1]+hi[1])/2];
 const axis=def.style==='balcony'?0:1,ix=earcut(p.flat());let projected=0;
 for(let i=0;i<ix.length;i+=3){let cells=[ix.slice(i,i+3).map(j=>p[j])];for(const cut of cuts)cells=cells.flatMap(cell=>[clip(cell,q=>q[axis]-cut),clip(cell,q=>cut-q[axis])]).filter(cell=>cell.length>2&&area(cell)>1e-7);
  for(let cell of cells){projected+=area(cell);let sections=[cell];if(def.main&&cell.every(q=>q[1]>=mainFront-1e-5&&q[1]<=mainBack+1e-5))for(const d of [...dormers,...rearDormers])sections=sections.flatMap(q=>subtract(q,dormerHole(d)));
   for(const q of sections)poly(q.map(a=>W(a,h(...a))),def.annex?3:1,def.annex?rgb('#8e9d9f'):def.neighbor?rgb(def.style==='balcony'?'#b2a58f':'#a69780'):C.roof,q.map(a=>[a[0]/1.4,a[1]/1.4]),true);
  }
 }
 roofAreas.push({id:def.id,footprint:area(p),roofProjected:projected});
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length],L=len(sub(b,a)),front=def.main&&Math.abs(a[1]-mainFront)<.4&&Math.abs(b[1]-mainFront)<.4,garage=def.main&&a[1]<-5.1&&b[1]<-5.1,rear=def.main&&a[1]>5&&b[1]>5&&Math.abs(a[1]-b[1])<.5;
  const span=(x,w,z,hh,extra={})=>({s:(x-a[0])/(b[0]-a[0])*L,w,z,h:hh,...extra});
  let os=garage?[{s:L/2,w:L-.26,z:.10,h:2.40,kind:'garage'}]:front?[span(-1.52,1.44,.10,2.38,{kind:'french-door',shutters:true}),span(3.15,2.48,.10,2.32,{closed:true,kind:'shutters'})]:rear?[span((a[0]+b[0])/2,Math.min(1.6,L*.7),.14,2.23,{kind:'french-door',side:'rear',ref:'03'})]:[];
  if(def.neighbor&&L>5.0&&i%2===0)os=[{s:L*.33,w:1.15,z:.90,h:1.45,shutters:true,ref:def.style==='balcony'?'07':'08',side:'context'}];
  if(rear&&L>6.0)os=[.20,.50,.80].map(t=>({s:L*t,w:1.28,z:.14,h:2.23,kind:'french-door',side:'rear',ref:'03'}));
  if(def.style==='balcony'&&a[0]>18&&a[0]<20&&b[0]>25)os=[{s:L*.50,w:1.45,z:.12,h:2.1,kind:'french-door',shutters:true,ref:'07'},{s:L*.50,w:1.45,z:2.89,h:2.04,kind:'french-door',shutters:true,ref:'07'}];
  if(def.annex&&L>2.4)os=[{s:L/2,w:L-.25,z:.42,h:1.95,side:'rear',ref:'03',kind:'veranda-glazing'}];
  os=os.filter(o=>o.s-o.w/2>.05&&o.s+o.w/2<L-.05);
  const stops=[0,1];for(const c of cuts){const t=(c-a[axis])/(b[axis]-a[axis]);if(t>0&&t<1)stops.push(t);}stops.sort((a,b)=>a-b);
  for(let j=0;j<stops.length-1;j++){const pa=mix(a,b,stops[j]),pb=mix(a,b,stops[j+1]),start=stops[j]*L,end=stops[j+1]*L;wall(pa,pb,h(...pa),h(...pb),os.filter(o=>o.s-o.w/2>=start-.01&&o.s+o.w/2<=end+.01).map(o=>({...o,s:o.s-start})),def.id,def.neighbor?rgb('#d0c6ac'):C.wall);B([...pa,h(...pa)+.04],[...pb,h(...pb)+.04],.10,C.trim);}
 }
 if(def.main){for(const d of [...dormers,...rearDormers])dormer(d);
  B([-8.1,ridge,8.07],[6.3,ridge,8.07],.16,C.trim);
  // Dark gutters on both long eaves and bends into downpipes.
  for(const y of [mainFront,mainBack])B([-8.1,y,3.10],[6.3,y,3.10],.12,rgb('#4b4e4b'));
  for(const [x,y,z]of [[6.30,mainFront,3.08],[-8.07,-5.43,2.70],[6.26,mainBack,3.08]])B([x,y,.12],[x,y,z],.074,rgb('#646764'));
  box(5.18,ridge-.08,.55,.62,7.60,8.79,rgb('#aaa99e'));for(const x of [4.98,5.38])box(x,ridge-.08,.06,.48,8.78,9.03,rgb('#626760'));box(5.18,ridge-.08,.78,.82,9.03,9.14,rgb('#666b64'));record('capped-chimney',[5.18,ridge,8.0],{reference:'06'});
  for(const [x,y,w,d]of [[-.86,3.42,.75,1.04],[1.10,3.35,.44,.55]]){const q=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+a*w/2,y+b*d/2]);face(q.map(p=>[...p,roofH(p[1])+.065]),3,C.glass,[[0,0],[1,0],[1,1],[0,1]]);for(let i=0;i<4;i++)B([...q[i],roofH(q[i][1])+.09],[...q[(i+1)%4],roofH(q[(i+1)%4][1])+.09],.064,rgb('#c4c7c1'));record('rear-rooflight',[x,y,roofH(y)],{reference:'03'});}
  // Porch lantern, number plate and threshold.
  box(-.24,mainFront-.16,.15,.17,2.43,2.68,rgb('#393c36'));box(-.24,mainFront-.17,.10,.12,2.46,2.64,rgb('#d0c6a1'));box(-2.78,mainFront-.025,.26,.025,1.47,1.65,rgb('#746c5c'));
  B([-2.85,mainFront-.048,1.49],[-2.85,mainFront-.048,1.62],.015,rgb('#ece6d5'));B([-2.75,mainFront-.048,1.62],[-2.80,mainFront-.048,1.54],.015,rgb('#ece6d5'));B([-2.80,mainFront-.048,1.54],[-2.70,mainFront-.048,1.54],.015,rgb('#ece6d5'));B([-2.72,mainFront-.048,1.62],[-2.72,mainFront-.048,1.49],.015,rgb('#ece6d5'));
  box(-1.52,mainFront-.27,1.65,.50,.04,.12,rgb('#b7b2a4'));
 }
 if(def.style==='balcony'){
  const x=22.72,y=-6.04,z=2.72;box(x,y,3.2,1.70,z,z+.17,C.wood);for(const xx of [x-1.5,x+1.5]){B([xx,y-.74,z],[xx,y-.74,z+1.12],.08,C.wood);B([xx,y+.70,z],[xx,y+.70,z+1.12],.07,C.wood);B([xx,y-.74,z+1.12],[xx,y+.70,z+1.12],.07,C.wood);}B([x-1.5,y-.74,z+1.12],[x+1.5,y-.74,z+1.12],.07,C.wood);for(let xx=x-1.40;xx<x+1.5;xx+=.20)B([xx,y-.74,z+.17],[xx,y-.74,z+1.1],.035,C.wood);record('neighbor-balcony',[x,y,z],{reference:'07'});
 }
 if(def.style==='dormers')for(const x of [-31.5,-26.7]){const y=-9.60,z=nRoof(x,y)+.02,w=1.8;face([[x-w/2,y,z],[x+w/2,y,z],[x+w/2,y,z+1.2],[x,y,z+2.0],[x-w/2,y,z+1.2]],0,C.wall);face([[x-.53,y-.025,z+.13],[x+.53,y-.025,z+.13],[x+.53,y-.025,z+1.14],[x-.53,y-.025,z+1.14]],3,C.glass,[[0,0],[1,0],[1,1],[0,1]]);for(const side of [-1,1]){face([[x,y-.10,z+2.04],[x+side*1.04,y-.10,z+1.19],[x+side*1.04,y+1.8,z+1.19],[x,y+1.8,z+2.04]],1,rgb('#9e8975'));B([x,y-.10,z+2.04],[x+side*1.04,y-.10,z+1.19],.10,C.wood);}B([x,y-.06,z+.13],[x,y-.06,z+1.92],.055,C.wood);record('neighbor-dormer',[x,y,z],{reference:'08'});}
 parts.push({id:def.id,osmId:def.osm,label:def.label,address:def.id===14?'14':null,footprint:f.geometry.coordinates[0],refs:def.main?['06','01','02','03','04']:def.style==='balcony'?['07']:def.neighbor?['08']:['03'],confidence:def.id===14?'Adresse et repère fournis par l’utilisateur ; proportions estimées sur les clichés.':'Emprise OSM ; architecture simplifiée d’après les vues fournies.'});
}

mesh.setPart(null);
// The street already supplies its own kerb and pavement. Cut the garden ground
// against that exact mesh, so no added surface competes at the same depth.
const cityRoads=JSON.parse(await fs.readFile('dist/data/city-roads/index.json'));
for(const [file,x0,y0,x1,y1]of cityRoads.nodes){
 if(x0>=-350||x1<=-480||y0>=2840||y1<=2750)continue;
 const bytes=await fs.readFile('dist/data/city-roads/'+file),size=bytes.readUInt32LE(0),a=new Float32Array(bytes.buffer.slice(bytes.byteOffset+4+size,bytes.byteOffset+bytes.length));
 for(let i=0;i<a.length;i+=33){if(Math.max(a[i+2],a[i+13],a[i+24])>.5)continue;const p=[0,11,22].map(k=>{const d=[a[i+k]-anchor[0],a[i+k+1]-anchor[1]];return[dot(d,u),dot(d,v)];});if(Math.min(...p.map(q=>q[0]))>32||Math.max(...p.map(q=>q[0]))<-40||Math.min(...p.map(q=>q[1]))>31||Math.max(...p.map(q=>q[1]))<-24)continue;streetHoles.push(p);}
}
const footprintHoles=parts.map(p=>p.footprint.slice(0,-1).map(frame));
const drive=[[-9.85,-12.18],[-6.10,-12.35],[-3.28,-10.70],[-2.60,-6.4],[-2.80,-4.02],[-8.18,-4.02],[-8.16,-5.38],[-9.85,-5.48]];
const terrace=[[-8.9,5.40],[6.8,5.40],[6.8,9.80],[4.9,11.3],[-8.9,11.3]];
const frontPlot=[[-10.2,-12.15],[-6,-12.55],[-.6,-12.35],[6.0,-14.30],[9.95,-18.5],[10.2,30.2],[-10.2,30.2]];
surface(frontPlot,.035,6,rgb('#9aa383'),[...footprintHoles,drive,terrace]);
// Stone cells and mortar share one plane with disjoint interiors: no stacked
// decal triangles to flicker when the player flies above the garden.
function paving(polygon,z,stepX,stepY,col){const y0=Math.floor(Math.min(...polygon.map(p=>p[1]))/stepY)*stepY,y1=Math.max(...polygon.map(p=>p[1])),x0=Math.floor(Math.min(...polygon.map(p=>p[0]))/stepX)*stepX-stepX,x1=Math.max(...polygon.map(p=>p[0]));for(let y=y0,row=0;y<y1;y+=stepY,row++)for(let x=x0+(row%2)*stepX/2;x<x1;x+=stepX){const cell=clip(clip(clip(clip(polygon,p=>p[0]-x),p=>x+stepX-p[0]),p=>p[1]-y),p=>y+stepY-p[1]);if(cell.length<3)continue;const bottom=clip(cell,p=>y+.013-p[1]),top=clip(cell,p=>p[1]-y-.013),joint=clip(top,p=>x+.013-p[0]),stone=clip(top,p=>p[0]-x-.013);for(const q of [bottom,joint])if(q.length>2)surface(q,z,8,rgb('#686c5f'),footprintHoles);if(stone.length>2)surface(stone,z,8,mul(col,.97+.025*Math.sin(x*15+y*27)),footprintHoles);}}
paving(drive,.045,.29,.20,rgb('#898979'));paving(terrace,.046,.65,.48,rgb('#b9ac96'));
// A narrow curved access to the door stays clear of the topiary.
const path=[[-3.2,-9.6],[-2.45,-7.7],[-1.50,-6.0],[-1.5,-4.12]];for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],t=norm(sub(b,a)),n=[-t[1]*.40,t[0]*.40];surface([add(a,n),sub(a,n),sub(b,n),add(b,n)],.055,8,rgb('#969589'));}
record('existing-street-kerb',[-1,-13,0],{source:'city-roads',additionalKerb:false,groundClippedToStreet:true});
shrub(-1.30,-6.65,1.64,1.44,2.86,'#a9bc82',3);
shrub(-1.15,-10.08,1.89,1.58,1.88,'#9e9275',5);
shrub(1.25,-9.37,1.33,1.23,3.47,'#b89479',9);
hedge([[-2.4,-6.26],[-2.30,-7.60],[-1.4,-8.2],[.45,-7.90]],.91,.70,'#7f936c');
hedge([[3.5,-13.45],[6.0,-14.30],[9.75,-18.3]],1.10,.82,'#b4ae78');
hedge([[9.8,-18.3],[10.2,8.5],[10.2,30.2],[-10.2,30.2],[-10.2,2.4]],1.70,.90,'#94a581');
hedge([[-10.15,2.4],[-10.1,-11.95]],2.50,1.10,'#8ca378');
statue(4.2,-7.12);
record('front-drive-without-vehicle',[-6.2,-8.3,0],{reference:['01','02','06']});
record('rear-terrace',[0,9.8,0],{reference:'03'});record('rear-garden',[0,19,0],{reference:['03','04']});
// Trees mostly frame the lawn, preserving a usable open rear garden.
for(const a of [[-8.8,10.9,9.6,3.2,10],[-8.4,20.6,11.3,3.8,20],[-5.5,28.1,12.6,4.3,30],[4.7,28.0,12.8,4.0,40],[8.3,20.5,10.9,3.2,50],[8.5,11.7,9.2,2.7,60]])tree(...a);
tree(-10.7,-8.2,10.3,2.45,71,false);tree(10.1,2.2,8.8,1.9,72,true);
for(const [x,y,r,h]of [[-8.8,15,.75,1.4],[-8.9,25,1.05,1.7],[7.9,15,.8,1.5],[7.8,25,.9,1.6],[-4,27.5,.7,1.2],[1.2,28,.8,1.3]])shrub(x,y,r,r*.8,h,'#a1b38a',x+y);
// A few rose stems and low beds around the statue, as visible in the front view.
for(const [x,y]of [[6.9,-11.0],[8.1,-7.9],[7.3,-4.6]]){for(let i=0;i<5;i++){const a=i*2.4;B([x,y,.03],[x+Math.cos(a)*.30,y+Math.sin(a)*.30,.55+i*.08],.018,rgb('#72784d'));ellipsoid(x+Math.cos(a)*.3,y+Math.sin(a)*.3,.55+i*.08,.13,.12,.15,rgb('#a5b887'),2,i,.10,7,5);}record('rose-bed',[x,y,0],{reference:'06'});}
// Context houses receive their recognizable silhouettes and broad planting only.
surface([[12.5,-12.0],[30.7,-13.0],[31,15.2],[13.0,19.0]],.027,6,rgb('#959c7a'),footprintHoles);
hedge([[12.5,-12],[27,-12.7]],1.0,.8,'#b0b37e');tree(21,-9.8,11.0,3.6,84,true);
const leftGarden=[[-39,-22],[-28,-22],[-23,-19],[-16,-14],[-10.2,-12.15],[-10.2,17],[-39,15]];
surface(leftGarden,.035,6,rgb('#98a17c'),footprintHoles);
record('connected-left-garden',[-13,-4,0],{outline:leftGarden.map(p=>world(...p)),reference:'user-annotated-corrections',groundClippedToStreet:true});
tree(-33,-15,7.3,2.7,88);shrub(-19,-10,.9,.8,1.8,'#aab185',92);
for(const x of [-29.8,-26.4]){box(x,-16.25,.16,.16,.05,1.12,C.wood);B([x,-16.25,.32],[x+1.6,-16.25,.32],.09,C.wood);B([x,-16.25,1.0],[x+1.6,-16.25,1.0],.09,C.wood);B([x,-16.25,.32],[x+1.6,-16.25,1.0],.10,C.wood);}

await fs.mkdir(out+'/references',{recursive:true});for(const file of att.textures)await fs.copyFile('dist/data/attila/'+file,out+'/'+file);
const titles=['Façade oblique et allée','Façade depuis la droite','Jardin et toiture arrière','Vue aérienne oblique','Statue et vasque','Façade principale et trois lucarnes','Voisine à droite et conifère','Voisine à gauche et deux lucarnes'];
const references=[];for(let i=1;i<=8;i++){const id=String(i).padStart(2,'0'),raw=await fs.readFile('references_parc14/'+id+'.png'),file='references/'+id+'.png';await fs.writeFile(out+'/'+file,raw);references.push({id,title:titles[i-1],file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),source:'Capture Google Maps / Street View fournie par l’utilisateur',role:i>6?'neighbor-context':'house-reference'});}
const result=mesh.finish(),a=result.vertices,bounds=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=11){const q=geo([a[i],a[i+1]]);bounds[0]=Math.min(bounds[0],q[0]);bounds[1]=Math.min(bounds[1],q[1]);bounds[2]=Math.max(bounds[2],q[0]);bounds[3]=Math.max(bounds[3],q[1]);}
const index={version:1,name:'14 · rue de la Résidence du Parc',origin,scale,bounds,gameAnchor:anchor,frame:{u,v},vertexCount:a.length/11,materials:att.materials,textures:att.textures,ranges:result.ranges,excludeIds:parts.map(p=>p.osmId),parts,objectRanges:result.objects,pickTriangles:result.pickTriangles,siteDetails:details,stats:{buildingParts:parts.length,mainBuildings:3,modelledOpenings:openings.length,triangles:a.length/33,referencePhotos:8},provenance:{footprints:'© OpenStreetMap contributors · existing project extract',references:'Eight user-supplied Google Maps / Street View screenshots',dimensions:'Visually estimated. Hidden garden limits and rear openings interpreted from oblique views.',vehicles:'No vehicle modeled',address:'14 rue de la Résidence du Parc, game anchor provided by user'}};
await fs.writeFile(out+'/mesh.bin',Buffer.from(a.buffer));await fs.writeFile(out+'/index.json',JSON.stringify(index));await fs.writeFile(out+'/survey.json',JSON.stringify({origin,scale,gameAnchor:anchor,parts,openings,roofAreas,details,references},null,2));
await fs.writeFile('dist/parc14-references.html',`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>14 · Résidence du Parc · références</title><style>body{font:16px/1.6 system-ui;color:#29372e;background:#eceee6;max-width:1150px;margin:auto;padding:30px}article{background:white;padding:20px;margin:25px 0}img{max-width:100%;height:auto}a{color:#346746}</style><h1>14 · rue de la Résidence du Parc</h1><p><a href="./#parc14">Voir la maison dans la carte</a> · <a href="./parc14-preview.html">Explorer le modèle</a></p><p>Repère du jeu : −413, 2800. Huit captures fournies, crédits Google Maps / Street View. Les proportions et limites du jardin sont estimées à partir de ces vues. Les deux voisines sont simplifiées.</p>${references.map(r=>`<article id="${r.id}"><h2>${r.id} · ${r.title}</h2><img loading="lazy" src="data/parc14/${r.file}" alt="${r.title}"></article>`).join('')}</html>`);
await buildCustomModelRegistry();console.log(JSON.stringify(index.stats));

