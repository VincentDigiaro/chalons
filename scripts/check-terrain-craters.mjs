import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CraterField,CRATER_SEGMENTS_ACROSS,setTerrainImpacts,terrainCraterRevision,terrainCraterField,craterMesh,finishGeometry} from '../dist/terrain-craters.js';
import {terrainHeight,terrainBaseHeight,terrainTile,loadTerrain,flightTerrainHeight} from '../dist/terrain.js';
import {saveScorches,readScorches,BombScorches} from '../dist/bomb-scorches.js';
import {prepareCraterGeometry,prepareBombGeometry,WalkPreparation} from '../dist/walk-preparation.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {collisionGeometry,advancePlayer,surfaceHeights} from '../dist/walk-physics.js';
import {prepareMapRoads} from '../dist/map-roads.js';
import {mapGroundHeight,mapDEMEncoding,mapDEMValue,mapDEMHeight} from '../dist/terrain-map.js';
import {HighwindBombs} from '../dist/highwind-bombs.js';
import {BOMB_DEFAULTS} from '../dist/walk-config.js';
import {cutBombRoads} from '../dist/bomb-road-cut.js';
import {CITY,cityDataURL} from '../dist/city-config.js';
import {cutMapRoadFeatures} from '../dist/bomb-map-roads.js';
import {toLngLat,toLocal} from '../dist/walk-core.js';
import {boxMesh,combineMeshes} from './bomb-cut-fixtures.mjs';
const close=(a,b,e=1e-4)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`),impact=[0,0,100,70];
const field=new CraterField([impact]);close(field.offset(0,0),-20);close(field.offset(100,0),0);close(field.offset(101,0),0);close(field.gradient(0,0)[0],0);close(field.gradient(100,0)[0],0);close(field.offset(50,0),-20*(1-.25)**2);
for(let x=0;x<100;x+=2)assert(field.offset(x+1,0)>=field.offset(x,0),'The bowl rises continuously to its rim');
close(new CraterField([impact,impact]).offset(0,0),-40);
const mixedDepths=new CraterField([[0,0,100,70,5],[0,0,100,70,30],[0,0,100,70,0]]);close(mixedDepths.offset(0,0),-35);assert.equal(mixedDepths.index.entries.size,1);
const noDig=new CraterField([[0,0,100,70,0]]);close(noDig.offset(0,0),0);assert.equal(noDig.index.entries.size,0);assert.equal(noDig.impacts.length,1,'Disabling excavation preserves destruction events');
const overlap=new CraterField([impact,[30,0,100,70]]);close(overlap.offset(0,0),-20-20*(1-.09)**2);close(overlap.offset(30,0),overlap.offset(0,0));
saveScorches([impact]);assert.deepEqual(readScorches(),[impact]);close(terrainHeight(0,0)-terrainBaseHeight(0,0),-20);close(flightTerrainHeight(0,0),-20);
const revision=terrainCraterRevision();saveScorches([impact]);assert.equal(terrainCraterRevision(),revision);
const once=terrainTile([-64,-64,64,64]);saveScorches([[0,0,100,70,80]]);assert.equal(terrainTile([-64,-64,64,64]).length,once.length,'Configured depth does not increase polygon count');close(terrainHeight(0,0),-80);saveScorches(Array.from({length:25},()=>impact));const many=terrainTile([-64,-64,64,64]);assert.equal(many.length,once.length,'Repeated hits keep exactly the same polygon count');close(terrainHeight(0,0),-500);assert.equal(terrainCraterField().index.entries.size,1,'Coincident impacts share one spatial record');
saveScorches([]);const blastScars=new BombScorches(null,{marks:[]}),bombs=new HighwindBombs({config:{...BOMB_DEFAULTS,dureeRechargeSecondes:0},groundHeight:p=>terrainHeight(...p),onImpact:b=>blastScars.add(b.position,b.radius,b.damageRadius,b.craterDepth,b.craterRadius)}),ship={enabled:true,residency:{data:{}},pose:{position:{x:0,y:0,z:90},angleDegres:0,longueurMetres:150,pitch:0}};
let dug=0;for(let n=1;n<=3;n++){const added=20/(1+BOMB_DEFAULTS.attenuationCreusementRepete*dug/20);assert(bombs.drop(ship));for(let j=0;j<3000&&bombs.impacts<n;j++)bombs.tick(.01);assert.equal(bombs.impacts,n);dug+=added;close(terrainHeight(0,0),-dug);assert.equal(bombs.craters.length,n);assert.equal(readScorches().length,n);}
const saved=readScorches();saveScorches([]);saveScorches(saved);close(terrainHeight(0,0),-dug);
saveScorches(Array.from({length:1000},()=>impact));const encoding=mapDEMEncoding(),encoded=mapDEMValue(-20000,encoding);assert(encoded>=0&&encoded<2**24);close(mapDEMHeight(-20000,encoding),-20000,.01);saveScorches([impact]);

// Existing ground density is sufficient for the normal 200 m crater: no new
// triangles are required. Small impacts refine a local patch, not the city.
const big=terrainTile([-64,-64,64,64]);assert.equal(big.length/33,512);
for(let i=0;i<big.length;i+=11){close(big[i+2],terrainHeight(big[i],big[i+1])-.025);close(Math.hypot(...big.subarray(i+3,i+6)),1);}
setTerrainImpacts([[0,0,4,4]]);const small=terrainTile([-64,-64,64,64]),smallTriangles=small.length/33;
assert(smallTriangles>512&&smallTriangles<1000,`Local low-poly refinement: ${smallTriangles} triangles`);
setTerrainImpacts([[64,0,4,4]]);const west=terrainTile([-64,-64,64,64]),east=terrainTile([64,-64,192,64]),border=v=>{const points=new Map();for(let i=0;i<v.length;i+=11)if(Math.abs(v[i]-64)<1e-4)points.set(v[i+1].toFixed(4),v[i+2]);return points;};assert.deepEqual(border(west),border(east),'Adjacent tiles keep a continuous rim and bottom');

saveScorches([impact]);const index={materials:[{kind:6},{kind:0}]},node={file:'roads/tile.bin',bounds:[-30,-5,30,5]},ground=boxMesh(-30,-5,30,5,{bottom:0,top:.035,material:0}),building=boxMesh(-10,-10,10,10,{material:1}),mixed=combineMeshes(ground,building),mixedNode={file:'detail/test.bin',bounds:[-30,-10,30,10]};
const deformed=finishGeometry(prepareCraterGeometry(mixed,mixedNode,index));
const surviving=deformed.ranges.find(([id])=>id===1);assert.deepEqual(deformed.vertices.slice(surviving[1]*11,(surviving[1]+surviving[2])*11),building.vertices,'Ground damage never bends a surviving building');
for(const [id,first,count] of deformed.ranges)if(id===0)for(let at=first*11;at<(first+count)*11;at+=11)assert(deformed.vertices[at+2]<-10,'No floating road remains at the former height');
const crossing=boxMesh(-120,-5,120,5,{bottom:0,top:.035,material:0}),cutRoad=finishGeometry(cutBombRoads(crossing,[impact]));assert(cutRoad.vertices.length>0);assert(cutRoad.ranges.some(([id])=>id==='bomb-road-cut'));
for(let at=0;at<cutRoad.vertices.length;at+=11)assert(Math.hypot(cutRoad.vertices[at],cutRoad.vertices[at+1])>=70-1e-3,'Road vertices inside the blast are removed');
const cutCollision=collisionGeometry(cutRoad.vertices);assert.equal(surfaceHeights([0,0],cutCollision.surfaces).length,0);assert(surfaceHeights([-100,0],cutCollision.surfaces).length>0&&surfaceHeights([100,0],cutCollision.surfaces).length>0,'Both exterior ends survive');
assert.deepEqual(finishGeometry(cutBombRoads(crossing,[impact,impact])).vertices,cutRoad.vertices);
const grass=boxMesh(-120,10,120,20,{bottom:0,top:.04,material:1}),detailedRoad=combineMeshes(crossing,grass),detailedIndex={materials:[{kind:6},{kind:8}]};
const detailedCut=finishGeometry(prepareBombGeometry(detailedRoad,{file:'detail/test.bin',bounds:[-120,-5,120,20]},[impact],detailedIndex));
assert.equal(surfaceHeights([0,0],collisionGeometry(detailedCut.vertices).surfaces).length,0,'Roads inside detailed models are also destroyed');
const grassRange=detailedCut.ranges.find(([id])=>id===1);assert.deepEqual(detailedCut.vertices.slice(grassRange[1]*11,(grassRange[1]+grassRange[2])*11),grass.vertices,'Grass remains as deformable ground');
const crateredRoad=finishGeometry(prepareCraterGeometry(detailedCut,{file:'detail/test.bin'},detailedIndex));
for(const [id,first,count] of crateredRoad.ranges)if(id==='bomb-road-cut')for(let at=first*11;at<(first+count)*11;at+=11)assert(crateredRoad.vertices[at+2]<-4,'New road edges descend with the crater');
const feature=(type,coordinates,properties={group:'road'})=>({type:'Feature',properties,geometry:{type,coordinates}}),line=feature('LineString',[[-120,0],[120,0]].map(toLngLat)),water=feature('LineString',line.geometry.coordinates,{group:'water'}),polygon=feature('Polygon',[[[-120,-5],[120,-5],[120,5],[-120,5],[-120,-5]].map(toLngLat)]);
const mapCut=cutMapRoadFeatures({type:'FeatureCollection',features:[line,water,polygon]},[impact,impact]);
assert.equal(mapCut.features[0].geometry.coordinates.length,2,'Vector roads retain both exterior ends');assert.equal(mapCut.features[1],water);
for(const point of mapCut.features[0].geometry.coordinates.flat())assert(Math.hypot(...toLocal(point))>=69.999);
for(const point of mapCut.features[2].geometry.coordinates.flat(2))assert(Math.hypot(...toLocal(point))>=69.999);
const ring=(a,b)=>[[a,a],[b,a],[b,b],[a,b],[a,a]].map(toLngLat),courtyard=feature('Polygon',[ring(-120,120),ring(-100,100)]),holeCut=cutMapRoadFeatures({type:'FeatureCollection',features:[courtyard]},[impact]);
const area=holeCut.features[0].geometry.coordinates.reduce((sum,[ring])=>{const [a,b,c]=ring.map(toLocal);return sum+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);close(area,240**2-200**2,.1);
let body={position:[0,0],feet:0,verticalSpeed:0,grounded:true};for(let i=0;i<400;i++)body=advancePlayer(body,0,0,1/60,{groundHeight:p=>terrainHeight(...p),segments:[],surfaces:[]});close(body.feet,-20);assert(body.grounded);

// Real update pipeline: already resident road geometry and the ground tile
// rebuild after an impact, using the shared preparation budget and collisions.
saveScorches([]);const base={...ground,collision:collisionGeometry(ground.vertices)},gl=new Proxy({createVertexArray:()=>({}),createBuffer:()=>({})},{get:(o,k)=>o[k]??(()=>{})});
const preparation=new WalkPreparation({budget:()=>0}),renderer=Object.assign(Object.create(WalkRenderer.prototype),{gl,index,preparation,errors:0,bombs:{craters:[],affects:()=>false}});
Object.assign(node,{mesh:base,collision:base.collision,ranges:base.ranges,gpu:{},hasGround:true,bombImpactCount:0,terrainRevision:terrainCraterRevision(),controller:new AbortController()});
const tile={bounds:[-64,-64,64,64],gpu:{},terrainRevision:terrainCraterRevision(),controller:new AbortController()};saveScorches([impact]);renderer.ensureBombDamage(node);renderer.ensureTerrainTile(tile);await new Promise(resolve=>setTimeout(resolve,50));assert.equal(renderer.errors,0);assert.equal(node.terrainRevision,terrainCraterRevision());assert.equal(tile.terrainRevision,terrainCraterRevision());assert(node.collision.surfaces.every(s=>s.p.every(p=>p[2]<-10)));assert.equal(tile.gpu.count,512*3);
saveScorches([]);renderer.ensureBombDamage(node);renderer.ensureTerrainTile(tile);await new Promise(resolve=>setTimeout(resolve,50));assert(node.collision.surfaces.some(s=>s.p.some(p=>p[2]>0)));preparation.dispose();

// Shared map DEM samples and map road heights retain their existing clearance.
await loadTerrain({fetchBuffer:async url=>{const b=await fs.readFile('dist/'+url.slice(2));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
saveScorches([impact]);const road=prepareMapRoads(crossing.vertices,crossing.ranges);assert(road.vertices.length>0);
for(let at=0;at<road.vertices.length;at+=11){const p=road.vertices.subarray(at,at+3),baseZ=p[2]-mapGroundHeight(p[0],p[1]);assert(baseZ>=.049&&baseZ<=.086,'Roads follow the depressed map DEM');}
close(terrainHeight(0,0)-terrainBaseHeight(0,0),-20);assert(mapGroundHeight(0,0)<terrainBaseHeight(0,0)-19.7);
saveScorches(Array.from({length:25},()=>impact));assert.equal(prepareMapRoads(crossing.vertices,crossing.ranges).vertices.length,road.vertices.length,'Map roads also keep a fixed mesh under repeated digging');saveScorches([impact]);
const snapshot=terrainTile([-64,-64,64,64]);saveScorches([]);saveScorches([impact]);assert.deepEqual(terrainTile([-64,-64,64,64]),snapshot,'Reloading reconstructs identical tile geometry');

// Existing scorch decals are invalidated as soon as another bowl changes their
// supporting terrain. The same current-session impacts feed both systems.
let released=0;const scars=new BombScorches({...gl,deleteBuffer:()=>released++,deleteVertexArray(){}},{marks:[impact]});scars.cache.set(0,{buffer:{},vao:{}});scars.marks=[];scars.draw([],[]);assert.equal(released,1);
saveScorches([]);close(terrainHeight(0,0),terrainBaseHeight(0,0));
console.log(JSON.stringify({terrainCraters:'passed',city:CITY.id,width:200,depthPerHit:20,segmentsAcross:CRATER_SEGMENTS_ACROSS,normalTileTriangles:big.length/33,smallImpactTileTriangles:smallTriangles,repeatedHitsKeepPolygonCount:true,roadsCut:true,tileSeams:true,roadCollisions:true,mapDEM:true,sessionReplay:true,scorchInvalidation:true}));
