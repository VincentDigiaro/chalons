import fs from 'node:fs';
import path from 'node:path';

// One complete JSON event per line, flushed before returning. No stream buffer
// to lose when Node crashes. Rotation applies only to these logs, never images.
export function createImageryLogger({directory,maxBytes=5*1024*1024,backups=5}={}){
  const root=path.resolve(directory),file=path.join(root,'events.jsonl');
  fs.mkdirSync(root,{recursive:true});
  function errorDetails(error,depth=0){
    if(!(error instanceof Error))return error;
    return {name:error.name,message:error.message,code:error.code,httpStatus:error.httpStatus,stack:error.stack,
      ...(error.cause&&depth<2?{cause:errorDetails(error.cause,depth+1)}:{})};
  }
  const log=(level,event,details={})=>{
    const record={time:new Date().toISOString(),level,event,pid:process.pid,...details};
    try{
      const line=JSON.stringify(record,(_key,value)=>value instanceof Error?errorDetails(value):value)+'\n';
      let size=0;try{size=fs.statSync(file).size;}catch(error){if(error.code!=='ENOENT')throw error;}
      if(size&&size+Buffer.byteLength(line)>maxBytes){
        for(let i=backups;i>=1;i--){
          const source=i===1?file:`${file}.${i-1}`,target=`${file}.${i}`;
          if(i===backups)try{fs.unlinkSync(target);}catch(error){if(error.code!=='ENOENT')throw error;}
          try{fs.renameSync(source,target);}catch(error){if(error.code!=='ENOENT')throw error;}
        }
      }
      fs.appendFileSync(file,line,{encoding:'utf8',flush:true});
      return true;
    }catch(error){
      // Logging failures must be visible in the wrapper's stderr file, while
      // a full log disk must not turn an already-saved image into a failure.
      try{fs.writeSync(2,JSON.stringify({time:new Date().toISOString(),level:'error',event:'log_write_failed',error:errorDetails(error),originalEvent:event})+'\n');}catch{}
      return false;
    }
  };
  log.file=file;return log;
}
