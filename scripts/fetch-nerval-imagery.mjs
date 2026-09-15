import fs from 'node:fs/promises';
import {sourceURL as imageryURL} from './ign-source.mjs';
const z=19,n=2**z;
const tile=([lng,lat])=>[(lng+180)/360*n,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n];
const nw=tile([4.3796,48.94885]).map(Math.floor),se=tile([4.3830,48.94615]).map(Math.floor);
await fs.mkdir('.cache/nerval-ign',{recursive:true});
const jobs=[];for(let y=nw[1];y<=se[1];y++)for(let x=nw[0];x<=se[0];x++)jobs.push({x,y});
let done=0;
for(let i=0;i<jobs.length;i+=4){
 await Promise.all(jobs.slice(i,i+4).map(async({x,y})=>{
  const file=`.cache/nerval-ign/${x}-${y}.jpg`;
  try{await fs.access(file);}catch{const r=await fetch(imageryURL(z,x,y));if(!r.ok)throw Error(`IGN ${r.status}`);await fs.writeFile(file,new Uint8Array(await r.arrayBuffer()));}
  done++;
 }));
 await new Promise(resolve=>setTimeout(resolve,450));
}
await fs.writeFile('.cache/nerval-ign/index.json',JSON.stringify({z,nw,se,tiles:done,source:'IGN BD ORTHO, ORTHOIMAGERY.ORTHOPHOTOS',license:'Licence Ouverte 2.0',fetchedAt:new Date().toISOString()}));
console.log(JSON.stringify({tiles:done,nw,se}));
