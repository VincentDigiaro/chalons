import {shipIdFromSearch} from './ship-selection.js';
// Map pitch is zero when looking straight down. One percent of 90° is 0.9°.
export const MAP_BUILDINGS_MIN_PITCH=.9;
export const mapBuildingsVisible=map=>map.getPitch()>=MAP_BUILDINGS_MIN_PITCH;
export const overviewCamera=city=>({center:[(city.bounds[0][0]+city.bounds[1][0])/2,(city.bounds[0][1]+city.bounds[1][1])/2],zoom:10.4,pitch:0,bearing:0});
export const directHighwindEntry=(search,hash,config)=>shipIdFromSearch(search)!==null&&!!config?.present&&hash!=='#overview'&&!hash.startsWith('#walk-return=');

export function preserveMapCamera(map,fov){
 map.stop();
 const eye={position:map.transform.getCameraLngLat().toArray(),height:map.transform.getCameraAltitude(),bearing:map.getBearing(),pitch:map.getPitch(),roll:map.getRoll?.()||0};
 map.setMaxPitch(Math.max(map.getMaxPitch(),84));map.setVerticalFieldOfView(fov);
 const camera=map.calculateCameraOptionsFromCameraLngLatAltRotation(eye.position,eye.height,eye.bearing,eye.pitch,eye.roll);
 map.setMaxZoom(Math.max(map.getMaxZoom(),camera.zoom));map.jumpTo(camera);
 return eye;
}
