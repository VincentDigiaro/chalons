// Static scene geometry is indexed when it arrives, never searched city-wide
// during a physics frame. Detailed primitive indexes are built only when visited.
export const WALK_COLLISION_RADIUS=.75;
export const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
export function movementBounds(position,delta=[0,0],radius=WALK_COLLISION_RADIUS){
 const [x,y]=position,[dx,dy]=delta;
 return [Math.min(x,x+dx)-radius,Math.min(y,y+dy)-radius,Math.max(x,x+dx)+radius,Math.max(y,y+dy)+radius];
}
export class SpatialIndex {
 constructor(size=16){this.size=size;this.cells=new Map();this.entries=new Map();this.large=new Set();}
 set(key,bounds,value){
  this.delete(key);
  const s=this.size,x0=Math.floor(bounds[0]/s),y0=Math.floor(bounds[1]/s),x1=Math.floor(bounds[2]/s),y1=Math.floor(bounds[3]/s);
  const entry={bounds,value,keys:[]};this.entries.set(key,entry);
  // Avoid expanding a very large floor/roof into thousands of buckets.
  if((x1-x0+1)*(y1-y0+1)>256){this.large.add(entry);return;}
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const k=x+','+y;let cell=this.cells.get(k);if(!cell)this.cells.set(k,cell=new Set());cell.add(entry);entry.keys.push(k);
  }
 }
 delete(key){
  const entry=this.entries.get(key);if(!entry)return;
  for(const k of entry.keys){const cell=this.cells.get(k);cell.delete(entry);if(!cell.size)this.cells.delete(k);}
  this.large.delete(entry);this.entries.delete(key);
 }
 query(bounds){
  const found=new Set(),s=this.size;
  for(let y=Math.floor(bounds[1]/s);y<=Math.floor(bounds[3]/s);y++)for(let x=Math.floor(bounds[0]/s);x<=Math.floor(bounds[2]/s);x++){
   const cell=this.cells.get(x+','+y);if(cell)for(const e of cell)if(overlaps(e.bounds,bounds))found.add(e);
  }
  for(const e of this.large)if(overlaps(e.bounds,bounds))found.add(e);
  return Array.from(found,e=>e.value);
 }
 clear(){this.cells.clear();this.entries.clear();this.large.clear();}
}
const primitiveIndexes=new WeakMap();
export function nearbyCollision(scene,bounds){
 if(!scene)return {segments:[],surfaces:[]};
 let index=primitiveIndexes.get(scene);
 if(!index){
  index={segments:new SpatialIndex(2),surfaces:new SpatialIndex(2)};
  scene.segments.forEach((s,i)=>index.segments.set(i,[Math.min(s[0],s[2]),Math.min(s[1],s[3]),Math.max(s[0],s[2]),Math.max(s[1],s[3])],s));
  scene.surfaces.forEach((s,i)=>index.surfaces.set(i,s.bounds,s));
  primitiveIndexes.set(scene,index);
 }
 return {segments:index.segments.query(bounds),surfaces:index.surfaces.query(bounds)};
}
