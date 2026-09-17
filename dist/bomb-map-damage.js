import {cityDataURL} from './city-config.js';
import {readScorches} from './bomb-scorches.js';
import {nearDistance,farDistance,toLocal} from './walk-core.js';
import {SpatialIndex} from './walk-collision-index.js';
import {bombImpactBounds} from './bomb-impact.js';

export const mapBombDamage={ids:[],hashes:new Set(),bounds:new SpatialIndex(100),detailed:new Set(),fragments:[],craters:[],index:null};
let pending;
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
export function loadMapBombDamage(){
 if(pending)return pending;
 const craters=readScorches();if(!craters.length)return Promise.resolve(mapBombDamage);
 return pending=fetch(cityDataURL('walk/index.json')).then(r=>{if(!r.ok)throw Error('Chargement des destructions impossible');return r.json();}).then(index=>{
  mapBombDamage.index=index;mapBombDamage.craters=craters;
  const impacts=new SpatialIndex(200);craters.forEach((p,i)=>{if(p[3]>0)impacts.set(i,bombImpactBounds(p),p);});
  for(const [file,...bounds] of index.nodes){const hits=impacts.query(bounds).filter(p=>nearDistance(bounds,p)<p[3]-1e-5);if(file.startsWith('roads/')||!hits.length)continue;
   if(!hits.some(p=>farDistance(bounds,p)<=p[3]))mapBombDamage.fragments.push({file,bounds});
   const generic=/^\d+\/(way|relation)-(\d+)\.bin$/.exec(file);
   if(generic){const id=generic[1]+'/'+generic[2];mapBombDamage.ids.push(id);mapBombDamage.hashes.add(hash(id));mapBombDamage.bounds.set(file,bounds,bounds);}
   else mapBombDamage.detailed.add(file);
  }
  return mapBombDamage;
 });
}
// Degenerate destroyed triangles in runtime copies, retaining material offsets.
export function removeBombRoofs(buffer,index,damage=mapBombDamage){
 if(!damage.ids.length)return buffer;const v=buffer instanceof Float32Array?buffer:new Float32Array(buffer),n=2**index.zoom;
 for(const t of index.tiles)for(let i=t.first*3;i<(t.first+t.count)*3;i+=9){const u=(v[i]+v[i+3]+v[i+6])/3,w=(v[i+1]+v[i+4]+v[i+7])/3,p=toLocal([(t.x+u)/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*(t.y+w)/n)))*180/Math.PI]);if(damage.bounds.query([p[0],p[1],p[0],p[1]]).length)for(const j of [3,6])v.set(v.subarray(i,i+3),i+j);}
 return buffer;
}
export function removeBombFacades(bytes,damage=mapBombDamage){
 if(!damage.hashes.size)return bytes;const data=new DataView(bytes);for(let i=0;i<bytes.byteLength;i+=52)if(damage.hashes.has(data.getUint32(i+48,true)))data.setFloat32(i+20,data.getFloat32(i+16,true),true);return bytes;
}
export function removeBombDetails(vertices,index,prefix,damage=mapBombDamage){
 if(!damage.detailed.size)return vertices;
 const scale=index.scale||[111320*Math.cos(index.origin[1]*Math.PI/180),111320];
 for(const range of index.ranges){if([6,7,8,9,14,15,16].includes(index.materials[range.material].kind))continue;
  for(let i=range.first*11;i<(range.first+range.count)*11;i+=33){const x=(vertices[i]+vertices[i+11]+vertices[i+22])/3,y=(vertices[i+1]+vertices[i+12]+vertices[i+23])/3,p=toLocal([index.origin[0]+x/scale[0],index.origin[1]+y/scale[1]]),cell=prefix+'-'+Math.floor(p[0]/20)+'-'+Math.floor(p[1]/20);
   if(damage.detailed.has(prefix+'/'+cell+'.bin'))for(const j of [11,22])vertices.set(vertices.subarray(i,i+3),i+j);
  }
 }
 return vertices;
}
