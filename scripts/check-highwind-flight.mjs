import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FPSHighwind,ff7Enabled,hullProbes} from '../dist/fps-highwind.js';
import {shipMatrix,transform,inversePoint,rotorMatrix,triangleDistance} from '../dist/highwind-math.js';
import {flightInputs,advanceFlight,chaseCamera,followHeading,HighwindFlight,terrainGrid,hullSupport} from '../dist/highwind-flight.js';
import {collisionGeometry,GROUND_HEIGHT} from '../dist/walk-physics.js';
import {parseMidi,HighwindMusic} from '../dist/highwind-music.js';
import {validateHighwindConfig,FPS_CONFIG} from '../dist/walk-config.js';
const near=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} ≠ ${b}`);
for(const q of ['?ship=highwind','?fps=1&ship=highwind','?ville=nice&ship=highwind'])assert(ff7Enabled(q));for(const q of ['','?fps=1','?other=ff7'])assert(!ff7Enabled(q));
const config=validateHighwindConfig({present:true,longueurMetres:237,position:{x:20,y:60,z:140},angleDegres:135,vitesseMaxKmh:400,dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18,hauteurApparitionMetres:20,distanceDerriereJoueurMetres:50,distanceCameraMetres:73.5,vitessesHelicesToursParSeconde:FPS_CONFIG.highwind.vitessesHelicesToursParSeconde});
for(const vitesseMaxKmh of [-1,0,'400',NaN])assert.throws(()=>validateHighwindConfig({...config,vitesseMaxKmh}));
for(const angle of [0,90,235])for(const pitch of [-Math.PI/18,0,Math.PI/18]){const pose={...config,angleDegres:angle,pitch},p=[.1,-.3,.08];const q=inversePoint(pose,transform(shipMatrix(pose),p));q.forEach((v,i)=>near(v,p[i]));}
const index=JSON.parse(await fs.readFile('dist/data/highwind/index.json')),bytes=await fs.readFile('dist/data/highwind/mesh.bin'),v=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
assert.deepEqual(Object.keys(index.rotors).sort(),['PropL','PropR','PropRear','PropTail']);
for(const r of Object.values(index.rotors)){const matrix=rotorMatrix(r,1),p=r.pivot;transform(matrix,p).forEach((n,i)=>near(n,p[i]));const vertex=[p[0]+.1,p[1],p[2]];near(Math.hypot(...transform(matrix,vertex).map((n,i)=>n-p[i])),.1);assert(Math.hypot(...transform(matrix,vertex).map((n,i)=>n-vertex[i]))>.02);}
near(triangleDistance([.2,.2,2],[0,0,0],[1,0,0],[0,1,0]),2);near(triangleDistance([0,0,0],[0,0,0],[1,0,0],[0,1,0]),0);
let pose={...config,pitch:0,position:{x:0,y:0,z:200},angleDegres:0};
const keys=new Set(['KeyW','KeyD','ArrowRight','Space']),input=flightInputs(keys);assert.deepEqual(input,{forward:1,strafe:1,turn:1,lift:1,boost:false});assert.deepEqual(flightInputs(new Set(),[1,1],[1,1]),input);
for(let i=0;i<200;i++){const next=advanceFlight(pose,input,.02,400);assert(next.position.x!==pose.position.x&&next.position.y!==pose.position.y&&next.position.z>pose.position.z&&next.angleDegres>pose.angleDegres);near(Math.hypot(...['x','y','z'].map(k=>(next.position[k]-pose.position[k])*(k==='z'?2:1)))/.02*3.6,400);pose=next;}
near(pose.pitch,Math.PI/18);for(let i=0;i<100;i++)pose=advanceFlight(pose,{forward:0,strafe:0,turn:0,lift:0},.02,400);near(pose.pitch,0);
const slow=advanceFlight({...pose,angleDegres:0},{forward:-1,strafe:0,turn:0,lift:-1},.05,200);near(Math.hypot(...['x','y','z'].map(k=>(slow.position[k]-pose.position[k])*(k==='z'?2:1)))/.05*3.6,200);assert(slow.position.y<pose.position.y&&slow.position.z<pose.position.z);
for(const mobile of [false,true])for(const lift of [-1,1]){
 const controls=flightInputs(new Set([lift>0?'Space':'ControlLeft']),[0,0],[0,0],mobile),next=advanceFlight(pose,controls,.05,400);
 near(next.position.z-pose.position.z,lift*400/3.6*.05/2);
}
const mobileDown=flightInputs(new Set(),[0,0],[1,-1],true),mobileUp=flightInputs(new Set(),[0,0],[1,1],true),desktopRight=flightInputs(new Set(['ArrowRight']));
assert.equal(mobileDown.lift,1);assert.equal(mobileUp.lift,-1);near(mobileDown.turn,desktopRight.turn*3);
const horizontal=advanceFlight(pose,{forward:1,strafe:1,turn:0,lift:0},.05,400);near(Math.hypot(horizontal.position.x-pose.position.x,horizontal.position.y-pose.position.y)/.05*3.6,400);
const camera=chaseCamera({...pose,angleDegres:0});assert(camera.position[1]<pose.position.y&&camera.height>pose.position.z&&camera.pitch<0);
const radians=n=>n*Math.PI/180;
for(const [a,b] of [[359,1],[1,359],[-179,179],[179,-179]]){
 const next=followHeading(radians(a),radians(b),.02),delta=Math.atan2(Math.sin(radians(b-a)),Math.cos(radians(b-a)));
 assert(Math.abs(next-radians(a))<Math.abs(delta));assert(Math.sign(next-radians(a))===Math.sign(delta),'Follow the short arc across heading wrap');
}
let at50=0,at100=0;for(let i=0;i<50;i++)at50=followHeading(at50,1,.02);for(let i=0;i<100;i++)at100=followHeading(at100,1,.01);near(at50,at100,1e-12);
for(const distanceCameraMetres of [25.5,151.86,350])for(const longueurMetres of [50,150,237])for(const angleDegres of [0,90,309])for(const orbit of [{yaw:0,pitch:0},{yaw:1.2,pitch:1.05},{yaw:-2,pitch:-.5}]){
 const p={...pose,distanceCameraMetres,longueurMetres,angleDegres},camera=chaseCamera(p,orbit);
 const dx=p.position.x-camera.position[0],dy=p.position.y-camera.position[1],dz=p.position.z-camera.height;
 near(Math.hypot(dx,dy,dz),distanceCameraMetres);
 near(Math.atan2(dz,Math.hypot(dx,dy)),camera.pitch);
 near(dx/Math.hypot(dx,dy),Math.sin(camera.yaw));near(dy/Math.hypot(dx,dy),Math.cos(camera.yaw));
}
const legacy=chaseCamera({...pose,angleDegres:0,distanceCameraMetres:undefined});
near(legacy.position[1],pose.position.y-.95*pose.longueurMetres);near(legacy.height,pose.position.z+.35*pose.longueurMetres);
// Configured elevation keeps the camera on the distance sphere and looking at the ship.
for(const angleCameraDegres of [-89,-20,0,35,89]){
 const p={...pose,angleDegres:90,distanceCameraMetres:310,angleCameraDegres},c=chaseCamera(p);
 near(c.pitch,-angleCameraDegres*Math.PI/180);near(c.height-p.position.z,310*Math.sin(angleCameraDegres*Math.PI/180));
 near(Math.hypot(c.position[0]-p.position.x,c.position[1]-p.position.y,c.height-p.position.z),310);
 const f=new HighwindFlight({pose:p});f.mode='flying';
 for(const dy of [10000,-10000]){f.look(0,dy,.0022,true);assert(Math.abs(f.camera().pitch)<=89*Math.PI/180);}
 f.cameraDistance=500;f.zoomDistance=600;f.resetCameraView();near(f.camera().pitch,c.pitch);near(f.cameraDistance,310);
}
globalThis.fetch=async url=>new Response(await fs.readFile('dist/'+String(url).replace('./','')));
const renderer={index:{materials:[]},geometry:vertices=>({bytes:vertices.byteLength}),drop(){},texture(){},material(id){return this.index.materials[id];}};
const ship=new FPSHighwind(renderer,config,{enabled:true});ship.refresh([100,200]);await ship.initializing;await ship.residency.pending;
const configuredCamera=chaseCamera(ship.pose);near(Math.hypot(configuredCamera.position[0]-ship.pose.position.x,configuredCamera.position[1]-ship.pose.position.y,configuredCamera.height-ship.pose.position.z),config.distanceCameraMetres);
assert.deepEqual(ship.pose.position,config.position,'Player entry must not replace the configured position');
assert.equal(ship.pose.angleDegres,config.angleDegres,'Player entry must not replace the configured angle');
assert.equal(ship.pose.position.z,140,'Use the configured model origin height without a hull clearance offset');
ship.refresh([-100,-100]);assert.deepEqual(ship.pose.position,config.position,'Player movement must not relocate the ship');
ship.animate(.02);assert(ship.rotorAngles.PropTail>0);
const matrices=[];ship.draw((gpu,id,first,count,m)=>{matrices.push(Array.from(m));return true;},[]);assert.equal(matrices.length,index.ranges.length);assert.notDeepEqual(matrices[0],matrices.at(-1),'Propeller draw must receive its own transform');
const r=index.ranges.find(r=>r.part==='Body'),contact=transform(shipMatrix(ship.pose),Array.from(v.subarray(r.first*11,r.first*11+3))),player={position:contact.slice(0,2),feet:contact[2]-.85};assert(ship.contactDistance(player)<.01);assert.equal(ship.contactDistance({position:[5000,5000],feet:0}),Infinity);
// At the outermost fixed hull vertex, approach from 30 metres beyond its bounds.
// This catches a stale 20 m broad-phase cutoff even when the UI range is 40 m.
let outer=null;for(const range of index.ranges.filter(r=>!r.part.startsWith('Prop')))for(let i=range.first*11;i<(range.first+range.count)*11;i+=11){const p=Array.from(v.subarray(i,i+3));if(!outer||p[0]>outer[0])outer=p;}
const nearHull=transform(shipMatrix(ship.pose),[outer[0]+30/ship.pose.longueurMetres,outer[1],outer[2]]),boardingDistance=ship.contactDistance({position:nearHull.slice(0,2),feet:nearHull[2]-.85});
near(boardingDistance,30,.0001);const boarding=new HighwindFlight(ship);assert.equal(boarding.interact({position:nearHull.slice(0,2),feet:nearHull[2]-.85}),'board');
ship.pose={...ship.pose,distanceCameraMetres:300};const zoomFlight=new HighwindFlight(ship);zoomFlight.mode='flying';const unchangedConfig=JSON.stringify(ship.config),unchangedPose=JSON.stringify(ship.pose),baseZoom=zoomFlight.cameraDistance;
zoomFlight.zoom(-100);assert(zoomFlight.zoomDistance<baseZoom);zoomFlight.updateCamera(.02,true);assert(zoomFlight.cameraDistance<baseZoom&&zoomFlight.cameraDistance>zoomFlight.zoomDistance);
for(let i=0;i<60;i++)zoomFlight.zoom(-600);assert(zoomFlight.zoomDistance>0);const closest=zoomFlight.zoomDistance;
for(let i=0;i<60;i++)zoomFlight.zoom(600);assert(zoomFlight.zoomDistance>closest&&Number.isFinite(zoomFlight.zoomDistance));
assert.equal(JSON.stringify(ship.pose),unchangedPose);assert.equal(JSON.stringify(ship.config),unchangedConfig,'Wheel never rewrites configured camera distance');
const idleInput={forward:0,strafe:0,turn:0,lift:0},pattern=[8,-2,0,5,1,-1];let sum=0,previous=0,changes=[],raw=[];
ship.pose={...ship.pose,angleDegres:0,pitch:0};const smooth=new HighwindFlight(ship);smooth.mode='flying';
for(let i=0;i<120;i++){const dx=pattern[i%pattern.length];sum+=dx;raw.push(dx*.0022*180/Math.PI);smooth.look(dx,0,.0022,false);smooth.tick(1/60,idleInput);changes.push(ship.pose.angleDegres-previous);previous=ship.pose.angleDegres;}
assert(changes.every(n=>n>=0),'Tiny reversed mouse samples no longer reverse a continuous turn');
const variation=a=>a.slice(1).reduce((n,v,i)=>n+Math.abs(v-a[i]),0);assert(variation(changes)<variation(raw)*.3,'Continuous turn is measurably smoother than raw mouse events');
for(let i=0;i<120;i++)smooth.tick(1/60,idleInput);near(ship.pose.angleDegres,sum*.0022*180/Math.PI,.005);
const settled=[];for(const fps of [30,60,120]){ship.pose={...ship.pose,angleDegres:0};const f=new HighwindFlight(ship);f.mode='flying';for(let i=0;i<fps;i++){f.look(240/fps,0,.0022,false);f.tick(1/fps,idleInput);}for(let i=0;i<fps*2;i++)f.tick(1/fps,idleInput);settled.push(ship.pose.angleDegres);}
for(const heading of settled)near(heading,240*.0022*180/Math.PI,.005);
// Fast mouse gestures must respect the cap even with simultaneous keyboard or
// mobile turns, across heading wrap and different frame rates.
const headingDelta=(after,before)=>(after-before+540)%360-180;
for(const fps of [20,30,60,120])for(const direction of [-1,1])for(const turnInput of [0,-1,1,-3,3]){
 ship.pose={...ship.pose,angleDegres:direction>0?359:1};const f=new HighwindFlight(ship);f.mode='flying';
 let lastDelta=0;
 for(let i=0;i<fps;i++){
  f.look(direction*10000/fps,0,.0022,false);
  const before=ship.pose.angleDegres;f.tick(1/fps,{...idleInput,turn:turnInput});
  lastDelta=headingDelta(ship.pose.angleDegres,before);assert(Math.abs(lastDelta)<=180/fps+1e-8,'Combined rotation stays below 180 degrees per second');
  assert.equal(f.mouseTurn,0,'Mouse displacement is consumed in the current frame');
 }
 assert(direction*lastDelta>.99*180/fps,'Sustained fast input reaches the speed limit');
}
// A saturated gesture must brake promptly without a snap, regardless of how
// much excess displacement was sent or how events were batched.
for(const fps of [20,30,60,120,240])for(const direction of [-1,1])for(const pixelsPerSecond of [10000,1e9])for(const events of [1,8]){
 ship.pose={...ship.pose,angleDegres:direction>0?359:1};const f=new HighwindFlight(ship);f.mode='flying';
 for(let i=0;i<fps;i++){
  for(let event=0;event<events;event++)f.look(direction*pixelsPerSecond/fps/events,0,.0022,false);
  f.tick(1/fps,idleInput);
 }
 let previousSpeed=180,brakingAngle=0;
 for(let i=0;i<Math.ceil(fps*.5);i++){
  const before=ship.pose.angleDegres;f.tick(1/fps,idleInput);const delta=direction*headingDelta(ship.pose.angleDegres,before),speed=delta*fps;
  assert(speed>=-1e-8&&speed<=previousSpeed+1e-8,'Stopping the mouse reduces rotation smoothly without reversing');
  if(i===0)assert(speed>0&&speed<179,'Braking starts immediately without snapping to a halt');
  previousSpeed=speed;brakingAngle+=delta;
 }
 assert(brakingAngle>0&&brakingAngle<8,'Braking travel stays short even after enormous gestures');
 assert.equal(f.mouseTurnSpeed,0,'Rotation fully stops within half a second');
 const stoppedAngle=ship.pose.angleDegres;
 for(let i=0;i<fps*10;i++)f.tick(1/fps,idleInput);
 assert.equal(ship.pose.angleDegres,stoppedAngle,'No stored rotation resumes during ten seconds without mouse input');
}
// Reversing after a saturated gesture must respond to the new input promptly.
ship.pose={...ship.pose,angleDegres:0};const reverse=new HighwindFlight(ship);reverse.mode='flying';
for(let i=0;i<60;i++){reverse.look(10000,0,.0022,false);reverse.tick(1/60,idleInput);}
const reversalStart=ship.pose.angleDegres;
for(let i=0;i<6;i++){reverse.look(-10000,0,.0022,false);reverse.tick(1/60,idleInput);}
assert(headingDelta(ship.pose.angleDegres,reversalStart)<0,'No old gesture delays a direction reversal');
const simpleProbes=[{x:0,y:0,bottom:-.1,top:.1},{x:.1,y:0,bottom:-.1,top:.1}];
const flat=z=>collisionGeometry(new Float32Array([[-20,-20,z],[20,-20,z],[20,20,z],[-20,-20,z],[20,20,z],[-20,20,z]].flatMap(p=>[...p,0,0,1,0,0,1,1,1])));
const obstacle=flat(8),grid=terrainGrid({...obstacle,ready:true}),simplePose={longueurMetres:10,position:{x:0,y:0,z:30},angleDegres:0,pitch:0};near(hullSupport(simplePose,simpleProbes,grid),9);
const terrain=terrainGrid({segments:[],surfaces:[],ready:true}),probes=hullProbes(v,index.ranges);assert(probes.length>100);const realPose={...config,position:{x:0,y:0,z:100},pitch:0};const support=hullSupport(realPose,probes,terrain);assert(support>25&&support<34);
// Actual score, not a replacement melody; no audio until an explicit start.
const midi=await fs.readFile('assets/highwind-takes-to-the-skies.mid'),score=parseMidi(midi.buffer.slice(midi.byteOffset,midi.byteOffset+midi.byteLength));assert(score.notes.length>5000);assert(score.duration>190&&score.duration<210);assert(score.notes.every(n=>n.duration>0&&Number.isFinite(n.time)));assert(score.notes.some(n=>n.channel===9));
assert.throws(()=>parseMidi(new ArrayBuffer(20)));
ship.dispose();console.log(JSON.stringify({highwindFlight:'passed',urlGate:true,spawn:{position:config.position,angleDegres:config.angleDegres,fromConfigOnly:true},rotors:'separate pivots',combinedControls:true,maxKmh:400,tiltDegrees:10,hullProbes:probes.length,midiNotes:score.notes.length,midiParsing:true}));
