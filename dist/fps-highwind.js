import {ModelResidency} from './custom-model-residency.js';
import {LOAD_RADIUS,nearDistance,toLngLat} from './walk-core.js';
import {fetchWalkBuffer} from './walk-loading.js';
import {shipMatrix,multiply,transform,inversePoint,rotorMatrix} from './highwind-math.js';
import {meshCollider,trianglePositions,walkingGeometry,meshDistance,worldBounds,groundSupports} from './highwind-collision.js';
import {nearbyCollision,overlaps} from './walk-collision-index.js';

export function placeHighwind(vertices,config){
 const angle=(config.angleDegres%360)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scale=config.longueurMetres,{x,y,z}=config.position;
 const out=new Float32Array(vertices.length);
 for(let at=0;at<vertices.length;at+=11){
  out.set(vertices.subarray(at,at+11),at);
  out[at]=x+scale*(c*vertices[at]+s*vertices[at+1]);
  out[at+1]=y+scale*(-s*vertices[at]+c*vertices[at+1]);out[at+2]=z+scale*vertices[at+2];
  out[at+3]=c*vertices[at+3]+s*vertices[at+4];out[at+4]=-s*vertices[at+3]+c*vertices[at+4];
 }
 return out;
}
export function highwindBounds(index,config){
 const corners=[];for(const x of [index.bounds[0][0],index.bounds[1][0]])for(const y of [index.bounds[0][1],index.bounds[1][1]])for(const z of [index.bounds[0][2],index.bounds[1][2]])corners.push(x,y,z,0,0,1,0,0,1,1,1);
 const vertices=placeHighwind(new Float32Array(corners),config),a=[Infinity,Infinity,Infinity],b=[-Infinity,-Infinity,-Infinity];
 for(let at=0;at<vertices.length;at+=11)for(let j=0;j<3;j++){a[j]=Math.min(a[j],vertices[at+j]);b[j]=Math.max(b[j],vertices[at+j]);}
 return {horizontal:[a[0],a[1],b[0],b[1]],vertical:[a[2],b[2]]};
}

export const HIGHWIND_BOARDING_DISTANCE=40;
export const highwindBoardingDistance=config=>config?.distanceEmbarquementMetres??HIGHWIND_BOARDING_DISTANCE;
export const ff7Enabled=search=>new URLSearchParams(search).has('ff7');
export function hullProbes(vertices,ranges){
 const cells=new Map(),step=1/40;
 // Rasterize the hull's vertical envelope. Propeller discs are not boarding surfaces.
 for(const r of ranges.filter(r=>!r.part.startsWith('Prop')))for(let i=r.first*11;i<(r.first+r.count)*11;i+=33){
  const [a,b,c]=[0,11,22].map(j=>Array.from(vertices.subarray(i+j,i+j+3))),det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<1e-10)continue;
  for(let x=Math.floor(Math.min(a[0],b[0],c[0])/step);x<=Math.ceil(Math.max(a[0],b[0],c[0])/step);x++)for(let y=Math.floor(Math.min(a[1],b[1],c[1])/step);y<=Math.ceil(Math.max(a[1],b[1],c[1])/step);y++){
   const px=x*step,py=y*step,u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/det,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/det;if(u<0||v<0||u+v>1)continue;
   const z=u*a[2]+v*b[2]+(1-u-v)*c[2],key=x+','+y,cell=cells.get(key)||{x:px,y:py,bottom:z,top:z};cell.bottom=Math.min(cell.bottom,z);cell.top=Math.max(cell.top,z);cells.set(key,cell);
  }
 }
 return [...cells.values()];
}

