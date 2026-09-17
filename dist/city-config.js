// One engine, separate geographic datasets. Shared models/audio stay at data/.
export const CITIES=Object.freeze({
 chalons:{id:'chalons',name:'Châlons',label:'Châlons-en-Champagne',dataRoot:'./data/',origin:[4.3815,48.9475],scale:[73109.44253336328,111320],home:{center:[4.3631,48.9566],zoom:15.85,pitch:55,bearing:-24},bounds:[[4.26,48.89],[4.46,49.035]],navigationBounds:[[4.16,48.81],[4.56,49.115]],spawn:{coordinates:[4.379995,48.946464],yawDegrees:Math.atan2((4.380129-4.379958)*73109.44253336328,(48.946532-48.946445)*111320)*180/Math.PI},destinations:[{id:'centre',name:'Centre-ville de Châlons',center:[4.3631,48.9566],zoom:15.85}]},
 nice:{id:'nice',name:'Nice',label:'Nice',dataRoot:'./data/cities/nice/',origin:[7.2701,43.6978],scale:[80483.6557180798,111320],home:{center:[7.2701,43.6978],zoom:16.1,pitch:55,bearing:0},bounds:[[7.17,43.635],[7.34,43.775]],navigationBounds:[[7.15,43.615],[7.365,43.79]],spawn:{coordinates:[7.21568,43.660272],yawDegrees:45},destinations:[
  {id:'centre',name:'Place Masséna',center:[7.2701,43.6978],zoom:17.1},
  {id:'vieux-nice',name:'Vieux-Nice · cours Saleya',center:[7.2756,43.6958],zoom:17.2},
  {id:'promenade',name:'Promenade des Anglais',center:[7.2607,43.6942],zoom:16.6},
  {id:'port',name:'Port Lympia',center:[7.2863,43.6969],zoom:16.2},
  {id:'chateau',name:'Colline du Château',center:[7.2793,43.6957],zoom:16.7},
  {id:'cimiez',name:'Cimiez',center:[7.2769,43.7195],zoom:16.2},
  {id:'mont-boron',name:'Mont Boron',center:[7.3005,43.6908],zoom:15.8},
  {id:'aeroport',name:'Aéroport et littoral ouest',center:[7.215,43.667],zoom:14.9}
 ]}
});
export const cityId=value=>Object.hasOwn(CITIES,value)?value:'chalons';
export const CITY=CITIES[cityId(new URLSearchParams(globalThis.location?.search||'').get('ville')||globalThis.process?.env?.MAP_CITY)];
// Nice starts on the airport runway in both modes. Keep the configured ship
// height and other settings; an ongoing map-return pose takes precedence.
export function cityHighwindConfig(config,city=CITY){
 if(!config||city.id!=='nice')return config;
 const [lng,lat]=city.spawn.coordinates;
 return {...config,position:{...config.position,x:(lng-city.origin[0])*city.scale[0],y:(lat-city.origin[1])*city.scale[1]},angleDegres:city.spawn.yawDegrees};
}
export function cityDataURL(file,city=CITY){
 if(city.id==='chalons')return './data/'+file;
 const parts=[];for(const part of file.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}
 if(['highwind','orca','audio','sky','nerval','attila','buirette','parc14','camp127'].includes(parts[0]))return './data/'+parts.join('/');
 return city.dataRoot+parts.join('/');
}
export function citySwitchURL(href,id){
 if(!Object.hasOwn(CITIES,id))throw Error('Ville inconnue');
 const url=new URL(href);if(cityId(url.searchParams.get('ville'))===id)return null;
 url.searchParams.set('ville',id);for(const key of ['fps','x','y','angle','pitch'])url.searchParams.delete(key);url.hash='overview';return url.href;
}
