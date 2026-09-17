// Model coordinates: nose on -Z, fins on +Z. Align the nose with velocity.
export const BOMB_PROFILE=[[-2.8,0],[-2.6,.8],[-2.05,1.4],[-1.2,1.75],[0,1.83],[1.1,1.68],[2.05,1.18],[2.5,.7]];
export function bombRotation(velocity=[0,0,0],heading=0){
 const speed=Math.hypot(...velocity),horizontal=Math.hypot(velocity[0],velocity[1]);
 const yaw=horizontal>1e-8?Math.atan2(velocity[0],velocity[1]):heading;
 const x=[Math.cos(yaw),-Math.sin(yaw),0],z=speed>1e-8?velocity.map(v=>-v/speed):[0,0,1];
 const y=[-z[2]*x[1],z[2]*x[0],z[0]*x[1]-z[1]*x[0]];
 return [...x,...y,...z];
}
// The lowest point changes as the casing tilts, including its four tail fins.
export function bombBottomOffset(rotation,scale=1){
 const [x,y,z]=[rotation[2],rotation[5],rotation[8]],radial=Math.hypot(x,y);
 let bottom=Math.min(...BOMB_PROFILE.map(([height,radius])=>height*z-radius*radial));
 for(const height of [1.7,2.5,4.2])bottom=Math.min(bottom,height*z-2.4*Math.max(Math.abs(x),Math.abs(y)));
 return bottom*scale;
}