// The original model is immutable; placement comes only from the FPS JSON.
export class FPSHighwind{
 constructor(renderer,config,{enabled=ff7Enabled(globalThis.location?.search||'')}={}){this.renderer=renderer;this.config=config;this.enabled=enabled&&!!config?.present;this.pose=config?{...config,position:{...config.position},pitch:0}:null;this.abort=new AbortController();this.materialIds=[];this.lastDraws=0;this.rotorAngles={};}
 updateBounds(){
  if(!this.index)return;const m=shipMatrix(this.pose),points=[];for(const x of [this.index.bounds[0][0],this.index.bounds[1][0]])for(const y of [this.index.bounds[0][1],this.index.bounds[1][1]])for(const z of [this.index.bounds[0][2],this.index.bounds[1][2]])points.push(transform(m,[x,y,z]));
  this.bounds={horizontal:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],vertical:[Math.min(...points.map(p=>p[2])),Math.max(...points.map(p=>p[2]))]};
  if(this.residency){const b=this.bounds.horizontal;this.residency.bounds=[...toLngLat(b.slice(0,2)),...toLngLat(b.slice(2,4))];}
 }
 animate(dt){
  // Integrate each rotor independently: fractional speeds must not jump when
  // another rotor completes a turn. Keep wall-clock speed even on slow frames.
  if(Number.isFinite(dt)&&dt>0)for(const [part,speed] of Object.entries(this.config?.vitessesHelicesToursParSeconde||{}))this.rotorAngles[part]=((this.rotorAngles[part]||0)+(dt*speed%1)*Math.PI*2)%(Math.PI*2);
  this.updateBounds();
 }
 playerCollisionScene(bounds){
  const data=this.residency?.data;if(!data?.collider)return {segments:[],surfaces:[]};
  if(bounds){let b=this.bounds?.horizontal;if(!b){const world=worldBounds(data.collider,this.pose);b=[world[0],world[1],world[3],world[4]];}if(!overlaps(bounds,b))return {segments:[],surfaces:[]};}
  const p=this.pose,key=[p.position.x,p.position.y,p.position.z,p.angleDegres,p.pitch,p.longueurMetres].join(',');
  if(data.walkingKey!==key){data.walking=walkingGeometry(data.collider,p);data.walkingKey=key;}return bounds?nearbyCollision(data.walking,bounds):data.walking;
 }
 contactDistance(player){
  const collider=this.residency?.data?.collider;if(!collider)return Infinity;
  const point=inversePoint(this.pose,[...player.position,player.feet+.85]),scale=this.pose.longueurMetres;
  return meshDistance(collider,point,highwindBoardingDistance(this.config)/scale)*scale;
 }
 refresh(position){
  this.position=[...position];if(!this.enabled||this.abort.signal.aborted)return;
  if(this.residency){this.updateBounds();this.residency.update(toLngLat(position));return;}
  // Read the small descriptor only when the configured ship could be nearby.
  const {x,y}=this.pose.position,r=this.config.longueurMetres;
  if(this.initializing||nearDistance([x-r,y-r,x+r,y+r],position)>=LOAD_RADIUS)return;
  this.initializing=this.initialize().catch(error=>{if(!this.abort.signal.aborted){this.error=error.message;console.warn('Highwind :',error.message);}});
 }
 async initialize(){
  const signal=this.abort.signal,buffer=await fetchWalkBuffer('./data/highwind/index.json',{signal});
  if(signal.aborted)return;
  const index=JSON.parse(new TextDecoder().decode(buffer));
  if(index.stride!==44||index.normalisedLength!==1||!index.vertexCount||!index.materials?.length)throw Error('Modèle Highwind invalide.');
  this.index=index;
  this.updateBounds();
  this.materialIds=index.materials.map(m=>{const id=this.renderer.index.materials.length;this.renderer.index.materials.push({...m,texture:'../highwind/'+m.texture});return id;});
  const b=this.bounds.horizontal,geographic=[...toLngLat(b.slice(0,2)),...toLngLat(b.slice(2,4))];
  this.residency=new ModelResidency({bounds:geographic,radius:LOAD_RADIUS,
   load:async signal=>{
    const buffer=await fetchWalkBuffer('./data/highwind/'+index.mesh,{signal});
    if(buffer.byteLength!==index.vertexCount*index.stride)throw Error('Géométrie Highwind tronquée.');
    const vertices=new Float32Array(buffer),collider=meshCollider(trianglePositions(vertices,index.ranges));groundSupports(collider);return {vertices,collider};
   },
   onLoad:data=>{data.gpu=this.renderer.geometry(data.vertices);for(const id of this.materialIds)this.renderer.texture(id);},
   onUnload:()=>{this.lastDraws=0;},disposeData:data=>this.renderer.drop(data.gpu),
   onError:error=>{this.error=error.message;}
  });
  this.residency.update(toLngLat(this.position));
 }
 textureKeys(){return this.residency?.data?this.materialIds.map(id=>this.renderer.material(id).texture):[];}
 draw(draw){
  this.lastDraws=0;const data=this.residency?.data;if(!data?.gpu)return 0;
  const model=shipMatrix(this.pose);
  for(const range of this.index.ranges){const rotor=this.index.rotors?.[range.part],matrix=rotor?multiply(model,rotorMatrix(rotor,this.rotorAngles[range.part]||0)):model;if(draw(data.gpu,this.materialIds[range.material],range.first,range.count,matrix))this.lastDraws++;}
  return this.lastDraws;
 }
 getState(){return {present:this.enabled,longueurMetres:this.pose?.longueurMetres,position:this.pose?.position,angleDegres:this.pose?.angleDegres,pitch:this.pose?.pitch,rotorAngles:{...this.rotorAngles},vitessesHelicesToursParSeconde:this.config?.vitessesHelicesToursParSeconde,...(this.residency?.getState()||{loaded:false,loading:!!this.initializing&&!this.index}),draws:this.lastDraws,gpuBytes:this.residency?.data?.gpu?.bytes||0,error:this.error||null};}
 dispose(){this.abort.abort();this.residency?.dispose();}
}
