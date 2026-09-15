import fs from 'node:fs/promises';

import crypto from 'node:crypto';

import earcut from 'earcut';

import {meshTools,add,sub,mul,dot,len,norm,mix,rgb,clip} from './attila-geometry.mjs';

import {buildCustomModelRegistry} from './build-custom-model-registry.mjs';

import {buildBuiretteOdd} from './buirette-odd-geometry.mjs';
import {buildBuirette15} from './buirette-15-geometry.mjs';



const out='dist/data/buirette', origin=[4.3759,48.9613];

const scale=[111320*Math.cos(origin[1]*Math.PI/180),111320];

const local=p=>p.map((v,i)=>(v-origin[i])*scale[i]),geo=p=>p.map((v,i)=>v/scale[i]+origin[i]);

const source=JSON.parse(await fs.readFile('dist/data/buildings.geojson','utf8'));

const referenceRows=JSON.parse(await fs.readFile('references_buirette_12_20/positions.json','utf8'));

const attila=JSON.parse(await fs.readFile('dist/data/attila/index.json','utf8'));

const materials=structuredClone(attila.materials),textures=[...attila.textures];

const mesh=meshTools(),{poly,beam,box,crown}=mesh,parts=[],openings=[],details=[],roofAreas=[];

const ivory=rgb('#e2dfd4'),metal=rgb('#555954'),blue=rgb('#657fac'),brick=rgb('#a3654b');

const area=p=>Math.abs(p.reduce((a,q,i)=>{const r=p[(i+1)%p.length];return a+q[0]*r[1]-r[0]*q[1]},0))/2;

const defs=[

 {id:12,osmId:'way/156702234',label:'12 · pierre et briques',address:'12',eaves:7.45,rise:1.45,color:'#aea18a',refs:['09','10','07','08'],front:[[4.3757,48.961444],[4.37565,48.961501]]},

 {id:14,osmId:'way/156688390',label:'14 · maison beige et garage',address:'14',eaves:6.85,rise:1.3,color:'#d2b994',refs:['07','08','15','06'],front:[[4.375768,48.961367],[4.3757,48.961444]]},

 {id:16,osmId:'way/156675732',label:'16 · maison blanche et garage',address:'16',eaves:7.05,rise:1.6,color:'#e0ddd3',refs:['05','06','11','15'],front:[[4.375834,48.961291],[4.375768,48.961367]]},

 {id:180,osmId:'way/156702655',label:'Secteur 18–20 · bâtiment bas',address:null,eaves:2.7,rise:1.35,color:'#dad7be',refs:['04','14'],front:[[4.3758,48.961115],[4.375694,48.961233]]},

 {id:181,osmId:'way/156682319',label:'Secteur 18–20 · retour du bâtiment bas',address:null,eaves:2.7,rise:1.35,color:'#dad7be',refs:['04','14'],front:[[4.375835,48.961076],[4.3758,48.961115]]}

];

await fs.mkdir(out+'/references',{recursive:true});

for(const file of textures)await fs.copyFile('dist/data/attila/'+file,out+'/'+file);



function rail(a,b,z0,z1,col=metal){beam([...a,z0],[...b,z0],.035,col,8);beam([...a,z1],[...b,z1],.045,col,8);const n=Math.ceil(len(sub(b,a))/.14);for(let i=0;i<=n;i++){const p=mix(a,b,i/n);beam([...p,z0],[...p,z1],.022,col,8);}}



