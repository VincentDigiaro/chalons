import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {MAP_BUILDINGS_MIN_PITCH,mapBuildingsVisible,overviewCamera,directHighwindEntry,preserveMapCamera} from '../dist/map-view.js';
import {CITIES} from '../dist/city-config.js';
import {mapDEMValue,mapDEMHeight,MAP_DEM_ZOOM,MAP_DEM_SIZE,mapGroundHeight} from '../dist/terrain-map.js';
import {loadTerrain,terrainLngLat,drapeVertices} from '../dist/terrain.js';
import {toLocal} from '../dist/walk-core.js';
import {prepareMapRoads} from '../dist/map-roads.js';

assert.equal(MAP_BUILDINGS_MIN_PITCH,.9);
for(const pitch of [0,.01,.899,.9,1,45,84])assert.equal(mapBuildingsVisible({getPitch:()=>pitch}),pitch>=.9);
for(const city of Object.values(CITIES)){const view=overviewCamera(city);assert.equal(view.pitch,0);assert.equal(view.zoom,10.4);assert(city.bounds[0][0]<view.center[0]&&view.center[0]<city.bounds[1][0]);}
assert(directHighwindEntry('?ship=highwind','',{present:true}));assert(directHighwindEntry('?fps=1&ship=highwind&ville=nice','',{present:true}));
for(const hash of ['#overview','#walk-return=4.37,48.95'])assert(!directHighwindEntry('?ship=highwind',hash,{present:true}));
assert(!directHighwindEntry('?fps=1','',{present:true}));assert(!directHighwindEntry('?ship=highwind','',{present:false}));

// Changing FOV must restore the measured camera, including elevation and roll.
const eye={position:[4.37,48.95],height:350,bearing:31,pitch:52,roll:3},calls=[];
const map={transform:{getCameraLngLat:()=>({toArray:()=>eye.position}),getCameraAltitude:()=>eye.height},getBearing:()=>eye.bearing,getPitch:()=>eye.pitch,getRoll:()=>eye.roll,getMaxPitch:()=>80,getMaxZoom:()=>22,
 stop:()=>calls.push('stop'),setMaxPitch:n=>assert.equal(n,84),setVerticalFieldOfView:n=>{assert.equal(n,65);calls.push('fov');},calculateCameraOptionsFromCameraLngLatAltRotation:(...args)=>{assert.deepEqual(args,[eye.position,350,31,52,3]);calls.push('solve');return {zoom:23};},setMaxZoom:n=>assert.equal(n,23),jumpTo:c=>{assert.equal(c.zoom,23);calls.push('restore');}};
assert.deepEqual(preserveMapCamera(map,65),eye);assert.deepEqual(calls,['stop','fov','solve','restore']);

await loadTerrain({fetchBuffer:async url=>{const b=await fs.readFile('dist/'+url.slice(2));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});
// DEM byte coefficients must decode the same centimetre sample used by roads.
for(const h of [-190.345,0,.035,27.582,415.37]){const n=mapDEMValue(h),decoded=(n>>16)*655.36+((n>>8)&255)*2.56+(n&255)*.01-10000;assert(Math.abs(decoded-h)<=.00501);assert(Math.abs(decoded-mapDEMHeight(h))<1e-9);}
const n=2**MAP_DEM_ZOOM*MAP_DEM_SIZE,col=Math.floor((4.43+180)/360*n),row=Math.floor((1-Math.asinh(Math.tan(48.96*Math.PI/180))/Math.PI)/2*n);
for(const [a,b] of [[0,0],[.5,.5],[.19,.73]]){const lng=(col+a)/n*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(row+b)/n)))*180/Math.PI,sample=(x,y)=>mapDEMHeight(terrainLngLat((col+x)/n*360-180,Math.atan(Math.sinh(Math.PI*(1-2*(row+y)/n)))*180/Math.PI));const expected=(1-b)*((1-a)*sample(0,0)+a*sample(1,0))+b*((1-a)*sample(0,1)+a*sample(1,1));assert(Math.abs(mapGroundHeight(...toLocal([lng,lat]))-expected)<1e-6);}
const mesh=new Float32Array([[0,0],[3,0],[0,3]].flatMap(([x,y])=>[x,y,.035,0,0,1,x,y,1,1,1])),copy=mesh.slice(),fps=drapeVertices(mesh.slice()),roads=prepareMapRoads(mesh,[[0,0,3]]);
assert.deepEqual(mesh,copy,'Never modify source geometry');assert.equal(roads.ranges[0][0],0);
for(let i=0;i<roads.vertices.length;i+=11)assert(Math.abs(roads.vertices[i+2]-mapGroundHeight(roads.vertices[i],roads.vertices[i+1])-.085)<.001);
assert(fps.every(Number.isFinite));

// MapLibre 5.6: a tilted view can select a z19 image at covering zoom 18.
// A z19 tile has one overzoomed child; the old code tried to read four.
const vendor=await fs.readFile('dist/vendor/maplibre-gl.js','utf8'),start=vendor.indexOf('_updateRetainedTiles(e,t){'),end=vendor.indexOf('_updateLoadedParentTileCache()',start);
assert(start>0&&end>start);const method=Function('xe','return ({'+vendor.slice(start,end)+'})._updateRetainedTiles')({maxOverzooming:10,maxUnderzooming:3});
const child={key:'child'},tile={key:'parent',canonical:{z:19},overscaledZ:19,children:()=>[child]};
const cache={_source:{minzoom:0,maxzoom:19},_tiles:{parent:{hasData:()=>false}},_addTile:()=>({hasData:()=>false}),_retainLoadedChildren:(_a,_b,_c,retain)=>{retain.child=child;},getTile:()=>({hasData:()=>true})};
assert.deepEqual(Object.keys(method.call(cache,[tile],18)).sort(),['child','parent']);
console.log(JSON.stringify({mapView:'passed',verticalThreshold:.9,overview:true,directFlight:true,cameraOriginPreserved:true,centimetreDEM:true,matchingDEMSamples:true,mapRoadClearance:true,maplibreTiltedTileRegression:true}));
