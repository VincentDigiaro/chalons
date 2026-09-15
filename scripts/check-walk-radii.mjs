// Test unequal JSON radii through the real loader, eviction and draw path.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FPS_CONFIG} from '../dist/walk-config.js';
import {WalkRenderer} from '../dist/walk-renderer.js';
import {viewProjection,tileAt,tileBounds} from '../dist/walk-core.js';
import {frustumPlanes,inFrustum} from '../dist/walk-visibility.js';

if(!process.argv.includes('--probe')){
 const root=fileURLToPath(new URL('..',import.meta.url));
 const parent=path.join(root,'artifacts/fps-radii/tests');await fs.mkdir(parent,{recursive:true});
 const temp=await fs.mkdtemp(path.join(parent,'variant-'));await fs.mkdir(path.join(temp,'dist'));await fs.mkdir(path.join(temp,'scripts'));
 await fs.writeFile(path.join(temp,'package.json'),'{"type":"module"}');
 for(const name of await fs.readdir(path.join(root,'dist')))if(name.endsWith('.js'))await fs.copyFile(path.join(root,'dist',name),path.join(temp,'dist',name));
 await fs.copyFile(fileURLToPath(import.meta.url),path.join(temp,'scripts/check-walk-radii.mjs'));
 for(const [buildings,ground,roads] of [[240,480,900],[900,240,480],[480,900,240],[0,0,0]]){
  const config={...FPS_CONFIG,rayonChargementBatimentsMetres:buildings,rayonChargementSolMetres:ground,rayonChargementRoutesMetres:roads,debutBrouillardMetres:125.25,finBrouillardMetres:975.75};
  await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify(config));
  console.log(execFileSync(process.execPath,['scripts/check-walk-radii.mjs','--probe'],{cwd:temp,encoding:'utf8'}).trim());
 }
}else{
 const buildings=FPS_CONFIG.rayonChargementBatimentsMetres,ground=FPS_CONFIG.rayonChargementSolMetres,roads=FPS_CONFIG.rayonChargementRoutesMetres;
 const radii={buildings,ground,roads},calls=[],uniforms={},sources=[],requests=[];let handle=0,boundVAO;
 const gl=new Proxy({}, {get(target,key){
  if(key in target)return target[key];
  if(/^[A-Z_0-9]+$/.test(key))return target[key]=++handle;
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(key==='getExtension')return ()=>null;
  if(key==='getUniformLocation')return (program,name)=>name;
  if(key==='shaderSource')return (shader,source)=>sources.push(source);
  if(['uniform1i','uniform1f','uniform2f'].includes(key))return (name,...values)=>{uniforms[name]=values;};
  if(key==='bindVertexArray')return vao=>{boundVAO=vao;};
  if(key==='drawArrays')return ()=>calls.push({vao:boundVAO,radius:uniforms.u_load_radius?.[0],fog:uniforms.u_fog});
  if(key.startsWith('create'))return ()=>++handle;
  return ()=>{};
 }});
 const nodes=['buildings','roads'].flatMap(type=>[100,350,650,850,1100].map(y=>[`${type}/${y}.bin`,-1,y,1,y+1]));
 globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=1;
 globalThis.fetch=async url=>{
  const file=String(url).replace('./data/walk/',''),record=nodes.find(n=>n[0]===file);
  if(!record)return new Response('',{status:404});
  requests.push(file);
  const y=record[2],vertices=new Float32Array([[-1,y,0],[1,y,0],[0,y+1,2]].flatMap(p=>[...p,0,0,1,0,0,1,1,1]));
  let json=JSON.stringify({ranges:[[0,0,3]],cityRoads:file.startsWith('roads/')});json+=' '.repeat((4-json.length%4)%4);
  const buffer=Buffer.alloc(4+json.length+vertices.byteLength);buffer.writeUInt32LE(json.length);buffer.write(json,4);Buffer.from(vertices.buffer).copy(buffer,4+json.length);
  return new Response(buffer);
 };
 const renderer=new WalkRenderer({clientWidth:800,clientHeight:600,getContext:()=>gl});
 // Record aerial texture scheduling without downloading imagery.
 renderer.pumpTextures=()=>{};
 renderer.index={nodes,materials:[{kind:2}],cityRoadMaterialBase:0,facadeBase:100,roofBase:200};
 const expectedAt=p=>nodes.filter(([file,w,s,e,n])=>Math.hypot(Math.max(Math.abs(w-p[0]),Math.abs(e-p[0])),Math.max(Math.abs(s-p[1]),Math.abs(n-p[1])))<=radii[file.split('/')[0]]).map(n=>n[0]).sort();
 const settle=async()=>{for(let i=0;renderer.active||renderer.queue.length;i++){assert(i<100,'Loader did not finish');await new Promise(resolve=>setTimeout(resolve,5));}};
 renderer.refresh([0,0]);await settle();
 assert.deepEqual(requests.sort(),expectedAt([0,0]),'Request each asset using its own category radius');
 assert.equal(renderer.errors,0);
 const [tx,ty]=tileAt([0,0],18);const expectedPhotos=[],expectedGround=[];
 for(let x=tx-12;x<=tx+12;x++)for(let y=ty-12;y<=ty+12;y++){
  const [w,s,e,n]=tileBounds(18,x,y),key=`ign/18/${x}/${y}`;
  if(Math.hypot(Math.max(w,0,-e),Math.max(s,0,-n))<ground)expectedGround.push(key);
  if(ground>0&&Math.hypot(Math.max(Math.abs(w),Math.abs(e)),Math.max(Math.abs(s),Math.abs(n)))<=ground)expectedPhotos.push(key);
 }
 assert.deepEqual([...renderer.ground.keys()].sort(),expectedGround.sort());
 assert.deepEqual([...renderer.textures.keys()].sort(),expectedPhotos.sort(),'Photo downloads only depend on the ground radius');
 renderer.draw([0,0],1.4,0,0);
 assert(sources.some(s=>s.includes('visibilityDistance>u_load_radius')&&s.includes('smoothstep(u_fog.x,u_fog.y,distance)')));
 for(const node of renderer.nodes.values()){
  const draws=calls.filter(c=>c.vao===node.gpu.vao);assert(draws.length>0,'Longer-radius assets must survive camera clipping');
  assert(draws.every(c=>c.radius===radii[node.file.split('/')[0]]));
 }
 const groundVAOs=new Set([...renderer.ground.values()].map(t=>t.gpu.vao));
 const groundDraws=calls.filter(c=>groundVAOs.has(c.vao));if(ground>0)assert(groundDraws.length>0);
 assert(groundDraws.every(c=>c.radius===ground));
 assert.deepEqual(uniforms.u_fog,[125.25,975.75],'Fog remains independent and preserves decimal settings');
 calls.length=0;const distantCamera=[0,-2000],shipCenter=[0,0];renderer.draw(distantCamera,300,0,0,null,shipCenter);
 assert.deepEqual(uniforms.u_player,distantCamera,'Projection and fog retain the real camera position');
 assert.deepEqual(uniforms.u_visibility_center,shipCenter,'The visible radius follows the ship center instead of its chase camera');
 for(const node of renderer.nodes.values())assert(calls.some(c=>c.vao===node.gpu.vao),'Ship-centered assets remain submitted with a distant chase camera');
 assert.deepEqual(renderer.getState().radii,radii);
 if(Math.max(buildings,ground,roads)>0){const d=Math.max(buildings,ground,roads)-2;assert(inFrustum([-1,d,1,d+1],[0,2],frustumPlanes(viewProjection([0,0,1.4],0,0,4/3))));}
 const p=[0,700];renderer.trim(p);
 assert.deepEqual([...renderer.nodes.keys()].sort(),expectedAt([0,0]).filter(file=>expectedAt(p).includes(file)),'Evict each category independently on movement');
 renderer.refresh(p);await settle();assert.deepEqual([...renderer.nodes.keys()].sort(),expectedAt(p));assert.equal(renderer.getState().outsideRadius,0);
 renderer.dispose();console.log(JSON.stringify({radii,requestsAndEviction:'passed',perDrawClipping:'passed',groundPhotos:'passed',fog:'independent'}));
}
