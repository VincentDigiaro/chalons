import {HighwindBombs,BLAST_SECONDS} from './highwind-bombs.js';
import {ORCA_MISSILE_CONFIG,validateMissileConfig,missileImpactConfig} from './walk-config.js';
import {shipMatrix,transform} from './highwind-math.js';
import {bombRotation} from './bomb-orientation.js';
import {trimBombItems} from './bomb-limits.js';

const length=v=>Math.hypot(...v),unit=v=>{const n=length(v);return n>1e-9?v.map(x=>x/n):[0,1,0];};
const difference=(a,b)=>a.map((x,i)=>x-b[i]);
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
export function turnMissile(current,desired,angle){
 const cosine=Math.max(-1,Math.min(1,current.reduce((s,x,i)=>s+x*desired[i],0))),arc=Math.acos(cosine);
 if(arc<=angle)return [...desired];
 if(cosine<-.9999){const perpendicular=unit(Math.abs(current[2])<.8?[-current[1],current[0],0]:[0,-current[2],current[1]]);return unit(current.map((x,i)=>x*Math.cos(angle)+perpendicular[i]*Math.sin(angle)));}
 const a=Math.sin(arc-angle)/Math.sin(arc),b=Math.sin(angle)/Math.sin(arc);return unit(current.map((x,i)=>x*a+desired[i]*b));
}

// Intersect the aircraft's fixed downward boresight with terrain and buildings.
// Orbiting the chase camera does not steer the weapon independently of the nose.
export function orcaSurfaceAim(pose,groundHeight,config=ORCA_MISSILE_CONFIG,raycast=null){
 if(!pose)return null;
 const matrix=shipMatrix(pose),center=transform(matrix,[0,0,0]),origin=transform(matrix,[0,.34,-.01]);
 const angle=config.angleViseeDegres*Math.PI/180,direction=unit(difference(transform(matrix,[0,Math.cos(angle),-Math.sin(angle)]),center));
 const point=t=>origin.map((x,i)=>x+direction[i]*t);
 const clearance=t=>{const p=point(t);return p[2]-groundHeight(p);};
 if(clearance(0)<=0)return null;
 let ground=null,limit=config.porteeViseurMetres;
 for(let previous=0;previous<config.porteeViseurMetres;){
  const next=Math.min(config.porteeViseurMetres,previous+8);
  if(clearance(next)<=0){let lo=previous,hi=next;for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(clearance(mid)>0)lo=mid;else hi=mid;}const hit=point(hi);hit[2]=groundHeight(hit);ground={position:hit,normal:null};limit=hi;break;}
  previous=next;
 }
 return raycast?.(origin,direction,limit)||ground;
}
export const orcaGroundAim=(pose,groundHeight,config=ORCA_MISSILE_CONFIG)=>orcaSurfaceAim(pose,groundHeight,config)?.position||null;

