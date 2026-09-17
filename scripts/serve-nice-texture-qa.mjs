// Local diagnostics only: preserve the application files and log texture errors.
import http from 'node:http';
const needle=".catch(error=>{if(error.name!=='AbortError'||entry.timedOut){entry.failed=true;";
http.createServer(async(req,res)=>{
 try{
  const response=await fetch('http://localhost:5191'+req.url,{headers:req.headers.range?{range:req.headers.range}:{}});
  let bytes=Buffer.from(await response.arrayBuffer());
  if(new URL(req.url,'http://localhost').pathname==='/walk-renderer.js'){
   const source=bytes.toString();if(!source.includes(needle))throw Error('Diagnostic insertion point changed');
   bytes=Buffer.from(source.replace(needle,".catch(error=>{if(error.name!=='AbortError'||entry.timedOut){console.warn('Nice texture QA:',entry.key,error.message);entry.failed=true;"));
  }
  const headers={'Content-Type':response.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store'};
  for(const name of ['content-range','accept-ranges'])if(response.headers.has(name))headers[name]=response.headers.get(name);
  res.writeHead(response.status,headers);res.end(bytes);
 }catch(error){res.writeHead(502);res.end(error.message);}
}).listen(5192,'127.0.0.1',()=>console.log('Nice diagnostics: http://localhost:5192'));