for(const o of defs){

 const f=source.features.find(f=>f.properties.osm_id===o.osmId);if(!f)throw Error('Missing footprint '+o.osmId);

 const ring=f.geometry.coordinates[0].slice(0,-1).map(local),u=norm(sub(local(o.front[1]),local(o.front[0]))),v=[-u[1],u[0]];

 const xy=ring.map(p=>[dot(p,u),dot(p,v)]),lo=[Math.min(...xy.map(p=>p[0])),Math.min(...xy.map(p=>p[1]))],hi=[Math.max(...xy.map(p=>p[0])),Math.max(...xy.map(p=>p[1]))];

 const w=hi[0]-lo[0],d=hi[1]-lo[1],frontY=dot(local(o.front[0]),v),world=(x,y,z)=>[...add(mul(u,x),mul(v,y)),z],P=(x,y)=>world(x,y,0).slice(0,2);

 const sections=o.id===14?[[lo[0],lo[0]+w*.315,2.72,.03],[lo[0]+w*.315,hi[0],o.eaves,o.rise]]:o.id===16?[[lo[0],lo[0]+w*.69,o.eaves,o.rise],[lo[0]+w*.69,hi[0],5.3,.58]]:[[lo[0],hi[0],o.eaves,o.rise]];

 const rh=(x,y,sec)=>{const s=sec||sections.find((s,i)=>x<s[1]-1e-7||i===sections.length-1);return s[2]+s[3]*Math.max(0,Math.min((y-lo[1])*2/d,(hi[1]-y)*2/d));};

 mesh.setPart(o.id);const color=rgb(o.color),roofTint=rgb(o.id===12?'#b4b5a5':o.id>=180?'#e2bba0':'#bdbaaa');

 // Clip every roof section to the original OSM polygon, including setbacks.

 const ix=earcut(xy.flat());let covered=0;

 for(const s of sections)for(let i=0;i<ix.length;i+=3){let cell=ix.slice(i,i+3).map(j=>xy[j]);cell=clip(clip(cell,p=>p[0]-s[0]),p=>s[1]-p[0]);for(const sign of [-1,1]){const half=clip(cell,p=>(p[1]-(lo[1]+hi[1])/2)*sign);if(half.length<3||area(half)<1e-7)continue;covered+=area(half);poly(half.map(p=>world(...p,rh(...p,s))),1,roofTint,half.map(p=>[p[0]/1.3,p[1]/1.3]),true);}}

 roofAreas.push({id:o.id,footprint:area(xy),roofProjected:covered});

 const specs=[],win=(x,z,ww,hh,extra={})=>specs.push({x:lo[0]+x*w,z,w:ww,h:hh,kind:'window',...extra}),door=(x,z,ww,hh,extra={})=>specs.push({x:lo[0]+x*w,z,w:ww,h:hh,kind:'door',...extra});

 if(o.id===12){door(.26,.12,1.19,2.62,{wood:true,arch:true,color:'#87603f'});win(.75,.82,1.15,1.98,{iron:true,frameColor:'#9b7048'});win(.26,4.3,1.15,2.06,{frameColor:'#9b7048'});win(.75,4.3,1.15,2.06,{frameColor:'#9b7048'});}

 if(o.id===14){door(.158,.07,w*.273,2.40,{garage:true,color:'#75624c'});door(.44,.22,1.07,2.24,{glazed:true,color:'#39433f'});win(.365,1.45,.36,.73,{bars:true});win(.78,.67,1.52,1.64,{roller:.035,darkRoller:true});win(.465,4.06,1.20,1.35);win(.78,3.9,1.46,1.62,{roller:.035,darkRoller:true});}

 if(o.id===16){for(const x of [.17,.52]){win(x,.76,1.08,1.91,{iron:true});win(x,4.20,1.09,1.70,{iron:true,roller:.38});}door(.842,.08,w*.265,2.7,{garage:true,color:'#a46d42'});win(.842,3.58,1.10,1.36,{closed:true,color:'#7186ac'});}

 if(o.id===180){win(.26,1.55,.75,.60,{closed:true,color:'#627994'});win(.58,1.52,.80,.67,{bars:true});win(.83,1.48,.60,.75,{closed:true,color:'#7084a4'});}

 // Merge collinear OSM nodes for openings that straddle an intermediate node.

 const walls=ring.map(p=>[...p]);let changed=true;

 while(changed&&walls.length>3){changed=false;for(let i=0;i<walls.length;i++){const a=walls[(i+walls.length-1)%walls.length],b=walls[i],c=walls[(i+1)%walls.length],ac=sub(c,a),ab=sub(b,a),t=dot(ab,ac)/dot(ac,ac);if(t>0&&t<1&&len(sub(ab,mul(ac,t)))<.12){walls.splice(i,1);changed=true;break;}}}

 const signed=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-a[1]*b[0]},0);

 for(let j=0;j<walls.length;j++){

  const a=walls[j],b=walls[(j+1)%walls.length],l=len(sub(b,a)),t=norm(sub(b,a)),n=mul([t[1],-t[0]],signed<0?-1:1),qa=[dot(a,u),dot(a,v)],qb=[dot(b,u),dot(b,v)];

  const isFront=dot(n,mul(v,-1))>.97&&Math.abs((qa[1]+qb[1])/2-frontY)<.15;

  const point=(x,z,inset=0)=>[...add(add(a,mul(t,x)),mul(n,-inset)),z];

  const os=isFront?specs.map(s=>({...s,s:(s.x-qa[0])/(qb[0]-qa[0])*l})).filter(s=>s.s-s.w/2>.07&&s.s+s.w/2<l-.07):[];

  const cuts=[0,l];for(const s of sections.slice(0,-1)){const f=(s[1]-qa[0])/(qb[0]-qa[0]);if(f>0&&f<1)cuts.push(f*l);}cuts.sort((a,b)=>a-b);

  for(let ci=0;ci<cuts.length-1;ci++){

   const ca=cuts[ci],cb=cuts[ci+1],qmid=mix(qa,qb,(ca+cb)/2/l),sec=sections.find((s,i)=>qmid[0]<s[1]-1e-7||i===sections.length-1),eh=sec[2];

   const xs=[ca,cb,...os.flatMap(s=>[s.s-s.w/2,s.s+s.w/2]).filter(x=>x>ca&&x<cb)].sort((a,b)=>a-b),zs=[0,eh,...os.flatMap(s=>[s.z,s.z+s.h]).filter(z=>z>0&&z<eh)].sort((a,b)=>a-b);

   for(let x=0;x<xs.length-1;x++)for(let z=0;z<zs.length-1;z++){

    if(os.some(s=>Math.abs((xs[x]+xs[x+1])/2-s.s)<s.w/2&&((zs[z]+zs[z+1])/2)>s.z&&((zs[z]+zs[z+1])/2)<s.z+s.h))continue;

    poly([point(xs[x],zs[z]),point(xs[x+1],zs[z]),point(xs[x+1],zs[z+1]),point(xs[x],zs[z+1])],0,color,undefined,true);

   }

   const stops=[ca,cb],ridge=((lo[1]+hi[1])/2-qa[1])/(qb[1]-qa[1])*l;if(ridge>ca&&ridge<cb)stops.push(ridge);stops.sort((a,b)=>a-b);

   for(let k=0;k<stops.length-1;k++){const sa=stops[k],sb=stops[k+1],za=rh(...mix(qa,qb,sa/l),sec),zb=rh(...mix(qa,qb,sb/l),sec);poly([point(sa,eh),point(sb,eh),point(sb,zb),point(sa,za)],0,color,undefined,true);beam(point(sa,za,-.10),point(sb,zb,-.10),.12,ivory,8);}

   if(isFront){for(const dz of [0,-.16,-.28])beam(point(ca,eh+dz,-.06),point(cb,eh+dz,-.06),dz===-.28?.10:.16,ivory,8);beam(point(ca,eh+.03,-.19),point(cb,eh+.03,-.19),.085,rgb('#737975'),8);}

  }

  if(isFront){

   // Masonry is geometry with neutral colours; no Street View photograph is projected.

   const clear=(x,z,pad=.03)=>!os.some(s=>Math.abs(x-s.s)<s.w/2+pad&&z>s.z-pad&&z<s.z+s.h+pad);

   if(o.id===12){

    for(let row=0,z=.17;z<o.eaves-.30;row++,z+=.16)for(let col=0,x=.045+(row%2)*.13;x<l-.20;col++,x+=.27){if(!clear(x+.11,z+.055,.15))continue;const f=Math.sin(row*61+col*31),width=.18+.035*f,height=.09+.018*Math.cos(col*13+row*7),tint=.68+.50*(.5+.5*Math.sin(row*17+col*37));poly([point(x,z,-.026),point(x+width*.63,z-.012,-.035),point(x+width,z+.025,-.029),point(x+width*.88,z+height,-.032),point(x+width*.31,z+height+.012,-.028),point(x-.008,z+height*.54,-.035)],0,mul(color,tint));}

    const vertical=[.10,l-.20,...os.filter(s=>s.z>3).flatMap(s=>[s.s-s.w/2-.24,s.s+s.w/2+.05])];

    for(const x of vertical)for(let z=.25;z<o.eaves-.35;z+=.115)if(clear(x+.08,z,.03))poly([point(x,z,-.047),point(x+.18,z,-.047),point(x+.18,z+.085,-.047),point(x,z+.085,-.047)],0,mul(brick,.95+.07*Math.sin(x*17+z*5)));

    for(const z of [3.14,3.30,6.82,6.98])beam(point(0,z,-.055),point(l,z,-.055),.12,brick);

   }

   if(o.id===16){for(const z of [6.25,6.38])for(let x=0;x<l;x+=.25)if(mix(qa,qb,x/l)[0]<sections[0][1])poly([point(x,z,-.035),point(Math.min(x+.225,l),z,-.035),point(Math.min(x+.225,l),z+.085,-.035),point(x,z+.085,-.035)],0,rgb('#b8a58b'));}

   if(o.id===14){for(let z=.15;z<.60;z+=.22)for(let x=.08;x<l-.1;x+=.48)if(clear(x+.19,z,.16))poly([point(x,z,-.035),point(x+.40,z,-.035),point(x+.40,z+.17,-.035),point(x,z+.17,-.035)],0,rgb('#b8ad94'));}

   for(const s of os){

    const x0=s.s-s.w/2,x1=s.s+s.w/2,z0=s.z,z1=s.z+s.h,depth=s.garage?.13:.20;

    const col=rgb(s.color||'#d8d8d0'),frameColor=rgb(s.frameColor||(s.glazed?'#39433f':'#e2dfd4'));

    poly([point(x0,z0,depth),point(x1,z0,depth),point(x1,z1,depth),point(x0,z1,depth)],s.kind==='window'&&!s.closed||s.glazed?3:8,s.kind==='window'&&!s.closed||s.glazed?rgb('#829391'):col,[[0,0],[1,0],[1,1],[0,1]]);

    for(const [sa,za,sb,zb]of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]]){poly([point(sa,za),point(sb,zb),point(sb,zb,depth),point(sa,za,depth)],0,mul(color,.85));beam(point(sa,za,depth-.03),point(sb,zb,depth-.03),s.garage?.055:.065,s.wood?col:frameColor,8);if(!s.garage)beam(point(sa,za,-.035),point(sb,zb,-.035),o.id===12?.16:s.glazed?.25:.13,o.id===12?brick:ivory,8);}

    if(s.kind==='window'&&!s.closed&&s.w>.65)beam(point(s.s,z0,depth-.02),point(s.s,z1,depth-.02),.045,frameColor,8);

    if(s.roller){poly([point(x0,z1-s.h*s.roller,.03),point(x1,z1-s.h*s.roller,.03),point(x1,z1,.03),point(x0,z1,.03)],8,rgb(s.darkRoller?'#303b3a':o.id===16?'#afa597':'#aeaba0'));for(let z=z1-s.h*s.roller;z<z1;z+=.085)beam(point(x0,z,.02),point(x1,z,.02),.012,rgb('#918a7e'));}

    if(s.iron){rail(point(x0-.05,0,-.20).slice(0,2),point(x1+.05,0,-.20).slice(0,2),z0+.04,z0+.50,metal);for(let x=x0+.15;x<x1;x+=.3){const pts=Array.from({length:15},(_,i)=>point(x+.075*Math.cos(i*Math.PI/7),z0+.27+.12*Math.sin(i*Math.PI/7),-.215));for(let i=1;i<pts.length;i++)beam(pts[i-1],pts[i],.015,metal,8);}}

    if(o.id===12&&s.kind==='window'){

     const arch=Array.from({length:13},(_,i)=>point(s.s+(s.w/2+.10)*Math.cos(i*Math.PI/12),z1+.02+.17*Math.sin(i*Math.PI/12),-.06));for(let i=1;i<arch.length;i++)beam(arch[i-1],arch[i],.13,brick);

     beam(point(x0-.19,z1+.11,-.055),point(x0-.34,z1+.11,-.055),.25,ivory,8);beam(point(x1+.19,z1+.11,-.055),point(x1+.34,z1+.11,-.055),.25,ivory,8);

    }

    if(o.id===16&&s.kind==='window'&&!s.closed){const stone=rgb('#babfc0');beam(point(x0-.16,z1+.08,-.06),point(x1+.16,z1+.08,-.06),.23,stone,8);beam(point(s.s,z1+.12,-.075),point(s.s,z1+.32,-.075),.19,stone,8);}

    if(s.wood){const z=z0+2.02,fan=[point(s.s-.34,z,depth-.035),...Array.from({length:17},(_,i)=>point(s.s+.34*Math.cos(Math.PI-i*Math.PI/16),z+.29*Math.sin(Math.PI-i*Math.PI/16),depth-.035))];poly(fan,3,rgb('#91a7a7'));for(let i=1;i<fan.length;i++)beam(fan[i-1],fan[i],.035,mul(col,.75),8);for(const a of [Math.PI/4,Math.PI/2,3*Math.PI/4])beam(point(s.s,z,depth-.065),point(s.s+.34*Math.cos(a),z+.29*Math.sin(a),depth-.065),.025,col,8);poly([point(x0+.04,z1-.27,depth-.035),point(x1-.04,z1-.27,depth-.035),point(x1-.04,z1-.04,depth-.035),point(x0+.04,z1-.04,depth-.035)],3,rgb('#889b9b'));}

    if(s.bars)for(let x=x0+.07;x<x1;x+=.12)beam(point(x,z0,-.04),point(x,z1,-.04),.025,metal,8);

    if(s.closed)for(let x=x0+.06;x<x1;x+=.10)beam(point(x,z0,depth-.01),point(x,z1,depth-.01),.012,mul(col,.8),8);

    if(s.garage)for(let z=z0+.13;z<z1;z+=.20)beam(point(x0+.035,z,depth-.015),point(x1-.035,z,depth-.015),.017,mul(col,.8),8);

    if(s.wood){for(const xa of [x0+.13,s.s+.04])for(const za of [z0+.2,z0+1.16]){const xb=xa+s.w*.35,zb=za+.70;for(const [a,z,b,zz]of [[xa,za,xb,za],[xb,za,xb,zb],[xb,zb,xa,zb],[xa,zb,xa,za]])beam(point(a,z,depth-.025),point(b,zz,depth-.025),.034,mul(col,.78),8);}const ar=Array.from({length:17},(_,i)=>point(s.s+(s.w/2+.12)*Math.cos(i*Math.PI/16),z1+.04+.20*Math.sin(i*Math.PI/16),-.07));for(let i=1;i<ar.length;i++)beam(ar[i-1],ar[i],.12,brick);}

    if(s.kind==='door'){beam(point(x1-.12,z0+1.02,depth-.08),point(x1-.12,z0+1.20,depth-.08),.035,metal,8);if(!s.garage){for(let z=.08;z<s.z+.03;z+=.09)box(point(s.s,0,-.25).slice(0,2),t,n,s.w+.18,.50,0,z,rgb('#bdb6a9'));}}

    if(!s.garage)beam(point(x0-.1,z0-.04,-.10),point(x1+.1,z0-.04,-.10),.12,ivory,8);

    openings.push({part:o.id,kind:s.garage?'garage':s.kind,center:point(s.s,s.z+s.h/2),width:s.w,height:s.h,depth,side:'street',refs:o.refs,observed:true,dimensions:'estimated',occludedBase:o.id===16});

   }

   for(const x of [.09,l-.09]){const q=mix(qa,qb,x/l),sec=sections.find((s,i)=>q[0]<s[1]||i===sections.length-1);beam(point(x,.10,-.075),point(x,sec[2],-.075),.072,rgb('#898d85'),8);}

   // Small wall number and mailbox are geometric marks, no text raster dependency.

   if(o.address){const d0=os.find(s=>s.kind==='door'&&!s.garage),x=d0?d0.s-d0.w/2-.28:l*.1,z=d0?1.20:1.5;const digits={'1':[[.10,.20,.10,0]],'2':[[0,.20,.12,.20],[.12,.20,.12,.11],[.12,.11,0,.0],[0,0,.12,0]],'4':[[0,.20,0,.10],[0,.10,.13,.10],[.1,.20,.1,0]],'6':[[.12,.20,0,.16],[0,.16,0,0],[0,0,.12,0],[.12,0,.12,.1],[.12,.1,0,.1]]};for(let k=0;k<o.address.length;k++)for(const [a,b,c,d]of digits[o.address[k]])beam(point(x+k*.16+a,z+b,-.075),point(x+k*.16+c,z+d,-.075),.018,metal,8);}

  }

 }

 // Vertical junctions between the lower garages and the main roofs.

 for(let si=1;si<sections.length;si++){const x=sections[si][0],ys=[];for(let i=0;i<xy.length;i++){const a=xy[i],b=xy[(i+1)%xy.length];if((a[0]>x)!==(b[0]>x))ys.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));}ys.sort((a,b)=>a-b);for(let i=0;i<ys.length-1;i+=2){const a=ys[i],b=ys[i+1],stops=[a,b],mid=(lo[1]+hi[1])/2;if(mid>a&&mid<b)stops.push(mid);stops.sort((a,b)=>a-b);for(let j=1;j<stops.length;j++){const y0=stops[j-1],y1=stops[j];poly([world(x,y0,rh(x,y0,sections[si-1])),world(x,y1,rh(x,y1,sections[si-1])),world(x,y1,rh(x,y1,sections[si])),world(x,y0,rh(x,y0,sections[si]))],0,color,undefined,true);}}}

 if(o.id<180){const c=[lo[0]+w*.22,(lo[1]+hi[1])/2],z=rh(...c);box(P(...c),u,v,.50,.60,z-.1,z+.80,brick);box(P(...c),u,v,.65,.73,z+.8,z+.92,metal,8);beam(world(hi[0]-1,frontY+1,rh(hi[0]-1,frontY+1)),world(hi[0]-1,frontY+1,o.eaves+2.1),.025,metal,8);}

 const part={...o,footprint:f.geometry.coordinates[0],center:geo(P((lo[0]+hi[0])/2,(lo[1]+hi[1])/2)),dimensions:{width:w,depth:d,eaves:o.eaves,ridge:o.eaves+o.rise},frame:{u,v,lo,hi,frontY},roofSections:sections,confidence:o.address?'Numéro visible ; proportions estimées sur les clichés de juillet 2024.':'Volume visible ; attribution au 18 ou au 20 non confirmée.'};parts.push(part);

 if(o.id===16){

  mesh.setPart('16-bay');const c=frontY+2.0,shape=[[lo[0],c-1.28],[lo[0]-.83,c-.81],[lo[0]-.83,c+.81],[lo[0],c+1.28]];

  for(let i=0;i<3;i++){const a=shape[i],b=shape[i+1],aa=P(...a),bb=P(...b),l=len(sub(bb,aa)),t=norm(sub(bb,aa)),n=[t[1],-t[0]],pt=(x,z,inset=0)=>[...add(add(aa,mul(t,x)),mul(n,-inset)),z];

   const x0=l*.22,x1=l*.78;for(const [za,zb]of [[0,1.0],[2.55,4.10],[5.55,6.65]])poly([pt(0,za),pt(l,za),pt(l,zb),pt(0,zb)],0,color);

   for(const [za,zb]of [[1,2.55],[4.1,5.55]]){for(const [a,b]of [[0,x0],[x1,l]])poly([pt(a,za),pt(b,za),pt(b,zb),pt(a,zb)],0,color);poly([pt(x0,za,.13),pt(x1,za,.13),pt(x1,zb,.13),pt(x0,zb,.13)],3,rgb('#899d9b'),[[0,0],[1,0],[1,1],[0,1]]);for(const [a,z,b,zz]of [[x0,za,x1,za],[x1,za,x1,zb],[x1,zb,x0,zb],[x0,zb,x0,za]])beam(pt(a,z,-.02),pt(b,zz,-.02),.09,ivory,8);openings.push({part:16,side:'bay',kind:'window',width:x1-x0,height:zb-za,depth:.13,center:pt(l/2,(za+zb)/2),refs:['05'],observed:true,dimensions:'estimated'});}

   for(const z of [3.15,6.60])beam(pt(0,z,-.05),pt(l,z,-.05),.12,ivory,8);

  }poly(shape.map(p=>world(...p,6.70)),1,roofTint,shape.map(p=>p));details.push({type:'polygonal-bay',part:16,confidence:'Projection estimée sur la vue oblique 05'});

 }

}



