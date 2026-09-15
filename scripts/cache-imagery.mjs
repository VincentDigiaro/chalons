import fs from 'node:fs/promises';
import path from 'node:path';
import {createImageryCache,isJPEG} from './imagery-cache.mjs';
import {IMAGERY_BOUNDS,tilePoint,IGN_SOURCE} from './ign-source.mjs';

const cache=createImageryCache(),jobs=new Map();
const add=(z,x,y)=>jobs.set(`${z}/${x}/${y}`,[z,x,y]);
function area([w,s,e,n],min,max){
  for(let z=min;z<=max;z++){
    const [left,top]=tilePoint(w,n,z).map(Math.floor),[right,bottom]=tilePoint(e,s,z).map(Math.floor);
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++)add(z,x,y);
  }
}
const detail=JSON.parse(await fs.readFile('dist/data/nerval/index.json','utf8'));
const [w,s,e,n]=detail.bounds,padLat=500/111320,padLng=padLat/Math.cos((s+n)/2*Math.PI/180);
const promenade=[w-padLng,s-padLat,e+padLng,n+padLat];
area(promenade,10,19);
const roofs=JSON.parse(await fs.readFile('dist/data/roofs/index.json','utf8'));
for(const t of roofs.tiles)add(roofs.zoom,t.x,t.y);
area(IMAGERY_BOUNDS,10,15);
if(process.argv.includes('--plan')){console.log(JSON.stringify({tiles:jobs.size,promenade,overview:IMAGERY_BOUNDS,roofTiles:roofs.tiles.length}));process.exit(0);}

// Reuse originals acquired earlier while creating the Nerval model.
let imported=0;
async function seed(file,z,x,y){
  const bytes=await fs.readFile(file);if(!isJPEG(bytes))return;
  const target=path.join(cache.root,`${z}/${x}/${y}.jpg`);await fs.mkdir(path.dirname(target),{recursive:true});
  try{await fs.copyFile(file,target,fs.constants.COPYFILE_EXCL);imported++;}catch(error){if(error.code!=='EEXIST')throw error;}
}
try{for(const name of await fs.readdir('.cache/nerval-ign')){const match=name.match(/^(\d+)-(\d+)\.jpg$/);if(match)await seed(path.join('.cache/nerval-ign',name),19,...match.slice(1).map(Number));}}catch(error){if(error.code!=='ENOENT')throw error;}
try{await seed('.cache/ign/centre-sample.jpg',17,67124,45037);}catch(error){if(error.code!=='ENOENT')throw error;}
console.log(JSON.stringify({tiles:jobs.size,imported,promenade}));
let done=0,bytes=0,next=0;const tasks=[...jobs.values()],failures=[];
async function worker(){
  while(next<tasks.length){const tile=tasks[next++];try{const image=await cache.get(...tile,{offline:process.argv.includes('--offline')});bytes+=image.length;}catch(error){failures.push({tile,error:error.message});}
    done++;if(done%100===0||done===tasks.length)console.log(JSON.stringify({saved:done-failures.length,total:tasks.length,failures:failures.length,megabytes:+(bytes/1e6).toFixed(1),...cache.stats}));
  }
}
await Promise.all(Array.from({length:8},worker));
await fs.mkdir('dist/data/imagery',{recursive:true});
const manifest={source:IGN_SOURCE,license:'Licence Ouverte 2.0',saved_at:new Date().toISOString(),promenade:{bounds:promenade,minZoom:10,maxZoom:19},overview:{bounds:IMAGERY_BOUNDS,minZoom:10,maxZoom:15},roofZoom:roofs.zoom,tiles:tasks,bytes,failures};
await fs.writeFile('dist/data/imagery/saved.json',JSON.stringify(manifest));
if(failures.length)process.exitCode=1;
