// Hand-modelled details from the southern Google Earth observations.
// Image references are documentation only; no Google imagery is used as texture.
export function buildEarthRoofDetails(ctx,observations){
 const {parts,poly,beam,box,objects,materials:M,rgb}=ctx;
 for(const d of observations.canopies){
  const p=parts.get(d.part),[lo,hi]=p.bounds,q=[lo[0]+.10,lo[1]+.10],at=p.world(q),top=p.roofHeight(q)-.06;
  beam([...at,.08],[...at,top],.11,rgb('#655c4c'));
  const a=[lo[0],lo[1]],b=[hi[0],lo[1]];
  beam([...p.world(a),p.roofHeight(a)-.05],[...p.world(b),p.roofHeight(b)-.05],.14,rgb('#655c4c'));
  objects.push({type:'earth-canopy',part:d.part,reference:d.reference,post:at,top,dimensions:'estimated'});
 }
 for(const d of observations.rooflights){
  const p=parts.get(d.part),[lo,hi]=p.bounds,mid=(lo[1]+hi[1])/2;
  const q=[lo[0]+(hi[0]-lo[0])*d.along,mid-(mid-lo[1])*d.down];
  const slope=Math.hypot(1,p.rise/(mid-lo[1]));
  const corners=(w,h,raise)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
   const v=[q[0]+a*w/2,q[1]+b*h/(2*slope)];return [...p.world(v),p.roofHeight(v)+raise];
  });
  poly(corners(d.width+.15,d.height+.15,.035),M.wall,rgb('#535a58'));
  poly(corners(d.width,d.height,.060),M.glass,rgb('#8c9d9e'),[[0,0],[1,0],[1,1],[0,1]]);
  const frame=corners(d.width+.025,d.height+.025,.073);
  for(let j=0;j<4;j++)beam(frame[j],frame[(j+1)%4],.045,rgb('#777e7d'));
  objects.push({type:'earth-rooflight',part:d.part,reference:d.reference,center:p.world(q),local:q,corners:corners(d.width,d.height,.060),width:d.width,height:d.height,dimensions:'estimated'});
 }
 for(const d of observations.chimneys){
  const p=parts.get(d.part),[lo,hi]=p.bounds;
  const q=[hi[0]+d.width/2-.035,lo[1]+(hi[1]-lo[1])*d.along];
  const center=p.world(q),top=p.eaves+p.rise+d.aboveRidge;
  box(center,p.u,p.v,d.width,d.depth,.10,top,rgb(d.color),M.wall);
  box(center,p.u,p.v,d.width+.12,d.depth+.12,top,top+.09,rgb('#878c7e'),M.wall);
  for(const dx of [-.16,.16]){const c=p.world([q[0]+dx,q[1]]);box(c,p.u,p.v,.075,.075,top+.09,top+.18,rgb('#585e55'),M.wall);}
  objects.push({type:'earth-chimney',part:d.part,reference:d.reference,center,width:d.width,depth:d.depth,top:top+.18,dimensions:'estimated'});
 }
}
