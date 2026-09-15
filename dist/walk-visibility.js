// Extract the six inward-facing clip planes from the same column-major matrix
// used by WebGL. Normalize once per frame so the edge tolerance is in metres.
export function frustumPlanes(matrix){
 const planes=[];
 for(let axis=0;axis<3;axis++)for(const sign of [1,-1]){
  const p=Array.from({length:4},(_,column)=>matrix[column*4+3]+sign*matrix[column*4+axis]);
  const length=Math.hypot(p[0],p[1],p[2]);planes.push(p.map(value=>value/length));
 }
 return planes;
}

// Reject only boxes wholly outside a plane. Roofs and objects crossing the
// screen edge stay visible; the camera can also stand inside a loaded cell.
export function inFrustum(bounds,zBounds,planes){
 for(const [a,b,c,d] of planes){
  const x=a>=0?bounds[2]:bounds[0],y=b>=0?bounds[3]:bounds[1],z=c>=0?zBounds[1]:zBounds[0];
  if(a*x+b*y+c*z+d<-.01)return false;
 }
 return true;
}
