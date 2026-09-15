// The root JSON is the only source of gameplay tuning, in Node and the browser.
// Accept older JSON files during deployment; explicit values always take priority.
const renderingDefaults={rayonChargementBatimentsMetres:600,rayonChargementSolMetres:600,rayonChargementRoutesMetres:600,debutBrouillardMetres:450,finBrouillardMetres:600};
export function validateFPSConfig(value){
 const keys=['puissanceSautMps','multiplicateurHauteurSautSpeed','delaiEntreSautsMs','vitesseMarcheMps','vitesseCourseMps','superVitesseKmh','graviteMps2'];
 const loadingKeys=['chargementsGeometrieSimultanes','chargementsTexturesSimultanes'];
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('fps-config.json : objet JSON attendu.');
 for(const key of loadingKeys)if(!Number.isSafeInteger(value[key])||value[key]<1)throw Error(`fps-config.json : ${key} doit être un entier supérieur ou égal à 1.`);
 for(const key of keys){
  const n=value[key];
  if(typeof n!=='number'||!Number.isFinite(n)||n<0||(key==='graviteMps2'&&n===0))throw Error(`fps-config.json : valeur invalide pour ${key}.`);
 }
 const config={...renderingDefaults,...value};
 for(const key of Object.keys(renderingDefaults))if(typeof config[key]!=='number'||!Number.isFinite(config[key])||config[key]<0)throw Error(`fps-config.json : valeur invalide pour ${key}.`);
 if(config.finBrouillardMetres<=config.debutBrouillardMetres)throw Error('fps-config.json : finBrouillardMetres doit dépasser debutBrouillardMetres.');
 for(const key of Object.keys(value))if(!keys.includes(key)&&!loadingKeys.includes(key)&&!Object.hasOwn(renderingDefaults,key)&&key!=='highwind')throw Error(`fps-config.json : réglage inconnu « ${key} ».`);
 return Object.freeze({...config,...(value.highwind===undefined?{}:{highwind:validateHighwindConfig(value.highwind)})});
}
export function validateHighwindConfig(value){
 const invalid=key=>{throw Error(`fps-config.json : valeur invalide pour highwind.${key}.`);};
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('configuration');
 for(const key of Object.keys(value))if(!['present','longueurMetres','position','angleDegres','vitesseMaxKmh','dureeAccelerationSecondes','dureeFreinageSecondes','hauteurApparitionMetres','distanceDerriereJoueurMetres','distanceCameraMetres','distanceEmbarquementMetres','vitessesHelicesToursParSeconde'].includes(key))invalid(key);
 for(const key of ['dureeAccelerationSecondes','dureeFreinageSecondes'])if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0)invalid(key);
 if(value.distanceEmbarquementMetres!==undefined&&(typeof value.distanceEmbarquementMetres!=='number'||!Number.isFinite(value.distanceEmbarquementMetres)||value.distanceEmbarquementMetres<=0))invalid('distanceEmbarquementMetres');
 if(value.distanceCameraMetres!==undefined&&(typeof value.distanceCameraMetres!=='number'||!Number.isFinite(value.distanceCameraMetres)||value.distanceCameraMetres<=0))invalid('distanceCameraMetres');
 for(const key of ['vitesseMaxKmh','hauteurApparitionMetres','distanceDerriereJoueurMetres'])if(value[key]!==undefined&&(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<0||(key==='vitesseMaxKmh'&&value[key]===0)))invalid(key);
 if(typeof value.present!=='boolean')invalid('present');
 if(typeof value.longueurMetres!=='number'||!Number.isFinite(value.longueurMetres)||value.longueurMetres<=0)invalid('longueurMetres');
 if(typeof value.angleDegres!=='number'||!Number.isFinite(value.angleDegres))invalid('angleDegres');
 if(!value.position||typeof value.position!=='object'||Array.isArray(value.position))invalid('position');
 for(const key of Object.keys(value.position))if(!['x','y','z'].includes(key))invalid('position.'+key);
 for(const key of ['x','y','z'])if(typeof value.position[key]!=='number'||!Number.isFinite(value.position[key]))invalid('position.'+key);
 const speeds=value.vitessesHelicesToursParSeconde;
 if(speeds!==undefined){
  const parts=['PropL','PropR','PropRear','PropTail'],key='vitessesHelicesToursParSeconde';
  if(!speeds||typeof speeds!=='object'||Array.isArray(speeds))invalid(key);
  for(const part of Object.keys(speeds))if(!parts.includes(part))invalid(key+'.'+part);
  for(const part of parts)if(typeof speeds[part]!=='number'||!Number.isFinite(speeds[part])||speeds[part]<0)invalid(key+'.'+part);
 }
 return Object.freeze({...value,position:Object.freeze({...value.position}),...(speeds===undefined?{}:{vitessesHelicesToursParSeconde:Object.freeze({...speeds})})});
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
