import assert from 'node:assert/strict';
import {getRoofMode,setRoofMode} from '../dist/roof-mode.js';
import {DEFAULT_ROOF_MODE} from '../dist/roof-config.js';

const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const alternative=DEFAULT_ROOF_MODE==='aerial'?'catalogue':'aerial';
let stored=null,assigned;
Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:{search:'',href:'https://example.test/chalons/?fps=1#view',assign:url=>{assigned=url;}}});
Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:()=>stored,setItem:(_key,value)=>{stored=value;}}});
try{
 assert.equal(getRoofMode(),DEFAULT_ROOF_MODE,'A new browser follows the site default');
 for(const old of ['catalogue','aerial','invalid','null','{"mode":"invalid"}']){
  stored=old;assert.equal(getRoofMode(),DEFAULT_ROOF_MODE,'Legacy or malformed preferences cannot override the default');
 }
 stored=JSON.stringify({mode:alternative,defaultMode:alternative});
 assert.equal(getRoofMode(),DEFAULT_ROOF_MODE,'A preference from a previous default is ignored');
 setRoofMode(alternative);
 assert.equal(getRoofMode(),alternative,'A new deliberate selection survives a reload');
 assert.equal(new URL(assigned).searchParams.get('roofs'),alternative);
 assert.equal(new URL(assigned).searchParams.get('fps'),'1');
 assert.equal(new URL(assigned).hash,'#view');
 for(const mode of ['aerial','catalogue']){
  location.search='?roofs='+mode;assert.equal(getRoofMode(),mode,'Explicit comparison links keep priority');
 }
 assert.throws(()=>setRoofMode('invalid'));
 globalThis.localStorage={getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');}};
 location.search='?roofs=invalid';assert.equal(getRoofMode(),DEFAULT_ROOF_MODE);
 setRoofMode(alternative);assert.equal(new URL(assigned).searchParams.get('roofs'),alternative);
 console.log('Roof selection passed: site default, legacy preferences, changed default, explicit choices, blocked storage.');
}finally{
 if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location;
 if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
}
