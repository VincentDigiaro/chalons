import assert from 'node:assert/strict';
import {fetchWalkBuffer} from '../dist/walk-loading.js';
const controller=new AbortController();let calls=0,retries=0;
globalThis.fetch=async()=>{
 calls++;
 if(calls===1)throw TypeError('Failed to fetch');
 if(calls===2)return new Response('',{status:503});
 if(calls===3)return {ok:true,arrayBuffer:async()=>{throw TypeError('Connection lost while reading');}};
 return new Response('building');
};
const recovered=await fetchWalkBuffer('/building.bin',{signal:controller.signal,retryDelayMs:1,onRetry(){retries++;}});
assert.equal(new TextDecoder().decode(recovered),'building');assert.equal(calls,4);assert.equal(retries,3);
// A stalled transfer releases its slot and retries, instead of hanging forever.
calls=0;
globalThis.fetch=async(_url,{signal})=>{if(++calls>1)return new Response('ok');return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};
await fetchWalkBuffer('/slow.bin',{signal:controller.signal,timeoutMs:5,retryDelayMs:1});assert.equal(calls,2);
// Slow downloads may exceed the timeout overall while still making progress.
calls=0;globalThis.fetch=async()=>{calls++;return new Response(new ReadableStream({start(c){let n=0;const timer=setInterval(()=>{c.enqueue(new Uint8Array([++n]));if(n===6){clearInterval(timer);c.close();}},10);}}));};
const streamed=await fetchWalkBuffer('/large.bin',{signal:controller.signal,timeoutMs:35,retryDelayMs:1});assert.equal(calls,1);assert.deepEqual([...new Uint8Array(streamed)],[1,2,3,4,5,6]);
// Exiting cancels the backoff immediately and prevents any further request.
calls=0;const leaving=new AbortController();globalThis.fetch=async()=>{calls++;throw TypeError('Offline');};
const pending=fetchWalkBuffer('/offline.bin',{signal:leaving.signal,onRetry(){setTimeout(()=>leaving.abort(),1);}});
await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
const alreadyLeft=new AbortController();alreadyLeft.abort();await assert.rejects(fetchWalkBuffer('/never.bin',{signal:alreadyLeft.signal}),{name:'AbortError'});assert.equal(calls,1);
console.log(JSON.stringify({networkRetry:true,httpRetry:true,bodyRetry:true,stalledRequestRecovery:true,slowProgressKept:true,exitCancelsRetry:true}));