mesh.setPart(null);

const home=parts.find(p=>p.id===16),{u,v,lo,hi,frontY}=home.frame,W=(x,y)=>add(mul(u,x),mul(v,y));

const plotSouth=dot(local([4.375995,48.961091]),u)+3.2,front=frontY-1.12,back=hi[1]+.10,north=lo[0]-.10;

const ground=(points,mat=6,tint=rgb('#8a9165'),z=.035)=>poly(points.map(p=>[...p,z]),mat,tint,points.map(p=>[p[0]/2,p[1]/2]));

ground([W(plotSouth,front),W(north,front),W(north,back),W(plotSouth,back)]);

function blueFence(a,b,{gate=false}={}){const l=len(sub(b,a)),u=norm(sub(b,a)),v=[-u[1],u[0]],count=Math.max(1,Math.ceil(l/3.4));

 for(let i=0;i<count;i++){const pa=mix(a,b,i/count),pb=mix(a,b,(i+1)/count),mid=mix(pa,pb,.5),w=len(sub(pb,pa));box(mid,u,v,w,.23,.035,gate?.16:.78,ivory);box(mid,u,v,w-.12,.065,gate?.18:.83,1.86,blue,8);for(let z=gate?.25:.95;z<1.84;z+=.24)beam([...add(add(pa,mul(u,.08)),mul(v,-.05)),z],[...add(add(pb,mul(u,-.08)),mul(v,-.05)),z],.022,rgb('#8297b7'),8);}

 for(let i=0;i<=count;i++)box(mix(a,b,i/count),u,v,.29,.34,0,1.98,ivory);details.push({type:gate?'blue-gate':'blue-fence',a,b,height:1.98,observed:true,refs:['04','05','14']});

}

