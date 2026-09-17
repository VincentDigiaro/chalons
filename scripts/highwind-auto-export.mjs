import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const run=promisify(execFile),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const project=fileURLToPath(new URL('..',import.meta.url));
const exists=async file=>fs.access(file).then(()=>true,()=>false);
const failure=(status,message)=>Object.assign(Error(message),{status});
export async function findBlender(){
 if(process.env.BLENDER_BIN)return process.env.BLENDER_BIN;
 const base=path.join(process.env.ProgramFiles||'C:/Program Files','Blender Foundation');
 const folders=await fs.readdir(base).catch(()=>[]);
 for(const folder of folders.filter(n=>/^Blender \d/.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
  const exe=path.join(base,folder,'blender.exe');if(await exists(exe))return exe;
 }
 return 'blender';
}
export function createHighwindExporter({root=project,blender,log=console.log}={}){
 root=path.resolve(root);
 const pending=new Map();let queue=Promise.resolve();
 const script=path.join(root,'scripts/export-highwind-blend.py');
 async function locked(version){
  const locks=path.join(root,'artifacts/highwind-auto-export');await fs.mkdir(locks,{recursive:true});
  const lock=path.join(locks,version+'.lock'),deadline=Date.now()+210000;
  let handle;
  while(!handle){
   try{handle=await fs.open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid}));}
   catch(error){
    if(error.code!=='EEXIST')throw error;
    // Recover a lock left behind by a stopped service, without racing an active exporter.
    const owner=await fs.readFile(lock,'utf8').then(JSON.parse,()=>null).catch(()=>null);
    if(owner?.pid){try{process.kill(owner.pid,0);}catch(e){if(e.code==='ESRCH'){await fs.unlink(lock).catch(()=>{});continue;}}}
    if(Date.now()>deadline)throw failure(503,'Préparation Highwind déjà en cours ; réessayez dans un instant.');
    await delay(100);
   }
  }
  try{return await prepare(version);}finally{await handle.close();await fs.unlink(lock).catch(()=>{});}
 }
 async function prepare(version){
  const source=path.join(root,'assets/Highwind',`Highwind-${version}.blend`),output=path.join(root,'dist/data/highwind',version);
  if(!await exists(source))throw failure(404,`Fichier Highwind-${version}.blend introuvable dans assets/Highwind.`);
  const sourceHash=sha(await fs.readFile(source)),exporterHash=sha(await fs.readFile(script));
  const cached=await fs.readFile(path.join(output,'index.json'),'utf8').then(JSON.parse,()=>null);
  if(cached?.sourceSha256===sourceHash&&cached?.exporterSha256===exporterHash){
   const files=[cached.mesh,...cached.textures.map(t=>t.file)];
   if((await Promise.all(files.map(f=>exists(path.join(output,f))))).every(Boolean))return output;
  }
  const stageRoot=path.join(root,'artifacts/highwind-auto-export');await fs.mkdir(stageRoot,{recursive:true});
  const stage=await fs.mkdtemp(path.join(stageRoot,version+'-'));
  log('Préparation automatique de '+version);
  try{
   const result=await run(blender||await findBlender(),['--background','--disable-autoexec','--python-exit-code','1',source,'--python',script,'--','--output',stage],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:2*1024*1024});
   await fs.writeFile(path.join(stage,'export.log'),result.stdout+result.stderr);
   const index=JSON.parse(await fs.readFile(path.join(stage,'index.json'),'utf8'));
   if(index.sourceSha256!==sourceHash||sha(await fs.readFile(source))!==sourceHash)throw Error('Le fichier Blender a changé pendant la préparation ; rechargez la page.');
   const data=await fs.readFile(path.join(stage,index.mesh));
   if(data.length!==index.vertexCount*44||sha(data)!==index.meshSha256)throw Error('Export de géométrie invalide.');
   for(const texture of index.textures)if(sha(await fs.readFile(path.join(stage,texture.file)))!==texture.sha256)throw Error('Texture exportée invalide.');
   index.exporterSha256=exporterHash;
   const descriptor=Buffer.from(JSON.stringify(index,null,2)+'\n');
   await fs.mkdir(output,{recursive:true});
   // Replace each asset atomically and make the complete descriptor visible last.
   for(const name of [index.mesh,index.mesh+'.gz',...index.textures.map(t=>t.file)]){
    const target=path.join(output,name),temp=target+'.'+path.basename(stage)+'.tmp';
    await fs.copyFile(path.join(stage,name),temp);await fs.rename(temp,target);
   }
   for(const [name,bytes] of [['index.json.gz',gzipSync(descriptor)],['index.json',descriptor]]){
    const target=path.join(output,name),temp=target+'.'+path.basename(stage)+'.tmp';await fs.writeFile(temp,bytes);await fs.rename(temp,target);
   }
   log(`${version} prêt : ${index.vertexCount/3} triangles`);return output;
  }catch(error){
   await fs.writeFile(path.join(stage,'error.log'),String(error.stack||error)+'\n'+(error.stdout||'')+'\n'+(error.stderr||''));
   throw failure(422,`Impossible de préparer Highwind-${version}.blend. Vérifiez le modèle dans Blender ; détails dans artifacts/highwind-auto-export.`);
  }
 }
 return version=>{
  if(typeof version!=='string'||!/^v[1-9]\d*$/.test(version))return Promise.reject(failure(404,'Version Highwind invalide.'));
  if(pending.has(version))return pending.get(version);
  const result=queue.then(()=>locked(version));queue=result.catch(()=>{});pending.set(version,result);
  result.then(()=>pending.delete(version),()=>pending.delete(version));return result;
 };
}

export function highwindRequestHandler({root=project,ensure=createHighwindExporter({root})}={}){
 return async(req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return false;}
  const match=pathname.match(/^\/data\/highwind\/(v[1-9]\d*)\/([A-Za-z0-9._-]+)$/);
  if(!match)return false;
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return true;}
  const [,version,file]=match;
  try{
   if(file.startsWith('.'))throw failure(404,'Ressource Highwind introuvable.');
   // The descriptor checks the source on every page reload. Texture reads reuse it.
   const output=path.join(root,'dist/data/highwind',version);
   if(file==='index.json'||!await exists(path.join(output,'index.json')))await ensure(version);
   // dist is the public export tree. A texture from an earlier export still
   // needs to be reachable after publication, even if the new index omits it.
   // Accept regular files in this version directory, without a second asset list.
   const target=path.join(output,file),stat=await fs.lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!stat?.isFile()||stat.isSymbolicLink())throw failure(404,'Ressource Highwind introuvable.');
   const resolved=await fs.realpath(target),base=path.resolve(root,'dist/data/highwind')+path.sep;
   if(!resolved.toLowerCase().startsWith(base.toLowerCase()))throw failure(404,'Ressource Highwind introuvable.');
   const bytes=await fs.readFile(target);
   const mime={'.json':'application/json','.bin':'application/octet-stream','.png':'image/png','.webp':'image/webp'};
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':bytes.length,'X-Content-Type-Options':'nosniff'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){
   const status=error.status||500,body=JSON.stringify({error:error.status?error.message:'Ressource Highwind indisponible.'});
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(req.method==='HEAD'?undefined:body);
  }
  return true;
 };
}
