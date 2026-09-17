import {landscapeTools} from './nerval-landscape.mjs';
import {frontBoundary} from './build-nerval-refinements.mjs';

// All dimensions are visual estimates from the archived, dated Street View views.
// The original survey remains intact; explicit additions and finish overrides live
// in nerval-streetview-survey.json. No Google image is embedded in the game.
export function streetRoofHeight(zone,q){
 const mid=(zone.start+zone.end)/2;
 return zone.eaves+zone.rise*Math.max(0,1-Math.abs((q[zone.axis]-mid)/((zone.end-zone.start)/2)));
}
export function buildStreetRoof(ctx,part,profile,ring,indices,clip){
 const {poly,materials:M,rgb}=ctx;
 for(const z of profile.zones){
  const mid=(z.start+z.end)/2,slope=Math.hypot(1,2*z.rise/(z.end-z.start));
  for(let i=0;i<indices.length;i+=3)for(const sign of [-1,1]){
   let face=indices.slice(i,i+3).map(j=>ring[j]);
   face=clip(clip(clip(face,q=>q[0]-z.from),q=>z.to-q[0]),q=>sign*(q[z.axis]-mid));
   poly(face.map(q=>[...part.world(q),streetRoofHeight(z,q)]),M.roof,[.9,.87,.8],face.map(q=>[q[1-z.axis]/1.65,Math.abs(q[z.axis]-mid)*slope/1.28]));
  }
 }
 // Close the joint between the low garage wing and the perpendicular main roof.
 const [a,b]=profile.zones,x=a.to,ys=[a.start,(a.start+a.end)/2,a.end];
 for(let j=1;j<ys.length;j++){
  const p=[x,ys[j-1]],q=[x,ys[j]];
  const ah=streetRoofHeight(a,p),bh=streetRoofHeight(b,p),ch=streetRoofHeight(a,q),dh=streetRoofHeight(b,q);
  const difference=(ah-bh)*(ch-dh);
  const emit=(p,q)=>poly([[...part.world(p),streetRoofHeight(a,p)],[...part.world(q),streetRoofHeight(a,q)],[...part.world(q),streetRoofHeight(b,q)],[...part.world(p),streetRoofHeight(b,p)]],M.wall,rgb('#d8d5c7'));
  if(difference<0){const t=(ah-bh)/(ah-bh-ch+dh),r=[x,p[1]+(q[1]-p[1])*t];emit(p,r);emit(r,q);}else emit(p,q);
 }
}

export function streetOpeningFinishes(openings,observations){
 return openings.map(o=>{
  const change=observations.openingFinishes.find(d=>d.part===o.part&&d.side===o.side&&d.kind===(o.kind||'window'));
  if(!change)return o;
  const {part,side,kind,reference,...finish}=change;
  return {...o,...finish,streetFinish:reference};
 });
}

