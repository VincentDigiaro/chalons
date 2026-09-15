import fs from 'node:fs/promises';
import {landscapeTools,} from './nerval-landscape.mjs';
import {frontBoundary} from './build-nerval-refinements.mjs';

const ids=[86,78,77,76,73,80,83],ref=n=>'nerval-roundabout-'+n;
export async function applyRoundaboutSurvey(survey){
 const refs=JSON.parse(await fs.readFile('scripts/nerval-roundabout-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith('nerval-roundabout-')),...refs];
 const raw=JSON.parse(await fs.readFile('scripts/nerval-roundabout-footprints.json','utf8'));
 const frame=survey.parts.find(p=>p.id===77),center=raw.find(p=>p.id===76).center;
 for(const source of raw){
  if(survey.parts.some(p=>p.id===source.id))continue;
  const {u,v}=frame,local=source.ring.map(q=>[u,v].map(a=>a[0]*(q[0]-center[0])+a[1]*(q[1]-center[1])));
  const lo=[0,1].map(i=>Math.min(...local.map(q=>q[i]))),hi=[0,1].map(i=>Math.max(...local.map(q=>q[i])));
  survey.parts.push({id:source.id,osm_id:source.osm_id,ring:source.ring,center,u,v,bounds:[lo,hi],surfaceBounds:{front:[lo[0],hi[0]]},group:'nerval-roundabout-26',photos:[],patches:[],focus:true,eaves:3,rise:2.8,roof:'gable',roofAxis:1});
 }
 if(!survey.groups.some(g=>g.id==='nerval-roundabout-26'))survey.groups.push({id:'nerval-roundabout-26',parts:[76,73],center,u:frame.u,v:frame.v,photos:[],description:'Maison 26, garage surmonté d’une fenêtre et aile basse ocre',roof:'cross'});
 survey.focusParts=[...new Set([...survey.focusParts,76,73])];
 survey.refinements.customFrontages=[...new Set([...survey.refinements.customFrontages,'nerval-35','nerval-36','nerval-38','nerval-roundabout-26'])];
 survey.roundabout={parts:ids,houseParts:{32:[86],30:[78],28:[77],26:[76,73],24:[80],22:[83]},references:refs.map(r=>r.id),accuracy:'Contours OSM inchangés ; hauteurs, menuiseries et jardins estimés sur les photographies du rond-point.'};
 const p=id=>survey.parts.find(p=>p.id===id);
 const set=(id,number,color,tint,sections)=>{const q=p(id);Object.assign(q,{description:`Maison ${number} de la rue Gérard-de-Nerval, façade observée depuis le rond-point`,color,roofTint:tint,roof:'gable',roofAxis:1,eaves:sections[0][1],rise:sections[0][2],roofSections:sections.map((s,i)=>({from:i?sections[i-1][0]:q.bounds[0][0],to:s[0],eaves:s[1],rise:s[2]}))});delete q.frontFlat;};
 set(86,32,[.88,.85,.70],[1,.97,.86],[[.6,4.15,3.05],[p(86).bounds[1][0],4.15,3.8]]);
 set(78,30,[.88,.84,.70],[1,.98,.88],[[4.32,3.0,2.65],[p(78).bounds[1][0],2.63,1.82]]);
 set(77,28,[.80,.79,.69],[.92,.94,.88],[[.94,3.0,3.75],[p(77).bounds[1][0],5.42,1.38]]);
 set(76,26,[.93,.80,.55],[.84,.87,.84],[[p(76).bounds[0][0]+3.25,5.35,1.40],[p(76).bounds[1][0],2.97,2.0]]);
 Object.assign(p(73),{color:[.93,.80,.55],roofTint:[.84,.87,.84],eaves:2.97,rise:2,description:'Retour de l’aile basse du 26'});
 set(80,24,[.88,.80,.70],[.64,.69,.73],[[-12.87,5.4,1.55],[p(80).bounds[1][0],3.02,3.95]]);
 set(83,22,[.88,.85,.75],[1,.97,.88],[[-2.60,5.4,1.55],[p(83).bounds[1][0],3.05,3.90]]);
 survey.openings=survey.openings.filter(o=>!ids.includes(o.part));
 const put=(id,x,bottom,width,height,extra={},photo)=>{const q=p(id),span=q.surfaceBounds.front;survey.openings.push({part:id,side:'front',along:(x-span[0])/(span[1]-span[0]),bottom,width,height,glassMaterial:true,...extra,reference:ref(photo||({86:'32-entry',78:'30',77:'28',76:'26-24',73:'26-24',80:'26-24',83:'22'})[id]),visibility:'Ouverture observée sur les photographies du rond-point ; cotes estimées'});};
 // Number 32: the entry sits LEFT of the two windows, behind the hedge.
 put(86,-.42,1.38,2.15,2.25,{kind:'patio',leaves:2,entry32:true});
 for(const [x,drop]of [[2.35,.70],[5.00,.90]])put(86,x,2.52,1.22,1.22,{shutters:'brown',roller:true,rollerDrop:drop});
 put(86,5.30,.13,2.48,1.90,{kind:'garage',color:'#e0dfd4',garageStyle:'panels'});
 // Number 30 is a low detached house, with the attached timber garage right.
 put(78,-4.55,.16,1.20,2.13,{kind:'patio',shutters:'ochre',closed:true});
 put(78,-1.35,.16,.99,2.17,{kind:'door',frame:'wood',color:'#876044',woodPanels:true});
 put(78,2.06,.92,1.43,1.36,{shutters:'ochre'});
 put(78,6.0,.13,2.70,2.17,{kind:'garage',color:'#987758',garageLights:4});
 // Number 28: entrance in the setback and French window on the balcony.
 put(77,-4.32,.17,1.62,2.12,{kind:'patio',shutters:'slate',depth:.59});
 put(77,-.60,.18,.93,2.17,{kind:'door',color:'#48514b',woodPanels:true,woodPanelColors:['#333e37','#566054'],depth:1.28});
 put(77,-1.55,1.16,.46,.74,{leaves:1,securityBars:true,depth:1.28});
 put(77,3.12,2.83,1.49,2.16,{kind:'patio',shutters:'slate',roller:true,rollerDrop:.92});
 put(77,3.12,.10,2.86,2.22,{kind:'garage',color:'#e1e0d4',garageStyle:'panels',garageLights:3});
 const l=p(76).bounds[0][0],split=l+3.25;
 put(76,l+1.66,3.47,1.22,1.40,{shutters:'white'});
 put(76,l+1.66,.10,2.77,2.20,{kind:'garage',color:'#e3e1d3',garageStyle:'panels',garageLights:3});
 put(76,split+1.25,.20,.98,2.16,{kind:'door',color:'#e4e3d5',glazed:true,depth:1.90});
 put(76,split+4.20,.90,1.30,1.33,{shutters:'white',depth:1.90});
 // Number 24: dressed-stone openings and white security grilles, no brown shutters.
 put(80,-14.47,3.54,1.12,1.37,{roller:true,rollerDrop:1,rollerColor:'#474b4a',stone:true});
 put(80,-14.47,.10,2.51,2.16,{kind:'garage',color:'#5d4439',garageLights:4,stone:true});
 put(80,-11.91,1.46,.46,.91,{leaves:1,securityBars:true,stone:true});
 put(80,-10.72,.42,.98,2.19,{kind:'door',color:'#eee5d3',glazed:true,securityBars:true,stone:true});
 put(80,-7.49,.43,1.27,2.18,{kind:'patio',grid:true,stone:true});
 // Number 22: white arched entry, narrow barred light, timber garage.
 put(83,-4.22,3.55,1.10,1.38,{shutters:'ochre',roller:true,rollerDrop:.91});
 put(83,-4.22,.12,2.47,2.19,{kind:'garage',color:'#825b3d',garageLights:4});
 put(83,-2.20,1.42,.38,.97,{leaves:1,securityBars:true});
 put(83,-.93,.61,1.02,2.14,{kind:'door',color:'#e4e3d9',archedGlass:true});
 put(83,2.12,.57,1.30,2.19,{kind:'patio',shutters:'ochre',grid:true,roller:true,rollerDrop:.57});
 survey.skylights=survey.skylights.filter(s=>!ids.includes(s[0]));
 survey.skylights.push([86,.64,.52,.69,.90],[86,.86,.52,1.16,.92],[77,.68,.45,.97,.85],[76,.18,.26,1.12,.68],[80,.16,.28,1.04,.67],[80,.65,.5,1.0,.96]);
}

export function buildRoundaboutDetails(ctx){
 const {parts,objects,survey,box,beam,poly,rgb,add,sub,mul,norm,len,mix,materials:M}=ctx,{ground,path,hedge}=landscapeTools(ctx);
 const p=id=>parts.get(id),W=(id,xy)=>p(id).world(xy),A=(id,x,y,z)=>[...W(id,[x,y]),z];
 const solid=(id,x,y,w,d,z0,z1,col='#d7d0b8',mat=M.wall)=>box(W(id,[x,y]),p(id).u,p(id).v,w,d,z0,z1,rgb(col),mat);
 const line=(id,a,b,w,col)=>beam(A(id,...a),A(id,...b),w,rgb(col));
 const surface=(id,pts,kind='grass',z=.06,tint)=>{const clean=pts.filter((b,i)=>{const a=pts[(i+pts.length-1)%pts.length],c=pts[(i+1)%pts.length];return Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))>1e-7;});ground(clean.map(q=>W(id,q)),M[kind],tint||({grass:[.55,.53,.31],pavers:[.77,.64,.48],pave:[.72,.70,.61],road:[.36,.37,.35]})[kind],z);};
 const rect=(id,x0,x1,y0,y1,kind='grass',z,tint)=>surface(id,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],kind,z,tint);
 const boundary=(id,x)=>{
  if(id===77){const q=W(id,[x,0]),d=sub(q,[-64.1,-59.5]),along=d[0]*p(id).u[0]+d[1]*p(id).u[1],depth=d[0]*p(id).v[0]+d[1]*p(id).v[1];return -depth+Math.sqrt(Math.max(0,14.70**2-along**2));}
  return frontBoundary(p(id),x,p(id).bounds[0][1],survey.refinements.streetPaths,id===78?14:id===83?11:25);
 };
 const front=(id,x0,x1)=>Array.from({length:17},(_,i)=>{const x=x0+(x1-x0)*i/16,q=p(id);if([76,80].includes(id)){const angles=id===76?[96,62]:[62,24],t=(x-q.bounds[0][0])/(q.bounds[1][0]-q.bounds[0][0]),a=(angles[0]+t*(angles[1]-angles[0]))*Math.PI/180,w=[-64.1+Math.cos(a)*14.3,-59.5+Math.sin(a)*14.3];return [q.u,q.v].map(v=>(w[0]-q.center[0])*v[0]+(w[1]-q.center[1])*v[1]);}return [x,boundary(id,x)];});
 function ball(id,x,y,z,rx,ry,rz,tint=[.79,.85,.60]){
  const pt=(j,k)=>{const a=j/6*Math.PI,b=k/10*Math.PI*2,r=1+.055*Math.sin(k*3+j*7+x);return A(id,x+Math.sin(a)*Math.cos(b)*rx*r,y+Math.sin(a)*Math.sin(b)*ry*r,z+Math.cos(a)*rz);};
  for(let j=0;j<6;j++)for(let k=0;k<10;k++)poly([pt(j,k),pt(j+1,k),pt(j+1,k+1),pt(j,k+1)],M.hedge,tint,[[k/5,j/3],[k/5,(j+1)/3],[(k+1)/5,(j+1)/3],[(k+1)/5,j/3]]);
 }
 function flowers(id,x,y,z,w=.65,d=.24,boxColor='#74624d'){
  solid(id,x,y,w,d,z,z+.18,boxColor);ball(id,x,y,z+.25,w*.51,d*.75,.17);
  for(let i=0;i<12;i++){const xx=x+Math.sin(i*2.39)*w*.47,yy=y+Math.cos(i*1.76)*d*.70,zz=z+.46+.05*Math.sin(i*2.1);const c=rgb(['#db819d','#e6ddd0','#bf4169'][i%3]);
   for(let k=0;k<5;k++){const a=k*1.257,px=xx+Math.cos(a)*.032,py=yy+Math.sin(a)*.032;poly([A(id,px-.032,py,zz),A(id,px,py-.03,zz+.026),A(id,px+.032,py,zz),A(id,px,py+.03,zz-.02)],M.wall,c);}}
 }
 function wall(points,height=.5,cap=true){
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],u=norm(sub(b,a)),v=[-u[1],u[0]],l=len(sub(b,a)),h=typeof height==='function'?height((i-.5)/(points.length-1)):height;
   box(mix(a,b,.5),u,v,l+.012,.22,.02,h,rgb('#dedac6'),M.wall);
   if(cap){box(mix(a,b,.5),u,v,l+.015,.27,h,h+.07,rgb('#a77d59'),M.wall);for(let d=.025;d<l;d+=.135){const c=add(a,mul(u,d));beam([...add(c,mul(v,-.138)),h+.073],[...add(c,mul(v,.138)),h+.073],.012,rgb('#d4c2a3'));}}
  }
 }
 function railing(id,pts,{style='bars',base=.24,height=1.20,col='#303e37'}={}){
  const coords=pts.map(q=>W(id,q));if(base)wall(coords,base,false);
  for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],u=norm(sub(b,a)),v=[-u[1],u[0]],l=len(sub(b,a));
   if(style==='solid')box(mix(a,b,.5),u,v,l,.065,.10,height,rgb(col),M.wall);
   else{for(const z of style==='rails'?[base+.22,base+.62,height]:[base+.10,height-.09])beam([...a,z],[...b,z],.037,rgb(col));
    for(let d=.05;d<l;d+=style==='rails'?2:style==='pickets'?.21:.135){const c=add(a,mul(u,d));box(c,u,v,style==='pickets'?.135:style==='rails'?.055:.022,.035,base+.02,height,rgb(col),M.wall);}}
  }
 }
 function pier(id,x,y,h=1.45,stone=false){solid(id,x,y,.32,.34,.03,h,stone?'#bcb39a':'#d5d2bc');solid(id,x,y,.40,.42,h,h+.09,'#c6bda6');for(let z=.2;z<h;z+=.24)solid(id,x,y,.326,.347,z,z+.017,'#dfd7c1');}
 function mail(id,x,y,col='#3f6652'){solid(id,x,y,.38,.28,.93,1.25,col);solid(id,x,y-.15,.24,.016,1.16,1.18,'#d1c7a0');solid(id,x+.11,y-.15,.018,.018,1.02,1.05,'#d5d7ca');}
 function lamp(id,x,y,z=2.28){solid(id,x,y,.14,.16,z,z+.24,'#414b41');solid(id,x,y-.09,.095,.023,z+.03,z+.18,'#d2c6a4');solid(id,x,y,.23,.22,z+.24,z+.29,'#424a3e');line(id,[x,y,z+.29],[x,y,z+.37],.04,'#424a3e');}
 function steps(id,x,y,w,top,count){for(let i=0;i<count;i++){const yy=y-(i+.5)*.32,h=top*(count-i)/count;solid(id,x,yy,w,.33,.06,h,'#b59a78');solid(id,x,yy-.025,w+.025,.30,h,h+.04,'#d1c7b2');}}
 function tree(id,x,y,h,r){line(id,[x,y,.06],[x+.10,y,h*.75],.20,'#817c5c');for(let i=0;i<6;i++){const a=i*2.4,bx=x+Math.cos(a)*r*.65,by=y+Math.sin(a)*r*.65,z=h*.67+Math.sin(i)*.45;line(id,[x,y,h*.35],[bx,by,z],.07,'#89846b');ball(id,bx,by,z,r*.65,r*.60,r*.68);}ball(id,x,y,h-r*.60,r*.72,r*.70,r*.70);}
 // Per-house front plots follow the road-facing property boundaries.
 for(const id of [86,78,77,76,80,83]){const q=p(id),[lo,hi]=q.bounds,pts=front(id,lo[0],hi[0]);surface(id,[...pts,[hi[0],lo[1]+.02],[lo[0],lo[1]+.02]]);objects.push({type:'refined-ground',part:id,material:'grass',boundary:pts.map(q=>W(id,q)),reference:ref('aerial')});}
 // 32: raised planted forecourt, retaining edges and separate basement ramp.
 {
  const id=86,[lo,hi]=p(id).bounds,y=lo[1],edge=boundary(id,4.10);
  const gy=boundary(id,5.3),start=[4.75,gy+.65],end=[-.40,y-.02],direction=norm(sub(end,start)),side=[direction[1],-direction[0]],length=len(sub(end,start)),half=.72;
  const offset=(q,s)=>add(q,mul(side,s)),left=offset(start,-half),right=offset(start,half);
  const pts=front(id,-2,4.06),plot=[...pts,[4.06,y],[-2,y]];
  // Cut the raised lawn on both sides of the ramp, leaving no hidden slab
  // above the walking surface. The clipped banks meet the original plot.
  function bank(sign){let out=[];const distance=q=>sign*(sub(q,start).reduce((n,v,i)=>n+v*side[i],0))-half;
   for(let i=0;i<plot.length;i++){const a=plot[i],b=plot[(i+1)%plot.length],da=distance(a),db=distance(b);if(da>=0)out.push(a);if((da>=0)!==(db>=0))out.push(mix(a,b,da/(da-db)));}return out;}
  for(const sign of [-1,1])surface(id,bank(sign),'grass',1.25,[.49,.54,.30]);
  wall(pts.map(q=>W(id,q)),1.24,false);
  const crossings=[left,right].map(a=>a[1]+(4.06-a[0])*direction[1]/direction[0]).sort((a,b)=>a-b);
  if(crossings[0]>edge)wall([W(id,[4.06,edge]),W(id,[4.06,crossings[0]])],1.20);
  wall([W(id,[4.06,crossings[1]]),W(id,[4.06,y])],1.20);
  rect(id,4.22,6.72,boundary(id,5.3),y,'pave',.083,[.60,.59,.51]);
  const stations=[0,.85,length-1.10,length],heights=[.089,.089,1.28,1.28],route=[];
  for(let i=0;i<stations.length;i++)route.push([...W(id,add(start,mul(direction,stations[i]))),heights[i]]);
  for(let i=1;i<stations.length;i++){
   const a=add(start,mul(direction,stations[i-1])),b=add(start,mul(direction,stations[i])),za=heights[i-1],zb=heights[i];
   const quad=[offset(a,-half),offset(a,half),offset(b,half),offset(b,-half)].map((q,j)=>[...W(id,q),j<2?za:zb]);
   poly(quad,M.pave,[.93,.94,.95],[[0,stations[i-1]/2],[half,stations[i-1]/2],[half,stations[i]/2],[0,stations[i]/2]]);
   // Low brick edges follow the slope; retaining faces are on the garden side.
   for(const sign of [-1,1]){const aa=offset(a,sign*half),bb=offset(b,sign*half);
    line(id,[...aa,za+.035],[...bb,zb+.035],.075,'#b89771');
    const cut=q=>Math.max(0,Math.min(1,(4.06-q[0])/(bb[0]-aa[0])));
    const t=aa[0]>4.06?cut(aa):0,pa=mix(aa,bb,t),zz=za+(zb-za)*t;
    if(bb[0]<4.06&&Math.min(zz,zb)<1.25)poly([A(id,...pa,zz),A(id,...bb,zb),A(id,...bb,1.25),A(id,...pa,1.25)],M.wall,[.75,.72,.63]);
   }
  }
  objects.push({type:'entrance-ramp',part:id,width:half*2,route,landingHeight:1.28,material:'white-grey-gravel'});
  // A dark glazed door at the right of a fixed white-framed entrance pane.
  solid(id,.14,y-.03,.83,.055,1.42,3.55,'#534735');solid(id,.14,y-.073,.63,.015,2.05,3.34,'#778981',M.glass);
  for(const x of [-1.50,.68])solid(id,x,y-.26,.10,.11,1.35,3.69,'#eee9d8');solid(id,-.41,y-.26,2.29,.11,3.59,3.71,'#eee9d8');
  poly([A(id,-1.46,y-.25,1.4),A(id,-1.46,y+.12,1.4),A(id,-1.46,y+.12,3.6),A(id,-1.46,y-.25,3.6)],M.glass,[.77,.84,.81],[[0,0],[1,0],[1,1],[0,1]]);
  const by=boundary(id,3.1);hedge([W(id,[-1.6,by+1.0]),W(id,[3.45,by+1.0])],1.83,.8,[.78,.85,.62],'32-front-hedge');
  ball(id,3.0,y-2.5,2.35,.72,.65,1.08);ball(id,1.70,y-1.7,1.85,.60,.50,.57);
  railing(id,[[3.84,gy],[6.90,gy]],{style:'solid',base:0,height:1.42,col:'#ecebdf'});pier(id,3.84,gy);pier(id,6.90,gy);mail(id,6.94,gy,'#e0dfcd');
  railing(id,[[6.83,gy],[6.83,y]],{style:'pickets',height:1.15,col:'#8a9b8b'});
  objects.push({type:'recessed-glazed-entry',part:id,number:32,side:'left of two windows',reference:ref('32-entry')});
 }
 ground([[-86,-56],[-78,-53],[-74,-48],[-80,-44],[-90,-43]],M.grass,[.55,.53,.31],.064);
 // 30: chalk/gravel vehicle access with grass in the centre and a narrow walk.
 {
  const id=78,[lo,hi]=p(id).bounds,y=lo[1];const gy=boundary(id,5.9);
  surface(id,[[4.33,boundary(id,4.33)],[7.60,boundary(id,7.60)],[7.60,y],[4.33,y]],'pave',.075,[.89,.87,.75]);
  rect(id,5.15,6.72,gy+.4,y-.3,'grass',.080,[.58,.57,.32]);
  rect(id,-1.78,-.95,boundary(id,-1.35),y,'road',.082,[.63,.65,.58]);
  for(const x of [lo[0]+.35,3.8]){rect(id,x-.18,x+.18,boundary(id,x)+.6,y,'pave',.081,[.81,.79,.67]);for(let yy=boundary(id,x)+1;yy<y;yy+=.85)ball(id,x,yy,.24,.25,.29,.18);}
  tree(id,2.10,y-2.2,2.6,1.02);flowers(id,-2.3,y-.35,.08,.36,.35);flowers(id,-.25,y-.30,.08,.40,.36);lamp(id,-.56,y-.17);
  const by=boundary(id,-2.3);solid(id,-2.3,by,.38,.28,.05,.88,'#d6d6c6');solid(id,-1.98,by,.14,.19,.05,1.26,'#8b7b5b');mail(id,-2.3,by);
  // The shared divider is the fence beside number 32's garage. Extending a
  // second fence along this differently oriented facade cuts across its lawn.
  railing(id,[[hi[0],boundary(id,hi[0])],[hi[0],y]],{style:'rails',height:1.80,col:'#4a5144'});
 }
 // 28: real projecting balcony with concrete slab, fine iron rails and flowers.
 {
  const id=77,[lo,hi]=p(id).bounds,y=lo[1];
  solid(id,3.12,y-.54,3.12,1.13,2.62,2.79,'#bcb7a1');
  for(const coords of [[[1.58,y-.05],[1.58,y-1.05],[4.66,y-1.05],[4.66,y-.05]]]){
   for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);for(const z of [2.88,3.74])line(id,[...a,z],[...b,z],.032,'#313e37');for(let t=0;t<d;t+=.13){const q=mix(a,b,t/d);line(id,[...q,2.87],[...q,3.73],.019,'#313e37');}}
  }
  for(const x of [2.0,3.08,4.15])flowers(id,x,y-1.09,3.53,.82,.26,'#4a5040');flowers(id,3.2,y-1.06,2.80,.64,.24,'#555443');
  const gy=boundary(id,2.65);surface(id,[[1.1,boundary(id,1.1)],[5.31,boundary(id,5.31)],[5.31,y],[1.1,y]],'pave',.084,[.68,.66,.54]);
  rect(id,lo[0],.92,y-.04,y+1.34,'grass',.063);rect(id,-1.02,-.16,boundary(id,-.60),y+1.29,'pave',.080);
  // Start at the shared divider of 30, never across its garage approach.
  const neighbour=p(78),shared=W(78,[neighbour.bounds[1][0],boundary(78,neighbour.bounds[1][0])]),delta=sub(shared,p(id).center),start=[delta[0]*p(id).u[0]+delta[1]*p(id).u[1],delta[0]*p(id).v[0]+delta[1]*p(id).v[1]];
  const gardenFence=[start,...front(id,start[0],.78).slice(1)],gate=[[.78,boundary(id,.78)],[5.35,boundary(id,5.35)]];
  railing(id,gardenFence,{base:.38,height:1.25});railing(id,gate,{base:0,height:1.28});
  for(const [x,y]of [start,...gate])pier(id,x,y);mail(id,5.43,gate[1][1],'#40473d');
  objects.push({type:'corrected-garden-frontage',part:77,neighbour:78,sharedCorner:shared,fence:gardenFence.map(q=>W(id,q)),gate:gate.map(q=>W(id,q)),reference:'user-impasse-corrections-20260914'});
  tree(id,-4.0,y-3.35,6.8,2.18);ball(id,-5.1,y-5.5,.95,.9,.7,.83);
  lamp(id,-1.10,y+1.13,2.33);flowers(id,1.6,y-.55,.10,.39,.40);
  objects.push({type:'flowered-balcony',part:id,reference:ref('28'),width:3.12,projection:1.13,garageBelow:true});
 }
 // 26: white picket frontage, stepping stones and the shaded garden terrace.
 {
  const id=76,[lo,hi]=p(id).bounds,y=lo[1],gx=lo[0]+1.66,split=lo[0]+3.25;
  surface(id,[...front(id,lo[0],split),[split,y],[lo[0],y]],'pave',.084,[.72,.70,.61]);
  rect(id,split,hi[0],y-1.10,y+2.15,'pavers',.091,[.84,.76,.58]);
  for(let i=0;i<7;i++){const yy=boundary(id,split+1.7)+(y+1.6-boundary(id,split+1.7))*i/6,xx=split+1.20+.65*Math.sin(i/6*Math.PI);rect(id,xx-.28,xx+.28,yy-.24,yy+.24,'pave',.084);}
  railing(id,front(id,lo[0],hi[0]),{style:'pickets',base:0,height:1.05,col:'#e9e7d8'});
  const by=boundary(id,gx);mail(id,lo[0]-.1,by,'#77916c');
  flowers(id,gx,y-.18,3.37,.76,.23);flowers(id,split+.35,y+1.25,.15,.50,.45);flowers(id,hi[0]-.4,y+.8,.15,.52,.46);
  const x=hi[0]-1.6,yy=y-.6;line(id,[x,yy,.05],[x,yy,2.30],.045,'#aaa991');
  const rim=Array.from({length:8},(_,i)=>A(id,x+Math.cos(i*Math.PI/4)*1.30,yy+Math.sin(i*Math.PI/4)*1.30,2.16));
  for(let i=0;i<8;i++){poly([rim[i],rim[(i+1)%8],A(id,x,yy,2.52)],M.wall,rgb(i%2?'#71837b':'#afb5a0'));beam(rim[i],A(id,x,yy,2.50),.020,rgb('#c5c8b3'));}
  solid(id,x,yy,.83,.70,.72,.78,'#a8a68b');ball(id,x-.9,yy-.30,.90,.62,.65,.76);
  objects.push({type:'garden-parasol',part:id,reference:ref('26-24')});
 }
 // 24: brick terrace, stone piers, light railing, hanging baskets and flower tiers.
 {
  const id=80,[lo,hi]=p(id).bounds,y=lo[1];surface(id,[...front(id,lo[0],hi[0]),[hi[0],y],[lo[0],y]],'pavers',.085,[.81,.65,.48]);
  const q=front(id,-12.55,hi[0]);railing(id,q,{style:'rails',base:.28,height:.99,col:'#cbd0bc'});for(const x of [-12.55,-9.2,hi[0]]){const q=front(id,x,x)[0];pier(id,...q,1.12,true);}
  steps(id,-10.72,y-.02,1.23,.39,3);steps(id,-7.49,y-.02,1.48,.4,3);
  for(const x of [-11.92,-10.8,-9.9,-8.1,-6.9,-6.0]){line(id,[x,y-.12,3.03],[x,y-.32,2.65],.012,'#b7bca9');flowers(id,x,y-.32,2.47,.30,.28,x<-9?'#a681a7':'#d0cbb7');}
  for(const x of [-12.2,-8.85,-6.25])flowers(id,x,y-1.3,.12,.90,.35);
  const x=-8.3,yy=boundary(id,x)+1.20;
  for(const [z,r]of [[.22,.58],[.70,.43],[1.13,.29]]){solid(id,x,yy,.15,.15,z,z+.40,'#c2b49a');const rim=Array.from({length:16},(_,i)=>A(id,x+Math.cos(i*Math.PI/8)*r,yy+Math.sin(i*Math.PI/8)*r,z));poly(rim,M.wall,rgb('#d5c7ab'));for(let i=0;i<6;i++)flowers(id,x+Math.cos(i)*r*.62,yy+Math.sin(i)*r*.62,z,.16,.14);}
  objects.push({type:'tiered-planter',part:id,reference:ref('26-24')});
 }
 // 22: broad lawn, curved cream wall with individually jointed brick coping.
 {
  const id=83,[lo,hi]=p(id).bounds,y=lo[1],arc=Array.from({length:28},(_,i)=>{const a=(-38+i*2.22)*Math.PI/180;return [-64.1+Math.cos(a)*14.3,-59.5+Math.sin(a)*14.3];});
  // Place the street-side wall behind the full 6.2 m roadway and sidewalk.
  const street=survey.refinements.streetPaths.find(s=>s.points.length>20);
  const setback=q=>{let best={distance:Infinity};for(let i=1;i<street.points.length;i++){const a=street.points[i-1],b=street.points[i],d=sub(b,a),l=len(d),u=mul(d,1/l),t=Math.max(0,Math.min(l,sub(q,a).reduce((n,v,j)=>n+v*u[j],0))),foot=add(a,mul(u,t)),distance=len(sub(q,foot));if(distance<best.distance)best={distance,point:add(foot,mul([-u[1],u[0]],4.75))};}return best.point;};
  const bend=setback([-45.5,-70.3]),tip=setback([-38,-64.8]);
  const tail=Array.from({length:13},(_,i)=>{const t=i/12;return add(add(mul(arc[0],(1-t)**2),mul(bend,2*t*(1-t))),mul(tip,t*t));});
  const lawn=[...arc,W(id,[hi[0]+1.35,y]),W(id,[hi[0]+1.35,hi[1]]),...tail.slice(1).reverse()];
  ground(lawn,M.grass,[.61,.58,.35],.081);
  // Keep the pedestrian entrance gap at the steps and the garage access open.
  const entry=W(id,[-.93,boundary(id,-.93)]),near=arc.reduce((best,q,i)=>Math.hypot(...sub(q,entry))<best.d?{d:Math.hypot(...sub(q,entry)),i}:best,{d:Infinity,i:0}).i;
  const pieces=[arc.slice(0,Math.max(2,near-1)),arc.slice(Math.min(arc.length-2,near+3))];
  for(const points of pieces)wall(points,t=>.61+.39*Math.pow(Math.abs(t-.5)*2,3));
  wall(tail,.75);
  objects.push({type:'street-setback-wall',part:id,path:tail,roadHalfWidth:3.1,minimumSetback:4.75});
  for(let i=1;i<tail.length;i++){
   const a=tail[i-1],b=tail[i],u=norm(sub(b,a)),out=[u[1],-u[0]];
   ground([a,b,add(b,mul(out,1.34)),add(a,mul(out,1.34))],M.pave,[.62,.62,.56],.145);
  }
  objects.push({type:'curved-cream-wall',part:id,path:arc,reference:ref('22-wall')});
  surface(id,[[lo[0],boundary(id,lo[0])],[-2.70,boundary(id,-2.70)],[-2.70,y],[lo[0],y]],'pavers',.093,[.75,.66,.53]);
  rect(id,-1.65,-.20,boundary(id,-.93),y,'pavers',.095);steps(id,-.93,y-.12,1.47,.58,5);
  for(let j=0;j<5;j++)flowers(id,-1.98,y-.4-j*.37,.12,.24,.27,'#998466');
  lamp(id,-1.64,y-.13,2.25);mail(id,hi[0]-.1,boundary(id,hi[0]-.1),'#404d43');
 }
 // Masonry surrounds, barred lights and panelled garage clerestories are 3D.
 for(const o of survey.openings.filter(o=>ids.includes(o.part))){
  const id=o.part,q=p(id),[lo,hi]=q.bounds,span=o.span||q.surfaceBounds.front,x=span[0]+o.along*(span[1]-span[0]),y=lo[1]+(o.depth||0)-.04,z=o.bottom,w=o.width,h=o.height;
  if(o.stone){for(let j=0;j<Math.ceil(h/.26);j++)for(const sign of [-1,1])solid(id,x+sign*(w/2+.14),y-.025,j%2?.22:.32,.10,z+j*.26,z+Math.min(h,(j+1)*.26)-.01,j%2?'#bcaa8a':'#ccb999');solid(id,x,y-.025,w+.55,.10,z+h+.02,z+h+.21,'#c6b391');}
  if(o.securityBars){for(let xx=x-w*.36;xx<=x+w*.36;xx+=.12)line(id,[xx,y-.13,z+.06],[xx,y-.13,z+h-.04],.024,o.kind==='door'?'#dfddc8':'#424c41');for(const zz of [z+.16,z+h-.16])line(id,[x-w/2,y-.13,zz],[x+w/2,y-.13,zz],.025,'#495346');}
  if(o.archedGlass){for(const sign of [-1,1]){const pts=[[x+sign*.04,y-.02,z+.72],[x+sign*.37,y-.02,z+.72],[x+sign*.37,y-.02,z+1.56]];for(let i=0;i<=8;i++){const a=i*Math.PI/16;pts.push([x+sign*(.04+.33*Math.cos(a)),y-.02,z+1.56+.38*Math.sin(a)]);}poly(pts.map(q=>A(id,...q)),M.glass,[.62,.72,.70],pts.map(q=>[(q[0]-x)/w,q[2]/h]));}solid(id,x,y-.06,.065,.025,z+.10,z+2.05,'#eceade');for(const xx of [x-.24,x+.24]){solid(id,xx,y-.04,.35,.025,z+.12,z+.59,'#c9cabb');solid(id,xx,y-.06,.28,.02,z+.17,z+.54,'#e1e0d1');}}
 }
 // Continuous narrow sidewalk and a jointed curb along the photographed court.
 for(let angle=-39;angle<242;angle+=2){const arc=(a,r)=>[-64.1+Math.cos(a*Math.PI/180)*r,-59.5+Math.sin(a*Math.PI/180)*r],a=arc(angle,12.95),b=arc(angle+2,12.95),c=arc(angle+2,14.22),d=arc(angle,14.22);ground([a,b,c,d],M.pave,[.62,.62,.56],.145);poly([[...a,.022],[...b,.022],[...b,.148],[...a,.148]],M.wall,[.72,.70,.61]);beam([...a,.15],[...b,.15],.09,rgb('#b4b09c'));}
 // The mouth of the turning court joins the main street as one asphalt apron.
 // Previously the two independent road ribbons left the aerial photo exposed.
 const mouth=[[-70.40,-70.78],[-69.95,-75.60],[-68.15,-80.55],[-65.85,-83.40],[-51.70,-76.20],[-46.00,-70.60],[-52.70,-69.65],[-54.15,-67.05],[-60.30,-68.90]];
 ground(mouth,M.road,[.43,.44,.425],.025);
 objects.push({type:'roundabout-road-connector',polygon:mouth,material:'road'});
 // A narrow footway continues around the southwest corner of the junction.
 const foot=[[-70.40,-70.78],[-70.15,-74.1],[-69.70,-77.1],[-68.15,-80.55]];
 for(let i=1;i<foot.length;i++){const a=foot[i-1],b=foot[i],u=norm(sub(b,a)),out=[u[1],-u[0]],c=add(b,mul(out,1.25)),d=add(a,mul(out,1.25));ground([a,b,c,d],M.pave,[.57,.57,.535],.14);poly([[...a,.025],[...b,.025],[...b,.14],[...a,.14]],M.wall,[.68,.67,.60]);}
 // The side drive between the blue-shuttered house and the corner house.
 const drive=[[7.65,-10.96],[9.35,-10.96],[9.74,-5.70],[11.04,4.68],[11.50,8.40],[6.40,8.40],[6.40,4.45],[7.82,2.70],[7.82,-7.20]];
 surface(101,drive,'pavers',.080,[.64,.61,.52]);
 // Drop the entrance smoothly onto the existing raised public sidewalk.
 const threshold=[[7.65,-12.21],[9.35,-12.21],[9.35,-10.96],[7.65,-10.96]];
 poly(threshold.map((q,i)=>A(101,...q,i<2?.141:.080)),M.pavers,[.64,.61,.52],threshold.map(q=>q.map(v=>v/2)));
 objects.push({type:'side-drive-surface',part:101,polygon:drive.map(q=>W(101,q)),material:'pavers'});
 // Fill the verge between the corner hedge and the existing road sidewalk,
 // including the short apron to the left of the paved drive entrance.
 const main=survey.refinements.streetPaths.find(s=>s.points.length>20);
 const roadEdge=q=>{let best={d:Infinity};for(let i=1;i<main.points.length;i++){const a=main.points[i-1],b=main.points[i],u=norm(sub(b,a)),l=len(sub(b,a)),t=Math.max(0,Math.min(l,sub(q,a).reduce((s,x,j)=>s+x*u[j],0))),near=add(a,mul(u,t)),d=len(sub(q,near));if(d<best.d)best={d,point:add(near,mul([-u[1],u[0]],3.11))};}return best.point;};
 const hedgeA=W(99,[-15.35,5.45]),hedgeB=W(99,[-15.35,-9]),verge=[W(101,[6.55,-11.0]),W(101,[6.55,-7.10]),W(101,[7.35,-7.10]),hedgeA,hedgeB,roadEdge(hedgeB),roadEdge(hedgeA)];
 ground(verge,M.road,[.36,.37,.355],.072);
 objects.push({type:'corner-sidewalk-apron',polygon:verge,material:'road'});
 // Roof-mounted chimney stacks, aerials and alarm boxes, at observed houses.
 for(const id of [86,78,77,76,80,83]){const q=p(id),[lo,hi]=q.bounds,x=id===80?-6.65:lo[0]+(hi[0]-lo[0])*.67,y=(lo[1]+hi[1])/2,z=q.roofHeight([x,y]);
  const height=id===80?1.35:.72;solid(id,x,y,.40,.43,z-.12,z+height,id===80?'#555b59':'#b5aa8b');solid(id,x,y,.52,.55,z+height,z+height+.08,'#676c60');
  if(id!==77){line(id,[x,y,z+height],[x,y,z+height+1.37],.024,'#858c81');line(id,[x-.64,y,z+height+1.2],[x+.62,y,z+height+1.2],.018,'#898e83');for(let i=0;i<6;i++)line(id,[x-.52+i*.20,y-.24,z+height+1.21],[x-.52+i*.20,y+.24,z+height+1.21],.014,'#888f85');}
  objects.push({type:'roof-aerial',part:id,reference:ref('aerial')});
 }
 for(const id of [78,77,76,80,83]){const [lo,hi]=p(id).bounds,x=hi[0]-.20,y=boundary(id,x);solid(id,x,y,.40,.24,.07,.88,'#cecec0');solid(id,x,y-.13,.31,.02,.22,.78,'#deded1');}
}
