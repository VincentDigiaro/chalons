import assert from 'node:assert/strict';
import {readWalkEntry,clearWalkEntry} from '../dist/walk-url.js';
import {SPAWN,SPAWN_YAW} from '../dist/walk-core.js';
import {WalkMode} from '../dist/walk-mode.js';
import {readWalkReturn} from '../dist/walk-return.js';
const bounds=[[4.16,48.81],[4.56,49.115]],read=search=>readWalkEntry(search,bounds);
assert.deepEqual(read('?fps=1'),{position:SPAWN,yaw:SPAWN_YAW,pitch:-6*Math.PI/180});
const photo=read('?fps=1&x=-633&y=1970.64&angle=189.53&pitch=0.21');
assert.deepEqual(photo.position,[-633,1970.64]);
assert(Math.abs(photo.yaw-189.53*Math.PI/180)<1e-12);
assert.equal(photo.pitch,.21*Math.PI/180);
assert(Math.abs(read('?fps=1&x=0&y=0&angle=-90').yaw-3*Math.PI/2)<1e-12);
assert.equal(read('?fps=1&x=0&y=0&angle=720').yaw,0);
for(const search of ['', '?x=0&y=0&angle=0','?fps=0','?fps=1&fps=1','?fps=1&x=0','?fps=1&pitch=0','?fps=1&x=&y=0&angle=0','?fps=1&x=NaN&y=0&angle=0','?fps=1&x=1e999&y=0&angle=0','?fps=1&x=9999999&y=0&angle=0','?fps=1&x=0&x=1&y=0&angle=0','?fps=1&x=0&y=0&angle=0&pitch=84'])assert.equal(read(search),null,search);
const cleaned=clearWalkEntry('https://example.test/chalons/?lang=fr&fps=1&x=1&y=2&angle=3&pitch=4#old');
assert.equal(cleaned.search,'?lang=fr');assert.equal(cleaned.hash,'#old');
assert.equal(clearWalkEntry('https://example.test/?x=2').search,'?x=2');
// Exiting either an ordinary session or a URL entry must reload the map at the
// last position, and must not immediately auto-start another FPS session.
globalThis.document={pointerLockElement:null};
for(const href of ['https://example.test/chalons/#nerval-focus','https://example.test/chalons/?fps=1&x=0&y=0&angle=0&lang=fr']){
 let changed,reloads=0;globalThis.history={replaceState(_a,_b,url){changed=new URL(url);}};globalThis.location={href,reload(){reloads++;}};
 const exiting=Object.assign(Object.create(WalkMode.prototype),{keys:new Set(),setFlash(){},position:[10,20],jumpInputs:new Set(['keyboard']),jumpQueued:true});exiting.exit();
 assert.equal(exiting.jumpInputs.size,0);assert.equal(exiting.jumpQueued,false);
 assert.equal(reloads,1);assert.equal(read(changed.search),null);assert(readWalkReturn(changed.hash,bounds));
}
console.log(JSON.stringify({urlEntry:'passed',localMetres:true,degreeAngles:true,optionalPitch:true,invalidLinksRejected:true,defaultSpawnPreserved:true,mapReturnDoesNotRestartFPS:true}));
