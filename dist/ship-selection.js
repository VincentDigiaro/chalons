// One explicit URL parameter selects the vehicle in both map and flight modes.
export const SHIP_IDS=Object.freeze(['highwind','orca']);
export function shipIdFromSearch(search=globalThis.location?.search||''){
 const params=new URLSearchParams(search),id=params.get('ship');
 return params.getAll('ship').length===1&&SHIP_IDS.includes(id)?id:null;
}
export const shipLabel=id=>id==='orca'?'Orca':'Hautvent';
export const selectedShipConfig=(config,search)=>config?.[shipIdFromSearch(search)]??null;

