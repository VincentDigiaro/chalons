import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createImageryLogger} from './imagery-log.mjs';
import {createImageryCache} from './imagery-cache.mjs';
import {createImageryServer} from './serve-imagery.mjs';

const temporaryRoot=path.resolve(os.tmpdir()),work=await fs.mkdtemp(path.join(temporaryRoot,'chalons-imagery-logs-'));
const records=async file=>(await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
async function run(exe,args,env={}){
  const child=spawn(exe,args,{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>child.kill(),10000);
  try{const [code,signal]=await once(child,'exit');assert.equal(signal,null,stderr);return {code,stdout,stderr};}finally{clearTimeout(timer);}
}
let server;
try{
  const root=path.join(work,'cache'),log=createImageryLogger({directory:path.join(work,'events')});
  const bytes=await fs.readFile('.cache/ign/centre-sample.jpg');let mode='http';
  const cache=createImageryCache({root,log,interval:0,cooldown:0,retries:1,timeout:20,fetchImage:async(_url,{signal})=>{
    if(mode==='http')return new Response('',{status:503});
    if(mode==='network')throw new TypeError('fetch failed',{cause:Object.assign(new Error('Connection reset'),{code:'ECONNRESET'})});
    if(mode==='timeout')return new Promise((_resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
    if(mode==='disk')await fs.writeFile(path.join(root,'17/67129'),'Cannot create a directory here');
    return new Response(bytes,{headers:{'content-type':'image/jpeg'}});
  }});
  server=createImageryServer({cache,log});server.listen(0,'127.0.0.1');await once(server,'listening');
  const get=x=>fetch(`http://127.0.0.1:${server.address().port}/data/imagery/ign/17/${x}/45037.jpg`);
  assert.equal((await get(67125)).status,503);
  mode='ok';assert.equal((await get(67125)).status,200);assert.equal((await get(67125)).status,200);
  mode='network';assert.equal((await get(67126)).status,503);
  mode='timeout';assert.equal((await get(67127)).status,503);
  await fs.mkdir(path.join(root,'17/67128'),{recursive:true});await fs.writeFile(path.join(root,'17/67128/45037.jpg'),'broken');
  assert.equal((await get(67128)).status,503);
  mode='disk';assert.equal((await get(67129)).status,503);
  // Read while the server is still running: no exit or stream close may be
  // needed to make an error visible on disk.
  const events=await records(log.file);
  assert(events.every(e=>Number.isFinite(Date.parse(e.time))&&e.pid===process.pid));
  assert(events.some(e=>e.event==='download_attempt_failed'&&e.error.httpStatus===503&&e.attempt===2));
  assert(events.some(e=>e.event==='download_failed'&&e.tile==='17/67125/45037'));
  assert(events.some(e=>e.event==='download_saved'&&e.bytes===bytes.length));
  assert(events.some(e=>e.event==='cache_hit'));
  assert(events.some(e=>e.error?.cause?.code==='ECONNRESET'));
  assert(events.some(e=>e.event==='download_attempt_failed'&&e.error.name==='TimeoutError'));
  assert(events.some(e=>e.event==='download_attempt_failed'&&e.stage==='save'));
  assert(events.some(e=>e.event==='cache_read_failed'));
  assert(events.some(e=>e.event==='request_failed'&&e.status===503));

  const rotating=createImageryLogger({directory:path.join(work,'rotation'),maxBytes:250,backups:2});
  for(let i=0;i<12;i++)assert(rotating('info','rotation_check',{i}));
  const logs=await fs.readdir(path.join(work,'rotation'));assert.equal(logs.length,3);
  for(const file of logs)assert((await records(path.join(work,'rotation',file))).length>0);
  assert.equal((await records(rotating.file)).at(-1).i,11);

  const crashDirectory=path.join(work,'crash'),fixture=path.join(work,'crash.mjs');
  await fs.writeFile(fixture,`import {startImageryService} from ${JSON.stringify(pathToFileURL(path.resolve('scripts/serve-imagery.mjs')).href)};
const server=startImageryService({port:0,logDirectory:${JSON.stringify(crashDirectory)},heartbeatMs:20});
server.once('listening',()=>setTimeout(()=>{throw Error('Controlled test crash');},90));\n`);
  const crashed=await run(process.execPath,[fixture]);assert.equal(crashed.code,1);
  const crashEvents=await records(path.join(crashDirectory,'events.jsonl'));
  assert(crashEvents.some(e=>e.event==='service_starting'));assert(crashEvents.some(e=>e.event==='service_listening'));
  assert(crashEvents.some(e=>e.event==='service_alive'));
  assert(crashEvents.some(e=>e.event==='process_crash'&&e.error.message==='Controlled test crash'));
  assert(crashEvents.some(e=>e.event==='process_exit'&&e.code===1));

  // A failed Node launch is logged by the existing Windows wrapper, even
  // though the Node logger never had a chance to initialize.
  if(process.platform==='win32'){
    const launchLogs=path.join(work,'launch');
    const launch=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/run-imagery-service.ps1'),'-LogDirectory',launchLogs,'-NodePath',path.join(work,'missing-node.exe')]);
    assert.equal(launch.code,1);assert((await records(path.join(launchLogs,'supervisor.jsonl'))).some(e=>e.event==='supervisor_failed'));
    // Exercise the real wrapper's normal child-exit path with a deliberate
    // startup error on an occupied test port; never touch the live service.
    const exitLogs=path.join(work,'child-exit');
    const exited=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/run-imagery-service.ps1'),'-LogDirectory',exitLogs,'-NodePath',process.execPath],{IGN_PORT:String(server.address().port)});
    assert.equal(exited.code,1);
    const supervisor=await records(path.join(exitLogs,'supervisor.jsonl'));
    assert(supervisor.some(e=>e.event==='process_started'));
    assert(supervisor.some(e=>e.event==='process_exited'&&e.exitCode===1));
    assert((await records(path.join(exitLogs,'events.jsonl'))).some(e=>e.event==='server_failed'&&e.error.code==='EADDRINUSE'));
  }
  console.log(JSON.stringify({imageryLogs:'passed',errors:['HTTP','network cause','timeout','disk write','corrupt cache'],visibleBeforeExit:true,rotation:'passed',crashPersisted:true,heartbeat:'passed',windowsLaunchAndExit:'passed'}));
}finally{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  const target=path.resolve(work);assert(target.startsWith(temporaryRoot+path.sep)&&path.basename(target).startsWith('chalons-imagery-logs-'));
  await fs.rm(target,{recursive:true,force:true});
}