// Share the existing terrain damage / explosion lifecycle, replacing the
// falling-body simulation entirely with finite, independently guided missiles.
export class OrcaMissiles extends HighwindBombs{
 constructor({missileConfig=ORCA_MISSILE_CONFIG,random=Math.random,raycast=null,...options}={}){
  const settings=validateMissileConfig(missileConfig);super({...options,config:missileImpactConfig(settings)});
  this.settings=settings;this.random=random;this.raycast=raycast;this.weapon='missiles';this.target=null;this.targetNormal=null;this.trails=[];this.salvos=0;this.expired=0;
 }
 get ready(){return super.ready&&this.bombs.length<this.settings.missilesSimultanes;}
 updateAim(ship,active=true){const aim=active&&ship?.enabled&&ship.shipId==='orca'?orcaSurfaceAim(ship.pose,this.groundHeight,this.settings,this.raycast):null;this.target=aim?.position||null;this.targetNormal=aim?.normal||null;return this.target;}
 drop(ship){
  if(ship?.shipId!=='orca'||!ship.enabled||!ship.residency?.data||!this.ready)return false;
  const target=this.updateAim(ship);if(!target)return false;
  const count=Math.min(this.settings.missilesParSalve,this.settings.missilesSimultanes-this.bombs.length,this.remainingBombs<0?Infinity:this.remainingBombs);
  if(count<=0)return false;
  const matrix=shipMatrix(ship.pose),center=transform(matrix,[0,0,0]);
  for(let i=0;i<count;i++){
   const id=++this.sequence,side=id%2?1:-1,p=transform(matrix,[side*.142,.358,-.19]);
   // Uniform solid angle in a cone around local +Y (the nose). The configured
   // angle is the full opening: 45° means at most 22.5° from the forward axis.
   const azimuth=this.random()*Math.PI*2,cosine=1-this.random()*(1-Math.cos(this.settings.angleConeDepartDegres*Math.PI/360)),sine=Math.sqrt(Math.max(0,1-cosine*cosine));
   const local=[Math.cos(azimuth)*sine,cosine,Math.sin(azimuth)*sine];
   const direction=unit(difference(transform(matrix,local),center)),speed=this.settings.dureeAccelerationSecondes===0?this.settings.vitesseMps:Math.min(this.settings.vitesseMps,this.settings.vitesseInitialeMps),launch=direction.map(n=>n*speed);
   // Ship drift must not push the actual launch outside the forward cone.
   const missile={id,position:p,velocity:launch,direction,speed,target:Object.freeze([...target]),age:0,distanceTravelled:0,scale:this.settings.tailleMetres,heading:ship.pose.angleDegres*Math.PI/180,trailDistance:0};
   missile.rotation=bombRotation(launch,missile.heading);this.bombs.push(missile);this.addTrail(missile,p,this.time);
  }
  this.salvos++;this.dropped+=count;this.readyAt=this.time+this.settings.dureeRechargeSecondes;
  if(this.remainingBombs>=0)this.remainingBombs-=count;this.onDrop(this.remainingBombs);return true;
 }
 addTrail(missile,position,time){this.trails.push({position:[...position],born:time,id:missile.id,seed:this.random()});}
 trace(missile,a,b,startTime,h){
  const distance=length(difference(b,a)),step=this.settings.trainee.espacementMetres;
  if(distance<=1e-9)return;
  let offset=step-missile.trailDistance;
  for(;offset<=distance;offset+=step)this.addTrail(missile,mix(a,b,offset/distance),startTime+h*offset/distance);
  missile.trailDistance=(missile.trailDistance+distance)%step;
 }
 detonate(missile,position){
  const p=[...position];p[2]=Math.max(p[2],this.groundHeight(p));
  const blast={id:missile.id,position:p,started:this.time,radius:this.config.rayonExplosionMetres,damageRadius:this.config.rayonDestructionBatimentsMetres,craterRadius:this.config.rayonCreusementMetres,craterDepth:this.craterDepthAt(p)};
  this.blasts.push(blast);trimBombItems(this.blasts,this.config.limites.explosionsSimultanees);
  this.addCrater([...p.slice(0,2),blast.radius,blast.damageRadius,blast.craterDepth,blast.craterRadius]);this.impacts++;this.onImpact(blast);
 }
 tick(seconds){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  const dt=Math.min(seconds,.1),steps=Math.ceil(dt*120),h=dt/steps,ageStep=seconds/steps;
  for(let step=0;step<steps;step++){
   const startTime=this.time;this.time+=h;this.blasts=this.blasts.filter(b=>this.time-b.started<BLAST_SECONDS);
   for(let i=this.bombs.length-1;i>=0;i--){
    // Physics stays bounded on slow frames, but lifetime counts all elapsed
    // playing time. Pause never calls tick, so it still freezes the countdown.
    const m=this.bombs[i],a=[...m.position];m.age+=ageStep;
    if(m.age+1e-9>=this.settings.dureeVieSecondes){this.detonate(m,a);this.bombs.splice(i,1);this.expired++;continue;}
    const guided=m.distanceTravelled>=this.settings.distanceDispersionMetres,toTarget=difference(m.target,a),distance=length(toTarget);
    const response=this.settings.dureeAccelerationSecondes;
    m.speed+=(this.settings.vitesseMps-m.speed)*(response>0?1-Math.exp(-Math.log(20)*h/response):1);
    if(guided)m.direction=turnMissile(m.direction,unit(toTarget),this.settings.vitesseRotationDegresParSeconde*Math.PI/180*h);
    m.velocity=m.direction.map(x=>x*m.speed);m.rotation=bombRotation(m.velocity,m.heading);
    let b=a.map((x,k)=>x+m.velocity[k]*h),impact=null;
    if(guided&&distance<=m.speed*h+.8){b=[...m.target];impact=b;}
    else if(b[2]<=this.groundHeight(b)){
     let lo=0,hi=1;for(let j=0;j<14;j++){const t=(lo+hi)/2,p=mix(a,b,t);if(p[2]>this.groundHeight(p))lo=t;else hi=t;}
     b=mix(a,b,hi);impact=b;
    }
    this.trace(m,a,b,startTime,h);m.distanceTravelled+=length(difference(b,a));m.position=b;
    if(impact){this.detonate(m,impact);this.bombs.splice(i,1);}
   }
  }
  this.trails=this.trails.filter(p=>this.time-p.born<this.settings.trainee.dureeSecondes);
  if(this.trails.length>this.settings.trainee.maximumParticules)this.trails.splice(0,this.trails.length-this.settings.trainee.maximumParticules);
 }
 getState(){
  const base=super.getState();delete base.bombs;delete base.initialBombs;delete base.remainingBombs;delete base.bombSizeMetres;
  return {...base,weapon:'missiles',target:this.target?[...this.target]:null,initialMissiles:this.settings.nombreMissiles,remainingMissiles:this.remainingBombs,missileSizeMetres:this.settings.tailleMetres,vitesseMps:this.settings.vitesseMps,angleConeDepartDegres:this.settings.angleConeDepartDegres,distanceDispersionMetres:this.settings.distanceDispersionMetres,dureeAccelerationSecondes:this.settings.dureeAccelerationSecondes,vitesseRotationDegresParSeconde:this.settings.vitesseRotationDegresParSeconde,salvos:this.salvos,expired:this.expired,trailParticles:this.trails.length,trailSeconds:this.settings.trainee.dureeSecondes,missiles:this.bombs.map(m=>({id:m.id,position:[...m.position],target:[...m.target],direction:[...m.direction],speedMps:m.speed,distanceTravelledMetres:m.distanceTravelled,age:m.age,phase:m.distanceTravelled<this.settings.distanceDispersionMetres?'dispersion':'guidage'}))};
 }
 dispose(){super.dispose();this.trails.length=0;this.target=null;this.targetNormal=null;}
}
