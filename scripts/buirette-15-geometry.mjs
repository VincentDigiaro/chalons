import earcut from 'earcut';
import {add,sub,mul,dot,len,norm,mix,rgb,clip} from './attila-geometry.mjs';

// The photographed number 15 is immediately north/left of the existing 17.
// Keep its stepped OSM outline; only visible elevations have observed detail.
export function buildBuirette15({mesh,source,origin,scale}) {
 const {poly,beam,box,crown}=mesh,osmId='way/156701424';
 const feature=source.features.find(f=>f.properties.osm_id===osmId);
 if(!feature)throw Error('Missing footprint '+osmId);
 const local=p=>p.map((n,i)=>(n-origin[i])*scale[i]);
 const geo=p=>p.map((n,i)=>origin[i]+n/scale[i]);
 const front=[[4.375968,48.961364],[4.375998,48.961331]];
 const A=local(front[0]),u=norm(sub(local(front[1]),A)),v=[-u[1],u[0]];
 const W=(x,y,z)=>[...add(A,add(mul(u,x),mul(v,y))),z];
 const Q=p=>[dot(sub(p,A),u),dot(sub(p,A),v)];
 const xy=feature.geometry.coordinates[0].slice(0,-1).map(local).map(Q);
 const mainW=len(sub(local(front[1]),A)),width=Math.max(...xy.map(p=>p[0]));
 const depth=Math.max(...xy.map(p=>p[1])),wingY=xy[2][1];
 const eaves=7.25,ridge=9.40,wingEaves=6.08;
 const refs=['15-2024','15-oblique-2024'],openings=[],details=[],roofAreas=[];
 const stone=rgb('#c1bca6'),mortar=rgb('#aaa690'),cream=rgb('#d7cfb6');
 const brick=rgb('#b97050'),white=rgb('#e0e1d7'),metal=rgb('#454d47'),green=rgb('#31594c');
 const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
 const top=(x,y,wing=x>mainW+.001)=>wing
  ?wingEaves+.82*Math.max(0,1-Math.abs(y-(wingY+depth)/2)*2/(depth-wingY))
  :eaves+(ridge-eaves)*Math.max(0,1-Math.abs(x-mainW/2)*2/mainW);
 const face=(a,b,z,zz,y,col,mat=0)=>poly([W(a,y,z),W(b,y,z),W(b,y,zz),W(a,y,zz)],mat,col,[[0,0],[1,0],[1,1],[0,1]]);
 const bar=(a,z,b,zz,y,t,col=metal)=>beam(W(a,y,z),W(b,y,zz),t,col,8);
 const rect=(x,z,w,h)=>[[x-w/2,z],[x+w/2,z],[x+w/2,z+h],[x-w/2,z+h]];
 const windows=[
  {x:mainW*.50,z:1.12,w:1.52,h:2.12,kind:'window',y:0,iron:true,roller:.10,arch:true},
  {x:mainW*.50,z:4.30,w:1.25,h:1.95,kind:'window',y:0,iron:true},
  {x:mainW*.50,z:7.66,w:.50,h:1.06,kind:'window',y:0},
  {x:mainW+.69,z:3.98,w:.69,h:.98,kind:'window',y:wingY,octagonal:true},
  {x:mainW+.72,z:.35,w:.91,h:2.27,kind:'door',y:wingY}
 ];
 for(const s of windows){const a=s.x-s.w/2,b=s.x+s.w/2,z=s.z,zz=z+s.h,c=.16;
  s.hole=s.octagonal?[[a+c,z],[b-c,z],[b,z+c],[b,zz-c],[b-c,zz],[a+c,zz],[a,zz-c],[a,z+c]]:rect(s.x,z,s.w,s.h);
 }
 // Earcut subtracts the complete aperture contours, including the octagonal bay.
 function wall(points,holes,y,col=mortar){
  const coords=[...points,...holes.flatMap(h=>h.hole)],starts=[];let n=points.length;
  for(const h of holes){starts.push(n);n+=h.hole.length;}
  const indices=earcut(coords.flat(),starts,2);
  for(let i=0;i<indices.length;i+=3)poly(indices.slice(i,i+3).map(j=>W(coords[j][0],y,coords[j][1])),0,col,undefined,true);
 }
 mesh.setPart(15);
 wall([[0,0],[mainW,0],[mainW,eaves],[mainW/2,ridge],[0,eaves]],windows.filter(s=>s.y===0),0);
 wall([[mainW,0],[width,0],[width,wingEaves],[mainW,wingEaves]],windows.filter(s=>s.y!==0),wingY);
 // Roof triangles are clipped to the OSM polygon, with the front gable's ridge
 // perpendicular to the street and a lower roof over the recessed entrance.
 const ids=earcut(xy.flat());let projected=0;
 for(let i=0;i<ids.length;i+=3)for(const wing of [false,true]){
  const cell=clip(ids.slice(i,i+3).map(j=>xy[j]),p=>wing?p[0]-mainW:mainW-p[0]);
  for(const sign of [-1,1]){
   const half=clip(cell,p=>sign*(wing?p[1]-(wingY+depth)/2:p[0]-mainW/2));
   projected+=area(half);poly(half.map(p=>W(...p,top(...p,wing))),1,rgb('#d1b59a'),half.map(p=>[p[0]/1.15,p[1]/1.15]),true);
  }
 }
 roofAreas.push({id:15,footprint:area(xy),roofProjected:projected});
 // Rear and side walls follow the same outline, with no invented openings.
 for(let j=0;j<xy.length;j++){
  if([0,2,3].includes(j))continue;
  const a=xy[j],b=xy[(j+1)%xy.length],cuts=[0,1];
  for(const x of [mainW/2,mainW]){const t=(x-a[0])/(b[0]-a[0]);if(t>0&&t<1)cuts.push(t);}
  const t=((wingY+depth)/2-a[1])/(b[1]-a[1]);if(t>0&&t<1)cuts.push(t);cuts.sort((a,b)=>a-b);
  for(let k=1;k<cuts.length;k++){const p=mix(a,b,cuts[k-1]),q=mix(a,b,cuts[k]),wing=(p[0]+q[0])/2>mainW;
   poly([W(...p,0),W(...q,0),W(...q,top(...q,wing)),W(...p,top(...p,wing))],0,stone,undefined,true);
  }
 }
 poly([W(mainW,wingY,wingEaves),W(mainW,depth,wingEaves),W(mainW,depth,eaves),W(mainW,wingY,eaves)],0,stone,undefined,true);
 // Mortar courses and individual irregular stones have a shallow bevel. Split
 // every stone around aperture bounds instead of covering glazing with texture.
 function subtractHole(p,h){let rest=p,out=[];const a=h.x-h.w/2-.025,b=h.x+h.w/2+.025,z=h.z-.025,zz=h.z+h.h+.025;
  for(const fn of [q=>a-q[0],q=>q[0]-b,q=>z-q[1],q=>q[1]-zz]){out.push(clip(rest,fn));rest=clip(rest,q=>-fn(q));}
  return out.filter(q=>q.length>=3&&area(q)>.0001);
 }
 function masonry(x0,x1,y,zMax,holes){
  let row=0;
  for(let z=.20;z<zMax;z+=.31,row++)for(let x=x0-.33-(row%2)*.18,col=0;x<x1;x+=.43,col++){
   const seed=Math.sin(row*37+col*71),w=.405+.008*seed,h=.286+.006*Math.cos(row*19+col*13);
   const j=.035*seed,k=.024*Math.cos(row*39+col*23);let p=[[x+.028+j*.35,z+.009],[x+w-.045+k,z],[x+w,z+.08+j],[x+w-.025,z+h-.018],[x+.042-k,z+h],[x,z+h*.55+j]];
   p=clip(clip(clip(p,q=>q[0]-x0),q=>x1-q[0]),q=>zMax-q[1]);
   let pieces=[p];for(const hole of holes)pieces=pieces.flatMap(p=>subtractHole(p,hole));
   for(const piece of pieces){if(piece.length<3)continue;const c=piece.reduce((s,p)=>add(s,p),[0,0]).map(n=>n/piece.length),inner=piece.map(p=>mix(p,c,.12)),shade=mul(stone,.91+.15*(.5+.5*seed));
    poly(inner.map(([x,z])=>W(x,y-.037,z)),0,shade);
    for(let k=0;k<piece.length;k++){const l=(k+1)%piece.length;poly([W(piece[k][0],y-.012,piece[k][1]),W(piece[l][0],y-.012,piece[l][1]),W(inner[l][0],y-.037,inner[l][1]),W(inner[k][0],y-.037,inner[k][1])],0,mul(shade,.91));}
   }
  }
 }
 masonry(0,mainW,0,6.25,windows.filter(s=>s.y===0));
 masonry(mainW,width,wingY,wingEaves-.08,windows.filter(s=>s.y!==0));
 // The pale gable, red brick frieze, dentils and turquoise ceramic insets.
 wall([[0,7.01],[mainW,7.01],[mainW,eaves],[mainW/2,ridge],[0,eaves]],[windows[2]],-.048,cream);
 for(let z=6.27,row=0;z<7.02;z+=.091,row++)for(let x=0;x<mainW;x+=.233){
  if(z>6.50&&z<6.73)continue;face(x,Math.min(x+.222,mainW),z,z+.078,-.067,brick);
 }
 face(0,mainW,6.54,6.67,-.059,cream);
 for(let x=.04;x<mainW-.05;x+=.105)face(x,x+.059,6.52,6.66,-.071,rgb('#a89f7e'));
 for(let i=0;i<9;i++){const x=.21+i*(mainW-.42)/8,z=7.22;
  face(x-.092,x+.092,z-.077,z+.077,-.061,rgb('#82b5aa'),8);
  face(x-.044,x+.044,z-.040,z+.040,-.074,rgb('#356185'),8);
  face(x-.086,x-.052,z+.03,z+.068,-.075,rgb('#c1d7b8'),8);
 }
 details.push({type:'brick-and-ceramic-frieze',part:15,insets:9,refs});
 // Windows, stone reveals, frames and ironwork are independent geometry.
 for(const s of windows){const dep=.22,y=s.y,hole=s.hole,x0=s.x-s.w/2,x1=s.x+s.w/2,z=s.z,zz=z+s.h;
  for(let k=0;k<hole.length;k++){const a=hole[k],b=hole[(k+1)%hole.length];
   if(s.kind==='door'&&a[1]===z&&b[1]===z)continue;
   poly([W(a[0],y-.04,a[1]),W(b[0],y-.04,b[1]),W(b[0],y+dep,b[1]),W(a[0],y+dep,a[1])],0,cream);
   bar(a[0],a[1],b[0],b[1],y+dep-.018,.048,s.kind==='door'?rgb('#795030'):white);
  }
  if(s.kind==='door'){
   face(x0,x1,z,zz,y+dep,rgb('#805134'),8);
   for(const dz of [.22,.82,1.45]){face(x0+.12,x1-.12,z+dz,z+dz+.39,y+dep-.023,rgb('#946741'),8);}
   bar(x1-.13,z+.98,x1-.13,z+1.23,y+dep-.08,.025,rgb('#ac9a60'));
   box(W(s.x,y+.04,0).slice(0,2),u,v,s.w+.16,.53,.19,z,cream);
   // Glass canopy with slender supports above the recessed timber door.
   const az=zz+.28;poly([W(s.x-.67,y-.04,az+.17),W(s.x+.67,y-.04,az+.17),W(s.x+.69,y-.72,az),W(s.x-.69,y-.72,az)],3,rgb('#bdc5b5'));
   for(const x of [s.x-.67,s.x+.67]){beam(W(x,y-.04,az+.17),W(x,y-.72,az),.035,white,8);beam(W(x,y-.04,az-.26),W(x,y-.72,az),.025,white,8);}
   bar(s.x-.69,az,s.x+.69,az,y-.72,.037,white);
  }else{
   poly(hole.map(([x,z])=>W(x,y+dep,z)),3,rgb('#9bada8'),hole.map(([x,z])=>[(x-x0)/s.w,(z-s.z)/s.h]));
   if(s.octagonal){bar(x0,z+.34,x1,z+.34,y+dep-.03,.045,white);bar(x0,z+.69,x1,z+.69,y+dep-.03,.045,white);}
   else if(s.w>1){bar(s.x,z,s.x,zz,y+dep-.03,.055,white);bar(x0,z+.40,x1,z+.40,y+dep-.03,.035,white);}
   bar(x0-.10,z-.07,x1+.10,z-.07,y-.12,.13,cream);
   if(s.roller){face(x0,x1,zz-s.h*s.roller,zz,y+.09,white,8);}
   if(s.iron){const a=x0-.07,b=x1+.07,rz=z+.06;
    bar(a,rz,b,rz,y-.32,.030);bar(a,rz+.46,b,rz+.46,y-.32,.038);
    for(let x=a;x<=b;x+=.16)bar(x,rz,x,rz+.45,y-.32,.017);
    for(const x of [a,b])beam(W(x,y-.02,rz+.45),W(x,y-.32,rz+.45),.027,metal,8);
    for(const dx of [-.16,.16])for(let i=0;i<16;i++){const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2;bar(s.x+dx+.085*Math.cos(a),rz+.20+.085*Math.sin(a),s.x+dx+.085*Math.cos(b),rz+.20+.085*Math.sin(b),y-.343,.013);}
   }
   if(s.arch){for(let i=0;i<18;i++){const x=x0-.10+i*(s.w+.20)/18,b=x+(s.w+.20)/18-.006,arch=x=>zz+.15+.17*(1-((x-s.x)/(s.w/2+.1))**2);poly([W(x,y-.082,arch(x)),W(b,y-.082,arch(b)),W(b,y-.082,arch(b)+.22),W(x,y-.082,arch(x)+.22)],0,brick);}
    for(const x of [x0-.12,x1+.12])bar(x,zz-.06,x,zz+.23,y-.075,.20,cream);
   }
  }
  openings.push({part:15,kind:s.kind,side:s.y===0?'street':'recess',center:W(s.x,y,z+s.h/2),width:s.w,height:s.h,depth:dep,observed:true,refs,dimensions:'Estimated from July 2024 photographs',shape:s.octagonal?'octagon':'rectangle'});
 }
 // Roof edging and exposed rafter ends follow the front gable silhouette.
 for(const sign of [-1,1]){const x=sign<0?-.14:mainW+.14,edge=sign<0?0:mainW;poly([W(edge,0,eaves),W(x,-.19,eaves-.04),W(mainW/2,-.19,ridge+.08),W(mainW/2,0,ridge)],1,rgb('#c1a488'));beam(W(x,-.19,eaves-.04),W(mainW/2,-.19,ridge+.08),.13,rgb('#b39377'),1);
  for(let t=.16;t<.92;t+=.20){const xx=x+(mainW/2-x)*t,z=top(Math.max(0,Math.min(mainW,xx)),0);beam(W(xx,-.04,z-.28),W(xx,-.30,z-.10),.095,rgb('#82745a'),8);}
 }
 bar(mainW,wingEaves,width,wingEaves,wingY-.13,.095,rgb('#777e73'));
 for(const [x,y,eh]of [[.03,.01,eaves],[width-.05,wingY,wingEaves]]){
  bar(x,.20,x,eh,y-.09,.062,rgb('#838b80'));for(let z=.5;z<eh;z+=1.3)bar(x-.05,z,x+.05,z,y-.125,.018,white);
 }
 box(W(mainW+1.1,depth*.62,0).slice(0,2),u,v,.32,.38,6.68,7.17,brick);box(W(mainW+1.1,depth*.62,0).slice(0,2),u,v,.39,.45,7.17,7.23,cream);
 // Number 15 on the stone beside the door, modelled as strokes above a plaque.
 const px=mainW-.22,pz=2.68;face(px-.10,px+.10,pz-.07,pz+.07,-.071,rgb('#808f88'),8);
 for(const [a,z,b,zz]of [[-.066,.04,-.040,.05],[-.04,.05,-.04,-.045],[.016,.05,.072,.05],[.016,.05,.016,.005],[.016,.005,.072,.005],[.072,.005,.072,-.045],[.016,-.045,.072,-.045]])bar(px+a,pz+z,px+b,pz+zz,-.089,.009,white);
 details.push({type:'enamel-number',part:15,text:'15',refs});
 // Private front garden, low wall, welded green fence and closed pedestrian gate.
 // Its street edge continues the existing 17 frontage, without entering the road.
 mesh.setPart('15-garden');
 const adjacent=Q(local([4.376,48.961283])),fy=adjacent[1],gardenW=adjacent[0],g0=4.54,g1=5.46,gx=(g0+g1)/2;
 poly([W(0,fy+.12,.13),W(gardenW,fy+.12,.13),W(gardenW,wingY,.13),W(width,wingY,.13),W(mainW,wingY,.13),W(mainW,0,.13),W(0,0,.13)],4,rgb('#7d8561'));
 poly([W(g0,fy-.08,.175),W(g1,fy-.08,.175),W(g1,wingY-.18,.175),W(g0,wingY-.18,.175)],0,rgb('#b6b2a0'));
 function fence(a,b){
  const wa=W(a[0],a[1],0).slice(0,2),wb=W(b[0],b[1],0).slice(0,2),d=norm(sub(wb,wa)),n=[-d[1],d[0]],length=len(sub(wb,wa));
  box(mix(wa,wb,.5),d,n,length,.20,.035,.47,cream);box(mix(wa,wb,.5),d,n,length+.025,.26,.47,.53,rgb('#999b88'));
  for(let x=0;x<=length;x+=.105){const p=mix(wa,wb,x/length);beam([...p,.52],[...p,1.65],.012,green,8);}
  for(let z=.60;z<1.68;z+=.16)beam([...wa,z],[...wb,z],.013,green,8);
  const nPosts=Math.ceil(length/2);for(let i=0;i<=nPosts;i++){const p=mix(wa,wb,i/nPosts);beam([...p,.47],[...p,1.76],.055,green,8);}
  details.push({type:'garden-fence',part:15,a:wa,b:wb,height:1.76,refs});
 }
 fence([0,fy],[g0-.10,fy]);fence([g1+.10,fy],[gardenW,fy]);fence([0,fy],[0,0]);fence([gardenW,fy],[gardenW,wingY]);
 for(const x of [g0-.08,g1+.08]){box(W(x,fy,0).slice(0,2),u,v,.20,.29,.04,1.94,cream);box(W(x,fy,0).slice(0,2),u,v,.27,.34,1.94,1.99,rgb('#a5a18d'));}
 box(W(gx,fy+.045,0).slice(0,2),u,v,g1-g0-.15,.062,.16,1.72,green,8);
 for(let x=g0+.04;x<g1-.03;x+=.14)bar(x,.19,x,1.70,fy,.014,rgb('#25443b'));
 for(const z of [.24,1.60])bar(g0+.02,z,g1-.02,z,fy-.017,.045,green);
 bar(g0+.12,.89,g0+.24,.89,fy-.06,.024,metal);
 details.push({type:'garden-gate',part:15,a:W(g0,fy,0).slice(0,2),b:W(g1,fy,0).slice(0,2),height:1.72,refs});
 box(W(.55,fy-.17,0).slice(0,2),u,v,.35,.18,1.00,1.43,rgb('#d3c6a0'),8);bar(.41,1.32,.69,1.32,fy-.267,.018,metal);
 mesh.setPart('15-planting');
 for(const [x,y,z,r]of [[7.8,-.40,1.73,.98],[7.4,.45,2.65,1.06],[6.02,-.20,2.03,1.05],[6.08,.55,2.65,1.05],[5.87,-.65,2.82,.86],[3.81,-1.80,.82,.66],[4.05,-1.70,1.29,.58],[.83,-.47,.66,.48]])crown(W(x,y,z),r,rgb(x>5?'#456449':'#73735e'),x*13+y);
 for(let i=0;i<35;i++){const x=.25+(i%12)*.30,y=fy+.35+Math.floor(i/12)*.35,h=.32+.24*(.5+.5*Math.sin(i*17));beam(W(x,y,.13),W(x+.04,y+.02,h+.13),.018,rgb('#5b7443'),2);}
 for(let i=0;i<12;i++){const x=1.03+.19*Math.sin(i*9),z=.65+i*.13;beam(W(x,-.31,z-.16),W(x+.03,-.32,z),.017,green,2);crown(W(x+.04,-.34,z),.055,rgb(i%3?'#bd6f80':'#dbccbd'),i);}
 details.push({type:'front-garden',part:15,frontY:fy,refs});
 const part={id:15,osmId,address:'15',label:'15 · maison en pierre à pignon et jardin',front,footprint:feature.geometry.coordinates[0],center:geo(W(width/2,depth/2,0).slice(0,2)),eaves,rise:ridge-eaves,refs,dimensions:{width,depth,eaves,ridge},frame:{A,u,v,lo:[dot(A,u),dot(A,v)],hi:[dot(A,u)+width,dot(A,v)+depth],frontY:dot(A,v)},confidence:'Numéro 15 visible ; position à gauche du 17 et façade de juillet 2024. Hauteurs estimées, faces cachées simplifiées.'};
 mesh.setPart(null);return {parts:[part],openings,details,roofAreas};
}
