import {SHIP_IDS,shipIdFromSearch} from './ship-selection.js';
// The root JSON is the only source of gameplay tuning, in Node and the browser.
// Accept older JSON files during deployment; explicit values always take priority.
const renderingDefaults={rayonChargementBatimentsMetres:600,rayonChargementSolMetres:600,rayonChargementRoutesMetres:600,debutBrouillardMetres:450,finBrouillardMetres:600};
const preparationDefaults={budgetParImageMs:4,budgetInitialParImageMs:8};
export const BOMB_LIMIT_DEFAULTS=Object.freeze({bombesVisiblesOrdinateur:32,bombesVisiblesMobile:16,explosionsSimultanees:3,particulesVisibles:800,eclairagesSimultanes:1,sonsSimultanes:8,sonsEnAttente:128});
export const BOMB_PARTICLE_DEFAULTS=Object.freeze({groupesFumeeOrdinateur:24,groupesFumeeMobile:14,etincellesOrdinateur:54,etincellesMobile:28,particulesParTrainee:5});
export const BOMB_SIMULATION_DEFAULTS=Object.freeze({largagesParImageSansRecharge:1,rattrapageMaximumSecondes:.1});
export const BOMB_SCORCH_DEFAULTS=Object.freeze({tailleRatio:1,opacite:.84,douceurBord:.5});
export const BOMB_SOIL_DEFAULTS=Object.freeze({opacite:1,tailleMotifMetres:12});
export const BOMB_DEFAULTS=Object.freeze({dureeRechargeSecondes:2.5,tailleMetres:7,rayonExplosionMetres:100,rayonCreusementMetres:100,rayonDestructionBatimentsMetres:100,profondeurCratereRatio:.1,attenuationCreusementRepete:.1,nombreBombes:-1,noircissement:BOMB_SCORCH_DEFAULTS,terre:BOMB_SOIL_DEFAULTS,limites:BOMB_LIMIT_DEFAULTS,particules:BOMB_PARTICLE_DEFAULTS,simulation:BOMB_SIMULATION_DEFAULTS});
function validateBombSection(value,defaults,section,valid){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`fps-config.json : highwind.bombes.${section} doit être un objet.`);
 for(const key of Object.keys(value))if(!Object.hasOwn(defaults,key))throw Error(`fps-config.json : réglage inconnu highwind.bombes.${section}.${key}.`);
 const result={...defaults,...value};for(const [key,n] of Object.entries(result))if(!valid(n,key))throw Error(`fps-config.json : valeur invalide pour highwind.bombes.${section}.${key}.`);
 return Object.freeze(result);
}
export function validateBombConfig(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('fps-config.json : highwind.bombes doit être un objet.');
 for(const key of Object.keys(value))if(!Object.hasOwn(BOMB_DEFAULTS,key))throw Error(`fps-config.json : réglage inconnu highwind.bombes.${key}.`);
 const config={...BOMB_DEFAULTS,...value};
 if(!Object.hasOwn(value,'rayonCreusementMetres'))config.rayonCreusementMetres=config.rayonExplosionMetres;
 for(const [key,n] of Object.entries(config))if(!['limites','particules','simulation','noircissement','terre'].includes(key)&&(key==='nombreBombes'?(!Number.isSafeInteger(n)||n< -1):(typeof n!=='number'||!Number.isFinite(n)||n<0||(['tailleMetres','rayonExplosionMetres'].includes(key)&&n===0))))throw Error(`fps-config.json : valeur invalide pour highwind.bombes.${key}.`);
 if(!Number.isFinite(config.rayonCreusementMetres*config.profondeurCratereRatio*2))throw Error('fps-config.json : profondeur calculée invalide pour highwind.bombes.profondeurCratereRatio.');
 config.noircissement=validateBombSection(config.noircissement,BOMB_SCORCH_DEFAULTS,'noircissement',(n,key)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&(key==='tailleRatio'||n<=1));
 config.terre=validateBombSection(config.terre,BOMB_SOIL_DEFAULTS,'terre',(n,key)=>typeof n==='number'&&Number.isFinite(n)&&(key==='opacite'?n>=0&&n<=1:n>0));
 if(!Number.isFinite(config.rayonExplosionMetres*config.noircissement.tailleRatio))throw Error('fps-config.json : taille calculée invalide pour highwind.bombes.noircissement.tailleRatio.');
 config.limites=validateBombSection(config.limites,BOMB_LIMIT_DEFAULTS,'limites',n=>Number.isSafeInteger(n)&&n>=-1);
 config.particules=validateBombSection(config.particules,BOMB_PARTICLE_DEFAULTS,'particules',n=>Number.isSafeInteger(n)&&n>=0);
 config.simulation=validateBombSection(config.simulation,BOMB_SIMULATION_DEFAULTS,'simulation',(n,key)=>key==='largagesParImageSansRecharge'?Number.isSafeInteger(n)&&n>=1:typeof n==='number'&&Number.isFinite(n)&&(n===-1||n>0));
 return Object.freeze(config);
}
export const ORCA_MISSILE_MAX_LIFETIME_SECONDS=3;
function missileExplosionForSharedEffects(explosion){
 const limits=explosion.limites;
 if(limits===undefined)return explosion;
 if(!limits||typeof limits!=='object'||Array.isArray(limits))throw Error('fps-config.json : orca.missiles.explosion.limites doit être un objet.');
 const shared={...limits};
 for(const platform of ['Ordinateur','Mobile']){
  const missile='missilesVisibles'+platform,bomb='bombesVisibles'+platform;
  if(Object.hasOwn(shared,missile)){shared[bomb]=shared[missile];delete shared[missile];}
 }
 return {...explosion,limites:shared};
}
function missileExplosionNames(explosion){
 const {bombesVisiblesOrdinateur,bombesVisiblesMobile,...limits}=explosion.limites;
 return Object.freeze({...explosion,limites:Object.freeze({missilesVisiblesOrdinateur:bombesVisiblesOrdinateur,missilesVisiblesMobile:bombesVisiblesMobile,...limits})});
}
export const ORCA_MISSILE_DEFAULTS=Object.freeze({nombreMissiles:-1,missilesParSalve:2,missilesSimultanes:64,dureeRechargeSecondes:.65,tailleMetres:1.1,vitesseInitialeMps:28,vitesseMps:120,angleConeDepartDegres:45,distanceDispersionMetres:30,dureeAccelerationSecondes:1,vitesseRotationDegresParSeconde:360,dureeVieSecondes:ORCA_MISSILE_MAX_LIFETIME_SECONDS,angleViseeDegres:28,porteeViseurMetres:1400,trainee:Object.freeze({dureeSecondes:8,espacementMetres:1.5,tailleMetres:1.5,maximumParticules:3000}),explosion:Object.freeze({rayonExplosionMetres:12,rayonCreusementMetres:8,rayonDestructionBatimentsMetres:12,profondeurCratereRatio:.1,limites:Object.freeze({...BOMB_LIMIT_DEFAULTS,explosionsSimultanees:12,particulesVisibles:4000})})});
export function validateMissileConfig(value={}){
 const invalid=key=>{throw Error('fps-config.json : valeur invalide pour orca.missiles.'+key+'.');};
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('configuration');
 for(const key of Object.keys(value))if(!Object.hasOwn(ORCA_MISSILE_DEFAULTS,key)&&!['vitesseMaxMps','dureeDispersionSecondes'].includes(key))invalid(key);
 // Accept the previous speed key while the new runtime/config rolls out.
 if(Object.hasOwn(value,'vitesseMaxMps')&&(!Number.isFinite(value.vitesseMaxMps)||value.vitesseMaxMps<=0))invalid('vitesseMaxMps');
 if(Object.hasOwn(value,'dureeDispersionSecondes')&&(!Number.isFinite(value.dureeDispersionSecondes)||value.dureeDispersionSecondes<0))invalid('dureeDispersionSecondes');
 const config={...ORCA_MISSILE_DEFAULTS,...value,vitesseMps:Object.hasOwn(value,'vitesseMps')?value.vitesseMps:(value.vitesseMaxMps??ORCA_MISSILE_DEFAULTS.vitesseMps)};delete config.vitesseMaxMps;delete config.dureeDispersionSecondes;
 for(const [key,n] of Object.entries(config)){
  if(['trainee','explosion'].includes(key))continue;
  if(typeof n!=='number'||!Number.isFinite(n))invalid(key);
  if(key==='nombreMissiles'){if(!Number.isSafeInteger(n)||n< -1)invalid(key);}
  else if(['missilesParSalve','missilesSimultanes'].includes(key)){if(!Number.isSafeInteger(n)||n<1||n>256)invalid(key);}
  else if(key==='angleConeDepartDegres'){if(n<0||n>180)invalid(key);}
  else if(['distanceDispersionMetres','dureeAccelerationSecondes'].includes(key)){if(n<0)invalid(key);}
  else if(n<=0||key==='angleViseeDegres'&&n>=85)invalid(key);
 }
 // A previous configuration must not let circling missiles live past 3 seconds.
 config.dureeVieSecondes=Math.min(config.dureeVieSecondes,ORCA_MISSILE_MAX_LIFETIME_SECONDS);
 if(!Object.hasOwn(value,'distanceDispersionMetres')&&Object.hasOwn(value,'dureeDispersionSecondes')){
  const t=value.dureeDispersionSecondes,rate=config.dureeAccelerationSecondes>0?Math.log(20)/config.dureeAccelerationSecondes:Infinity,initial=Math.min(config.vitesseInitialeMps,config.vitesseMps);
  config.distanceDispersionMetres=config.vitesseMps*t-(Number.isFinite(rate)?(config.vitesseMps-initial)*(-Math.expm1(-rate*t))/rate:0);
  if(!Number.isFinite(config.distanceDispersionMetres))invalid('distanceDispersionMetres');
 }
 if(config.missilesParSalve>config.missilesSimultanes)invalid('missilesParSalve');
 const trail=config.trainee;
 if(!trail||typeof trail!=='object'||Array.isArray(trail))invalid('trainee');
 for(const key of Object.keys(trail))if(!Object.hasOwn(ORCA_MISSILE_DEFAULTS.trainee,key))invalid('trainee.'+key);
 config.trainee={...ORCA_MISSILE_DEFAULTS.trainee,...trail};
 for(const [key,n]of Object.entries(config.trainee))if(typeof n!=='number'||!Number.isFinite(n)||n<=0||key==='maximumParticules'&&(!Number.isSafeInteger(n)||n>20000))invalid('trainee.'+key);
 if(!config.explosion||typeof config.explosion!=='object'||Array.isArray(config.explosion))invalid('explosion');
 try{const defaults=ORCA_MISSILE_DEFAULTS.explosion,explosion=missileExplosionForSharedEffects(config.explosion);config.explosion=missileExplosionNames(validateBombConfig({...defaults,...explosion,limites:{...defaults.limites,...explosion.limites}}));}catch(error){throw Error(error.message.replaceAll('highwind.bombes','orca.missiles.explosion').replaceAll('bombesVisibles','missilesVisibles'),{cause:error});}
 return Object.freeze({...config,trainee:Object.freeze(config.trainee)});
}
export function missileImpactConfig(missiles){return validateBombConfig({...missileExplosionForSharedEffects(missiles.explosion),nombreBombes:missiles.nombreMissiles,dureeRechargeSecondes:missiles.dureeRechargeSecondes,tailleMetres:missiles.tailleMetres});}
export const HIGHWIND_MODELS=Object.freeze({
 original:Object.freeze({label:'Original',textures:Object.freeze({})}),
 'redrawn-v3':Object.freeze({label:'Textures redessinées v3',textures:Object.freeze({'Highwind1.png':'Highwind1-redrawn-v3.webp','Highwind2.png':'Highwind2-redrawn-v3.webp','Highwind3.png':'Highwind3-redrawn-v3.webp'})}),
 v4:Object.freeze({label:'Highwind v4',directory:'v4/',textures:Object.freeze({})}),
 v5:Object.freeze({label:'Highwind v5',directory:'v5/',textures:Object.freeze({})})
});
export function highwindModel(name='original'){
 if(typeof name!=='string')return null;
 if(Object.hasOwn(HIGHWIND_MODELS,name))return HIGHWIND_MODELS[name];
 return /^v[1-9]\d*$/.test(name)?Object.freeze({label:'Highwind '+name,directory:name+'/',textures:Object.freeze({})}):null;
}
export function shipModel(id,name=id==='orca'?'v1':'original'){
 if(id==='highwind'){
  const model=highwindModel(name);
  return model?{...model,basePath:'highwind/'+(model.directory||'')}:null;
 }
 return id==='orca'&&typeof name==='string'&&/^v[1-9]\d*$/.test(name)?{label:'Orca '+name,directory:name+'/',basePath:'orca/'+name+'/',textures:{}}:null;
}
export function validatePreparationConfig(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('fps-config.json : preparation doit être un objet.');
 for(const key of Object.keys(value))if(!Object.hasOwn(preparationDefaults,key))throw Error(`fps-config.json : réglage inconnu preparation.${key}.`);
 const config={...preparationDefaults,...value};
 for(const [key,n] of Object.entries(config))if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw Error(`fps-config.json : preparation.${key} doit être un nombre positif ou nul (0 = sans limite).`);
 return Object.freeze(config);
}
export function validateFPSConfig(value){
 const keys=['puissanceSautMps','multiplicateurHauteurSautSpeed','delaiEntreSautsMs','vitesseMarcheMps','vitesseCourseMps','superVitesseKmh','graviteMps2'];
 const loadingKeys=['chargementsGeometrieSimultanes','chargementsTexturesSimultanes'];
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('fps-config.json : objet JSON attendu.');
 for(const key of loadingKeys)if(!Number.isSafeInteger(value[key])||value[key]<1)throw Error(`fps-config.json : ${key} doit être un entier supérieur ou égal à 1.`);
 for(const key of keys){
  const n=value[key];
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||(key==='graviteMps2'&&n===0))throw Error(`fps-config.json : valeur invalide pour ${key}.`);
 }
 const config={...renderingDefaults,batimentsParTelechargement:1,...value};
 if(!Number.isSafeInteger(config.batimentsParTelechargement)||config.batimentsParTelechargement<1||config.batimentsParTelechargement>256)throw Error('fps-config.json : batimentsParTelechargement doit être un entier entre 1 et 256.');
 for(const key of Object.keys(renderingDefaults))if(typeof config[key]!=='number'||!Number.isFinite(config[key])||config[key]<0)throw Error(`fps-config.json : valeur invalide pour ${key}.`);
 if(config.finBrouillardMetres<=config.debutBrouillardMetres)throw Error('fps-config.json : finBrouillardMetres doit dépasser debutBrouillardMetres.');
 for(const key of Object.keys(value))if(!keys.includes(key)&&!loadingKeys.includes(key)&&!Object.hasOwn(renderingDefaults,key)&&key!=='batimentsParTelechargement'&&!SHIP_IDS.includes(key)&&key!=='preparation')throw Error(`fps-config.json : réglage inconnu « ${key} ».`);
 const ships=Object.fromEntries(SHIP_IDS.filter(id=>value[id]!==undefined).map(id=>[id,validateShipConfig(value[id],id)]));
 return Object.freeze({...config,preparation:validatePreparationConfig(Object.hasOwn(value,'preparation')?value.preparation:preparationDefaults),...ships});
}
export const validateHighwindConfig=value=>validateShipConfig(value,'highwind');
export function validateShipConfig(value,id='highwind'){
 const invalid=key=>{throw Error(`fps-config.json : valeur invalide pour ${id}.${key}.`);};
 if(!SHIP_IDS.includes(id))invalid('configuration');
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('configuration');
 for(const key of Object.keys(value))if(!['present','modele','longueurMetres','position','angleDegres','vitesseNormaleKmh','vitesseMaxKmh','vitesseMonteeKmh','vitesseDescenteKmh','dureeAccelerationSecondes','dureeFreinageSecondes','inertie','hauteurApparitionMetres','distanceDerriereJoueurMetres','distanceCameraMetres','angleCameraDegres','distanceEmbarquementMetres','vitessesHelicesToursParSeconde','bombes',...(id==='orca'?['missiles']:[])].includes(key))invalid(key);
 if(Object.hasOwn(value,'modele')&&!shipModel(id,value.modele))invalid('modele');
 for(const key of ['dureeAccelerationSecondes','dureeFreinageSecondes'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0)invalid(key);
 if(Object.hasOwn(value,'inertie')&&(typeof value.inertie!=='number'||!Number.isFinite(value.inertie)||value.inertie<0||!['dureeAccelerationSecondes','dureeFreinageSecondes'].every(key=>Number.isFinite(value[key]*value.inertie))))invalid('inertie');
 for(const key of ['vitesseMonteeKmh','vitesseDescenteKmh'])if(Object.hasOwn(value,key)&&(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0))invalid(key);
 if(value.distanceEmbarquementMetres!==undefined&&(typeof value.distanceEmbarquementMetres!=='number'||!Number.isFinite(value.distanceEmbarquementMetres)||value.distanceEmbarquementMetres<=0))invalid('distanceEmbarquementMetres');
 if(value.distanceCameraMetres!==undefined&&(typeof value.distanceCameraMetres!=='number'||!Number.isFinite(value.distanceCameraMetres)||value.distanceCameraMetres<=0))invalid('distanceCameraMetres');
 if(value.angleCameraDegres!==undefined&&(typeof value.angleCameraDegres!=='number'||!Number.isFinite(value.angleCameraDegres)||Math.abs(value.angleCameraDegres)>89))invalid('angleCameraDegres');
 if(value.vitesseNormaleKmh!==undefined&&(typeof value.vitesseNormaleKmh!=='number'||!Number.isFinite(value.vitesseNormaleKmh)||value.vitesseNormaleKmh<=0))invalid('vitesseNormaleKmh');
 if(value.vitesseNormaleKmh!==undefined&&value.vitesseMaxKmh!==undefined&&value.vitesseMaxKmh<value.vitesseNormaleKmh)invalid('vitesseMaxKmh (doit être supérieure ou égale à vitesseNormaleKmh)');
 for(const key of ['vitesseMaxKmh','hauteurApparitionMetres','distanceDerriereJoueurMetres'])if(value[key]!==undefined&&(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||(key==='vitesseMaxKmh'&&value[key]===0)))invalid(key);
 if(typeof value.present!=='boolean')invalid('present');
 if(typeof value.longueurMetres!=='number'||!Number.isFinite(value.longueurMetres)||value.longueurMetres<=0)invalid('longueurMetres');
 if(typeof value.angleDegres!=='number'||!Number.isFinite(value.angleDegres))invalid('angleDegres');
 if(!value.position||typeof value.position!=='object'||Array.isArray(value.position))invalid('position');
 for(const key of Object.keys(value.position))if(!['x','y','z'].includes(key))invalid('position.'+key);
 for(const key of ['x','y','z'])if(typeof value.position[key]!=='number'||!Number.isFinite(value.position[key]))invalid('position.'+key);
 const speeds=value.vitessesHelicesToursParSeconde;
 if(speeds!==undefined){
  const parts=id==='orca'?['PropL','PropR']:['PropL','PropR','PropRear','PropTail'],key='vitessesHelicesToursParSeconde';
  if(!speeds||typeof speeds!=='object'||Array.isArray(speeds))invalid(key);
  for(const part of Object.keys(speeds))if(!parts.includes(part))invalid(key+'.'+part);
  for(const part of parts)if(typeof speeds[part]!=='number'||!Number.isFinite(speeds[part])||speeds[part]<0)invalid(key+'.'+part);
 }
 let bombs;
 if(Object.hasOwn(value,'bombes'))try{bombs=validateBombConfig(value.bombes);}catch(error){throw Error(error.message.replaceAll('highwind.bombes',id+'.bombes'),{cause:error});}
 return Object.freeze({...value,position:Object.freeze({...value.position}),...(bombs?{bombes:bombs}:{}),...(Object.hasOwn(value,'missiles')?{missiles:validateMissileConfig(value.missiles)}:{}),...(speeds===undefined?{}:{vitessesHelicesToursParSeconde:Object.freeze({...speeds})})});
}
export async function readFPSConfig(){
 try{
  let text;
  if(new URL(import.meta.url).protocol==='file:'){
   const {readFile}=await import('node:fs/promises');
   text=await readFile(new URL('../fps-config.json',import.meta.url),'utf8');
  }else{
   const response=await fetch(new URL('./fps-config.json',import.meta.url),{cache:'no-store'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   text=await response.text();
  }
  return validateFPSConfig(JSON.parse(text));
 }catch(error){throw Error(`Impossible de charger la configuration FPS : ${error.message}`,{cause:error});}
}
export const FPS_CONFIG=await readFPSConfig().catch(error=>{
 if(typeof document!=='undefined'){
  const message=document.createElement('p');message.id='fps-config-error';message.setAttribute('role','alert');
  message.textContent=error.message;message.style.cssText='position:fixed;inset:20px 20px auto;z-index:10000;background:#fff;color:#a02020;padding:20px;border-radius:8px;font:16px sans-serif';
  (document.body||document.documentElement).append(message);
 }
 throw error;
});
export const SHIP_ID=shipIdFromSearch();
// Walking without a vehicle keeps its existing environment defaults.
export const SHIP_CONFIG=SHIP_ID?FPS_CONFIG[SHIP_ID]:FPS_CONFIG.highwind;
export const ORCA_MISSILE_CONFIG=validateMissileConfig(FPS_CONFIG.orca?.missiles??{});
export const WEAPON_IMPACT_CONFIG=SHIP_ID==='orca'?missileImpactConfig(ORCA_MISSILE_CONFIG):(SHIP_CONFIG?.bombes??BOMB_DEFAULTS);
