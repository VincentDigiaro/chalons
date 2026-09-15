import {DEFAULT_ROOF_MODE} from './roof-config.js';
const KEY='chalons-roofs';
const valid=value=>value==='catalogue'||value==='aerial';
export function getRoofMode(){
 const query=new URLSearchParams(globalThis.location?.search||'').get('roofs');
 if(valid(query))return query;
 // Old preferences must not pin a browser to a retired site default.
 let saved;try{saved=JSON.parse(globalThis.localStorage?.getItem(KEY)||'null');}catch{}
 return saved?.defaultMode===DEFAULT_ROOF_MODE&&valid(saved.mode)?saved.mode:DEFAULT_ROOF_MODE;
}
export function setRoofMode(mode){
 if(!valid(mode))throw Error('Mode de toiture inconnu');
 try{globalThis.localStorage?.setItem(KEY,JSON.stringify({mode,defaultMode:DEFAULT_ROOF_MODE}));}catch{}
 const url=new URL(location.href);url.searchParams.set('roofs',mode);location.assign(url.href);
}
