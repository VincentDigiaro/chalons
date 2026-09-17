// Local preview of v4, without changing the root config served by production.
import http from 'node:http';
import fs from 'node:fs/promises';
const server=http.createServer(async(req,res)=>{
 if(new URL(req.url,'http://localhost').pathname==='/fps-config.json'){
  const config=JSON.parse(await fs.readFile(new URL('../fps-config.json',import.meta.url)));config.highwind.modele='v4';
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(config));return;
 }
 const upstream=http.request({hostname:'127.0.0.1',port:5173,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
 upstream.on('error',e=>{res.writeHead(502);res.end(e.message);});req.pipe(upstream);
});
server.listen(5194,'127.0.0.1',()=>console.log('V4 preview: http://127.0.0.1:5194/?fps=1&ff7'));
