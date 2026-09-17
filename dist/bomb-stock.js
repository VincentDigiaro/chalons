import {CITY} from './city-config.js';
import {WEAPON_IMPACT_CONFIG,SHIP_ID} from './walk-config.js';
const initial=WEAPON_IMPACT_CONFIG.nombreBombes;
const key=(SHIP_ID==='orca'?'orca-missile':'highwind-bomb')+'-stock-map-return:'+CITY.id;
function beginStock(){
 try{
  const storage=globalThis.sessionStorage,raw=storage?.getItem(key);storage?.removeItem(key);
  const saved=JSON.parse(raw||'null');
  if(globalThis.location?.hash?.startsWith('#walk-return=')&&saved?.initial===initial&&(saved.remaining===-1&&initial===-1||Number.isSafeInteger(saved.remaining)&&saved.remaining>=0&&saved.remaining<=initial))return saved.remaining;
 }catch{}
 return initial;
}
let remaining=beginStock();
export const readBombStock=()=>remaining;
export function saveBombStock(value){remaining=value;}
export function preserveBombStockForMap(){try{globalThis.sessionStorage?.setItem(key,JSON.stringify({initial,remaining}));}catch{}}
