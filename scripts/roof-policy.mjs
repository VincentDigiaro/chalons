export const ROOF_ZOOM=17,ROOF_N=2**ROOF_ZOOM;
export const roofPoint=([lon,lat])=>[(lon+180)/360*ROOF_N,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*ROOF_N];
export function roofHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function roofFamily(p,area,center,evidence,seed){
 const rgb=evidence?.rgb,[r,g,b]=rgb||[115,105,98],warm=r>b*1.18&&r>g*1.04,brightness=(r+g+b)/3;
 const industrial=['industrial','warehouse','barn','farm_auxiliary','sports_centre','stadium','retail','commercial'].includes(p.kind)||(area>900&&p.height<14);
 const civic=['church','cathedral','chapel','temple'].includes(p.kind);
 if(civic)return warm?'tile':'slate';
 if(industrial)return warm||brightness>145||seed%3===0?'metal':'flat';
 if(warm)return 'tile';
 if((['apartments','dormitory','hospital','office'].includes(p.kind)&&area>180&&p.height>=10)||(area>450&&p.height>=12))return 'flat';
 if(area<35&&brightness>150)return seed%2?'metal':'flat';
 const old=center[0]>4.350&&center[0]<4.374&&center[1]>48.950&&center[1]<48.968;
 if(old||b>r*1.06)return 'slate';
 return 'tile';
}
export function assignRoof(feature,catalog,evidence){
 const p=feature.properties,id=p.osm_id,seed=roofHash(id),polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 const points=polys.flatMap(poly=>poly[0]),bb=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
 const center=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2],origin=roofPoint(center),meters=40075016.68557849*Math.cos(center[1]*Math.PI/180)/ROOF_N;
 let area=0,longest=0,axis=[1,0];
 for(const poly of polys)for(let j=0;j<poly.length;j++){
  const ring=poly[j].map(roofPoint);let a=0;
  for(let i=0;i<ring.length-1;i++){
   const x=ring[i],y=ring[i+1],dx=y[0]-x[0],dy=y[1]-x[1],length=Math.hypot(dx,dy);
   a+=(x[0]-origin[0])*(y[1]-origin[1])-(y[0]-origin[0])*(x[1]-origin[1]);
   if(j===0&&length>longest){longest=length;const sign=dx<0?-1:1;axis=[dx/length*sign,dy/length*sign];}
  }
  area+=(j===0?1:-1)*Math.abs(a)*.5*meters*meters;
 }
 const family=roofFamily(p,area,center,evidence,seed),rgb=evidence?.rgb||[125,110,98];
 const distance=m=>{
  const a=rgb.reduce((s,x)=>s+x,0)/3||1,b=m.palette.reduce((s,x)=>s+x,0)/3||1;
  return rgb.reduce((s,x,i)=>s+(x/a-m.palette[i]/b)**2,0)*8+((a-b)/255)**2*.7;
 };
 const candidates=catalog.materials.map((m,i)=>({m,i,d:distance(m)})).filter(o=>o.m.family===family).sort((a,b)=>a.d-b.d);
 const rank=seed%17===0?(seed>>>16)%candidates.length:[0,0,1,1,2,3][(seed>>>8)%6],chosen=candidates[Math.min(rank,candidates.length-1)],material=chosen.i;
 const [width,height]=chosen.m.size;
 return {id,material,uvTransform:[...origin,...axis,meters/width,meters/height,(seed%101)/101,((seed>>>12)%103)/103],tint:245+(seed%11),areaM2:Math.round(area),observedColor:evidence?.rgb||null,photoZoom:evidence?.zoom||null,photoSamples:evidence?.samples||0};
}
export function roofUV(assignment,point){
 const [x,y,ax,ay,su,sv,ou,ov]=assignment.uvTransform,dx=point[0]-x,dy=point[1]-y;
 return [(dx*ax+dy*ay)*su+ou,(-dx*ay+dy*ax)*sv+ov];
}