blueFence(W(plotSouth,front),W(north-1.35,front));blueFence(W(north-1.35,front),W(north,front),{gate:true});blueFence(W(plotSouth,front),W(plotSouth,back));

// Narrow walkable apron along the photographed facades; keep the public road mesh.

const end=parts.find(p=>p.id===12),endU=dot(local(end.front[1]),u);

ground([W(north,frontY-1.45),W(endU,frontY-1.45),W(endU,frontY-.05),W(north,frontY-.05)],5,rgb('#bab5a8'),.08);

beam([...W(north,frontY-1.45),.08],[...W(endU,frontY-1.45),.08],.13,rgb('#c6c2b6'),8);

for(const [x,y,h,r]of [[plotSouth+3.2,back-.8,3.7,1.0],[plotSouth+8.0,back-.6,2.6,.75]]){beam([...W(x,y),.08],[...W(x,y),h],.11,rgb('#75644e'));crown([...W(x,y),h],r,rgb('#758461'),Math.round(x));}

for(const x of [plotSouth+1,north+13]){const p=W(x,frontY-1.15);beam([...p,.08],[...p,6.7],.10,rgb('#756b60'),8);box(add(p,mul(v,-.30)),u,v,.32,.65,6.65,6.78,metal,8);details.push({type:'streetlamp',center:p,refs:['04','15'],estimated:true});}

