import http from 'node:http';
import {highwindRequestHandler} from './highwind-auto-export.mjs';
const handle=highwindRequestHandler();
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"service":"highwind-auto-export","ready":true}');return;}
 if(!await handle(req,res))res.writeHead(404).end('Not found');
});
server.listen(Number(process.env.HIGHWIND_PORT||5195),'127.0.0.1',()=>console.log('Highwind local : '+server.address().port));
