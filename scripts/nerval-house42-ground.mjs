import {landscapeTools} from './nerval-landscape.mjs';

export const GROUND42_REFERENCE='user-earth-house42-ground-20260917';
export const GROUND42_REGION=[-162,-151,-86,-56];
export const GROUND42_MAX_EDGE=1.25;

// Encode the local square-paver finish in the existing paving UV channel. Other
// plots retain their original albedo, material indices and download packets.
export const pinkPaverUV=([x,y])=>[128+x+24,y+20];
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);

export function buildHouse42EntranceGround(ctx,entry){
 const {parts,poly,beam,rgb,objects,materials:M}=ctx,p=parts.get(112);
 const at=(q,z)=>[...p.world(q),z];
 const {ground}=landscapeTools(ctx),doorX=(entry.split+.055+entry.right-.05)/2;
 // One continuous curve: it joins the garage apron near the front boundary,
 // then opens towards the glazed entrance, around the low planted bed.
 const controls=[[5.00,-9.65],[.65,-9.83],[-3.30,-9.17],[doorX,entry.face-.055]],count=36;
 const center=Array.from({length:count+1},(_,i)=>{
  const t=i/count,s=1-t;return [0,1].map(k=>s*s*s*controls[0][k]+3*s*s*t*controls[1][k]+3*s*t*t*controls[2][k]+t*t*t*controls[3][k]);
 });
 const edges=[[],[]];
 for(let i=0;i<center.length;i++){
  const a=center[Math.max(0,i-1)],b=center[Math.min(count,i+1)],d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d),n=[-d[1]/l,d[0]/l];
  const width=1.24-.18*(i/count)**3;
  for(let side=0;side<2;side++)edges[side].push(center[i].map((v,k)=>v+n[k]*(side?1:-1)*width/2));
 }
 const emit=points=>poly(points.map(q=>at(q,.073)),M.pavers,[.71,.57,.51],points.map(pinkPaverUV));
 for(let i=1;i<center.length;i++)emit([edges[0][i-1],edges[0][i],edges[1][i],edges[1][i-1]]);
 // Narrow strip at the French door on the tall facade, joined to the entrance
 // landing rather than the old disconnected spur into the lawn.
 emit([[-7.58,-5.83],[-3.57,-5.83],[-3.57,entry.face-.15],[doorX+.52,entry.face-.15],[doorX+.52,-5.09],[-7.58,-5.09]]);
 // Flush pale edging follows the curve, without a raised obstacle across it.
 for(const edge of edges)for(let i=1;i<edge.length;i++)beam(at(edge[i-1],.072),at(edge[i],.072),.045,rgb('#b3a48e'));
 const inner=edges[0].slice(0,27);
 const bed=[...inner,[entry.right+.06,-6.28],[4.87,-6.28]];
 ground(bed.map(q=>p.world(q)),M.grass,[.29,.37,.20],.041);
 // A low leafy carpet under the two windows, distinct from the open lawn.
 poly(bed.map(q=>at(q,.095)),M.hedge,[.73,.83,.61],bed.map(q=>[q[0]/1.35,q[1]/1.35]));
 for(let x=-.6;x<4.5;x+=.48)for(let y=-7.95;y<-6.45;y+=.46){
  // Keep planting on the house side of the new curved walk.
  const near=center.reduce((a,b)=>Math.abs(a[0]-x)<Math.abs(b[0]-x)?a:b);
  if(y<near[1]+.86)continue;
  const q=[x+.045*Math.sin(x*9+y),y],c=p.world(q),r=.22;
  const leaves=Array.from({length:6},(_,k)=>{const a=k*Math.PI/3;return [c[0]+r*Math.cos(a),c[1]+r*Math.sin(a),.13+.025*Math.sin(k*2+x)];});
  poly(leaves,M.hedge,[.73,.83,.61],leaves.map(v=>[v[0]/.8,v[1]/.8]));
 }
 objects.push({type:'house42-paved-curve',part:112,reference:GROUND42_REFERENCE,centerline:center.map(q=>p.world(q)),localCenterline:center,widthEstimated:[1.06,1.24],finish:'small warm pink square pavers',entry:at([doorX,entry.face],.073)});
 objects.push({type:'house42-low-front-bed',part:112,reference:GROUND42_REFERENCE,boundary:bed.map(q=>p.world(q))});
}

export function buildHouse42GroundContext(ctx){
 const {parts,objects,materials:M}=ctx,{ground}=landscapeTools(ctx);
 // The aerial reference shows continuous lawns beyond the narrow front strips.
 // Existing higher paths, thresholds and drives remain above these base lawns.
 for(const [id,ring]of [
  [108,[[-7.25,-11.10],[6.8,-11.10],[6.8,13.4],[5.6,16.8],[-7.05,16.8],[-8.0,13.5]]],
  [120,[[-10.5,-8.4],[7.45,-8.4],[7.45,8.5],[-10.5,8.5]]]
 ]){
  const p=parts.get(id),boundary=ring.map(q=>p.world(q));
  ground(boundary,M.grass,[.37,.44,.255],.030);
  objects.push({type:'house42-neighbour-lawn',part:id,reference:GROUND42_REFERENCE,boundary,accuracy:'Visible garden limits estimated from the supplied oblique view'});
 }
}

// The relief is bilinear, while a large model triangle interpolates only its
// three corner heights. Refine the affected ground before both renderers drape
// it; otherwise the aerial terrain intersects the lawn in the middle of a plot.
export function refineHouse42Ground(batches,materials){
 const [xmin,ymin,xmax,ymax]=GROUND42_REGION;let input=0,output=0;
 for(const [material,data]of batches){
  if(!materials.has(material))continue;
  const result=[];
  const emit=(a,b,c)=>{
   const pairs=[[a,b,c],[b,c,a],[c,a,b]],lengths=pairs.map(([a,b])=>Math.hypot(a[0]-b[0],a[1]-b[1])),k=lengths.indexOf(Math.max(...lengths));
   if(lengths[k]<=GROUND42_MAX_EDGE){result.push(...a,...b,...c);output++;return;}
   const [p,q,r]=pairs[k],mid=lerp(p,q,.5);emit(p,mid,r);emit(mid,q,r);
  };
  for(let i=0;i<data.length;i+=33){
   const p=[0,11,22].map(o=>data.slice(i+o,i+o+11)),inside=p.every(q=>q[2]>=0&&q[2]<=.25)&&p.some(q=>q[0]>=xmin&&q[0]<=xmax&&q[1]>=ymin&&q[1]<=ymax);
   if(inside){input++;emit(...p);}else result.push(...p.flat());
  }
  batches.set(material,result);
 }
 return {inputTriangles:input,outputTriangles:output,maxEdge:GROUND42_MAX_EDGE,region:GROUND42_REGION};
}
