import {clipBoundaryPolygon,trimBoundaryPath,GARDEN_ROAD_LIMIT,GARDEN_HEDGE_LIMIT,GARDEN_BOUNDARY_REFERENCE} from './nerval-garden-boundary.mjs';
// Planting silhouettes and ground layouts interpreted from the supplied views.
// Coordinates are local metres; these are visual estimates, not parcel surveys.
export function landscapeTools(ctx){
 const {poly,beam,box,objects,materials:M,add,sub,mul,mix,norm,len,rgb}=ctx;
 function hedge(path,height=1.6,width=.85,tint=[.76,.81,.66],label='hedge'){
  const pts=[path[0]];for(let i=1;i<path.length;i++){const count=Math.ceil(len(sub(path[i],path[i-1]))/.55);for(let j=1;j<=count;j++)pts.push(mix(path[i-1],path[i],j/count));}
  const rings=[];let distance=0;
  for(let i=0;i<pts.length;i++){
   if(i)distance+=len(sub(pts[i],pts[i-1]));const d=norm(sub(pts[Math.min(i+1,pts.length-1)],pts[Math.max(0,i-1)])),n=[-d[1],d[0]],h=height+.045*Math.sin(i*1.73)+.02*Math.sin(i*4.3),w=width*(1+.05*Math.sin(i*2.2));
   const profile=[[-.44,.05],[-.51,.48],[-.47,.83],[-.30,.99],[.26,1],[.46,.84],[.51,.48],[.44,.05]];
   rings.push({distance,points:profile.map(([x,z])=>[...add(pts[i],mul(n,x*w)),Math.max(.035,z*h)]),n});
  }
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<7;j++){const a=rings[i],b=rings[i+1];poly([a.points[j],b.points[j],b.points[j+1],a.points[j+1]],M.hedge,tint,[[a.distance/1.35,j*.23],[b.distance/1.35,j*.23],[b.distance/1.35,(j+1)*.23],[a.distance/1.35,(j+1)*.23]]);}
  for(const i of [0,rings.length-1]){const r=rings[i];poly(r.points,M.hedge,tint,r.points.map(p=>[(p[0]*r.n[0]+p[1]*r.n[1])/1.35,p[2]/1.35]));}
  // Small leaves break up the clipped silhouette without alpha cards.
  for(let i=1;i<rings.length-1;i+=2)for(const sign of [-1,1]){
   const r=rings[i],base=add(pts[i],mul(r.n,sign*width*.47)),z=height*(.64+.26*(.5+.5*Math.sin(i*3.1))),t=[-r.n[1],r.n[0]],tip=add(base,mul(r.n,sign*.105));
   poly([[...add(base,mul(t,-.07)),z],[...tip,z+.045],[...add(base,mul(t,.07)),z+.09]],M.wall,[.25,.36,.17]);
  }
  objects?.push({type:'landscape-hedge',label,path,heightEstimated:height,widthEstimated:width});
 }
 function ground(points,material,color,z=.028){poly(points.map(p=>[...p,z]),material,color,points.map(p=>[p[0]/2,p[1]/2]));}
 function path(a,b,width,material=M.pavers,color=[.70,.64,.54],z=.055){const d=norm(sub(b,a)),n=mul([-d[1],d[0]],width/2);ground([sub(a,n),sub(b,n),add(b,n),add(a,n)],material,color,z);}
 function wall(a,b,height=.32,color='#b5afa0'){const d=norm(sub(b,a)),n=[-d[1],d[0]],l=len(sub(b,a));box(mix(a,b,.5),d,n,l,.22,0,height,rgb(color),M.wall);beam([...a,height],[...b,height],.10,rgb('#b6ab92'));}
 return {hedge,ground,path,wall};
}

export function buildGarage42HedgeFill(ctx){
 // Join the driveway divider to the neighbouring frontage, behind the cabinets.
 const p=ctx.parts.get(112);
 landscapeTools(ctx).hedge([[8.65,-10.22],[9.62,-10.22],[10.25,-11.40]].map(xy=>p.world(xy)),1.60,1.05,[.78,.84,.61],'garage-42-front-gap');
}

