const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,s)=>a.map(n=>n*s),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),cross=(a,b)=>a[0]*b[1]-a[1]*b[0],norm=a=>mul(a,1/Math.hypot(...a));
function clipPolygon(points,fn){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],fa=fn(a),fb=fn(b);if(fa>=0)out.push(a);if((fa>=0)!==(fb>=0))out.push(add(a,mul(sub(b,a),fa/(fa-fb))));}return out;}
export function pathVergeSurfaces(path){
 const j=path[2],axis=norm(sub(path[3],path[1])),station=q=>dot(sub(q,j),axis),out=[];
 const offsets=path.map((p,i)=>{const d=norm(sub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));return [-d[1],d[0]];});
 for(let i=0;i<path.length-1;i++)for(const [a,b]of [[.93,1.9],[-1.9,-.93]]){
  const polygon=[add(path[i],mul(offsets[i],a)),add(path[i+1],mul(offsets[i+1],a)),add(path[i+1],mul(offsets[i+1],b)),add(path[i],mul(offsets[i],b))];
  if(a>0){out.push({polygon,kind:'grass'});continue;}
  // The street-facing verge inside the junction must be asphalt, including
  // the small exposed triangle outside the rounded sidewalk connection.
  for(const [kind,points]of [['road',clipPolygon(clipPolygon(polygon,q=>station(q)+7),q=>7-station(q))],['grass',clipPolygon(polygon,q=>-7-station(q))],['grass',clipPolygon(polygon,q=>station(q)-7)]])if(points.length>=3)out.push({polygon:points,kind});
 }return out;
}
export function buildPathVerges(ctx,path){
 const {poly,objects,materials:M}=ctx,patches=pathVergeSurfaces(path);
 for(const {polygon,kind}of patches)poly(polygon.map(p=>[...p,kind==='road'?.035:.023]),M[kind],kind==='road'?[.43,.44,.425]:[.32,.40,.235]);
 objects.push({type:'path-verge-correction',asphalt:patches.filter(p=>p.kind==='road').map(p=>p.polygon),reference:'user-nerval-furniture-20260914-1'});
}
export function impasseLayout(survey,path){
 const street=survey.refinements.streetPaths.find(s=>s.points.some(p=>Math.hypot(...sub(p,path[2]))<.01));
 const junction=path[2],u=norm(sub(street.points[1],junction)),v=[-u[1],u[0]],W=(t,s)=>add(junction,add(mul(u,t),mul(v,s)));
 const curves=[1,-1].map(sign=>{
  const f=norm(sub(path[sign===1?3:1],junction));let n=[-f[1],f[0]];if(dot(n,u)<0)n=mul(n,-1);
  const end=add(junction,add(mul(f,5.35),mul(n,.93))),origin=W(0,sign*3.1),t=cross(sub(end,origin),f)/cross(u,f),control=add(origin,mul(u,t)),start=W(3,sign*3.1);
  const points=Array.from({length:17},(_,i)=>{const t=i/16;return add(add(mul(start,(1-t)**2),mul(control,2*t*(1-t))),mul(end,t*t));});
  const outer=points.map((q,i)=>{const d=norm(sub(points[Math.min(i+1,16)],points[Math.max(i-1,0)]));let n=[-d[1],d[0]];if(dot(n,mul(v,sign))<0)n=mul(n,-1);return add(q,mul(n,1.25));});
  // Exact connection with the existing straight sidewalks.
  outer[0]=W(3,sign*4.35);
  return {sign,points,outer};
 });
 return {junction,u,v,curves,roadPolygon:[...curves[0].points,junction,...curves[1].points.toReversed()]};
}
export function buildImpasseJunction(ctx,path){
 const {poly,objects,survey,materials:M}=ctx,layout=impasseLayout(survey,path);
 poly(layout.roadPolygon.map(p=>[...p,.036]),M.road,[.43,.44,.425]);
 for(const {points,outer}of layout.curves)for(let i=0;i<16;i++){
  const z=j=>.14-.10*Math.max(0,(j-10)/6),a=points[i],b=points[i+1],c=outer[i+1],d=outer[i];
  poly([[...a,z(i)],[...b,z(i+1)],[...c,z(i+1)],[...d,z(i)]],M.pave,[.57,.57,.535]);
  poly([[...a,.036],[...b,.036],[...b,z(i+1)],[...a,z(i)]],M.wall,[.68,.67,.60]);
 }
 objects.push({type:'continuous-impasse-junction',...layout,sidewalkWidth:1.25,reference:'user-impasse-corrections-20260914'});
}
