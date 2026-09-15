// A dropped mobile request should delay entry, not discard the whole session.
// Retry stalled requests until the caller leaves; an active slow transfer is kept.
export function waitForWalkRetry(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason||new DOMException('Aborted','AbortError'));
  const stop=()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(signal.reason||new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);
  signal.addEventListener('abort',stop,{once:true});
 });
}

export async function fetchWalkBuffer(url,{signal,onRetry=()=>{},timeoutMs=20000,retryDelayMs=750,cache='default'}={}){
 let attempts=0;
 while(!signal.aborted){
  const attempt=new AbortController(),stop=()=>attempt.abort(signal.reason);
  signal.addEventListener('abort',stop,{once:true});
  let timer;const progress=()=>{clearTimeout(timer);timer=setTimeout(()=>attempt.abort(new DOMException('Request stalled','TimeoutError')),timeoutMs);};progress();
  try{
   const response=await fetch(url,{signal:attempt.signal,cache});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   progress();let buffer;
   if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);length+=value.byteLength;progress();}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}buffer=bytes.buffer;
   }else buffer=await response.arrayBuffer();
   if(attempt.signal.aborted)throw attempt.signal.reason;
   return buffer;
  }catch(error){
   if(signal.aborted)throw signal.reason||error;
   onRetry({attempt:++attempts,error});
  }finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
  await waitForWalkRetry(Math.min(5000,retryDelayMs*2**Math.min(attempts-1,4)),signal);
 }
 throw signal.reason||new DOMException('Aborted','AbortError');
}
