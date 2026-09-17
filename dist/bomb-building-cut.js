// Runtime mesh cuts in local metres. Source assets stay untouched; each impact
// is replayable, including after streaming and a return to the map.
export const BOMB_CUT_MATERIAL='bomb-cut';
export const BOMB_ROAD_CUT_MATERIAL='bomb-road-cut';
export const BOMB_CUT_KIND=18;
export const BOMB_GROUND_KINDS=new Set([6,7,8,9,14,15,16]);
const EPS=1e-5;
function randomUnit(values){let hash=2166136261;for(const c of values.map(n=>Math.round(n*1000)).join(',')){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}hash^=hash>>>16;hash=Math.imul(hash,0x45d9f3b);hash^=hash>>>16;return (hash>>>0)/4294967295;}
export const buildingCutShade=bounds=>.08+.24*randomUnit(bounds);
export const bombMaterial=(id,index)=>id===BOMB_CUT_MATERIAL||id===BOMB_ROAD_CUT_MATERIAL?{kind:BOMB_CUT_KIND}:typeof id==='string'?{kind:1,texture:id}:index.materials[id];
export const bombGround=(id,index)=>id===BOMB_ROAD_CUT_MATERIAL||BOMB_GROUND_KINDS.has(bombMaterial(id,index).kind);
export const bombRoad=(id,index)=>id===BOMB_ROAD_CUT_MATERIAL||[6,7,9,14,15].includes(bombMaterial(id,index).kind);

export function bombCutPlane(bounds,impact,groundZ=0){
 const cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2;
 let x=cx-impact[0],y=cy-impact[1],d=Math.hypot(x,y);
 if(d<EPS){x=bounds[2]-impact[0];y=bounds[3]-impact[1];d=Math.hypot(x,y);}
 const rx=d>EPS?x/d:1,ry=d>EPS?y/d:0,seed=[...bounds,impact[0],impact[1],impact[3]],random=salt=>randomUnit([...seed,salt])*2-1;
 // Rotate around the local contact point, not the explosion. Keep a single
 // plane, with independent, replayable yaw (+/-30 deg), offset and lean (+/-18).
 const angle=random(1)*Math.PI/6,c=Math.cos(angle),s=Math.sin(angle),nx=rx*c-ry*s,ny=rx*s+ry*c;
 const width=Math.abs(nx)*(bounds[2]-bounds[0])+Math.abs(ny)*(bounds[3]-bounds[1]),limit=width*.4;
 let px=impact[0]+rx*impact[3],py=impact[1]+ry*impact[3];
 const offset=(px-cx)*nx+(py-cy)*ny,shift=random(2)*Math.min(width*.2,impact[3]*.1,12);
 const move=Math.max(-limit,Math.min(limit,offset+shift))-offset;px+=nx*move;py+=ny*move;
 return {nx,ny,nz:Math.tan(random(3)*Math.PI/10),x:px,y:py,z:groundZ};
}
// Float32 mesh coordinates must not accumulate slivers when an identical shot
// clips an already cut face again (especially far from the city's origin).
const distance=(v,p)=>{const d=(v[0]-p.x)*p.nx+(v[1]-p.y)*p.ny+(v[2]-(p.z??0))*(p.nz??0);return Math.abs(d)<.002?0:d;};
const interpolate=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const area=(a,b,c)=>Math.hypot((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
function triangle(out,a,b,c){if(area(a,b,c)>EPS)out.push(...a,...b,...c);}
function clipTriangle(points,plane,segments){
 const poly=[],cross=[];
 for(let i=0;i<3;i++){
  const a=points[i],b=points[(i+1)%3],da=distance(a,plane),db=distance(b,plane);
  if(da>=0)poly.push(a);
  if((da>=0)!==(db>=0)){const v=interpolate(a,b,da/(da-db));poly.push(v);cross.push(v);}
 }
 if(cross.length===2&&area(cross[0],cross[1],[cross[0][0]+plane.nx,cross[0][1]+plane.ny,cross[0][2]])>EPS)segments.push(cross);
 return poly;
}
const tangent=(v,p)=>(v[0]-p.x)*-p.ny+(v[1]-p.y)*p.nx;

// Sweep the section in its own (horizontal, height) coordinates. This handles
// concave footprints, courtyards and separate roof islands without a convex
// hull bridging the gaps. Duplicate facade/backing intersections are welded.
// City meshes have no underside: an unpaired roof section closes to its base.
export function* sectionCaps(segments,plane,baseHeight,color=[.035,.032,.029]){
 const edges=[],seen=new Set(),breaks=[];
 for(const [a,b] of segments){
  let u=tangent(a,plane),v=tangent(b,plane),z=a[2],w=b[2];
  if(u>v){[u,v]=[v,u];[z,w]=[w,z];}
  if(v-u<EPS)continue;
  const key=[u,z,v,w].map(n=>Math.round(n*1000)).join(',');if(seen.has(key))continue;seen.add(key);
  edges.push({u,v,z,w});breaks.push(u,v);
 }
 breaks.sort((a,b)=>a-b);const stops=breaks.filter((n,i)=>!i||n-breaks[i-1]>EPS),out=[];
 const height=(e,t)=>e.z+(e.w-e.z)*(t-e.u)/(e.v-e.u);
 const nz=plane.nz??0,normalLength=Math.hypot(plane.nx,plane.ny,nz);
 const point=(t,z)=>{const lean=nz*(z-(plane.z??0));return [plane.x-plane.ny*t-plane.nx*lean,plane.y+plane.nx*t-plane.ny*lean,z,-plane.nx/normalLength,-plane.ny/normalLength,-nz/normalLength,t,z,...color];};
 const base=t=>{let z=baseHeight(point(t,plane.z??0));if(nz)for(let i=0;i<3;i++)z=baseHeight(point(t,z));return z;};
 for(let i=0;i<stops.length-1;i++){
  const a=stops[i],b=stops[i+1],mid=(a+b)/2;
  const active=edges.filter(e=>e.u<mid&&e.v>mid).sort((e,f)=>height(e,mid)-height(f,mid));
  const levels=active.filter((e,j)=>!j||Math.abs(height(e,mid)-height(active[j-1],mid))>.002);
  if(levels.length%2)levels.unshift({u:a,v:b,z:base(a),w:base(b)});
  for(let j=0;j+1<levels.length;j+=2){
   const lo=levels[j],hi=levels[j+1],p=point(a,height(lo,a)),q=point(b,height(lo,b)),r=point(b,height(hi,b)),s=point(a,height(hi,a));
   if(height(hi,mid)<=height(lo,mid)+EPS)continue;
   triangle(out,p,q,r);triangle(out,p,r,s);
  }
  if(i%64===0)yield;
 }
 return out;
}
const pointSegmentDistance=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],s=x*x+y*y,t=s?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/s)):0;return Math.hypot(a[0]+x*t-p[0],a[1]+y*t-p[1]);};
function touchesCircle(v,p){
 const sign=(a,b)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),s=v.map((a,i)=>sign(a,v[(i+1)%3]));
 if(s.every(n=>n>EPS)||s.every(n=>n<-EPS))return true;
 return v.some((a,i)=>pointSegmentDistance(p,a,v[(i+1)%3])<p[3]-EPS);
}

