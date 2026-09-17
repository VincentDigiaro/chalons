import {normalizeBombImpact,bombImpactDepth,bombImpactCraterRadius} from './bomb-impact.js';
import {SpatialIndex} from './walk-collision-index.js';
import {terrainWaterMask,terrainWaterRevision} from './terrain-water.js';

// Each impact stores its excavation radius and final added depth.
// A smooth bowl rejoins the original ground with a zero slope at its rim.
export const CRATER_SEGMENTS_ACROSS=8;
export class CraterField {
 constructor(impacts=[]){
  this.impacts=[];this.index=new SpatialIndex(200);this.totalDepth=0;this.centers=new Map();
  for(const value of impacts)this.add(value);
 }
 add(value){
   const p=normalizeBombImpact(value);if(!p)return;
   const r=bombImpactCraterRadius(p),depth=r?bombImpactDepth(p):0;this.impacts.push(p);this.totalDepth+=depth;if(!depth)return;
   const bounds=[p[0]-r,p[1]-r,p[0]+r,p[1]+r];
   const key=[p[0],p[1],r].join(','),existing=this.centers.get(key);
   if(existing){existing.depth+=depth;existing.hits++;return;}
   const crater={x:p[0],y:p[1],radius:r,depth,bounds,impact:p};
   crater.hits=1;this.centers.set(key,crater);this.index.set(key,bounds,crater);
 }
 query(bounds){return this.index.query(bounds).filter(c=>Math.hypot(Math.max(bounds[0]-c.x,0,c.x-bounds[2]),Math.max(bounds[1]-c.y,0,c.y-bounds[3]))<c.radius);}
 offset(x,y){
  let depth=0;
  for(const c of this.index.query([x,y,x,y])){const d=((x-c.x)**2+(y-c.y)**2)/c.radius**2;if(d<1)depth+=c.depth*(1-d)**2;}
  // Every recorded impact contributes once. Always evaluate against the
  // original heightmap, so loading/saving cannot accidentally dig again.
  return -(depth?depth*terrainWaterMask().weight(x,y):0);
 }
 gradient(x,y){
  let gx=0,gy=0;
  for(const c of this.index.query([x,y,x,y])){const dx=x-c.x,dy=y-c.y,r2=c.radius**2,d=(dx*dx+dy*dy)/r2;if(d<1){gx+=4*c.depth*(1-d)*dx/r2;gy+=4*c.depth*(1-d)*dy/r2;}}
  const mask=terrainWaterMask(),weight=mask.weight(x,y);if(!weight)return [0,0];if(weight===1)return [gx,gy];
  // The bank transition is part of the height function and its normals.
  return [(this.offset(x+.25,y)-this.offset(x-.25,y))/.5,(this.offset(x,y+.25)-this.offset(x,y-.25))/.5];
 }
}
let field=new CraterField(),revision=0;
export const terrainCraterField=()=>field;
export const terrainCraterRevision=()=>revision+terrainWaterRevision();
// A distant impact must not invalidate geometry that already contains a crater.
export const terrainCraterStamp=(bounds,snapshot=field)=>terrainWaterRevision()+'|'+snapshot.query(bounds).map(c=>[c.x,c.y,c.radius,c.depth].join(',')).join(';');
export function setTerrainImpacts(impacts){
 const next=new CraterField(impacts);
 if(JSON.stringify(next.impacts)===JSON.stringify(field.impacts))return;
 field=next;revision++;
}

// Refine ground triangles only around impact bowls. No vertex/impact count cap:
// callers schedule generator steps using the existing per-frame work budget.
export function* craterMesh(mesh,{field=terrainCraterField(),isGround=()=>true,toWorld=p=>p,scale=[1,1],displace=true}={}){
 if(!field.index.entries.size)return mesh;
 const groups=[];let changed=false,steps=0;
 for(const [id,first,count] of mesh.ranges){
  const input=mesh.vertices.subarray(first*11,(first+count)*11);
  if(!isGround(id)){groups.push([id,input]);continue;}
  const out=[],stack=[];
  for(let at=0;at<input.length;at+=33){
   stack.push([0,11,22].map(i=>Array.from(input.subarray(at+i,at+i+11))));
   while(stack.length){
    const tri=stack.pop(),p=tri.map(toWorld),bounds=[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))],hits=field.query(bounds);
    if(hits.length){
     const pairs=[[0,1,2],[1,2,0],[2,0,1]],lengths=pairs.map(([a,b])=>Math.hypot(p[a][0]-p[b][0],p[a][1]-p[b][1])),edge=lengths.indexOf(Math.max(...lengths)),target=Math.min(...hits.map(c=>2*c.radius/CRATER_SEGMENTS_ACROSS));
     if(lengths[edge]>target){const [a,b,c]=pairs[edge],mid=tri[a].map((v,i)=>(v+tri[b][i])/2);stack.push([mid,tri[b],tri[c]],[tri[a],mid,tri[c]]);changed=true;}
     else{for(let i=0;i<3;i++){const v=tri[i],h=field.offset(...p[i]);if(displace&&h){v[2]+=h;const [gx,gy]=field.gradient(...p[i]),nx=v[3]-gx*scale[0]*v[5],ny=v[4]-gy*scale[1]*v[5],nz=v[5],n=Math.hypot(nx,ny,nz)||1;v[3]=nx/n;v[4]=ny/n;v[5]=nz/n;changed=true;}out.push(...v);}}
    }else for(const v of tri)out.push(...v);
    if(++steps%128===0)yield;
   }
  }
  groups.push([id,out]);
 }
 if(!changed)return mesh;
 let size=0;for(const [,v] of groups)size+=v.length;
 const vertices=new Float32Array(size),ranges=[];let at=0;
 for(const [id,v] of groups){vertices.set(v,at);ranges.push([id,at/11,v.length/11]);at+=v.length;yield;}
 return {vertices,ranges};
}
export const finishGeometry=iterator=>{let step;do{step=iterator.next();}while(!step.done);return step.value;};
