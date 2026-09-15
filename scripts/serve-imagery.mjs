// Loopback-only acquisition service for Nginx. Originals live in the project,
// outside the deployed static copy, and survive deployments and restarts.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createImageryCache} from './imagery-cache.mjs';
import {createImageryLogger} from './imagery-log.mjs';
import {createImageryPackCache} from './imagery-pack-cache.mjs';

export const imageryRoot=fileURLToPath(new URL('../dist/data/imagery/ign/',import.meta.url));
export function createImageryServer({log=()=>{},cache=createImageryCache({root:imageryRoot,log}),packs=createImageryPackCache({root:cache.root,tileCache:cache,log}),offline=false}={}){
  return http.createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/imagery-config.json'){
      try{const bytes=Buffer.from(JSON.stringify(packs.config()));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Content-Length':bytes.length}).end(req.method==='HEAD'?undefined:bytes);}catch(error){log('error','imagery_configuration_failed',{error});res.writeHead(503,{'Cache-Control':'no-store'}).end();}return;
    }
    const packet=pathname.match(/^\/data\/imagery\/ign\/packs\/v1\/(\d+)\/(\d+)\/(\d+)\/(\d+)\.bin$/);
    if(packet){
      const [side,z,x,y]=packet.slice(1).map(Number),started=Date.now(),key=packet.slice(1).join('/');
      res.once('close',()=>{if(!res.writableFinished)log('warn','client_disconnected',{packet:key,durationMs:Date.now()-started,acquisitionContinues:true});});
      try{const bytes=await packs.get(z,x,y,side,{offline});res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:bytes);}
      catch(error){log('error','packet_request_failed',{packet:key,status:error.statusCode||503,error});res.writeHead(error.statusCode||503,{'Cache-Control':'no-store'}).end();}return;
    }
    const tile=pathname.match(/^\/data\/imagery\/ign\/(\d+)\/(\d+)\/(\d+)\.jpg$/);
    if(!tile){res.writeHead(404).end();return;}
    const started=Date.now(),key=tile.slice(1).join('/');
    res.once('close',()=>{if(!res.writableFinished)log('warn','client_disconnected',{tile:key,durationMs:Date.now()-started,acquisitionContinues:true});});
    try{
      const bytes=await cache.get(...tile.slice(1).map(Number),{offline});
      res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){log(error.statusCode===404?'warn':'error','request_failed',{tile:key,status:error.statusCode||503,durationMs:Date.now()-started,error});res.writeHead(error.statusCode||503,{'Cache-Control':'no-store'}).end();}
  });
}
export function startImageryService({port=Number(process.env.IGN_PORT||5174),logDirectory=process.env.IGN_LOG_DIR||fileURLToPath(new URL('../artifacts/imagery-service/',import.meta.url)),heartbeatMs=60000,cacheOptions={}}={}){
  const log=createImageryLogger({directory:logDirectory});
  const cache=createImageryCache({root:imageryRoot,...cacheOptions,log});
  const packs=createImageryPackCache({root:cache.root,tileCache:cache,log});
  const server=createImageryServer({cache,packs,log,offline:process.env.IGN_OFFLINE==='1'});
  let heartbeat,stopping=false;
  log('info','service_starting',{port,cacheRoot:cache.root,node:process.version});
  process.on('uncaughtExceptionMonitor',(error,origin)=>log('fatal','process_crash',{origin,error}));
  process.once('exit',code=>log(code?'error':'info','process_exit',{code,uptimeSeconds:Math.round(process.uptime())}));
  function stop(signal){
    if(stopping)return;stopping=true;clearInterval(heartbeat);log('info','shutdown_requested',{signal});
    const deadline=setTimeout(()=>{log('error','shutdown_timed_out');process.exit(1);},5000);deadline.unref();
    server.close(()=>{clearTimeout(deadline);process.exit(0);});
  }
  process.once('SIGINT',()=>stop('SIGINT'));process.once('SIGTERM',()=>stop('SIGTERM'));
  server.once('error',error=>{log('fatal','server_failed',{error});process.exit(1);});
  server.listen(port,'127.0.0.1',()=>{
    log('info','service_listening',{address:server.address(),logFile:log.file});
    heartbeat=setInterval(()=>log('info','service_alive',{uptimeSeconds:Math.round(process.uptime()),...cache.getState(),packets:packs.getState()}),heartbeatMs);heartbeat.unref();
    console.log(`Imagery: http://127.0.0.1:${server.address().port} | ${cache.root} | ${log.file}`);
  });
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  startImageryService();
}
