import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createImageryCache} from './imagery-cache.mjs';
import {CITIES} from '../dist/city-config.js';
import {highwindRequestHandler} from './highwind-auto-export.mjs';
const handleHighwind=highwindRequestHandler();
const root=path.resolve('dist');
const imagery=createImageryCache({root:path.join(root,'data/imagery/ign')});
const niceImagery=createImageryCache({root:path.join(root,'data/cities/nice/imagery/ign'),bounds:CITIES.nice.navigationBounds.flat()});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream','.wav':'audio/wav','.mp3':'audio/mpeg','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  if(await handleHighwind(req,res))return;
  let file;
  try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return;}
  if(file!==root && !file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  // Read the editable root config on every request, without a generated copy.
  if(file===path.join(root,'fps-config.json')){
    try{const bytes=await fs.promises.readFile(new URL('../fps-config.json',import.meta.url));res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(503,{'Cache-Control':'no-store'}).end('Configuration FPS indisponible');}
    return;
  }
  const tile=path.relative(root,file).replaceAll(path.sep,'/').match(/^data\/(cities\/nice\/)?imagery\/ign\/(\d+)\/(\d+)\/(\d+)\.jpg$/);
  if(tile){
    try{
      const bytes=await (tile[1]?niceImagery:imagery).get(...tile.slice(2).map(Number),{offline:process.env.IGN_OFFLINE==='1'});
      res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'public, max-age=31536000, immutable'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){res.writeHead(error.statusCode||503,{'Cache-Control':'no-store'}).end();}
    return;
  }
  if(file===root)file=path.join(root,'index.html');
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end('Not found');return;}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    res.setHeader('Vary','Accept-Encoding');
    if(path.extname(file)==='.pack'){
      res.setHeader('Accept-Ranges','bytes');
      const range=req.headers.range;
      if(range){
        const match=/^bytes=(\d+)-(\d+)$/.exec(range),start=Number(match?.[1]),end=Number(match?.[2]);
        if(!match||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||end>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}
        res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});
        if(req.method==='HEAD'){res.end();return;}
        const slice=fs.createReadStream(file,{start,end});slice.on('error',()=>res.destroy());slice.pipe(res);return;
      }
      res.setHeader('Content-Length',stat.size);if(req.method==='HEAD'){res.end();return;}
      const archive=fs.createReadStream(file);archive.on('error',()=>res.destroy());archive.pipe(res);return;
    }
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());
    if(/gzip/.test(req.headers['accept-encoding']||'')){res.setHeader('Content-Encoding','gzip');stream.pipe(zlib.createGzip()).pipe(res);}else stream.pipe(res);
  });
});
const port=Number(process.env.PORT||5173);
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Local: http://localhost:${server.address().port}`));