const hydrant=W(plotSouth-.35,front-.4);box(hydrant,u,v,.27,.30,.08,.90,rgb('#b34031'),8);beam([...add(hydrant,mul(u,-.24)),.65],[...add(hydrant,mul(u,.24)),.65],.14,rgb('#a73c2c'),8);

const odd=buildBuiretteOdd({mesh,source,origin,scale});parts.push(...odd.parts);openings.push(...odd.openings);details.push(...odd.details);roofAreas.push(...odd.roofAreas);

const house15=buildBuirette15({mesh,source,origin,scale});parts.push(...house15.parts);openings.push(...house15.openings);details.push(...house15.details);roofAreas.push(...house15.roofAreas);

const result=mesh.finish(),references=[];

for(const r of referenceRows.filter(r=>r.image_date==='2024-07')){const raw=await fs.readFile('references_buirette_12_20/'+r.file),file='references/'+r.file;await fs.writeFile(out+'/'+file,raw);references.push({...r,file,sha256:crypto.createHash('sha256').update(raw).digest('hex')});}

for(const r of JSON.parse(await fs.readFile('references_buirette_17_19/references.json','utf8'))){const raw=await fs.readFile('references_buirette_17_19/'+r.file),file='references/'+r.file;await fs.writeFile(out+'/'+file,raw);references.push({...r,file,sha256:crypto.createHash('sha256').update(raw).digest('hex')});}

