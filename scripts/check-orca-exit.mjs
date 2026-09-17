import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {FPS_CONFIG} from '../dist/walk-config.js';
import {FPSHighwind} from '../dist/fps-highwind.js';
import {meshCollider,trianglePositions} from '../dist/highwind-collision.js';
import {HighwindFlight,deckExitPosition} from '../dist/highwind-flight.js';
import {advancePlayer,surfaceHeights} from '../dist/walk-physics.js';
import {blocked,PLAYER_HEIGHT} from '../dist/walk-core.js';
import {movementBounds} from '../dist/walk-collision-index.js';
import {WalkMode} from '../dist/walk-mode.js';
import {HighwindUI} from '../dist/highwind-ui.js';

const index=JSON.parse(await fs.readFile('dist/data/orca/v1/index.json')),bytes=await fs.readFile('dist/data/orca/v1/mesh.bin'),vertices=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
const collider=meshCollider(trianglePositions(vertices,index.ranges)),noop=()=>{};
const ship=Object.assign(Object.create(FPSHighwind.prototype),{shipId:'orca',label:'Orca',enabled:true,index,config:FPS_CONFIG.orca,residency:{data:{collider}},updateBounds:noop});
let cases=0;
for(const pitch of [-18,-9,0,9,18])for(const roll of [-24,0,24])for(const angleDegres of [0,37,90,110,180,270]){
 ship.pose={...FPS_CONFIG.orca,position:{x:-120,y:-173,z:60},pitch:pitch*Math.PI/180,roll:roll*Math.PI/180,angleDegres};
 const before=structuredClone(ship.pose),exit=deckExitPosition(ship),label=`pitch=${pitch}, roll=${roll}, yaw=${angleDegres}`;
 assert(exit,'Exit must work while tilted: '+label);
 const scene=ship.playerCollisionScene(movementBounds(exit.position));
 assert(!blocked(exit.position,scene.segments,exit.feet),'No cockpit arch traps the player: '+label);
 const ceilings=surfaceHeights(exit.position,scene.surfaces).filter(z=>z>exit.feet+.01);
 assert(ceilings.every(z=>z-exit.feet>=PLAYER_HEIGHT),'Standing headroom: '+label);
 const flight=new HighwindFlight(ship);flight.mode='flying';flight.speedKmh=270;flight.mouseTurn=40;
 const player={};assert.equal(flight.interact(player),'exit');assert.equal(flight.mode,'foot');assert.equal(flight.speedKmh,0);assert.equal(flight.mouseTurn,0);
 assert.deepEqual(player,exit);assert.deepEqual(ship.pose,before,'Exit never levels, moves or turns the Orca');
 for(let i=0;i<120;i++)Object.assign(player,advancePlayer(player,0,0,1/60,scene));
 assert(player.grounded,'Remain on the hull: '+label);assert(Math.abs(player.feet-exit.feet)<.01,'No fall through the Orca: '+label);
 assert.equal(flight.interact(player),'board','Reboarding still works from this exit');cases++;
}

// Exercise the real E handler and the mobile Sortir button, including cleanup
// of movement, held fire and orbit input when leaving an inclined aircraft.
for(const touch of [false,true]){
 globalThis.document=new EventTarget();globalThis.window=new EventTarget();
 const elements=new Map(),el=key=>{if(!elements.has(key))elements.set(key,Object.assign(new EventTarget(),{style:{},textContent:'',focus:noop,setAttribute:noop,setPointerCapture:noop}));return elements.get(key);};
 ship.pose={...FPS_CONFIG.orca,position:{x:0,y:0,z:60},pitch:-18*Math.PI/180,roll:24*Math.PI/180,angleDegres:0};
 const mode=Object.assign(Object.create(WalkMode.prototype),{root:{querySelector:el,classList:{toggle:noop},insertAdjacentHTML:noop},canvas:el('canvas'),events:new AbortController(),phase:'playing',touch,keys:new Set(['KeyW']),stick:[1,1],position:[0,0],feet:60,renderer:{highwind:ship},lock:noop});
 mode.flight=new HighwindFlight(ship);mode.flight.mode='flying';mode.bind();mode.highwindUI=new HighwindUI(mode);mode.bombInputs.add('mouse-left');mode.jumpInputs.add('keyboard');mode.mouseOrbit=true;mode.mouseOrbitButtons=2;mode.highwindUI.update();
 if(touch){assert(!el('#highwind-enter').hidden);assert.equal(el('#highwind-enter').textContent,'Sortir');el('#highwind-enter').dispatchEvent(new Event('click'));}
 else{document.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'KeyE',repeat:false}));}
 assert.equal(mode.flight.mode,'foot',touch?'Sortir exits on mobile':'E exits on desktop');assert(mode.grounded);
 assert.equal(mode.keys.size,0);assert.equal(mode.bombInputs.size,0);assert.equal(mode.jumpInputs.size,0);assert(!mode.mouseOrbit);assert.deepEqual(mode.stick,[0,0]);assert.deepEqual(mode.flightStick,[0,0]);
 mode.events.abort();
}
console.log(JSON.stringify({orcaExit:'passed',realModelOrientations:cases,keyboardAndMobile:true,standingHeadroom:true,stableForTwoSeconds:true,shipPosePreserved:true,reboarding:true,heldInputsCleared:true}));
