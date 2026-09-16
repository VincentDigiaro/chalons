import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Terrain,loadTerrain,terrainHeight,terrainMaxHeight,terrainTile,drapeVertices,subdivideRoads} from '../dist/terrain.js';
import {advancePlayer,GROUND_HEIGHT,GRAVITY,JUMP_SPEED} from '../dist/walk-physics.js';
import {SPAWN,toLocal,tileAt,tileBounds} from '../dist/walk-core.js';
import {meshCollider,shipHitsGround} from '../dist/highwind-collision.js';

const close=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const synthetic={version:1,width:2,height:2,bounds:[4.3815,48.9475,4.3825,48.9485],referenceAltitude:100,encoding:'int16-le-centimetres'};
const grid=new Terrain(synthetic,new Int16Array([10000,12000,8000,10000]).buffer);
const mid=toLocal([4.382,48.948]);close(grid.height(...mid),0);
close(grid.height(-1e6,1e6),0);close(grid.height(1e6,-1e6),0);
assert.throws(()=>new Terrain(synthetic,new ArrayBuffer(2)));
await loadTerrain({fetchBuffer:async url=>{const b=await fs.readFile('dist/'+url.replace('./',''));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
assert(Math.abs(terrainHeight(...SPAWN))<.02,'Spawn remains at its local datum');
const valley=terrainHeight(...toLocal([4.36,48.95])),hill=terrainHeight(...toLocal([4.43,48.96]));
assert(hill-valley>15,'The IGN extraction must contain real relief east of the valley');
const bounds=tileBounds(18,...tileAt(SPAWN,18)),mesh=terrainTile(bounds);
assert.equal(mesh.length,16*16*66);
for(let i=0;i<mesh.length;i+=11){close(mesh[i+2],terrainHeight(mesh[i],mesh[i+1])-.025,.001);close(Math.hypot(...mesh.subarray(i+3,i+6)),1,.001);assert(mesh[i+8]===1);}
// Adjacent ground tiles share positions and heights along their common edge.
const [tx,ty]=tileAt(SPAWN,18),neighbor=terrainTile(tileBounds(18,tx+1,ty));
const border=v=>{const points=new Map();for(let i=0;i<v.length;i+=11)if(Math.abs(v[i]-bounds[2])<.001)points.set(v[i+1].toFixed(3),v[i+2]);return points;};
assert.deepEqual(border(mesh),border(neighbor));
const vertices=new Float32Array([[0,0],[50,0],[0,50]].flatMap(([x,y])=>[x,y,.04,0,0,1,x/4,y/4,1,1,1]));
const road=subdivideRoads(vertices,[[2,0,3]]);assert(road.vertices.length>vertices.length);assert.equal(road.ranges[0][2],road.vertices.length/11);
for(let i=0;i<road.vertices.length;i+=33)for(const [a,b] of [[0,11],[11,22],[22,0]])assert(Math.hypot(road.vertices[i+a]-road.vertices[i+b],road.vertices[i+a+1]-road.vertices[i+b+1])<=8.001);
const original=new Float32Array(vertices);drapeVertices(vertices);assert.deepEqual(vertices.filter((_,i)=>i%11>5),original.filter((_,i)=>i%11>5),'Keep UVs and materials');
// Walk uphill and downhill, including negative elevations and turbo-sized steps.
for(const slope of [-.35,.35])for(const fps of [20,60,120])for(const speed of [3.3,100]){
 const groundHeight=p=>-8+p[0]*slope,scene={segments:[],surfaces:[],groundHeight};
 let body={position:[0,0],feet:groundHeight([0,0]),verticalSpeed:0,grounded:true};
 for(let i=0;i<fps*2;i++){body=advancePlayer(body,speed/fps,0,1/fps,scene);close(body.feet,groundHeight(body.position));assert(body.grounded);}
 const start=body.feet;let peak=start;
 const frames=Math.ceil((2*JUMP_SPEED/GRAVITY+1)*fps);
 for(let i=0;i<frames;i++){body=advancePlayer(body,0,0,1/fps,scene,i===0);peak=Math.max(peak,body.feet);}
 close(peak-start,JUMP_SPEED**2/(2*GRAVITY),.01);close(body.feet,groundHeight(body.position));assert(body.grounded);
}
// A roof must remain support until its edge, then allow a real fall.
const roof={p:[[0,-1,5],[2,-1,5],[0,1,5]],det:4,bounds:[0,-1,2,1]};
let body={position:[.1,0],feet:5,verticalSpeed:0,grounded:true};
body=advancePlayer(body,0,0,.02,{surfaces:[roof],segments:[],groundHeight:()=>-4});close(body.feet,5);
body=advancePlayer(body,3,0,.05,{surfaces:[roof],segments:[],groundHeight:()=>-4});assert(body.feet>4&&!body.grounded);
// Flight deliberately accepts small peaks between its coarse supports.
const collider=meshCollider(new Float32Array([-10,-10,0,10,-10,0,0,10,0]));
const pose={position:{x:0,y:0,z:1},longueurMetres:1,angleDegres:0,pitch:0};
assert(!shipHitsGround(collider,pose,()=>-5));assert(!shipHitsGround(collider,pose,p=>Math.hypot(p[0],p[1])<4?2:0));assert(shipHitsGround(collider,pose,()=>2));
const max=terrainMaxHeight(bounds);for(let i=0;i<mesh.length;i+=11)assert(mesh[i+2]<=max+.01);
console.log(JSON.stringify({terrain:'passed',source:'IGN RGE ALTI',valley,hill,continuousTileEdges:true,roadSubdivision:true,slopesAndJumps:true,negativeHeights:true,airshipTerrainCollision:true}));