for(const r of JSON.parse(await fs.readFile('references_buirette_15/references.json','utf8'))){const raw=await fs.readFile('references_buirette_15/'+r.file),file='references/'+r.file;await fs.writeFile(out+'/'+file,raw);references.push({...r,file,sha256:crypto.createHash('sha256').update(raw).digest('hex')});}

const all=result.vertices,bounds=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<all.length;i+=11){const q=geo([all[i],all[i+1]]);bounds[0]=Math.min(bounds[0],q[0]);bounds[1]=Math.min(bounds[1],q[1]);bounds[2]=Math.max(bounds[2],q[0]);bounds[3]=Math.max(bounds[3],q[1]);}

const index={version:1,name:'Buirette · 12–20',origin,scale,bounds,vertexCount:all.length/11,textures,materials,ranges:result.ranges,excludeIds:parts.map(p=>p.osmId),parts,objectRanges:result.objects,pickTriangles:result.pickTriangles,siteDetails:details,stats:{buildingParts:parts.length,mainBuildings:6,modelledOpenings:openings.length,triangles:all.length/33,referencePhotos:references.length},provenance:{footprints:'© OpenStreetMap contributors · existing project extract',references:'Google Street View · juillet 2024',dimensions:'Estimated from photographs; unknown rear elevations remain simple.',addresses:'12, 14, 15, 16, 17 and 19 visible; 18–20 address attribution uncertain.'}};