export function buildGardenDetails(ctx){
 const {parts,survey,objects,poly,beam,box,rgb,add,sub,mul,mix,norm,len,crown,materials:M}=ctx;
 const {hedge,ground,path,wall}=landscapeTools(ctx),W=(id,xy)=>parts.get(id).world(xy);
 const h=(id,coords,height,width,label,tint)=>hedge(coords.map(p=>W(id,p)),height,width,tint,label);
 const g=(id,coords,col=[.36,.43,.235])=>ground(coords.map(p=>W(id,p)),M.grass,col,.029);

 // The driveway is bounded by a tall hedge, immediately behind the right pier.
 h(112,[[8.72,-10.8],[8.72,2.8]],1.86,.90,'garage-42-divider',[.78,.84,.61]);
 buildGarage42HedgeFill(ctx);
 // Garden of the opposite last house extends to the pedestrian path: the empty
 // satellite strip in the previous model was part of this planted corner.
 const garden=clipBoundaryPolygon([[-4.8,-11.3],[25.7,-11.3],[22.8,-6.6],[8.1,20.4],[-4.8,10.0]],q=>GARDEN_ROAD_LIMIT-q[1]);
 g(117,garden);
 // Continue the street-facing edge of the front hedge (user's red alignment).
 const returnHedge=trimBoundaryPath([[9.8,-10.64],[24.9,-10.32],[24.8,-10.12],[23.0,-6.7],[8.0,20.4]],q=>GARDEN_HEDGE_LIMIT-q[1]);
 const sideHedge=trimBoundaryPath([[-4.70,-10.9],[-4.70,8.7],[7.3,19.8]],q=>GARDEN_HEDGE_LIMIT-q[1]);
 h(117,returnHedge,1.72,.94,'end-garden-return-hedge',[.75,.81,.63]);
 h(117,sideHedge,1.60,.76,'end-garden-side-hedge');
 h(117,[sideHedge.at(-1),returnHedge.at(-1)],1.60,.94,'end-garden-road-boundary-hedge',[.75,.81,.63]);
 objects.push({type:'garden-road-boundary',part:117,localLimit:GARDEN_ROAD_LIMIT,hedgeLocalLimit:GARDEN_HEDGE_LIMIT,polygon:garden.map(q=>W(117,q)),reference:GARDEN_BOUNDARY_REFERENCE});
 path(W(117,[-.7,-11.8]),W(117,[-.7,-4.5]),1.15,M.pavers,[.68,.61,.52]);
 // The upper garden behind the last house and the house across the path.
 // House 42's rear parcel is defined by the additional oblique reference in
 // build-nerval-house42-rear.mjs; avoid the old rectangular ground overlap.
 g(120,[[-7.1,-7.2],[7.5,-7.2],[7.5,6.5],[-7.1,6.5]]);
 // Separations between adjacent gardens, documented by the oblique views.
 h(108,[[5.70,-10.8],[5.70,-2.0]],1.55,.76,'40-38-garden-divider');
 h(105,[[7.35,-7.0],[7.35,2.8]],1.80,.92,'blue-house-side-hedge');
 h(114,[[6.70,-8.7],[6.70,-2.7]],1.35,.85,'45-side-privet');
 h(114,[[-.35,-6.8],[-.35,-2.2]],2.18,1.12,'45-tall-entry-screen',[.66,.75,.58]);
 h(109,[[8.80,-7.8],[8.80,-2.4]],1.58,.85,'paired-house-divider');
 h(100,[[10.80,-10.0],[10.80,-2.7]],1.80,.85,'paired-house-loop-divider');

 // Low privet behind the brown palisade, with the opening aligned to the door.
 h(114,[[-4.8,-8.45],[1.95,-8.45]],1.1,.68,'45-front-privet-left',[.85,.88,.68]);
 h(114,[[3.55,-8.45],[6.4,-8.45]],1.15,.80,'45-front-privet-right',[.85,.88,.68]);
 path(W(114,[2.75,-9.2]),W(114,[2.75,-4.0]),1.20,M.pavers,[.68,.59,.49]);
 // Individual paths to the doors avoid turning each frontage into one strip.
 for(const [id,x,y] of [[108,3.55,-6.6],[105,-3.1,-3.65],[111,5.2,-3.1],[100,-6.6,-5.4],[104,6.7,-5.2]]){
  const p=parts.get(id),fy=p.bounds[0][1]-Math.min(5,Math.abs(p.bounds[0][1]));
  path(W(id,[x,fy]),W(id,[x,y]),1.05,M.pavers,[.65,.58,.49]);
 }
 // Flowering shrubs spilling over the low mesh near the garage (photos 03/27).
 for(const [id,x0,x1,y] of [[108,-5.6,-3.7,-11.30],[108,.15,5.25,-11.30],[114,-4.2,1.5,-8.45]]){
  for(let x=x0;x<x1;x+=.65){const c=W(id,[x,y]);
   for(let k=0;k<5;k++){const a=k*2.4+x,z=.85+.34*Math.sin(k*1.9+x),p=[c[0]+Math.cos(a)*.33,c[1]+Math.sin(a)*.30,z];
    for(let l=0;l<3;l++){const q=add(p,[Math.sin(l*3.1)*.065,Math.cos(l*3.1)*.065,.025*l]);poly([[q[0]-.055,q[1],q[2]],[q[0],q[1]-.04,q[2]+.04],[q[0]+.055,q[1],q[2]],[q[0],q[1]+.04,q[2]-.035]],M.wall,[.81,.82,.68]);}
   }
  }
 }
 // Keep both entrance paths clear: conifer in the left lawn, burgundy tree
 // in the blue house's right-hand bed, as shown in the supplied Street View.
 for(const [id,xy,height,r,tone,seed] of [[108,[1.05,-8.2],2.7,.77,[.25,.35,.18],131],[105,[5.1,-3.8],3.5,1.12,[.33,.22,.22],141]]){
  const c=W(id,xy);beam([...c,.08],[...c,height*.75],.11,rgb('#776958'));crown([...c,height*.58],r,tone,seed);crown([...c,height-.48],r*.69,tone,seed+1);
  objects.push({type:'entrance-garden-tree',part:id,local:xy,center:c,heightEstimated:height,crownRadiusEstimated:r,reference:'user-nerval-entry-trees-20260914-1'});
 }
 // Pollarded tree visible at the white rails: pale trunk, dark bark patches,
 // forked branches and sparse tips instead of the old missing vertical detail.
 {
  const p=parts.get(109),c=p.world([5.8,-6.0]),at=(x,y,z)=>[c[0]+x,c[1]+y,z];
  beam(at(0,0,.08),at(.10,.02,3.5),.23,rgb('#b4b09a'));
  for(let z=.4;z<3.5;z+=.33)beam(at(-.09,0,z),at(.07,.02,z+.055),.065,rgb('#6d7361'));
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2,rr=.75+.25*Math.sin(i*2.7),b=at(Math.cos(a)*rr,Math.sin(a)*rr,3.9+.45*Math.sin(i*2.8));beam(at(.07,0,2.35+i*.10),b,.075,rgb('#959783'));
   for(const side of [-1,1]){const tip=add(b,[Math.cos(a+side*.7)*.45,Math.sin(a+side*.7)*.45,.65]);beam(b,tip,.035,rgb('#737d64'));beam(tip,add(tip,[.12*side,.10,.23]),.018,rgb('#596e44'));}
  }
  objects.push({type:'pollarded-tree',part:109,reference:'04'});
 }
 // Low planted beds at the turning court; maintain entrances and paved court.
 for(const [id,x0,x1,y] of [[86,-5.8,5.5,-6.1],[83,-5,5,-8.6]]){
  if(survey.roundabout?.parts.includes(id))continue;
  h(id,[[x0,y],[x1,y]],.60,.80,'loop-low-planting',[.77,.86,.68]);
 }
 // Continuation behind the loop's lawn, visible from the main street.
 h(99,[[-15.35,-9.0],[-15.35,5.0]],1.72,.85,'corner-street-hedge');
 // Marked small paving thresholds and mailbox/post bases sit on solid ground.
 for(const [id,xy] of [[108,[4.5,-11.4]],[114,[3.4,-8.9]],[109,[-2.2,-8.2]]]){
  const p=parts.get(id),c=p.world(xy);box(c,p.u,p.v,.3,.18,.85,1.13,rgb('#b9b8a2'),M.wall);box(add(c,mul(p.v,-.095)),p.u,p.v,.19,.012,1.04,1.055,rgb('#525e52'),M.wall);
 }
}
