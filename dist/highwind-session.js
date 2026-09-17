import {CITY} from './city-config.js';
import {shipIdFromSearch} from './ship-selection.js';
const key=id=>id+'-map-return:'+CITY.id;
export function saveMapHighwind(pose,id=shipIdFromSearch()){
 if(!id)return;
 try{sessionStorage.setItem(key(id),JSON.stringify({position:{...pose.position},angleDegres:pose.angleDegres,pitch:pose.pitch||0,...(id==='orca'?{roll:pose.roll||0}:{})}));}catch{}
}
export function readMapHighwind(hash=globalThis.location?.hash||'',id=shipIdFromSearch()){
 if(!id||!hash.startsWith('#walk-return='))return null;
 try{const p=JSON.parse(sessionStorage.getItem(key(id)));return p&&[p.position?.x,p.position?.y,p.position?.z,p.angleDegres,p.pitch,p.roll??0].every(Number.isFinite)?p:null;}catch{return null;}
}
