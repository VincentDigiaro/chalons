import {SPAWN,SPAWN_YAW,toLngLat} from './walk-core.js';

// x/y are the metre coordinates used by the FPS renderer. Angles are clockwise
// from north; pitch is positive when looking up. Keep the usual -6° start tilt.
export function readWalkEntry(search,bounds){
 const params=new URLSearchParams(search);
 if(params.get('fps')!=='1'||params.getAll('fps').length!==1)return null;
 const keys=['x','y','angle','pitch'];
 if(keys.every(k=>!params.has(k)))return {position:[...SPAWN],yaw:SPAWN_YAW,pitch:-6*Math.PI/180};
 const number=k=>{const text=params.get(k);return params.getAll(k).length===1&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text||'')?Number(text):NaN;};
 const x=number('x'),y=number('y'),angle=number('angle'),pitch=params.has('pitch')?number('pitch'):-6;
 if(![x,y,angle,pitch].every(Number.isFinite)||Math.abs(pitch)>83)return null;
 const [lng,lat]=toLngLat([x,y]);
 if(lng<bounds[0][0]||lng>bounds[1][0]||lat<bounds[0][1]||lat>bounds[1][1])return null;
 return {position:[x,y],yaw:((angle%360+360)%360)*Math.PI/180,pitch:pitch*Math.PI/180};
}

export function clearWalkEntry(href){
 const url=new URL(href);
 if(url.searchParams.has('fps'))for(const key of ['fps','x','y','angle','pitch'])url.searchParams.delete(key);
 return url;
}
