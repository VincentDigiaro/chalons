import {landscapeTools} from './nerval-landscape.mjs';

// The new oblique view shows the outer gable on the path side, as well as the
// rear wing. Its low-resolution photogrammetric silhouettes are observations,
// not measurements; OSM footprints and the previously observed front stay put.
export const REAR_REFERENCE='house42-rear-oblique-2026-09-13';
export const REAR_CORRECTION='house42-rear-user-correction-2026-09-13';
export const REAR_GABLE_CORRECTION='house42-gable-french-door-user-correction-2026-09-13';
export const REAR_GARDEN=[[-8.95,-10.85],[-12.65,-5.5],[-18.35,2.6],[-20.8,5.1],[-21.2,6.8],[-19.4,9.3],[-12.6,13.3],[-3.2,16.0],[6.4,16.0],[8.7,13.5],[8.7,2.9]];
export function applyHouse42RearSurvey(survey){
 const reference={id:REAR_REFERENCE,sha256:'ff4a4f67ca7e74ed2d973bda9d52ba9a20877aefe89dbb07b0634eb987b28fe7',source:'Vue oblique fournie par l’utilisateur',usage:'Pignon côté passage, aile arrière, limites plantées et jardin ; positions et dimensions estimées.'};
 const correction={id:REAR_CORRECTION,sha256:'1588b23e0f4b9154bdc5a2edb9e39e0a9f80d1df06c3d94ca273f17b0361ff88',source:'Correction explicite de l’utilisateur sur capture annotée',usage:'Supprimer la fenêtre de l’aile arrière, la porte du pignon et l’écran vert ; deux portes-fenêtres sur la façade de la terrasse.'};
 const gableCorrection={id:REAR_GABLE_CORRECTION,sha256:'746f3fdee87a736d94bd196dd1f14757e904d89c1453f2fa19c5ef210ae57407',source:'Précision ultérieure de l’utilisateur sur capture annotée',usage:'La baie du pignon côté chemin existe : rétablir une porte-fenêtre vitrée à cet emplacement, et non une porte pleine.'};
 const refs=[reference,correction,gableCorrection],refIds=refs.map(r=>r.id);
 survey.supplementaryReferences=[...(survey.supplementaryReferences||[]).filter(r=>!refIds.includes(r.id)),...refs];
 survey.openings=survey.openings.filter(o=>!refIds.includes(o.reference));
 survey.openings.push(
  {part:115,side:'left',along:.66,bottom:.10,width:.94,height:2.02,kind:'patio',frame:'white',leaves:1,glassMaterial:true,reference:gableCorrection.id,visibility:'Porte-fenêtre confirmée par l’utilisateur à l’emplacement entouré en orange sur le pignon côté chemin'},
  {part:115,side:'left',along:.49,bottom:4.03,width:.74,height:.82,frame:'wood',leaves:1,reference:reference.id,visibility:'Petite ouverture du pignon remontée au centre des deux fenêtres de l’étage, correction utilisateur du 14 septembre 2026'},
  {part:112,side:'left',span:[3.85,8.01],along:.30,bottom:.11,width:1.02,height:2.04,kind:'patio',frame:'wood',leaves:1,reference:reference.id,visibility:'Accès au jardin dans le retour de l’aile basse ; proportions estimées'},
  ...[.24,.74].map(along=>({part:115,side:'back',along,bottom:.10,width:1.28,height:2.13,kind:'patio',frame:'white',leaves:2,glassMaterial:true,handleOffset:.13,reference:correction.id,visibility:'Porte-fenêtre confirmée à l’emplacement entouré en vert par l’utilisateur'}))
 );
 for(const part of survey.parts.filter(p=>[112,115].includes(p.id))){
  const local=part.ring.map(q=>{const d=q.map((x,i)=>x-part.center[i]);return [d[0]*part.u[0]+d[1]*part.u[1],d[0]*part.v[0]+d[1]*part.v[1]];});
  const ys=local.filter(q=>Math.abs(q[1]-part.bounds[1][1])<.65).map(q=>q[0]);
  part.surfaceBounds.back=[Math.min(...ys),Math.max(...ys)];
 }
 survey.endSite.rearGarden={reference:reference.id,correction:correction.id,gableCorrection:gableCorrection.id,framePart:112,boundary:REAR_GARDEN,accuracy:'Interprétation visuelle, ouvertures corrigées par l’utilisateur ; aucune limite cadastrale revendiquée'};
 survey.endSite.removedPrivacyScreen={confirmedBy:correction.id,reason:'Écran vert inexistant signalé par l’utilisateur'};
}

