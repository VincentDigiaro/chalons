import assert from 'node:assert/strict';
import {LOAD_RADIUS,MAX_LOAD_RADIUS,EYE_HEIGHT,viewProjection,inRange} from '../dist/walk-core.js';
import {frustumPlanes,inFrustum} from '../dist/walk-visibility.js';

const planes=(yaw=0,pitch=0,aspect=16/9,position=[0,0,EYE_HEIGHT])=>frustumPlanes(viewProjection(position,yaw,pitch,aspect));
const front=planes();
assert(inRange([0,LOAD_RADIUS-1,0,LOAD_RADIUS],[0,0]),'Include the configured boundary');
assert(!inRange([0,LOAD_RADIUS+1,0,LOAD_RADIUS+2],[0,0]));
assert(inFrustum([-1,MAX_LOAD_RADIUS-2,1,MAX_LOAD_RADIUS-1],[0,12],front),'The camera must show the largest configured radius');
assert(!inFrustum([-1,MAX_LOAD_RADIUS+150,1,MAX_LOAD_RADIUS+151],[0,12],front),'Far clip plane');
assert(!inFrustum([-1,-30,1,-20],[0,12],front),'Behind the camera');
assert(!inFrustum([25,10,30,12],[0,12],front),'Right of the camera');
assert(!inFrustum([-30,10,-25,12],[0,12],front),'Left of the camera');
assert(!inFrustum([-1,10,1,11],[30,40],front),'Above the camera');
assert(!inFrustum([-1,10,1,11],[-40,-30],front),'Below the camera');
assert(inFrustum([-1,-1,1,1],[0,12],front),'A cell containing the camera must stay visible');
assert(inFrustum([-1,10,30,12],[0,12],front),'Keep buildings that cross a screen edge');
assert(inFrustum([25,-1,30,1],[0,12],planes(Math.PI/2)),'Turning towards a previously hidden building');
assert(inFrustum([-1,-30,1,-20],[0,12],planes(Math.PI)),'Turning around');
assert(!inFrustum([-1,20,1,30],[0,12],planes(Math.PI)),'The old view should now be hidden');
assert(inFrustum([8,10,9,12],[0,12],front));
assert(!inFrustum([8,10,9,12],[0,12],planes(0,0,9/16)),'Portrait aspect ratio has a narrower horizontal field');
const upward=planes(0,.8);
assert(!inFrustum([-1,20,1,25],[0,1],upward));
assert(inFrustum([-1,20,1,25],[0,50],upward),'Use roof height: a tall building is visible while its base is offscreen');
assert(inFrustum([-2,18,2,22],[0,1],planes(0,-.8,9/16,[0,0,25])),'Looking down during flight');
assert(inFrustum([-2,18,2,22],[0,1],planes(0,-Math.PI/2,9/16,[0,0,700])),'Far clip must account for high flight above the loaded circle');

// A vertex that WebGL projects strictly inside the screen must never belong to
// a discarded box, even at map-scale coordinates and oblique camera angles.
let seed=12345,checked=0;
const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
for(let i=0;i<2000;i++){
 const camera=[random()*14000-7000,random()*14000-7000,random()*150+2];
 const yaw=random()*Math.PI*2,pitch=(random()-.5)*2.6,aspect=.5+random()*2;
 const m=viewProjection(camera,yaw,pitch,aspect),p=camera.map((v,axis)=>v+(random()-.5)*(axis===2?150:700));
 const clip=Array.from({length:4},(_,r)=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
 if(clip[3]>0&&clip.slice(0,3).every(v=>Math.abs(v)<clip[3])){
  assert(inFrustum([p[0]-2,p[1]-2,p[0]+2,p[1]+2],[p[2]-1,p[2]+8],frustumPlanes(m)),'Visible geometry was culled');checked++;
 }
}
assert(checked>100);
console.log(JSON.stringify({visibility:'passed',radius:LOAD_RADIUS,projectedSamples:checked,checks:'six planes, turning, portrait, roof heights, edge crossings, flight'}));
