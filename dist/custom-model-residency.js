export const CUSTOM_MODEL_RADIUS=500;
// Distance from the map's geographic centre to the closest point of a model's
// horizontal extent. Descriptors are small; geometry/textures remain unloaded.
export function modelDistance(center,bounds){
 const lng=center.lng??center[0],lat=center.lat??center[1];
 const x=Math.max(bounds[0],Math.min(bounds[2],lng)),y=Math.max(bounds[1],Math.min(bounds[3],lat));
 const r=Math.PI/180,a=(lat-y)*r,b=(lng-x)*r;
 return 6371008.8*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(a/2)**2+Math.cos(lat*r)*Math.cos(y*r)*Math.sin(b/2)**2)));
}
export class ModelResidency{
 constructor({bounds,load,onLoad,onUnload,disposeData,onError=()=>{},radius=CUSTOM_MODEL_RADIUS}){Object.assign(this,{bounds,load,onLoad,onUnload,disposeData,onError,radius});this.generation=0;this.distance=Infinity;this.disposed=false;}
 update(center,enabled=true){
  if(this.disposed)return;this.center=center;this.enabled=enabled;this.distance=modelDistance(center,this.bounds);
  if(!enabled||this.distance>=this.radius){this.evict();return;}
  if(this.data||this.pending)return;
  const token=++this.generation,controller=new AbortController();this.controller=controller;
  this.pending=Promise.resolve().then(()=>this.load(controller.signal)).then(data=>{
   if(controller.signal.aborted||token!==this.generation||this.disposed){this.disposeData(data);return;}
   this.data=data;this.onLoad(data);
  }).catch(error=>{if(controller.signal.aborted||token!==this.generation||this.disposed)return;this.evict();this.onError(error);this.retry=setTimeout(()=>this.update(this.center,this.enabled),3000);}).finally(()=>{if(token===this.generation)this.pending=null;});
 }
 evict(){clearTimeout(this.retry);this.generation++;this.controller?.abort();this.controller=null;this.pending=null;if(this.data){this.onUnload(this.data);this.disposeData(this.data);this.data=null;}}
 dispose(){this.disposed=true;this.evict();}
 getState(){return {radius:this.radius,distanceMeters:Number.isFinite(this.distance)?Math.round(this.distance):null,loaded:!!this.data,loading:!!this.pending};}
}
