import {PLAYER_HEIGHT,PLAYER_RADIUS,stepPlayer,blocked,segmentDistance} from './walk-core.js';
import {FPS_CONFIG} from './walk-config.js';

export const GROUND_HEIGHT=.022,STEP_HEIGHT=.22;
export const JUMP_SPEED=FPS_CONFIG.puissanceSautMps,GRAVITY=FPS_CONFIG.graviteMps2;
// Collision data is derived from the same displaced mesh sent to the renderer.
export function collisionGeometry(vertices){
 const segments=[],surfaces=[];
 for(let at=0;at<vertices.length;at+=33){
  const p=[0,11,22].map(i=>Array.from(vertices.subarray(at+i,at+i+3))),nz=Math.abs(vertices[at+5]);
  if(nz<.7){
   const pairs=[[0,1],[1,2],[2,0]].sort(([a,b],[c,d])=>Math.hypot(p[d][0]-p[c][0],p[d][1]-p[c][1])-Math.hypot(p[b][0]-p[a][0],p[b][1]-p[a][1]));
   const [a,b]=pairs[0],min=Math.min(...p.map(v=>v[2])),max=Math.max(...p.map(v=>v[2]));
   if(max-min>.015&&Math.hypot(p[b][0]-p[a][0],p[b][1]-p[a][1])>.005){
    const segment=[...p[a].slice(0,2),...p[b].slice(0,2),min,max];
    // A leaning face occupies a different horizontal position at each height.
    // Keep its existing triangle instead of making a vertical invisible wall.
    if(nz>1e-5){segment.triangle=p;segment.bounds=[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];}
    segments.push(segment);
   }
  }
  if(nz>.5){
   const [a,b,c]=p,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
   if(Math.abs(det)>1e-8)surfaces.push({p,det,bounds:[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))]});
  }
 }
 return {segments,surfaces};
}
export function surfaceHeights(position,surfaces){
 const heights=[],r=PLAYER_RADIUS*.65,samples=[[0,0],[r,0],[-r,0],[0,r],[0,-r]];
 for(const s of surfaces){
  if(position[0]+r<s.bounds[0]||position[0]-r>s.bounds[2]||position[1]+r<s.bounds[1]||position[1]-r>s.bounds[3])continue;
  const [a,b,c]=s.p;
  for(const [dx,dy] of samples){const x=position[0]+dx,y=position[1]+dy,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/s.det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/s.det;if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)heights.push(u*a[2]+v*b[2]+(1-u-v)*c[2]);}
 }
 return heights;
}
const floorSamples=[[0,0],[PLAYER_RADIUS*.65,0],[-PLAYER_RADIUS*.65,0],[0,PLAYER_RADIUS*.65],[0,-PLAYER_RADIUS*.65]];
function floorAt(position,scene,max){
 let floor=scene.groundHeight?.(position)??GROUND_HEIGHT;const r=PLAYER_RADIUS*.65;
 for(const s of scene.surfaces){
  if(position[0]+r<s.bounds[0]||position[0]-r>s.bounds[2]||position[1]+r<s.bounds[1]||position[1]-r>s.bounds[3])continue;
  const [a,b,c]=s.p;
  for(const [dx,dy] of floorSamples){
   const x=position[0]+dx,y=position[1]+dy,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/s.det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/s.det;
   if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001){const z=u*a[2]+v*b[2]+(1-u-v)*c[2];if(z<=max&&z>floor)floor=z;}
  }
 }
 for(const s of scene.segments)if(s[5]>floor&&s[5]<=max&&segmentDistance(position,s,s[5],s[5])<PLAYER_RADIUS-.005)floor=s[5];
 return floor;
}
export function advancePlayer(body,dx,dy,seconds,scene,jump=false,speedActive=false){
 let {position,feet,verticalSpeed,grounded}=body;position=[...position];
 // Each jump trigger supplies a new upward impulse, including during a fall.
 // Scale the impulse by sqrt(height multiplier), keeping gravity unchanged.
 if(jump){verticalSpeed=JUMP_SPEED*(speedActive?Math.sqrt(FPS_CONFIG.multiplicateurHauteurSautSpeed):1);grounded=false;}
 const dt=Math.max(0,Math.min(seconds,.05)),count=Math.max(1,Math.ceil(Math.max(dt*120,Math.hypot(dx,dy)/.08))),h=dt/count;
 for(let i=0;i<count;i++){
  const wasGrounded=grounded,oldFloor=floorAt(position,scene,feet+.005);
  const oldFeet=feet,next=feet+verticalSpeed*h-GRAVITY*h*h/2;verticalSpeed-=GRAVITY*h;feet=next;
  if(feet>oldFeet){
   const ceilings=surfaceHeights(position,scene.surfaces).filter(z=>z>=oldFeet+PLAYER_HEIGHT-.001&&z<feet+PLAYER_HEIGHT);
   if(ceilings.length){feet=Math.min(...ceilings)-PLAYER_HEIGHT;verticalSpeed=0;}
  }else{
   const floor=oldFloor;
   if(feet<=floor){feet=floor;verticalSpeed=0;grounded=true;}else grounded=false;
  }
  const candidate=[position[0]+dx/count,position[1]+dy/count];
  // Small kerbs can be stepped onto; fences require the player's feet to clear their top.
  const step=grounded?floorAt(candidate,scene,feet+STEP_HEIGHT):feet;
  if(step>feet&&step-feet<=STEP_HEIGHT&&!blocked(candidate,scene.segments,step))feet=step;
  const previous=position;
  // Terrain is continuous; a substep that climbs beyond a kerb-sized rise is blocked.
  const ground=scene.groundHeight?.(candidate)??GROUND_HEIGHT;
  if(ground<=feet+STEP_HEIGHT)position=stepPlayer(position,dx/count,dy/count,scene.segments,feet);
  // Follow a gentle downhill slope while walking, without cancelling jumps
  // or snapping the player down from roofs and ledges.
  const support=floorAt(position,scene,feet+STEP_HEIGHT);
  if(wasGrounded&&verticalSpeed<=0&&Math.abs(support-oldFloor)<=STEP_HEIGHT&&!blocked(position,scene.segments,support)){feet=support;verticalSpeed=0;grounded=true;}
  if((scene.groundHeight?.(position)??GROUND_HEIGHT)>feet+.005){if(grounded)feet=scene.groundHeight(position);else position=previous;}
  const floor=floorAt(position,scene,feet+.005);
  if(feet>floor+.005)grounded=false;
 }
 return {position,feet,verticalSpeed,grounded};
}
