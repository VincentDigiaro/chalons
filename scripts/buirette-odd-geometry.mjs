import earcut from 'earcut';
import {add,sub,mul,dot,len,norm,mix,rgb,clip} from './attila-geometry.mjs';

// July 2024 user photographs: number plaques confirm 17 and 19. OSM, not the
// panorama position, determines both footprints. Rear elevations are estimated.
export function buildBuiretteOdd({mesh,source,origin,scale}){
 const {poly,beam,box}=mesh,parts=[],openings=[],details=[],roofAreas=[];
 const local=p=>p.map((v,i)=>(v-origin[i])*scale[i]),geo=p=>p.map((v,i)=>v/scale[i]+origin[i]);
 const stone=rgb('#c6c3b6'),white=rgb('#e6e4da'),steel=rgb('#626d71'),dark=rgb('#363e43'),brick=rgb('#ac6848');
 const area=r=>Math.abs(r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
 const defs=[
  {id:17,osmId:'way/156698545',label:'17 · pierre, briques et porte anthracite',address:'17',front:[[4.376,48.961283],[4.37604,48.961236]],eaves:7.0,rise:1.9,color:'#a99e84',refs:['17-2024']},
  {id:19,osmId:'way/156691929',label:'19 · maison blanche aux deux garages',address:'19',front:[[4.376055,48.961219],[4.376141,48.961122]],eaves:6.4,rise:2.65,color:'#dedbd0',refs:['19-2024','19-entree-2024']}
 ];
 for(const o of defs){
  const f=source.features.find(f=>f.properties.osm_id===o.osmId);if(!f)throw Error('Missing OSM footprint '+o.osmId);
  const A=local(o.front[0]),B=local(o.front[1]),u=norm(sub(B,A)),v=[-u[1],u[0]],w=len(sub(B,A));
  const W=(x,y,z)=>[...add(A,add(mul(u,x),mul(v,y))),z],Q=p=>[dot(sub(p,A),u),dot(sub(p,A),v)];
  const ring=f.geometry.coordinates[0].slice(0,-1).map(local),xy=ring.map(Q),bounds=[0,1].map(k=>[Math.min(...xy.map(p=>p[k])),Math.max(...xy.map(p=>p[k]))]);
  const color=rgb(o.color),garageStart=w*.785,sections=o.id===19?[[bounds[0][0],garageStart,o.eaves,o.rise],[garageStart,bounds[0][1],3.08,0]]:[[bounds[0][0],bounds[0][1],o.eaves,o.rise]];
  const rh=(x,y,s=sections.find(s=>x<=s[1]+1e-7)||sections.at(-1))=>s[2]+s[3]*Math.max(0,Math.min((y-bounds[1][0])*2/(bounds[1][1]-bounds[1][0]),(bounds[1][1]-y)*2/(bounds[1][1]-bounds[1][0])));
  mesh.setPart(o.id);
  const ix=earcut(xy.flat());let projected=0;
  for(const s of sections)for(let i=0;i<ix.length;i+=3){const cell=clip(clip(ix.slice(i,i+3).map(j=>xy[j]),p=>p[0]-s[0]),p=>s[1]-p[0]);for(const sign of [-1,1]){const half=clip(cell,p=>sign*(p[1]-(bounds[1][0]+bounds[1][1])/2));if(half.length<3)continue;projected+=area(half);poly(half.map(p=>W(...p,rh(...p,s))),s[3]?1:0,s[3]?rgb('#c1bbaa'):rgb('#92988c'),half.map(p=>[p[0]/1.3,p[1]/1.3]),true);}}
  roofAreas.push({id:o.id,footprint:area(xy),roofProjected:projected});
  const specs=o.id===17?[
   {x:w*.30,z:.18,w:1.00,h:2.66,kind:'door',panel:4,transom:.40},
   {x:w*.74,z:.82,w:1.13,h:1.92,kind:'window',shutter:'grey',roller:.80},
   {x:w*.30,z:4.24,w:1.12,h:1.97,kind:'window',shutter:'grey',roller:.75,arch:true},
   {x:w*.74,z:4.24,w:1.12,h:1.97,kind:'window',shutter:'grey',roller:.94,arch:true}
  ]:[
   {x:w*.176,z:.10,w:w*.288,h:2.58,kind:'garage',corrugated:true},
   {x:w*.399,z:.17,w:1.03,h:2.49,kind:'door',panel:4},
   {x:w*.471,z:1.46,w:.54,h:1.19,kind:'glass-blocks'},
   {x:w*.638,z:.99,w:1.48,h:1.55,kind:'window',shutter:'tan'},
   {x:w*.176,z:4.12,w:1.91,h:1.48,kind:'window',shutter:'tan',closed:true},
   {x:w*.636,z:4.12,w:1.56,h:1.48,kind:'window',shutter:'tan'},
   {x:w*.892,z:.09,w:w*.179,h:2.49,kind:'garage',squares:true}
  ];
  // Each face is divided at opening edges, so the glazing sits in an actual hole.
  const signed=xy.reduce((s,a,i)=>{const b=xy[(i+1)%xy.length];return s+a[0]*b[1]-a[1]*b[0];},0);
  for(let j=0;j<xy.length;j++){
   const a=xy[j],b=xy[(j+1)%xy.length],l=len(sub(b,a)),out=mul([b[1]-a[1],a[0]-b[0]],signed<0?-1:1),isFront=Math.abs((a[1]+b[1])/2)<.07&&out[1]<0;
   // OSM's intermediate frontage nodes can deviate a few centimetres. Keep a
   // common facade plane so the cut walls meet every recessed reveal cleanly.
   if(isFront){a[1]=0;b[1]=0;}
   const os=isFront?specs:[],point=(d,z)=>{const q=mix(a,b,d/l);return W(...q,z);};
   const cuts=[0,l,...sections.slice(0,-1).map(s=>(s[1]-a[0])/(b[0]-a[0])*l).filter(x=>x>0&&x<l),...os.flatMap(s=>[s.x-s.w/2,s.x+s.w/2]).map(x=>(x-a[0])/(b[0]-a[0])*l).filter(x=>x>0&&x<l)].sort((a,b)=>a-b);
   for(let k=0;k<cuts.length-1;k++){
    const c=cuts[k],d=cuts[k+1],mid=mix(a,b,(c+d)/2/l),sec=sections.find(s=>mid[0]<=s[1]+1e-7)||sections.at(-1),h=sec[2],zs=[0,h,...os.flatMap(s=>[s.z,s.z+s.h]).filter(z=>z>0&&z<h)].sort((a,b)=>a-b);
    for(let z=0;z<zs.length-1;z++){const zz=(zs[z]+zs[z+1])/2;if(os.some(s=>Math.abs(mid[0]-s.x)<s.w/2+1e-7&&zz>s.z&&zz<s.z+s.h))continue;poly([point(c,zs[z]),point(d,zs[z]),point(d,zs[z+1]),point(c,zs[z+1])],0,color,undefined,true);}
    const breaks=[c,d],ridge=((bounds[1][0]+bounds[1][1])/2-a[1])/(b[1]-a[1])*l;if(ridge>c&&ridge<d)breaks.push(ridge);breaks.sort((a,b)=>a-b);
    for(let z=1;z<breaks.length;z++){const c0=breaks[z-1],c1=breaks[z],q0=mix(a,b,c0/l),q1=mix(a,b,c1/l);poly([point(c0,h),point(c1,h),point(c1,rh(...q1,sec)),point(c0,rh(...q0,sec))],0,color,undefined,true);beam(point(c0,rh(...q0,sec)),point(c1,rh(...q1,sec)),.10,white,8);}
   }
  }
  // The high side wall above the 19's attached flat-roof garage.
  if(o.id===19){
   const x=garageStart,ym=(bounds[1][0]+bounds[1][1])/2,holes=[{y:2.55,w:.87,z:4.06,h:1.34},{y:ym,w:.60,z:7.32,h:.86}],ys=[bounds[1][0],bounds[1][1],ym,...holes.flatMap(h=>[h.y-h.w/2,h.y+h.w/2])].sort((a,b)=>a-b),zs=[3.08,10,...holes.flatMap(h=>[h.z,h.z+h.h])].sort((a,b)=>a-b);
   for(let i=1;i<ys.length;i++)for(let j=1;j<zs.length;j++){const a=ys[i-1],b=ys[i],z=zs[j-1],zz=zs[j];if(holes.some(h=>Math.abs((a+b)/2-h.y)<h.w/2+.0001&&(z+zz)/2>h.z&&(z+zz)/2<h.z+h.h))continue;const cell=clip([[a,z],[b,z],[b,zz],[a,zz]],p=>rh(x,p[0],sections[0])-p[1]);poly(cell.map(([y,z])=>W(x,y,z)),0,color,undefined,true);}
   for(const h of holes){const a=h.y-h.w/2,b=h.y+h.w/2,z=h.z,zz=h.z+h.h;poly([W(x-.19,a,z),W(x-.19,b,z),W(x-.19,b,zz),W(x-.19,a,zz)],3,rgb('#94a3a0'),[[0,0],[1,0],[1,1],[0,1]]);for(const [p,q,r,t]of [[a,z,b,z],[b,z,b,zz],[b,zz,a,zz],[a,zz,a,z]]){poly([W(x,p,q),W(x,r,t),W(x-.20,r,t),W(x-.20,p,q)],0,stone);beam(W(x+.025,p,q),W(x+.025,r,t),.07,white,8);}openings.push({part:19,kind:'window',side:'gable',center:W(x,h.y,z+h.h/2),width:h.w,height:h.h,depth:.20,observed:true,referenceDate:'2017-10',refs:['19-contexte-2017'],dimensions:'estimated; historical oblique reference'});}
  }
  const face=(x0,x1,z0,z1,y,col,mat=0)=>poly([W(x0,y,z0),W(x1,y,z0),W(x1,y,z1),W(x0,y,z1)],mat,col,[[0,0],[1,0],[1,1],[0,1]]);
  const bar=(x0,z0,x1,z1,y,width,col,mat=8)=>beam(W(x0,y,z0),W(x1,y,z1),width,col,mat);
  const clear=(x,z,pad=.02)=>!specs.some(s=>Math.abs(x-s.x)<s.w/2+pad&&z>s.z-pad&&z<s.z+s.h+pad);
  if(o.id===17){
   for(let row=0,z=.16;z<o.eaves-.25;row++,z+=.115)for(let col=0,x=.05+(row%2)*.10;x<w-.17;col++,x+=.205){if(!clear(x+.07,z+.035,.11)||x<.23||x>w-.26||(z>.24&&z<.48)||(z>3.12&&z<3.49)||specs.filter(s=>s.z>3).some(s=>(Math.abs(x+.07-s.x)<s.w/2+.08&&z>3.5&&z<4.22)||Math.abs(Math.abs(x+.07-s.x)-(s.w/2+.14))<.16))continue;const seed=Math.sin(row*57+col*31),ww=.11+.026*seed,hh=.06+.013*Math.cos(row*23+col*7),tint=.72+.35*(.5+.5*Math.sin(row*17+col*47));poly([W(x,-.023,z),W(x+ww*.65,-.03,z-.01),W(x+ww,-.024,z+.02),W(x+ww*.8,-.03,z+hh),W(x+.02,-.029,z+hh+.007)],0,mul(color,tint));}
   const brickRow=(x0,x1,z,h=.072,y=-.052)=>{for(let x=x0,i=0;x<x1;i++,x+=.235){const xx=Math.min(x+.222,x1);if(clear((x+xx)/2,z+h/2,.015))face(x,xx,z,z+h,y,(i+Math.floor(z*10))%4?brick:rgb('#b8a17a'));}};
   for(let z=.20;z<6.8;z+=.095){brickRow(.025,.22,z);brickRow(w-.22,w-.025,z);for(const s of specs.filter(s=>s.z>3)){brickRow(s.x-s.w/2-.25,s.x-s.w/2-.035,z);brickRow(s.x+s.w/2+.035,s.x+s.w/2+.25,z);}}
   for(const z of [.26,.36,3.15,3.26,3.37])brickRow(0,w,z,.072,-.071);
   for(const s of specs.filter(s=>s.z>3))for(let row=0,z=3.53;z<s.z-.08;row++,z+=.105){for(let x=s.x-s.w/2;x<s.x+s.w/2-.06;x+=.22)face(x,Math.min(x+.206,s.x+s.w/2),z,z+.09,-.026,row%4===0?brick:rgb('#b8aa89'));}
  }
  if(o.id===19){const xs=[0,garageStart,...specs.filter(s=>s.z<.37).flatMap(s=>[s.x-s.w/2,s.x+s.w/2]).filter(x=>x>0&&x<garageStart)].sort((a,b)=>a-b);for(let i=1;i<xs.length;i++)if(clear((xs[i-1]+xs[i])/2,.25))face(xs[i-1],xs[i],.10,.37,-.025,white);face(0,garageStart,2.76,3.04,-.09,white);bar(0,3.11,garageStart,3.11,-.075,.075,white);}
  for(const s of specs){
   const x0=s.x-s.w/2,x1=s.x+s.w/2,z0=s.z,z1=s.z+s.h,depth=s.kind==='door'?.25:.20;
   const trim=o.id===17?rgb('#b9b6a6'):white;
   for(const [a,z,b,zz]of [[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]]){if(o.id===17&&s.kind==='door'&&z===z0&&zz===z0)continue;poly([W(a,0,z),W(b,0,zz),W(b,depth,zz),W(a,depth,z)],0,mul(color,.84));bar(a,o.id===17&&s.kind==='door'&&z===z0?z-.02:z,b,o.id===17&&s.kind==='door'&&zz===z0?zz-.02:zz,depth-.025,.055,s.kind==='door'?dark:white);}
   if(s.kind==='window'){
    face(x0+.025,x1-.025,z0+.02,z1-.02,depth,rgb('#91a3a2'),3);
    bar(s.x,z0,s.x,z1,depth-.028,.05,white);bar(x0,z0+.06,x1,z0+.06,depth-.025,.045,white);
    if(s.roller){const zz=z1-s.h*s.roller;face(x0+.015,x1-.015,zz,z1,.11,rgb('#e2e4df'),8);for(let z=zz;z<z1;z+=.052)bar(x0+.02,z,x1-.02,z,.092,.009,rgb('#aaaead'));}
    const shutter=s.shutter==='grey'?rgb('#767b76'):rgb('#b79174'),pw=s.closed?s.w/6:s.w*(s.shutter==='grey'?.46:.13);
    const shutterPanel=(a,b,y,closed)=>{
     face(a,b,z0+.01,z1-.01,y,shutter,8);
     const pitch=closed?.13:.065;for(let x=a+.02;x<b;x+=pitch)bar(x,z0+.02,x,z1-.02,y-.015,.009,mul(shutter,.72));
     if(s.shutter==='grey'){for(const z of [z0+.27,z1-.27])bar(a+.025,z,b-.025,z,y-.042,.062,mul(shutter,1.06));bar(a+.055,z0+.33,b-.055,z1-.33,y-.044,.045,mul(shutter,.93));}
     else for(let x=a+.035;x<b-.025;x+=.14)for(let z=z0+.08;z<z1-.05;z+=.073)face(x,Math.min(x+.093,b-.025),z,z+.017,y-.013,mul(shutter,.60),8);
     for(const z of [z0+.27,z1-.27])bar(a+.01,z,a+.09,z,y-.053,.025,steel);
    };
    if(s.closed)for(let i=0;i<6;i++)shutterPanel(x0+i*pw+.004,x0+(i+1)*pw-.004,.085,true);
    else{shutterPanel(x0-pw-.06,x0-.06,-.085,false);shutterPanel(x1+.06,x1+pw+.06,-.085,false);}
    bar(x0-.13,z0-.055,x1+.13,z0-.055,-.10,.13,trim);
   }else if(s.kind==='garage'){
    face(x0,x1,z0,z1,depth,s.corrugated?rgb('#7c898b'):rgb('#586972'),8);
    if(s.corrugated)for(let x=x0+.025;x<x1;x+=.040){bar(x,z0+.025,x,z1-.025,depth-.024,.011,rgb('#a1a7a4'));}
    if(s.squares){for(let row=0;row<4;row++)for(let col=0;col<4;col++){const a=x0+.055+col*s.w/4,b=a+s.w/4-.095,z=z0+.12+row*.54;face(a,b,z,z+.43,depth-.018,rgb('#50626a'),8);for(const [x,y,xx,yy]of [[a,z,b,z],[b,z,b,z+.43],[b,z+.43,a,z+.43],[a,z+.43,a,z]])bar(x,y,xx,yy,depth-.035,.024,rgb('#75848a'));}}
   }else if(s.kind==='glass-blocks'){
    for(let row=0;row<5;row++)for(let col=0;col<2;col++){const a=x0+col*s.w/2+.023,b=a+s.w/2-.046,z=z0+row*s.h/5+.016,zz=z+s.h/5-.032,shade=(row===0&&col===1)||(row===2&&col===0)?'#d7b844':row===3&&col===1?'#b85540':'#b6c3ba';face(a,b,z,zz,depth,rgb(shade),shade==='#b6c3ba'?3:8);for(const [a0,b0,a1,b1]of [[a,z,b,z],[b,z,b,zz],[b,zz,a,zz],[a,zz,a,z]])bar(a0,b0,a1,b1,depth-.02,.026,steel);}
   }else if(s.kind==='door'){
    const leafTop=z1-(s.transom||0),size=o.id===17?.245:.145,glass=Array.from({length:4},(_,i)=>({x:s.x,z:z0+.34+i*(o.id===17?.45:.49),w:size,h:size}));
    const xs=[x0,x1,s.x-size/2,s.x+size/2].sort((a,b)=>a-b),zs=[z0,leafTop,...glass.flatMap(g=>[g.z,g.z+g.h])].sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){const x=(xs[i]+xs[i-1])/2,z=(zs[j]+zs[j-1])/2;if(glass.some(g=>Math.abs(x-g.x)<g.w/2&&z>g.z&&z<g.z+g.h))continue;face(xs[i-1],xs[i],zs[j-1],zs[j],depth-.03,dark,8);}
    for(const g of glass){face(g.x-g.w/2,g.x+g.w/2,g.z,g.z+g.h,depth+.015,rgb('#6d8285'),3);const t=o.id===17?.041:.018,a=g.x-g.w/2,b=g.x+g.w/2,z=g.z,zz=g.z+g.h;for(const q of [[a-t,b+t,z-t,z],[a-t,b+t,zz,zz+t],[a-t,a,z,zz],[b,b+t,z,zz]])face(...q,depth-.064,rgb('#a7ada8'),8);for(const [x0,z0,x1,z1]of [[a,z,b,z],[b,z,b,zz],[b,zz,a,zz],[a,zz,a,z]])poly([W(x0,depth-.064,z0),W(x1,depth-.064,z1),W(x1,depth+.018,z1),W(x0,depth+.018,z0)],8,steel);}
    if(s.transom){face(x0+.025,x1-.025,leafTop,z1-.025,depth,rgb('#879291'),3);bar(x0,leafTop,x1,leafTop,depth-.04,.08,dark);}
    const hx=o.id===17?x0+.10:x1-.10;if(o.id===17){const z=z0+.95;bar(hx,z-.15,hx,z+.11,depth-.09,.042,rgb('#a7ada8'));beam(W(hx,depth-.10,z),W(hx,depth-.17,z),.03,rgb('#b8bfba'),8);bar(hx,z,hx+.20,z,depth-.17,.03,rgb('#b8bfba'));details.push({type:'horizontal-door-handle',part:17,a:W(hx,depth-.17,z),b:W(hx+.20,depth-.17,z)});}else bar(hx,z0+.75,hx,z0+1.82,depth-.12,.027,rgb('#b3beb8'));
    // A single extruded stair profile: no stacked boxes or coplanar tread faces.
    mesh.setPart(o.id+'-threshold');const xa=x0-.055,xb=x1+.055,profile=[[-.42,.065],[-.42,.115],[-.12,.115],[-.12,z0],[depth+.035,z0],[depth+.035,.065]];
    poly(profile.map(([y,z])=>W(xa,y,z)),0,stone);poly(profile.map(([y,z])=>W(xb,y,z)).reverse(),0,stone);
    for(let k=0;k<profile.length;k++){const a=profile[k],b=profile[(k+1)%profile.length];poly([W(xa,...a),W(xb,...a),W(xb,...b),W(xa,...b)],0,stone);}
    bar(x0,z0+.008,x1,z0+.008,depth-.025,.02,rgb('#aaaead'));
    details.push({type:'single-shell-threshold',part:o.id,profile,width:xb-xa,frame:{A,u,v},x:s.x,doorBottom:z0,refs:o.refs});mesh.setPart(o.id);
   }
   if(o.id===17){
    if(s.arch){const r=s.w/2+.08;for(let i=0;i<14;i++){const a=i/14*Math.PI,b=(i+1)/14*Math.PI,p=(t,extra)=>W(s.x+(r+extra)*Math.cos(t),-.063,z1+.03+.18*Math.sin(t)+extra);poly([p(a,0),p(b,0),p(b,.20),p(a,.20)],0,i%4===0?stone:brick);}}
    else{bar(x0-.08,z1+.11,x1+.08,z1+.11,-.045,.075,brick);bar(x0-.08,z1+.22,x1+.08,z1+.22,-.04,.085,brick);bar(x0-.045,z1+.035,x1+.045,z1+.035,.02,.07,steel);}
   }
   openings.push({part:o.id,kind:s.kind==='glass-blocks'?'window':s.kind,center:W(s.x,0,z0+s.h/2),width:s.w,height:s.h,depth,side:'street',observed:true,refs:o.refs,dimensions:'estimated',shutter:s.shutter||null});
  }
  const door=specs.find(s=>s.kind==='door');
  // Enamel plaques use geometric digits with all strokes above the plate surface.
  const plaqueX=o.id===17?door.x+door.w/2+.30:door.x-door.w/2-.25,plaqueZ=o.id===17?2.65:2.57;
  face(plaqueX-.14,plaqueX+.14,plaqueZ-.095,plaqueZ+.095,-.10,rgb('#e0dfcc'),8);face(plaqueX-.125,plaqueX+.125,plaqueZ-.081,plaqueZ+.081,-.112,rgb('#1f356d'),8);
  const strokes={'1':[[0,.09,.035,.12],[.035,.12,.035,0],[.008,0,.062,0]],'7':[[0,.12,.075,.12],[.075,.12,.025,0]],'9':[[0,.12,.07,.12],[.07,.12,.07,0],[0,.12,0,.061],[0,.061,.07,.061],[0,0,.07,0]]};
  for(let i=0;i<2;i++)for(const [a,b,c,d]of strokes[o.address[i]])bar(plaqueX-.085+i*.095+a,plaqueZ-.06+b,plaqueX-.085+i*.095+c,plaqueZ-.06+d,-.125,.011,white);
  details.push({type:'enamel-number',part:o.id,text:o.address,center:W(plaqueX,-.125,plaqueZ),refs:o.refs});
  const mailboxX=o.id===17?door.x+door.w/2+.33:w*.471,mailboxZ=o.id===17?1.06:1.05;
  box(W(mailboxX,-.09,0).slice(0,2),u,v,.31,.17,mailboxZ-.19,mailboxZ+.19,o.id===17?white:rgb('#46576c'),8);bar(mailboxX-.105,mailboxZ+.085,mailboxX+.105,mailboxZ+.085,-.182,.014,steel);
  if(o.id===17){
   const awningY=-.46,z=3.02;poly([W(door.x-.71,-.035,z+.12),W(door.x+.71,-.035,z+.12),W(door.x+.74,awningY,z),W(door.x-.74,awningY,z)],8,rgb('#b6ab8e'));
   bar(door.x-.74,z,door.x+.74,z,awningY,.035,steel);for(const x of [door.x-.64,door.x+.64]){beam(W(x,-.03,z-.21),W(x,awningY,z),.035,dark,8);}
   details.push({type:'door-canopy',part:o.id,refs:o.refs});
  }else{box(W(door.x,-.04,0).slice(0,2),u,v,.23,.15,2.62,2.71,white,8);}
  for(const s of sections){const a=Math.max(0,s[0]),b=Math.min(w,s[1]);bar(a,s[2]-.085,b,s[2]-.085,-.115,.17,white);bar(a,s[2]+.045,b,s[2]+.045,-.215,.10,steel);}
  for(const x of [.04,w-.04]){const eh=x>garageStart&&o.id===19?3.08:o.eaves;bar(x,.10,x,eh,-.095,.070,steel);for(let z=.42;z<eh;z+=1.15)bar(x-.04,z,x+.04,z,-.14,.020,rgb('#b3b8af'));}
  const chimney=[w*.21,(bounds[1][0]+bounds[1][1])/2],cz=rh(...chimney);box(W(...chimney,0).slice(0,2),u,v,.52,.60,cz-.05,cz+.70,brick);box(W(...chimney,0).slice(0,2),u,v,.62,.72,cz+.70,cz+.79,steel,8);
  const center=geo(W((bounds[0][0]+bounds[0][1])/2,(bounds[1][0]+bounds[1][1])/2,0).slice(0,2));
  parts.push({...o,footprint:f.geometry.coordinates[0],center,dimensions:{width:w,depth:bounds[1][1]-bounds[1][0],eaves:o.eaves,ridge:o.eaves+o.rise},frame:{u,v,A,lo:[dot(A,u)+bounds[0][0],dot(A,v)+bounds[1][0]],hi:[dot(A,u)+bounds[0][1],dot(A,v)+bounds[1][1]],frontY:dot(A,v)},roofSections:sections,confidence:'Numéro confirmé par la plaque visible ; façade de juillet 2024, proportions estimées.'});
  mesh.setPart(o.id+'-ground');poly([W(-.06,-.80,.04),W(w+.06,-.80,.04),W(w+.06,.12,.04),W(-.06,.12,.04)],5,rgb('#a8aaa2'));
 }
 const left=parts.find(p=>p.id===17),right=parts.find(p=>p.id===19),a=local(left.front[1]),b=local(right.front[0]),u=norm(sub(b,a)),v=[-u[1],u[0]],mid=mix(a,b,.5),width=len(sub(b,a));
 mesh.setPart('17-19-side-gate');box(add(mid,mul(v,.035)),u,v,width-.03,.065,.09,2.66,rgb('#a1a39d'),8);beam([...mid,.12],[...mid,2.65],.015,rgb('#737b78'),8);for(const dz of [1.18,1.28])beam([...add(mid,mul(u,-.13)),dz],[...add(mid,mul(u,-.03)),dz],.019,dark,8);
 details.push({type:'shared-side-gate',a,b,height:2.66,refs:['19-entree-2024']});
 mesh.setPart(null);return {parts,openings,details,roofAreas};
}
