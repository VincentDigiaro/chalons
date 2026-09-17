import {FPS_CONFIG} from './walk-config.js';
import {CITY} from './city-config.js';
// Shared metre-based geometry for the pedestrian camera, streaming and collisions.
export const EYE_HEIGHT=1.40, PLAYER_RADIUS=.24, PLAYER_HEIGHT=1.65;
export const BUILDING_LOAD_RADIUS=FPS_CONFIG.rayonChargementBatimentsMetres, GROUND_LOAD_RADIUS=FPS_CONFIG.rayonChargementSolMetres, ROAD_LOAD_RADIUS=FPS_CONFIG.rayonChargementRoutesMetres;
export const LOAD_RADIUS=BUILDING_LOAD_RADIUS, MAX_LOAD_RADIUS=Math.max(BUILDING_LOAD_RADIUS,GROUND_LOAD_RADIUS,ROAD_LOAD_RADIUS);
export const FOG_START=FPS_CONFIG.debutBrouillardMetres, FOG_END=FPS_CONFIG.finBrouillardMetres;
export const nodeLoadRadius=file=>file.startsWith('roads/')?ROAD_LOAD_RADIUS:BUILDING_LOAD_RADIUS;
export const WALK_SPEED=FPS_CONFIG.vitesseMarcheMps, RUN_SPEED=FPS_CONFIG.vitesseCourseMps, TURBO_SPEED=FPS_CONFIG.superVitesseKmh/3.6;
export const FPS_FOV=65;
export const ORIGIN=CITY.origin, SCALE=CITY.scale;
export const toLocal=([lng,lat])=>[(lng-ORIGIN[0])*SCALE[0],(lat-ORIGIN[1])*SCALE[1]];
export const toLngLat=([x,y])=>[x/SCALE[0]+ORIGIN[0],y/SCALE[1]+ORIGIN[1]];
export const SPAWN=toLocal(CITY.spawn.coordinates);
export const SPAWN_YAW=CITY.spawn.yawDegrees*Math.PI/180;
export const nearDistance=(b,p)=>Math.hypot(Math.max(b[0]-p[0],0,p[0]-b[2]),Math.max(b[1]-p[1],0,p[1]-b[3]));
export const farDistance=(b,p)=>Math.hypot(Math.max(Math.abs(b[0]-p[0]),Math.abs(b[2]-p[0])),Math.max(Math.abs(b[1]-p[1]),Math.abs(b[3]-p[1])));
// Whole asset bounds must fit inside the loading circle.
export const inRange=(b,p,radius=BUILDING_LOAD_RADIUS)=>farDistance(b,p)<=radius;
export function segmentDistance(p,s,bottom=s[4],top=s[5]){
 if(s.triangle){
  let poly=s.triangle;
  // Only the part of an inclined wall alongside the player's body can block
  // movement. This also lets the player stand beneath its overhanging part.
  for(const [z,sign] of [[bottom,1],[top,-1]]){
   const clipped=[];
   for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=(a[2]-z)*sign,db=(b[2]-z)*sign;
    if(da>=0)clipped.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,z]);}
   }
   poly=clipped;if(!poly.length)return Infinity;
  }
  let nearest=Infinity,positive=false,negative=false;
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],cross=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
   if(cross>1e-9)positive=true;if(cross< -1e-9)negative=true;
   nearest=Math.min(nearest,segmentDistance(p,[a[0],a[1],b[0],b[1]]));
  }
  return poly.length>=3&&positive!==negative?0:nearest;
 }
 const dx=s[2]-s[0],dy=s[3]-s[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p[0]-s[0])*dx+(p[1]-s[1])*dy)/den)):0;return Math.hypot(p[0]-s[0]-dx*t,p[1]-s[1]-dy*t);
}
export function blocked(p,segments,feet=0){return segments.some(s=>(s.length<6||(feet<s[5]-.005&&feet+PLAYER_HEIGHT>s[4]+.005))&&segmentDistance(p,s,feet,feet+PLAYER_HEIGHT)<PLAYER_RADIUS);}
export function stepPlayer(p,dx,dy,segments,feet=0){
 const count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.10));let q=[...p];
 for(let i=0;i<count;i++){
  const nx=q[0]+dx/count,ny=q[1]+dy/count;
  if(!blocked([nx,ny],segments,feet))q=[nx,ny];
  else {if(!blocked([nx,q[1]],segments,feet))q[0]=nx;if(!blocked([q[0],ny],segments,feet))q[1]=ny;}
 }
 return q;
}
export function movement(yaw,forward,right,seconds,fast=false,turbo=false){const n=Math.max(1,Math.hypot(forward,right)),speed=(turbo?TURBO_SPEED:fast?RUN_SPEED:WALK_SPEED)*Math.min(seconds,.05)/n;return [(Math.sin(yaw)*forward+Math.cos(yaw)*right)*speed,(Math.cos(yaw)*forward-Math.sin(yaw)*right)*speed];}
export function viewProjection(position,yaw,pitch,aspect,fov=FPS_FOV*Math.PI/180,centerOffset=0){
 const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
 const right=[cy,-sy,0],up=[-sy*sp,-cy*sp,cp],back=[-sy*cp,-cy*cp,-sp];
 const dot=a=>a[0]*position[0]+a[1]*position[1]+a[2]*position[2];
 const v=[right[0],up[0],back[0],0,right[1],up[1],back[1],0,right[2],up[2],back[2],0,-dot(right),-dot(up),-dot(back),1];
 // A chase camera can sit outside the loaded circle. Its far plane must still
 // reach the opposite edge of the circle centered on the player/ship.
 const f=1/Math.tan(fov/2),near=.06,far=Math.hypot(MAX_LOAD_RADIUS,position[2])+centerOffset+100;
 const p=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
 const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=p[k*4+r]*v[c*4+k];return m;
}
export function tileBounds(z,x,y){const n=2**z,lngLat=(x,y)=>[x/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI];const nw=toLocal(lngLat(x,y)),se=toLocal(lngLat(x+1,y+1));return [nw[0],se[1],se[0],nw[1]];}
export function tileAt(p,z){const [lng,lat]=toLngLat(p),n=2**z;return [Math.floor((lng+180)/360*n),Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n)];}
