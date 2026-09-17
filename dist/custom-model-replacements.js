import {cityDataURL} from './city-config.js';

// Mask generic GPU geometry at load time. Original city files and their hashes
// stay intact; an older city without replacementGeometries remains unchanged.
let pending;
export function loadCustomReplacements(){
 return pending??=fetch(cityDataURL('custom-models.json')).then(r=>{if(!r.ok)throw Error('Registre des modèles : HTTP '+r.status);return r.json();}).then(compileReplacements).catch(e=>{pending=null;throw e;});
}
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;};
const inRing=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
export function compileReplacements(registry){
 const models=registry.models.filter(m=>m.replacementGeometries?.length),hashes=new Set(models.flatMap(m=>m.excludeIds).map(hash));
 const polygons=models.flatMap(m=>m.replacementGeometries.flatMap(g=>g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]));
 return {hashes,polygons};
}
export function maskCustomFacades(buffer,replacements){
 if(!replacements.hashes.size)return buffer;
 const d=new DataView(buffer);
 for(let at=0;at<buffer.byteLength;at+=52)if(replacements.hashes.has(d.getUint32(at+48,true))){
  // Equal endpoints and heights produce zero-area triangles without changing
  // instancing counts, terrain arrays or the catalogue's material references.
  d.setFloat32(at+8,d.getFloat32(at,true),true);d.setFloat32(at+12,d.getFloat32(at+4,true),true);
  d.setFloat32(at+20,d.getFloat32(at+16,true),true);
 }
 return buffer;
}
export function maskCustomRoofs(buffer,index,replacements){
 if(!replacements.polygons.length)return buffer;
 const n=2**index.zoom,xy=([lng,lat])=>[(lng+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];
 const polygons=replacements.polygons.map(rings=>{const r=rings.map(r=>r.map(xy)),p=r[0];return {rings:r,b:[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))]};});
 const a=new Float32Array(buffer);
 for(const t of index.tiles){const candidates=polygons.filter(p=>p.b[0]<=t.x+1&&p.b[2]>=t.x&&p.b[1]<=t.y+1&&p.b[3]>=t.y);if(!candidates.length)continue;
  for(let i=t.first*3;i<(t.first+t.count)*3;i+=9){const p=[t.x+(a[i]+a[i+3]+a[i+6])/3,t.y+(a[i+1]+a[i+4]+a[i+7])/3];
   if(candidates.some(q=>p[0]>=q.b[0]&&p[0]<=q.b[2]&&p[1]>=q.b[1]&&p[1]<=q.b[3]&&inRing(p,q.rings[0])&&!q.rings.slice(1).some(r=>inRing(p,r)))){a.copyWithin(i+3,i,i+3);a.copyWithin(i+6,i,i+3);}
  }
 }
 return buffer;
}
