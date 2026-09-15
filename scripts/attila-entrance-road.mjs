import {add,sub,mul,dot,len,norm,mix,rgb} from './attila-geometry.mjs';

export function cornerEntrance({mesh,o,u,v,lo,hi,frontY,P,details}){
 const {box,beam,poly,crown}=mesh,w=hi[0]-lo[0],x=lo[0]+w*.72,fy=frontY+2.35,ivory=rgb('#dddccd'),concrete=rgb('#c4c1af'),iron=rgb('#aca996');
 const at=(x,y,z)=>[...P(x,y),z];
 // Broad concrete canopy, thin fascia, weathered upper edge and brackets.
 box(P(x,frontY+.26),u,v,w*.47,.65,3.00,3.13,ivory,8);
 beam(at(x-w*.24,frontY+.59,3.14),at(x+w*.24,frontY+.59,3.14),.055,rgb('#7c7e68'),8);
 for(const dx of [-w*.19,w*.19])box(P(x+dx,frontY+.18),u,v,.16,.38,2.83,3.01,concrete);
 beam(at(lo[0]+.05,frontY+.025,6.15),at(hi[0]-.04,frontY+.025,6.15),.05,ivory,8);
 beam(at(hi[0]-.07,frontY+.075,.05),at(hi[0]-.07,frontY+.075,6.2),.055,ivory,8);
 // Three steps and a landing line up with the recessed door and garden gate.
 box(P(x,frontY+.34),u,v,1.05,.66,0,.48,concrete,8);
 for(let k=0;k<3;k++){
  const y=frontY+1.38-k*.32,z=.16*(k+1);
  box(P(x,y),u,v,1.02,.34,0,z,concrete,8);
  beam(at(x-.52,y+.16,z+.006),at(x+.52,y+.16,z+.006),.024,rgb('#96978b'),8);
 }
 box(P(x,frontY+1.91),u,v,1.03,.64,.025,.08,rgb('#bcb9a9'),5);
 box(P((lo[0]+hi[0])/2,frontY+1.13),u,v,w,2.26,0,.045,[.91,.95,.84],6);
 const gateWidth=1.02,gateLeft=x-gateWidth/2,gateRight=x+gateWidth/2;
 // Low garden wall wraps smoothly around the corner, below diamond mesh.
 function boundary(points){let distance=0;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],d=sub(b,a),ll=len(d),t=norm(d),n=[-t[1],t[0]];
   box(mix(a,b,.5),t,n,ll+.008,.15,.02,.40,concrete);
   beam([...a,.41],[...b,.41],.18,rgb('#d0cdbd'),8);
   const uv=(s,z)=>[(s+z)/.12,(s-z)/.12];
   poly([[...a,.43],[...b,.43],[...b,1.26],[...a,1.26]],7,iron,[uv(distance,.43),uv(distance+ll,.43),uv(distance+ll,1.26),uv(distance,1.26)]);
   beam([...a,1.28],[...b,1.28],.028,iron,8);distance+=ll;
  }
  for(const i of [0,Math.floor(points.length/2),points.length-1])beam([...points[i],.38],[...points[i],1.33],.045,iron,8);
 }
 const corner=[hi[0]-.56,fy-.60],curve=Array.from({length:13},(_,i)=>{const a=i/12*Math.PI/2;return P(corner[0]+.60*Math.cos(a),corner[1]+.60*Math.sin(a));});
 boundary([P(hi[0]+.04,frontY+.13),...curve,P(gateRight+.13,fy)]);
 boundary([P(lo[0]+.03,fy),P(gateLeft-.13,fy)]);
 for(const dx of [-gateWidth/2-.10,gateWidth/2+.10]){
  box(P(x+dx,fy),u,v,.20,.23,.02,1.44,ivory,8);
  box(P(x+dx,fy),u,v,.25,.28,1.44,1.49,rgb('#e0e0d2'),8);
 }
 box(P(x,fy),u,v,gateWidth,.07,.13,1.36,rgb('#d4d6c5'),8);
 for(let z=.24;z<1.36;z+=.14)beam(at(gateLeft+.025,fy+.044,z),at(gateRight-.025,fy+.044,z),.012,rgb('#a7ae9e'),8);
 for(const dx of [-gateWidth/2+.045,gateWidth/2-.045])beam(at(x+dx,fy+.055,.14),at(x+dx,fy+.055,1.35),.055,ivory,8);
 box(P(gateLeft+.13,fy+.07),u,v,.085,.035,1.01,1.045,rgb('#71776b'),8);
 box(P(gateLeft-.34,fy),u,v,.36,.23,.89,1.18,rgb('#c5bfa6'),8);
 beam(at(gateLeft-.48,fy+.13,1.10),at(gateLeft-.22,fy+.13,1.10),.022,rgb('#646b5f'),8);
 // The opening left of the door in the photograph has protective iron bars.
 const bx=lo[0]+w*.88;
 for(const dx of [-.12,.12])beam(at(bx+dx,frontY+.02,1.38),at(bx+dx,frontY+.02,2.52),.018,rgb('#9a9c80'),8);
 for(const z of [1.72,2.10])beam(at(bx-.22,frontY+.02,z),at(bx+.22,frontY+.02,z),.022,rgb('#9a9c80'),8);
 // Low shrubs preserve sight of the door, steps and rounded fence.
 for(const [xx,yy,r,h]of [[hi[0]-.45,frontY+1.08,.52,1.08],[hi[0]-.72,frontY+.53,.56,1.13],[lo[0]+.85,fy-.26,.75,1.04],[lo[0]+1.85,fy-.26,.72,1.05]])crown(at(xx,yy,h),r,rgb('#769368'),3+xx);
 // A small unreadable address plate is represented by its shape only.
 box(P(hi[0]-.19,frontY+.035),u,v,.16,.045,2.1,2.36,rgb('#aab5a0'),8);
 details.push({type:'corner-entrance',part:o.id,reference:'user-20260914-corner-house-reference',doorAxis:P(x,frontY),gateAxis:P(x,fy),steps:3,canopyWidth:w*.47,curvedFence:curve,gateWidth,accuracy:'Dimensions et détails estimés sur le cliché fourni'});
}

