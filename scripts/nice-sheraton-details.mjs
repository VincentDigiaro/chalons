import {rgb,add,mul,mix} from './attila-geometry.mjs';

const ivory=rgb('#e5e4dc'),metal=rgb('#343f41'),glass=rgb('#253b42'),stone=rgb('#c5c1b5'),timber=rgb('#a78c6c');
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};

// The reference has an oval, convex envelope, not a straight conical cylinder.
// Each white louvre is an annulus: no stacked solid discs across the crown.
export function buildSheratonCornerTower(m,world,u,v){
 const center=world(-32,-18.7),slices=64;
 const profile=[[0,3.45,3.9],[1.0,4.2,4.6],[3.5,4.8,5.2],[8,4.95,5.35],[13,4.85,5.2],[17,4.48,4.85],[21,3.85,4.15],[24.4,3.35,3.7]];
 const radii=z=>{let i=0;while(i<profile.length-2&&z>profile[i+1][0])i++;const a=profile[i],b=profile[i+1],t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0]))),s=t*t*(3-2*t);return mix(a.slice(1),b.slice(1),s);};
 const point=(z,k,offset=0)=>{const [rx,ry]=radii(z),a=k/slices*Math.PI*2,p=add(center,add(mul(u,(rx+offset)*Math.cos(a)),mul(v,(ry+offset)*Math.sin(a))));return [...p,z];};
 for(let z=0;z<24.4;z+=.4){const top=Math.min(24.4,z+.4);for(let k=0;k<slices;k++)m.face([point(z,k),point(z,k+1),point(top,k+1),point(top,k)],glass,0);}
 for(let z=.25;z<24.35;z+=.62){const top=Math.min(24.4,z+.29);for(let k=0;k<slices;k++){
  m.face([point(z,k,.20),point(z,k+1,.20),point(top,k+1,.20),point(top,k,.20)],ivory);
  m.face([point(top,k),point(top,k,.20),point(top,k+1,.20),point(top,k+1)],ivory);
  m.face([point(z,k+1),point(z,k+1,.20),point(z,k,.20),point(z,k)],ivory);
 }}
 const rim=Array.from({length:slices},(_,k)=>point(24.4,k,.12).slice(0,2));
 m.roof([rim],24.4,stone,0);m.band(rim,24.4,.23,.06,ivory);
 const dome=(angle,t)=>{const p=add(center,add(mul(u,3.40*t*Math.cos(angle)),mul(v,3.75*t*Math.sin(angle))));return [...p,24.64+1.16*(1-t*t)];};
 // Dark curved ribs and circular ties read as an open lattice, with a low
 // round apex instead of the previous pointed white cap.
 for(let k=0;k<12;k++)for(let j=0;j<12;j++)m.beam(dome(k*Math.PI/6,j/12),dome(k*Math.PI/6,(j+1)/12),.15,metal);
 for(const t of [.28,.60,.83,1])for(let k=0;k<slices;k++)m.beam(dome(k*2*Math.PI/slices,t),dome((k+1)*2*Math.PI/slices,t),.13,metal);
 m.detail('stair-ovoid-envelope',[...center,0],{profile,u,v,louvrePitch:.62,louvreHeight:.29,reference:'sheraton-reference-utilisateur.png'});
 m.detail('oval-stair-crown',[...center,25.8],{shape:'low-open-elliptic-dome',base:24.4,top:25.8});
}

export function buildAirPromenadeTip(m,{ring,world,u,v}){
 const floor=15.03,soffit=3.4;
 m.building([ring],15,{base:soffit,band:3.5,bandHeight:1,roof:stone});
 m.roof([ring],.045,stone,0);
 const columnFrames=[[29.8,-6.3],[44.2,5.6],[38.0,7.8]];
 for(const p of columnFrames){const c=world(...p);m.cylinder(c,.29,.045,soffit-.045,ivory,.29,20);m.cylinder(c,.38,.045,.10,stone,.38,20);}

 m.detail('open-preau',[...world(40,2),0],{clearHeight:soffit,footprint:ring,columns:columnFrames.map(p=>world(...p)),walkthrough:[world(40,-8),world(40,4)]});

 function chair(c,forward){
  const right=[forward[1],-forward[0]];
  m.box(c,.48,.48,floor+.43,.065,timber,right,forward);
  for(const a of [-1,1])for(const b of [-1,1]){const p=add(c,add(mul(right,a*.20),mul(forward,b*.20)));m.beam([...p,floor+.02],[...p,floor+.45],.035,metal);}
  const back=add(c,mul(forward,-.23));m.box(back,.48,.055,floor+.48,.39,timber,right,forward);
 }
 const tableFrames=[[32,-4],[32,2],[34,7],[38,.5],[39,6],[44,6]];
 for(const [x,y]of tableFrames){const c=world(x,y);if(!inside(c,ring))continue;
  for(const a of [-1,1])for(const b of [-1,1]){const p=add(c,add(mul(u,a*.66),mul(v,b*.30)));m.box(p,.055,.055,floor,.73,metal,u,v);}
  m.box(c,1.6,.85,floor+.73,.07,ivory,u,v);
  let chairs=0;for(const [d,distance] of [[u,1.3],[mul(u,-1),1.3],[v,.95],[mul(v,-1),.95]]){const p=add(c,mul(d,distance));if(![p,add(p,mul(d,.4))].every(q=>inside(q,ring)))continue;chair(p,mul(d,-1));chairs++;}
  m.detail('terrace-table',[...c,floor],{chairs,shape:'rectangular',width:1.6,depth:.85});
 }
 m.detail('east-terrace',[...world(38,3),floor],{use:'tables and chairs',ventilation:false,reference:'terrasse-preau.png'});
}