await fs.writeFile(out+'/index.json',JSON.stringify(index));await fs.writeFile(out+'/mesh.bin',Buffer.from(all.buffer));await fs.writeFile(out+'/survey.json',JSON.stringify({origin,scale,parts,openings,roofAreas,details,references},null,2));await fs.writeFile(out+'/references.json',JSON.stringify(references,null,2));

const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

await fs.writeFile('dist/buirette-references.html',`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buirette · clichés</title><style>body{font:16px/1.5 system-ui;background:#f1f0e9;color:#263c40;max-width:1200px;margin:30px auto;padding:20px}img{width:100%;height:auto}article{background:white;padding:18px;margin:25px 0}a{color:#096e7d}</style><h1>Buirette · références des 12–20</h1><p><a href="./#buirette">Retour au jeu</a> · Façades de juillet 2024 et une vue oblique de contexte d’octobre 2017, Google Street View. Dimensions du modèle estimées. Les adresses 18 et 20 restent incertaines.</p>${references.map(r=>`<article id="${r.anchor||r.id.slice(0,2)}"><h2>${esc(r.title)}</h2><img loading="lazy" src="data/buirette/${r.file}" alt="${esc(r.title)}"><p>${esc(r.note)}</p>${r.latitude!=null?`<p>Caméra : ${r.latitude}, ${r.longitude} · azimut ${r.heading_deg}°</p>`:""}${r.url?`<a href="${esc(r.url)}">Ouvrir le panorama source ↗</a>`:""}</article>`).join('')}</html>`);

await buildCustomModelRegistry();console.log(JSON.stringify(index.stats));

