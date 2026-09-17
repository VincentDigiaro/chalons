// Saved impacts keep the radii and depth used at detonation. Editing FPS settings
// must never resize an old scorch or bring back destroyed buildings.
// Legacy pairs were always 100 m; these migration values are intentionally fixed.
export function normalizeBombImpact(value){
 if(!Array.isArray(value)||![2,4,5,6].includes(value.length)||!value.every(Number.isFinite))return null;
 const [x,y,visual=100,damage=100]=value;
 if(!(visual>0&&damage>=0)||(value.length>=5&&value[4]<0)||(value.length===6&&value[5]<0))return null;
 return [x,y,visual,damage,...value.slice(4)];
}
// The optional sixth field separates excavation from visual effects.
export const bombImpactCraterRadius=p=>p[5]??p[2]??100;
// Old session records predate the setting and retain their original 10% depth.
export const bombImpactDepth=p=>p[4]??(p[2]??100)*.2;
export const sameBombImpact=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.01&&a[2]===b[2]&&a[3]===b[3]&&bombImpactDepth(a)===bombImpactDepth(b)&&bombImpactCraterRadius(a)===bombImpactCraterRadius(b);
export const bombImpactBounds=(p,index=3)=>[p[0]-p[index],p[1]-p[index],p[0]+p[index],p[1]+p[index]];
