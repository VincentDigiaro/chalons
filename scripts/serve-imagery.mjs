// Loopback-only acquisition service for Nginx. Originals live in the project,
// outside the deployed static copy, and survive deployments and restarts.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createImageryCache} from './imagery-cache.mjs';

export const imageryRoot=fileURLToPath(new URL('../dist/data/imagery/ign/',import.meta.url));
export function createImageryServer({cache=createImageryCache({root:imageryRoot}),offline=false}={}){
  return http.createServer(async(req,res)=>{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const tile=new URL(req.url,'http://localhost').pathname.match(/^\/data\/imagery\/ign\/(\d+)\/(\d+)\/(\d+)\.jpg$/);
    if(!tile){res.writeHead(404).end();return;}
    try{
      const bytes=await cache.get(...tile.slice(1).map(Number),{offline});
      res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){res.writeHead(error.statusCode||503,{'Cache-Control':'no-store'}).end();}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const server=createImageryServer({offline:process.env.IGN_OFFLINE==='1'});
  server.listen(Number(process.env.IGN_PORT||5174),'127.0.0.1',()=>console.log(`Imagery: http://127.0.0.1:${server.address().port} | ${imageryRoot}`));
}