export function buildAttilaStreets({mesh,local,parts,details}){
 const {poly,box,beam}=mesh;
 // OSM intersection way/109239570 with way/29342043. The former hand-placed
 // Rue des Francs mouth was ten metres too far east and carried its crossing
 // into the main road. Derive every marking and kerb from this shared frame.
 const junction=local([4.372843,48.965192]),a=local([4.372002,48.964937]),b=local([4.37350,48.965392]);
 const u=norm(sub(b,a)),v=[-u[1],u[0]],fu=norm(sub(local([4.372883,48.965154]),junction)),fv=[-fu[1],fu[0]];
 const W=(x,y)=>add(junction,add(mul(u,x),mul(v,y))),F=(x,y)=>add(junction,add(mul(fu,x),mul(fv,y))),lo=dot(sub(a,junction),u),hi=dot(sub(b,junction),u);
 const asphalt=[.77,.80,.80],pavement=[.98,.98,.95],kerb=rgb('#b9b9ab'),white=rgb('#e7e6dc');
 const ground=(q,m=4,col=asphalt,z=.025)=>poly(q.map(p=>[...p,z]),m,col,q.map(p=>[p[0]/2.7,p[1]/2.7]));
 ground([W(lo,-3.6),W(hi,-3.6),W(hi,3.6),W(lo,3.6)]);
 ground([F(0,-2.65),F(34,-2.65),F(34,2.65),F(0,2.65)]);
 const crossings=[];
 function crossing(name,c,d,n,width,count){
  const stripes=[];for(let k=0;k<count;k++){
   const p=add(c,mul(n,(k-(count-1)/2)*.95)),q=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(p,add(mul(d,x*1.2),mul(n,y*.25))));
   // Paint stays planar, and follows the road's direction, with regular gaps.
   ground(q,8,white,.033);stripes.push(q);
  }crossings.push({name,center:c,direction:d,across:n,roadWidth:width,stripes});
 }
 const crossX=[-11.3,10.3];for(const [i,x] of crossX.entries())crossing('Camp d’Attila '+(i+1),W(x,0),u,v,7.2,7);
 crossing('Rue des Francs',F(6.6,0),fu,fv,5.3,5);
 function strip(A,B,d,n,inside,outside,ramps){
  const length=len(sub(B,A)),at=(x,y)=>add(A,add(mul(d,x),mul(n,y))),cuts=[0,length];
  for(const r of ramps)for(const x of [r-1.55,r+1.55])if(x>0&&x<length)cuts.push(x);cuts.sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
   const left=cuts[i-1],right=cuts[i],ramp=ramps.some(r=>Math.abs((left+right)/2-r)<1.56),h=ramp?.045:.145;
   const q=[[...at(left,inside),h],[...at(right,inside),h],[...at(right,outside),.145],[...at(left,outside),.145]];
   poly(q,5,pavement,q.map(p=>[p[0]/2.7,p[1]/2.7]));
   const aa=at(left,inside),bb=at(right,inside);poly([[...aa,.025],[...bb,.025],[...bb,h],[...aa,h]],8,kerb);
   beam([...aa,h],[...bb,h],.075,kerb,8);
  }
 }
 strip(W(lo,0),W(hi,0),u,v,3.6,6.0,crossX.map(x=>x-lo));
 strip(W(lo,0),W(-5.6,0),u,mul(v,-1),3.6,6.0,crossX.map(x=>x-lo));
 strip(W(5.6,0),W(hi,0),u,mul(v,-1),3.6,6.0,crossX.map(x=>x-5.6));
 for(const sign of [-1,1])strip(F(6,0),F(34,0),fu,mul(fv,sign),2.65,4.05,[.6]);
 // Flared rounded corners join the pavements without a kerb across the mouth.
 for(const sign of [-1,1]){
  const start=W(sign*5.6,-3.6),end=F(6,sign*2.65),control=add(junction,mul(fv,sign*2.65));
  const curve=Array.from({length:17},(_,k)=>{const t=k/16;return add(add(mul(start,(1-t)**2),mul(control,2*t*(1-t))),mul(end,t*t));});
  ground([junction,...curve]);
  const cornerStation=(sign*4.05+6*dot(v,fv))/dot(u,fv);
  const outer=[F(6,sign*4.05),W(cornerStation,-6),W(sign*5.6,-6)];
  const curveHeight=k=>.145-Math.max(0,k-12)/4*.10;
  const pavementPolygon=[...curve.map((p,k)=>[...p,curveHeight(k)]),...outer.map(p=>[...p,.145])];
  poly(pavementPolygon,5,pavement,pavementPolygon.map(p=>[p[0]/2.7,p[1]/2.7]));
  for(let k=1;k<curve.length;k++){
   const aa=curve[k-1],bb=curve[k],ha=curveHeight(k-1),hb=curveHeight(k);
   beam([...aa,ha],[...bb,hb],.075,kerb,8);
   poly([[...aa,.025],[...bb,.025],[...bb,hb],[...aa,ha]],8,kerb);
  }
 }
 // Fill the former aerial-texture gaps between the terraced gardens and road.
 for(const p of parts.filter(p=>p.type==='terrace')){
  const {u:pu,v:pv,lo:l,hi:h}=p.frame,fy=h[1]+(p.id===3?2.35:1.7),P=(x,y)=>add(mul(pu,x),mul(pv,y));
  const aa=P(l[0],fy),bb=P(h[0],fy),edge=q=>W(dot(sub(q,junction),u),-6.0);
  ground([aa,bb,edge(bb),edge(aa)],5,pavement,.143);
 }
 // Two small utility covers give local scale without covering the asphalt.
 for(const [x,y]of [[-23,-2.1],[21,1.8]]){
  const c=W(x,y);box(c,u,v,.52,.61,.027,.036,rgb('#626861'),8);
  for(let k=-2;k<=2;k++)beam([...add(c,add(mul(u,-.22),mul(v,k*.095))),.04],[...add(c,add(mul(u,.22),mul(v,k*.095))),.04],.009,rgb('#393e3b'),8);
 }
 details.push({type:'street-layout',junction,road:{a,b,u,v,width:7.2},francs:{direction:fu,across:fv,width:5.3},crossings,kerbOpening:11.2,reference:'OSM street centre lines and supplied junction screenshot'});
 return {roadU:u,roadV:v,roadA:a,roadB:b,junction,W,F};
}
