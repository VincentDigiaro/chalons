import fs from 'node:fs/promises';
import {sourceURL} from './ign-source.mjs';
const z=19,n=2**z;
const tile=([x,y])=>[(x+180)/360*n,(1-Math.asinh(Math.tan(y*Math.PI/180))/Math.PI)/2*n];
const nw=tile([4.3720,48.9656]).map(Math.floor),se=tile([4.3734,48.96475]).map(Math.floor);
const dir='.cache/attila-ign';await fs.mkdir(dir,{recursive:true});
for(let y=nw[1];y<=se[1];y++)for(let x=nw[0];x<=se[0];x++){
 const f=`${dir}/${x}-${y}.jpg`;try{await fs.access(f);}catch{const r=await fetch(sourceURL(z,x,y));if(!r.ok)throw Error(`IGN ${r.status}`);await fs.writeFile(f,new Uint8Array(await r.arrayBuffer()));}
}
await fs.writeFile(dir+'/index.json',JSON.stringify({z,nw,se,source:'IGN BD ORTHO',fetchedAt:new Date().toISOString()}));console.log({nw,se});
