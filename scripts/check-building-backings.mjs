import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise the real map synchronization against every building's catalogue
// assignment, including the zoom threshold and the untextured map mode.
const app=await fs.readFile('dist/app.js','utf8');
const buildings=JSON.parse(await fs.readFile('dist/data/buildings.geojson')).features;
const assignments=JSON.parse(await fs.readFile('dist/data/facades/assignments.json'));
const nerval=JSON.parse(await fs.readFile('dist/data/nerval/index.json'));
const attila=JSON.parse(await fs.readFile('dist/data/attila/index.json'));
const textured=new Set(assignments.buildings.map(b=>b.id));
const detailed=new Set([...nerval.excludeIds,...attila.excludeIds]);
let filter,zoom=15,updates=0,visibility='visible';
const context=vm.createContext({initialized:true,photoMode:true,nervalLayer:{index:nerval},attilaLayer:{index:attila},$(){return {checked:true};},map:{
 getZoom:()=>zoom,getFilter:()=>filter,setFilter:(id,value)=>{assert.equal(id,'buildings-3d');filter=value;updates++;},
 getLayoutProperty:()=>visibility,setLayoutProperty:(id,key,value)=>{visibility=value;}
}});
for(const name of ['syncDetailedExclusions','syncBuildingVisibility']){
 const source=app.match(new RegExp('function '+name+'\\(\\)\\{[\\s\\S]*?\\n\\}'))?.[0];assert(source);vm.runInContext(source,context);
}
function evaluate(e,p){if(!Array.isArray(e))return e;const [op,...args]=e;
 if(op==='all')return args.every(a=>evaluate(a,p));if(op==='!')return !evaluate(args[0],p);
 if(op==='get')return p[args[0]];if(op==='literal')return args[0];
 if(op==='in')return evaluate(args[1],p).includes(evaluate(args[0],p));throw Error(op);
}
vm.runInContext('syncBuildingVisibility()',context);
assert.equal(visibility,'visible','The custom facade layer must keep its visibility signal');
let removed=0;
for(const b of buildings){const id=b.properties.osm_id,shown=evaluate(filter,b.properties);
 if(textured.has(id)){assert(!shown,'Solid duplicate remains: '+id);removed++;}
 else if(!detailed.has(id))assert(shown,'An untextured building lost its only wall: '+id);
 else assert(!shown,'Detailed OSM duplicate: '+id);
}
assert.equal(removed,textured.size);
vm.runInContext('syncBuildingVisibility()',context);assert.equal(updates,1,'Camera movement must not reset unchanged filters');
zoom=13.9;vm.runInContext('syncBuildingVisibility()',context);
for(const b of buildings)assert.equal(evaluate(filter,b.properties),!detailed.has(b.properties.osm_id));
zoom=15;context.photoMode=false;vm.runInContext('syncBuildingVisibility()',context);
for(const b of buildings)assert.equal(evaluate(filter,b.properties),!detailed.has(b.properties.osm_id));
context.photoMode=true;vm.runInContext('syncBuildingVisibility()',context);
assert(!evaluate(filter,buildings.find(b=>textured.has(b.properties.osm_id)).properties));
console.log(JSON.stringify({backings:'passed',texturedBuildings:removed,detailedBuildings:detailed.size,coverage:'every building',zoomAndPhotoTransitions:true}));
