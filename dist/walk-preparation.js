import {applyRoofMode} from './roof-walk-mode.js';
import {drapeVertices,subdivideRoads} from './terrain.js';
import {collisionGeometry} from './walk-physics.js';

// Retain the exact vertex order, materials and collision rules. Only the work
// boundaries change; incomplete results are never installed in the live scene.
export function* prepareWalkGeometry(buffer,index,roofMode){
 const length=new DataView(buffer).getUint32(0,true);
 const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));
 let vertices=new Float32Array(buffer,4+length);
 let ranges=header.cityRoads?header.ranges.map(([id,first,count])=>[id+index.cityRoadMaterialBase,first,count]):applyRoofMode(header,vertices,index,roofMode);
 yield;
 if(header.cityRoads){
  const chunks=[],nextRanges=[];let size=0;
  for(const [id,first,count] of ranges){
   const start=size/11;
   for(let offset=first;offset<first+count;offset+=384){
    const n=Math.min(384,first+count-offset),chunk=subdivideRoads(vertices.subarray(offset*11,(offset+n)*11),[[id,0,n]]).vertices;
    chunks.push(chunk);size+=chunk.length;yield;
   }
   nextRanges.push([id,start,size/11-start]);
  }
  vertices=new Float32Array(size);let offset=0;
  for(const chunk of chunks){vertices.set(chunk,offset);offset+=chunk.length;yield;}
  ranges=nextRanges;
 }
 const collision={segments:[],surfaces:[]};
 for(let offset=0;offset<vertices.length;offset+=4224){
  const chunk=vertices.subarray(offset,offset+4224);drapeVertices(chunk);
  const part=collisionGeometry(chunk);collision.segments.push(...part.segments);collision.surfaces.push(...part.surfaces);yield;
 }
 return {vertices,ranges,collision};
}

const cancelled=()=>new DOMException('Aborted','AbortError');
const schedule=fn=>typeof requestAnimationFrame==='function'?requestAnimationFrame(fn):setTimeout(fn,0);
const unschedule=id=>typeof cancelAnimationFrame==='function'?cancelAnimationFrame(id):clearTimeout(id);

// One shared budget for CPU preparation and geometry uploads. Download completion
// merely adds a generator: even a packet of 256 objects cannot run synchronously.
export class WalkPreparation {
 constructor({budget=()=>2,priority=()=>0,requestFrame=schedule,cancelFrame=unschedule,now=()=>performance.now()}={}){
  Object.assign(this,{budget,priority,requestFrame,cancelFrame,now});this.jobs=[];this.frame=null;this.disposed=false;
  this.stats={completed:0,frames:0,maxFrameMs:0,maxStepMs:0};
 }
 get pending(){return this.jobs.length;}
 add(node,iterator){
  if(this.disposed||node.controller.signal.aborted){iterator.return();return Promise.reject(cancelled());}
  return new Promise((resolve,reject)=>{
   const job={node,iterator,resolve,reject};
   job.abort=()=>{const i=this.jobs.indexOf(job);if(i>=0)this.jobs.splice(i,1);iterator.return();node.controller.signal.removeEventListener('abort',job.abort);reject(cancelled());};
   node.controller.signal.addEventListener('abort',job.abort,{once:true});this.jobs.push(job);this.schedule();
  });
 }
 schedule(){if(this.frame===null&&this.jobs.length&&!this.disposed)this.frame=this.requestFrame(()=>{this.frame=null;this.flush();});}
 flush(){
  if(this.disposed)return;
  const start=this.now(),budget=this.budget();let steps=0;
  this.jobs.sort((a,b)=>this.priority(a.node)-this.priority(b.node));
  // Zero explicitly removes the time cap; drain every job already available.
  while(this.jobs.length&&(budget===0||steps===0||this.now()-start<budget)){
   const job=this.jobs[0],before=this.now();let done=false;
   try{const result=job.iterator.next();if(result.done){done=true;this.stats.completed++;job.resolve(result.value);}}
   catch(error){done=true;job.iterator.return();job.reject(error);}
   this.stats.maxStepMs=Math.max(this.stats.maxStepMs,this.now()-before);steps++;
   if(done){this.jobs.shift();job.node.controller.signal.removeEventListener('abort',job.abort);}
  }
  this.stats.frames++;this.stats.maxFrameMs=Math.max(this.stats.maxFrameMs,this.now()-start);this.schedule();
 }
 getState(){return {pending:this.pending,budgetMs:this.budget(),...this.stats};}
 dispose(){this.disposed=true;if(this.frame!==null)this.cancelFrame(this.frame);this.frame=null;for(const job of [...this.jobs])job.abort();}
}
