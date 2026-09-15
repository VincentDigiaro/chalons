// Measure real loader concurrency with controlled responses and isolated JSON files.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FPS_CONFIG} from '../dist/walk-config.js';
import {WalkRenderer} from '../dist/walk-renderer.js';

if(!process.argv.includes('--probe')){
 const root=fileURLToPath(new URL('..',import.meta.url)),parent=path.join(root,'artifacts/fps-concurrency/tests');
 await fs.mkdir(parent,{recursive:true});
 const temp=await fs.mkdtemp(path.join(parent,'variant-'));
 await fs.mkdir(path.join(temp,'dist'));await fs.mkdir(path.join(temp,'scripts'));
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 for(const name of await fs.readdir(path.join(root,'dist')))if(name.endsWith('.js'))await fs.copyFile(path.join(root,'dist',name),path.join(temp,'dist',name));
 await fs.copyFile(fileURLToPath(import.meta.url),path.join(temp,'scripts/check-walk-concurrency.mjs'));
 for(const [geometry,textures] of [[1,1],[3,2],[12,9],[2,11],[8,6]]){
  await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify({...FPS_CONFIG,chargementsGeometrieSimultanes:geometry,chargementsTexturesSimultanes:textures}));
  console.log(execFileSync(process.execPath,['scripts/check-walk-concurrency.mjs','--probe'],{cwd:temp,encoding:'utf8'}).trim());
 }
}else{
 const limits={geometry:FPS_CONFIG.chargementsGeometrieSimultanes,textures:FPS_CONFIG.chargementsTexturesSimultanes};
 const count=25,pending={geometry:[],textures:[]},started={geometry:0,textures:0},peaks={geometry:0,textures:0};
 let handle=0;
 const gl=new Proxy({}, {get(target,key){
  if(key in target)return target[key];
  if(/^[A-Z_0-9]+$/.test(key))return target[key]=++handle;
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(key==='getExtension')return ()=>null;
  if(key.startsWith('create'))return ()=>++handle;
  return ()=>{};
 }});
 globalThis.matchMedia=()=>({matches:false});
 globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
 const vertices=new Float32Array([[0,0,0],[1,0,0],[0,1,0]].flatMap(p=>[...p,0,0,1,0,0,1,1,1]));
 let header=JSON.stringify({cityRoads:true,ranges:[[0,0,3]]});header+=' '.repeat((4-header.length%4)%4);
 const buffer=Buffer.alloc(4+header.length+vertices.byteLength);buffer.writeUInt32LE(header.length);buffer.write(header,4);Buffer.from(vertices.buffer).copy(buffer,4+header.length);
 globalThis.fetch=(url,{signal}={})=>{
  // Sky resources have their own loader and are outside these two queues.
  if(!String(url).startsWith('./data/walk/probe/'))return Promise.resolve(new Response('',{status:404}));
  return new Promise((resolve,reject)=>{
  const type=String(url).endsWith('.bin')?'geometry':'textures';
  const abort=()=>reject(new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  pending[type].push(()=>{signal?.removeEventListener('abort',abort);resolve(new Response(type==='geometry'?buffer:'image'));});
  started[type]++;peaks[type]=Math.max(peaks[type],pending[type].length);
  assert(pending[type].length<=limits[type],`${type}: JSON concurrency exceeded`);
  });
 };
 const renderer=new WalkRenderer({getContext:()=>gl});
 renderer.index={materials:[{kind:2}],cityRoadMaterialBase:0};
 const turn=()=>new Promise(resolve=>setImmediate(resolve));
 const until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await turn();assert(predicate(),'Loader did not settle');};
 try{
  for(let i=0;i<count;i++)renderer.nodes.set(String(i),{file:`probe/${i}.bin`,bounds:[0,0,1,1],controller:new AbortController()});
  renderer.pump();
  for(let i=0;i<count;i++)renderer.texture(`probe/${i}.webp`);
  for(const type of ['geometry','textures'])assert.equal(pending[type].length,limits[type],`${type}: JSON must set the actual number of requests`);
  assert.equal(renderer.queue.length,count-limits.geometry);
  assert.equal(renderer.textureQueue.length,count-limits.textures);
  pending.geometry.shift()();
  await until(()=>started.geometry===limits.geometry+1);
  assert.equal([...renderer.nodes.values()].filter(n=>n.gpu).length,1);
  assert.equal(pending.geometry.length,limits.geometry,'A completed mesh immediately frees one slot');
  assert.equal(started.textures,limits.textures,'Geometry completion does not alter the texture limit');
  pending.textures.shift()();
  await until(()=>started.textures===limits.textures+1);
  assert.equal([...renderer.textures.values()].filter(t=>t.gpu).length,1);
  assert.equal(pending.textures.length,limits.textures,'A completed texture immediately frees one slot');
  for(let wave=0;renderer.active||renderer.textureActive;wave++){
   assert(wave<count+5,'Queues failed to drain');
   for(const type of ['geometry','textures'])for(const finish of pending[type].splice(0))finish();
   await turn();
  }
  assert.equal(renderer.queue.length,0);assert.equal(renderer.textureQueue.length,0);
  assert.equal([...renderer.nodes.values()].filter(n=>n.gpu).length,count);
  assert.equal([...renderer.textures.values()].filter(t=>t.gpu).length,count);
  assert.equal(renderer.errors,0);assert.deepEqual(peaks,limits);
  assert.deepEqual(started,{geometry:count,textures:count});
  console.log(JSON.stringify({jsonLimits:limits,measuredPeaks:peaks,loadedEach:count,slotRefill:'passed'}));
 }finally{renderer.dispose();await turn();}
}