export function buildHouse42Rear(ctx){
 const {parts,objects,poly,beam,box,rgb,add,sub,mul,len,norm,mix,materials:M}=ctx;
 const p=parts.get(112),tall=parts.get(115),{u,v}=p,world=p.world,at=(x,y,z)=>[...world([x,y]),z];
 const {ground,path,hedge}=landscapeTools(ctx);
 const solid=(x,y,w,d,z0,z1,color,mat=M.wall)=>box(world([x,y]),u,v,w,d,z0,z1,rgb(color),mat);
 const line=(a,b,w,color)=>beam(at(...a),at(...b),w,rgb(color));
 const lawn=(points,color=[.35,.43,.27],z=.031)=>ground(points.map(world),M.grass,color,z);
 const patch=(points,color,z=.035,mat=M.road)=>ground(points.map(world),mat,color,z);
 const ellipse=(x,y,rx,ry)=>Array.from({length:24},(_,i)=>[x+Math.cos(i*Math.PI/12)*rx,y+Math.sin(i*Math.PI/12)*ry]);
 const surround=(points,height,width,label,color)=>hedge(points.map(world),height,width,color,label);

 // A continuous parcel surface replaces the photograph underneath the rear
 // garden. The open centre is lawn; only borders and observed small beds are soil.
 lawn(REAR_GARDEN);
 surround(REAR_GARDEN.slice(1,-2),1.65,.92,'house42-rear-perimeter',[.72,.80,.65]);
 surround([REAR_GARDEN[0],REAR_GARDEN[1]],1.75,.86,'house42-path-screen-return',[.69,.78,.64]);
 surround([[8.7,2.9],[8.7,13.5],[6.4,16]],1.83,.90,'house42-neighbour-rear-divider',[.76,.81,.65]);
 // A shaded, planted ribbon lies just inside the clipped boundary. It gives
 // the bushes a planted base instead of the former floating silhouettes.
 const border=[[-11.9,-4.8],[-17.35,2.8],[-19.65,5.6],[-19.75,6.8],[-17.8,8.6],[-12.3,12.15],[-3.1,14.7],[6.1,14.7],[7.4,13.0],[7.4,8.65]];
 for(let i=0;i<border.length-1;i++)path(world(border[i]),world(border[i+1]),.95,M.road,[.30,.30,.22],.038);
 // Narrow perimeter paving along the gable and the shaded rear return.
 const paving=[[-8.92,-4.75],[-8.92,4.65],[-1.35,4.65],[-1.35,8.64],[6.9,8.64]];
 for(let i=0;i<paving.length-1;i++)path(world(paving[i]),world(paving[i+1]),.78,M.pavers,[.68,.63,.53],.049);
 const terrace=[[-8.9,4.22],[-1.6,4.22],[-1.35,8.48],[-5.4,9.32],[-8.9,7.85]];
 patch(terrace,[.61,.57,.49],.043,M.pavers);
 // Raised thresholds remain flush with the access paths, not suspended beams.
 solid(-8.70,-1.88,.86,1.08,.042,.10,'#bdb6a5');
 for(const o of ctx.survey.openings.filter(o=>o.reference===REAR_CORRECTION)){
  const span=tall.surfaceBounds.back,x=span[0]+(1-o.along)*(span[1]-span[0]);
  solid(x,tall.bounds[1][1]+.24,o.width+.16,.58,.042,.10,'#bdb6a5');
 }
 solid(-1.93,6.75,.83,1.17,.042,.10,'#beb5a2');
 // A small rectangular planted patch visible in the lawn. No invented garden
 // furniture: just edging, earth and short rows of mixed low plants.
 const bed=[[-.1,12.6],[3.3,12.6],[3.3,14.0],[-.1,14.0]];
 patch(bed,[.37,.32,.235],.052);
 for(let i=0;i<bed.length;i++){const a=bed[i],b=bed[(i+1)%bed.length];line([...a,.10],[...b,.10],.10,'#9a9077');}
 for(let x=.3;x<3.2;x+=.53)line([x,12.77,.061],[x,13.84,.061],.035,'#67684a');
 objects.push({type:'rear-planted-bed',part:112,reference:REAR_REFERENCE,boundary:bed.map(world),estimated:true});

 // Rounded foliage with the existing seamless leaf material; multiple lobes
 // and slight irregularities give volume from both map and pedestrian views.
 function foliage(x,y,z,rx,ry,rz,seed,tint=[.69,.79,.62]){
  const steps=14,bands=8,points=[];
  for(let j=0;j<=bands;j++){const phi=j/bands*Math.PI,row=[];
   for(let i=0;i<=steps;i++){const theta=i/steps*Math.PI*2,rough=1+.045*Math.sin(theta*5+seed)*Math.sin(phi*3)+.025*Math.cos(theta*7-phi*4+seed);
    row.push(at(x+Math.sin(phi)*Math.cos(theta)*rx*rough,y+Math.sin(phi)*Math.sin(theta)*ry*rough,z+Math.cos(phi)*rz*rough));
   }points.push(row);
  }
  for(let j=0;j<bands;j++)for(let i=0;i<steps;i++){
   const col=tint.map(c=>c*(.98+.035*Math.sin(i*2.1+j*3.7+seed))),scale=Math.PI*2*Math.max(rx,ry)/1.6;
   poly([points[j][i],points[j][i+1],points[j+1][i+1],points[j+1][i]],M.hedge,col,[[i/steps*scale,j/bands*rz*2/1.3],[(i+1)/steps*scale,j/bands*rz*2/1.3],[(i+1)/steps*scale,(j+1)/bands*rz*2/1.3],[i/steps*scale,(j+1)/bands*rz*2/1.3]]);
  }
 }
 function shrub(x,y,r,height,seed,tint){
  lawn(ellipse(x,y,r*.98,r*.84),[.25,.32,.19],.039);
  line([x,y,.05],[x+.045,y,height*.60],.055,'#66664c');
  foliage(x,y,height*.53,r,r*.88,height*.48,seed,tint);
 }
 // Clipped shrubs at the base of the rear walls, with gaps before both doors.
 for(const [x,y,r,h] of [[-9.55,-3.7,.68,1.10],[-9.65,.25,.72,1.16],[-9.50,2.6,.67,1.12],[-7.9,8.2,.65,.9],[-5.9,9.0,.64,.82],[-.5,9.1,.52,.78],[2.4,9.0,.7,.91],[5.8,9.3,.79,1.12]])shrub(x,y,r,h,x+y,[.74,.80,.66]);
 for(const [x,y,r,h] of [[-11.6,-3.6,.75,1.35],[-13.1,-1.7,.85,1.52],[-15.0,1.1,.72,1.42],[-16.8,4.2,.73,1.50],[-18.0,7.1,.84,1.72],[-15.7,9.6,.70,1.28],[-11.0,12.55,.67,1.37],[5.55,13.75,.74,1.5],[7.15,11.15,.84,1.65]])shrub(x,y,r,h,x*3+y,[.66,.76,.60]);
 for(let i=0;i<18;i++){const x=.2+(i%6)*.53,y=12.83+Math.floor(i/6)*.37;foliage(x,y,.17,.115,.14,.10,i,[.65,.76,.51]);}
 // Upright evergreens beside the path-side gable, recognisable in the view.
 for(const [x,y,h,r,seed] of [[-12.25,-1.05,3.6,.72,12],[-15.55,3.15,3.9,.91,15]]){
  lawn(ellipse(x,y,r*1.25,r),[.24,.32,.20],.04);line([x,y,.05],[x,y,h*.75],.14,'#696b52');
  foliage(x,y,h*.47,r,r*.86,h*.46,seed,[.64,.76,.65]);
  foliage(x+.06,y-.07,h*.79,r*.57,r*.54,h*.18,seed+7,[.68,.79,.68]);
 }
 // The broader tree occupies the rear corner, leaving the lawn centre open.
 const tree=[-14.65,10.45],height=4.85;
 lawn(ellipse(...tree,2.05,1.67),[.25,.33,.19],.042);
 line([...tree,.04],[tree[0]+.10,tree[1]+.04,3.15],.19,'#77755b');
 for(let i=0;i<5;i++){const a=i*2.4,dx=Math.cos(a)*.9,dy=Math.sin(a)*.82;
  line([tree[0]+.08,tree[1],1.9],[tree[0]+dx,tree[1]+dy,3.7],.075,'#6e7055');
  foliage(tree[0]+dx,tree[1]+dy,3.2+.3*Math.sin(i),1.17,1.05,1.40,i+20,[.70,.79,.62]);
 }foliage(tree[0],tree[1],height-.65,1.03,1.08,.84,32,[.73,.82,.66]);
 objects.push({type:'rear-garden-tree',part:112,reference:REAR_REFERENCE,center:world(tree),heightEstimated:height});

 // Rear roof details follow the existing planes, so no photo angle is baked in.
 function rooflight(part,x,y,w,d){
  const ring=(width,depth,raise)=>[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy])=>{const q=[x+sx*width/2,y+sy*depth/2];return [...world(q),part.roofHeight(q)+raise];});
  poly(ring(w+.16,d+.16,.052),M.wall,rgb('#626b68'));
  poly(ring(w,d,.08),M.wall,rgb('#829caa'));
  const r=ring(w,d,.096);for(let i=0;i<4;i++)beam(r[i],r[(i+1)%4],.045,rgb('#b0b6b1'));
  poly([r[0],r[1],mix(r[1],r[2],.24),mix(r[0],r[3],.24)],M.wall,rgb('#a0b3b9'));
  objects.push({type:'rear-rooflight',part:part.id,reference:REAR_REFERENCE,center:world([x,y]),widthEstimated:w});
 }
 rooflight(tall,-4.25,1.61,.88,.69);rooflight(p,2.5,6.80,1.12,.83);
 const local=q=>{const d=sub(q,p.center);return [d[0]*u[0]+d[1]*u[1],d[0]*v[0]+d[1]*v[1]];};
 for(const part of [p,tall]){
  const ring=part.ring.map(local),hi=part.bounds[1][1];
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];if(Math.abs(a[1]-hi)>.25||Math.abs(b[1]-hi)>.25)continue;
   line([...a,part.eaves+.035],[...b,part.eaves+.035],.10,'#59655f');
   objects.push({type:'supported-gutter',part:part.id,start:world(a),end:world(b)});
   const c=mix(a,b,.09),outside=[c[0],c[1]+.075];
   line([...c,part.eaves],[...outside,part.eaves-.20],.055,'#6f7870');
   line([...outside,part.eaves-.20],[...outside,.16],.055,'#6f7870');
   for(const z of [.48,1.55,2.52])if(z<part.eaves-.2)solid(...outside,.074,.075,z,z+.03,'#697069');
  }
 }
 // A rear ridge cap on the low annex; stop at its real footprint ends.
 const rearMid=(p.roofEnd+p.bounds[1][1])/2;
 line([-1.58,rearMid,p.eaves+p.rearRise+.045],[8.0,rearMid,p.eaves+p.rearRise+.045],.12,'#71675a');
 // Wall-mounted pale equipment visible on the outer gable, with shallow grille
 // and brackets that actually connect to the wall (no freestanding crossbar).
 const unitY=-3.5,unitX=tall.bounds[0][0]-.21;
 solid(unitX,unitY,.35,.63,1.64,2.10,'#c5c9bd');
 for(let z=1.69;z<2.06;z+=.054)line([unitX-.19,unitY-.255,z],[unitX-.19,unitY+.255,z],.012,'#747f74');
 for(const yy of [unitY-.23,unitY+.23])line([tall.bounds[0][0]+.025,yy,1.62],[unitX-.13,yy,1.62],.043,'#929d90');
 line([unitX,unitY+.38,1.81],[tall.bounds[0][0]+.02,unitY+.38,1.81],.034,'#b0b7a8');
 objects.push({type:'rear-house-details',parts:[112,115],reference:REAR_REFERENCE,correction:REAR_CORRECTION,gableCorrection:REAR_GABLE_CORRECTION,details:['outer gable high window','glazed gable French door confirmed by user','two rear French doors confirmed by user','recessed garden access','rooflights on both rear slopes','supported rear gutters','wall-mounted equipment']});
 objects.push({type:'rear-garden',part:112,reference:REAR_REFERENCE,boundary:REAR_GARDEN.map(world),estimated:true,details:['continuous clipped boundary','open textured lawn','side-door paving','rear terrace','small planted bed','upright evergreens','rounded shrubs','corner tree']});
}