export function buildStreetDetails(ctx,observations){
 const {parts,survey,poly,beam,box,rgb,objects,add,sub,mul,mix,norm,len,crown,materials:M}=ctx;
 const {hedge,ground,path}=landscapeTools(ctx);
 const P=id=>parts.get(id),W=(id,q)=>P(id).world(q),A=(id,q,z)=>[...W(id,q),z];
 const solid=(id,q,w,d,z0,z1,c)=>box(W(id,q),P(id).u,P(id).v,w,d,z0,z1,rgb(c),M.wall);
 const record=(type,d,more={})=>objects.push({type:'streetview-'+type,part:d.part,reference:d.reference,dimensions:'estimated',...more});

 // Three observed frontages: mesh on ashlar at 31, two timber gates at 33,
 // and distinct white/brown halves on the paired houses. Keep the sidewalk clear.
 for(const d of observations.frontages){
  const id=d.part,p=P(id),group=survey.groups.find(g=>g.id===d.group);
  const coords=group.parts.flatMap(id=>P(id).ring).map(q=>[p.u,p.v].map(v=>(q[0]-p.center[0])*v[0]+(q[1]-p.center[1])*v[1]));
  const min=Math.min(...coords.map(q=>q[0]))-.8,max=Math.max(...coords.map(q=>q[0]))+.8,front=Math.min(...coords.map(q=>q[1]));
  const fy=x=>frontBoundary(p,x,front,survey.refinements.streetPaths),at=(x,z,dy=0)=>A(id,[x,fy(x)+dy],z);
  const section=(a,b,h,kind,color,base=.38)=>{
   if(b<=a)return;
   const aa=W(id,[a,fy(a)]),bb=W(id,[b,fy(b)]),u=norm(sub(bb,aa)),v=[-u[1],u[0]],l=len(sub(bb,aa));
   box(mix(aa,bb,.5),u,v,l,.24,.025,base,rgb(id===93?'#c2bda5':'#d4cdbb'),M.wall);
   beam(at(a,base+.02),at(b,base+.02),.08,rgb('#b8af95'));
   if(id===93){
    for(let z=.17;z<base;z+=.18)beam(at(a,z,-.126),at(b,z,-.126),.012,rgb('#8b8979'));
    for(let x=a+.30;x<b;x+=.54)beam(at(x,.03,-.13),at(x,base,-.13),.013,rgb('#969180'));
    hedge([W(id,[a,fy(a)+.55]),W(id,[b,fy(b)+.55])],h,.82,[.79,.84,.67],'streetview-31-privet');
   }
   if(kind==='mesh'){
    // Diamond mesh is a repeating game material; posts/wires are actual geometry.
    poly([at(a,base+.02,-.04),at(b,base+.02,-.04),at(b,h,-.04),at(a,h,-.04)],M.wire,[.30,.46,.35],[[0,0],[l/.18,0],[l/.18,(h-base)/.18],[0,(h-base)/.18]]);
    for(let x=a;x<=b;x+=2.1)beam(at(x,base),at(x,h+.08),.045,rgb('#365346'));
    for(const z of [base+.08,h-.07])beam(at(a,z),at(b,z),.022,rgb('#476353'));
   }else if(kind==='rails'){
    for(const z of [base+.2,base+.48,base+.76])beam(at(a,z),at(b,z),.09,rgb(color));
    for(let x=a+.1;x<=b;x+=1.65)beam(at(x,base),at(x,h),.12,rgb(color));
   }else{
    for(const z of [base+.15,h-.16])beam(at(a,z),at(b,z),.055,rgb(color));
    for(let x=a+.07;x<b-.03;x+=.16){beam(at(x,base+.03),at(x,h-.04),.08,rgb(color));if(id===96)solid(id,[x,fy(x)],.08,.075,h-.05,h+.015,color);}
   }
  };
  const pier=(x,h=1.40)=>{solid(id,[x,fy(x)],.35,.37,.02,h,'#d1c9b5');solid(id,[x,fy(x)],.44,.46,h,h+.08,'#e0d7be');};
  const gate=(a,b,color,h=1.20,style='timber')=>{
   for(const z of [.17,h-.13])beam(at(a,z),at(b,z),.065,rgb(color));
   for(let x=a+.07;x<b;x+=.14)beam(at(x,.10),at(x,h),.09,rgb(color));
   beam(at((a+b)/2,.12),at((a+b)/2,h+.03),.085,rgb(color));
   if(style==='two-tone')poly([at(a,.11,-.05),at(b,.11,-.05),at(b,.48,-.05),at((a+b)/2,.63,-.05),at(a,.48,-.05)],M.wall,rgb('#d3d2c5'));
   beam(at(b-.18,h*.57,-.07),at(b-.05,h*.57,-.07),.03,rgb('#aaa795'));
   pier(a,h+.12);pier(b,h+.12);
  };
  const groundStrip=(a,b,endY,type,tint)=>ground([[a,fy(a)+.15],[b,fy(b)+.15],[b,endY],[a,endY]].map(q=>W(id,q)),M[type],tint,.064);
  if(id===93){
   const g0=min+.15,g1=g0+3.15;
   section(g1,max,1.45,'mesh','#355747',.38);gate(g0,g1,'#574737',1.48);
   pier(min,1.52);pier(max,1.45);
   groundStrip(g0,g1,-1.15,'pavers',[.70,.66,.55]);groundStrip(g1,max,front+.05,'grass',[.37,.44,.25]);
  }else if(id===96){
   const g0=-5.70,g1=-2.48,p0=.22,p1=1.39;
   section(min,g0,1.18,'timber','#574530');section(g1,p0,1.18,'timber','#574530');section(p1,max+3.5,1.18,'timber','#574530');
   gate(g0,g1,'#574530',1.22);gate(p0,p1,'#574530',1.23);pier(min);pier(max+3.5);
   groundStrip(g0,g1,-1.23,'pavers',[.63,.61,.51]);groundStrip(p0,p1,-6.80,'pavers',[.65,.62,.53]);
   groundStrip(p1,max+3.5,front+.05,'grass',[.39,.45,.27]);
   // Pale letterbox in the pedestrian gate pier and the short side wall lamp.
   solid(id,[p0,fy(p0)-.21],.23,.10,.92,1.12,'#d8d9cd');
   solid(id,[6.43,-4.8],.06,.23,2.17,2.29,'#bdbbac');
   for(const [x,y,r,h]of [[-1.6,-6.0,.72,.75],[-4.7,-5.6,.56,.8],[7.9,-7.2,.85,1.3]]){
    const c=W(id,[x,y]);crown([...c,.38+h*.4],r,[.34,.45,.21],id+x*3);
   }
  }else if(id===117){
   const g0=-4.45,g1=-.60;
   section(min,g0,1.35,'mesh','#3f6151',.20);section(g1,max,1.35,'mesh','#3f6151',.20);
   hedge([W(id,[g1+.50,fy(g1+.50)+.58]),W(id,[max,fy(max)+.58])],1.65,.92,[.79,.84,.61],'streetview-47-front-hedge');
   pier(g0,1.30);pier(g1,1.35);
   groundStrip(g0,g1,-1.05,'pavers',[.58,.57,.50]);
   solid(id,[g1,fy(g1)-.18],.34,.23,.96,1.22,'#526d5a');
   solid(id,[g1+.32,fy(g1+.32)+.1],.40,.30,.06,.72,'#c7c8bb');
  }else{
   const g0=.15,g1=3.40,p0=4.55,p1=5.70;
   section(min,-3.65,1.1,'rails','#dddcd0');gate(-3.65,-.35,'#d9ddd1',1.12);
   section(-.35,g0,1.1,'rails','#dddcd0');
   gate(g0,g1,'#555447',1.35,'two-tone');section(g1,p0,1.32,'timber','#555447');
   gate(p0,p1,'#555447',1.3,'two-tone');section(p1,max,1.25,'timber','#555447');
   for(const x of [min,max])pier(x,1.35);
   groundStrip(-3.65,-.35,front+.1,'pavers',[.63,.63,.55]);groundStrip(g0,g1,front+.1,'pavers',[.63,.63,.55]);
  }
  record('frontage',d,{group:d.group,bounds:[min,max],boundary:[min,max].map(x=>W(id,[x,fy(x)]))});
 }

 for(const d of observations.trees){
  const c=W(d.part,d.local),H=d.height,R=d.radius;
  beam([...c,.08],[c[0]+.10,c[1],H*.83],d.kind==='birch'?.21:.24,rgb(d.kind==='birch'?'#cecebb':'#82765c'));
  if(d.kind==='conifer'){
   const rings=[[.07,.19],[.14,.62],[.24,.85],[.38,1],[.52,.97],[.67,.83],[.80,.66],[.91,.40],[1,.025]],steps=18;
   const point=(j,k)=>{const [z,r]=rings[j],a=k/steps*Math.PI*2,rr=R*r*(1+.12*Math.sin(k*3.3+j*2.1));return [c[0]+Math.cos(a)*rr,c[1]+Math.sin(a)*rr*.87,H*z+.11*Math.sin(k*2+j)];};
   for(let j=0;j<rings.length-1;j++)for(let k=0;k<steps;k++)poly([point(j,k),point(j,k+1),point(j+1,k+1),point(j+1,k)],M.hedge,[.73,.81,.49],[[k/3,j/2],[(k+1)/3,j/2],[(k+1)/3,(j+1)/2],[k/3,(j+1)/2]]);
  }else{
   const leaves=(c,r,h,seed)=>{
    const at=(j,k)=>{const a=j/6*Math.PI,b=k/10*Math.PI*2,n=1+.12*Math.sin(j*5+k*3+seed);return [c[0]+Math.sin(a)*Math.cos(b)*r*n,c[1]+Math.sin(a)*Math.sin(b)*r*n,c[2]+Math.cos(a)*h];};
    for(let j=0;j<6;j++)for(let k=0;k<10;k++)poly([at(j,k),at(j+1,k),at(j+1,k+1),at(j,k+1)],M.hedge,[.82,.88,.60],[[k/4,j/3],[k/4,(j+1)/3],[(k+1)/4,(j+1)/3],[(k+1)/4,j/3]]);
   };
   for(let z=.45;z<H*.7;z+=.42)beam([c[0]-.09,c[1]-.05,z],[c[0]+.08,c[1]-.05,z+.04],.035,rgb('#555d51'));
   for(let j=0;j<11;j++){
    const a=j*2.399,z=2.7+j*.41,r=R*(.65+.24*Math.sin(j*1.8));
    const end=[c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r,z+1.5];
    beam([c[0],c[1],z],end,.055,rgb('#b0b29c'));
    leaves(end,.72,1.0,201+j);
    for(let k=0;k<3;k++){
     const tip=[end[0]+Math.cos(a+k)*.45,end[1]+Math.sin(a+k)*.45,end[2]-.85-k*.23];
     beam(end,tip,.018,rgb('#777e60'));leaves(tip,.42,.78,250+j*3+k);
    }
   }
   leaves([c[0],c[1],H-.5],.8,.6,288);
  }
  record('tree',d,{kind:d.kind,center:c,heightEstimated:H});
 }
 for(const d of observations.roofVents){
  const p=P(d.part),[lo,hi]=p.bounds,mid=(lo[1]+hi[1])/2,q=d.local||[lo[0]+(hi[0]-lo[0])*d.along,mid-(mid-lo[1])*d.down];
  const z=p.roofHeight(q),c=W(d.part,q);
  box(c,p.u,p.v,.26,.29,z-.04,z+.15,rgb('#74766a'),M.wall);
  box(c,p.u,p.v,.34,.34,z+.15,z+.19,rgb('#606557'),M.wall);
  record('roof-vent',d,{center:c,top:z+.19});
 }
 for(const d of observations.aerials){
  const p=P(d.part),[lo,hi]=p.bounds,q=[lo[0]+(hi[0]-lo[0])*.26,(lo[1]+hi[1])/2],c=W(d.part,q),z=p.roofHeight(q)+1.2;
  beam([...c,z-.4],[...c,z+1.3],.022,rgb('#92968c'));
  const end=add(c,mul(p.u,.85));beam([...add(c,mul(p.u,-.5)),z+1.25],[...end,z+1.25],.02,rgb('#8b9287'));
  for(let j=0;j<7;j++){const at=add(c,mul(p.u,-.5+j*.22)),r=.25-j*.012;beam([...add(at,mul(p.v,-r)),z+1.25],[...add(at,mul(p.v,r)),z+1.25],.013,rgb('#93998d'));}
  record('aerial',d,{center:c,top:z+1.3});
 }
 // Roof-edge treatment at 33 follows its actual L perimeter and perpendicular ridge.
 const p=P(96),profile=observations.roofs.find(r=>r.part===96);
 const local=q=>[p.u,p.v].map(v=>(q[0]-p.center[0])*v[0]+(q[1]-p.center[1])*v[1]),ring=p.ring.map(local);
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],ts=[0,1];
  for(const z of profile.zones){const mid=(z.start+z.end)/2;if((a[z.axis]-mid)*(b[z.axis]-mid)<0)ts.push((mid-a[z.axis])/(b[z.axis]-a[z.axis]));if((a[0]-z.to)*(b[0]-z.to)<0)ts.push((z.to-a[0])/(b[0]-a[0]));}
  ts.sort((a,b)=>a-b);
  for(let j=1;j<ts.length;j++){
   const aa=mix(a,b,ts[j-1]),bb=mix(a,b,ts[j]),zone=profile.zones.find(z=>(aa[0]+bb[0])/2>=z.from&&(aa[0]+bb[0])/2<=z.to);
   beam(A(96,aa,streetRoofHeight(zone,aa)+.02),A(96,bb,streetRoofHeight(zone,bb)+.02),.105,rgb('#656960'));
  }
 }
 for(const q of [[-5.60,-1.23],[6.39,-6.78]])beam(A(96,q,.14),A(96,q,2.78),.065,rgb('#6a7168'));
 for(const d of observations.canopies){
  const p=P(d.part),[lo,hi]=p.bounds;
  beam(A(d.part,[lo[0]+.08,lo[1]+.08],.08),A(d.part,[lo[0]+.08,lo[1]+.08],p.eaves),.105,rgb('#70634f'));
  record('open-canopy',d,{garagePart:118});
 }
 record('cross-roof',profile,{zones:profile.zones});
}