export function* cutBombMesh(mesh,bounds,impacts,index,{groundHeight=()=>0,generic=true}={}){
 let current=mesh,changed=false;const seen=new Set();
 for(const impact of impacts){
  const key=[impact[0],impact[1],impact[3]].join(',');if(!(impact[3]>0)||seen.has(key))continue;seen.add(key);
  const near=Math.hypot(Math.max(bounds[0]-impact[0],0,impact[0]-bounds[2]),Math.max(bounds[1]-impact[1],0,impact[1]-bounds[3]));
  if(near>=impact[3]-EPS)continue;
  const full=Math.hypot(Math.max(Math.abs(bounds[0]-impact[0]),Math.abs(bounds[2]-impact[0])),Math.max(Math.abs(bounds[1]-impact[1]),Math.abs(bounds[3]-impact[1])))<=impact[3];
  const plane=bombCutPlane(bounds,impact,groundHeight([(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2])),groups=[],sections=[];let touched=full,base=Infinity,removed=false;
  for(const [id,first,count] of current.ranges){
   if(bombGround(id,index)){groups.push([id,current.vertices.subarray(first*11,(first+count)*11)]);continue;}
   if(full){if(count)removed=true;continue;}
   const out=[];
   for(let i=first*11;i<(first+count)*11;i+=33){
    const points=[0,11,22].map(k=>Array.from(current.vertices.subarray(i+k,i+k+11)));
    for(const v of points)base=Math.min(base,v[2]-groundHeight(v));
    if(!touched&&touchesCircle(points,impact))touched=true;
    const poly=clipTriangle(points,plane,sections);if(points.some(v=>distance(v,plane)<0))removed=true;
    for(let k=1;k+1<poly.length;k++)triangle(out,poly[0],poly[k],poly[k+1]);
    if((i-first*11)%4224===0)yield;
   }
   if(out.length)groups.push([id,out]);
  }
  if(!touched||!removed)continue;
  if(!full){
   const shade=buildingCutShade(bounds),caps=yield* sectionCaps(sections,plane,p=>groundHeight(p)+(generic&&Number.isFinite(base)?base:0),[shade,shade,shade]);
   if(caps.length)groups.push([BOMB_CUT_MATERIAL,caps]);
  }
  let size=0;for(const [,v] of groups)size+=v.length;
  const vertices=new Float32Array(size),ranges=[];let offset=0;
  for(const [id,v] of groups){vertices.set(v,offset);ranges.push([id,offset/11,v.length/11]);offset+=v.length;yield;}
  current={vertices,ranges};changed=true;
 }
 return changed?current:mesh;
}

export const BOMB_CUT_GLSL=`
 if(u_kind==18){
  // A uniform finish: only the building's solid shade and scene lighting.
  c=v_color*light;
 }
`;
