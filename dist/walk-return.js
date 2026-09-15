import {toLngLat} from './walk-core.js';

export function walkReturnHash(position){
 return '#walk-return='+toLngLat(position).map(n=>n.toFixed(7)).join(',');
}

export function readWalkReturn(hash,bounds){
 const match=/^#walk-return=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(hash);
 if(!match)return null;
 const center=match.slice(1).map(Number),[lng,lat]=center;
 if(!center.every(Number.isFinite)||lng<bounds[0][0]||lng>bounds[1][0]||lat<bounds[0][1]||lat>bounds[1][1])return null;
 return {center,zoom:18.5,pitch:0,bearing:0};
}
