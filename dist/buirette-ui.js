import {toLocal} from './walk-core.js';

export const BUIRETTE={id:'buirette',name:'Buirette · 12–20',center:[4.37569,48.96131],zoom:20,pitch:48,bearing:235};

export const BUIRETTE_ODD={id:"buirette-17-19",name:"Buirette · 17–19",center:[4.37610,48.96123],zoom:20.35,pitch:48,bearing:55};

export const BUIRETTE_15={id:'buirette-15',name:'Buirette · 15–19',center:[4.376015,48.96130],zoom:20.35,pitch:48,bearing:55};

export function buiretteWalkURL(odd=false){const p=toLocal(odd===15?[4.375880,48.961309]:odd?[4.376029,48.961148]:[4.375918,48.961350]);return `./?fps=1&x=${p[0].toFixed(3)}&y=${p[1].toFixed(3)}&angle=${odd?55:235}&pitch=${odd===15?17:8}`;}

export function installBuiretteUI(map,layer){

 const panel=document.createElement('div');panel.className='buirette-tools';panel.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:5;display:flex;gap:12px;align-items:center;background:#fffffff0;border-radius:24px;padding:10px 18px;box-shadow:0 2px 15px #102a2930;font:14px system-ui;white-space:nowrap';

 const name=document.createElement('span');name.textContent='Buirette · 12–20';const play=document.createElement('a');play.href=buiretteWalkURL();play.textContent='Jouer ici';const refs=document.createElement('a');refs.href='./buirette-references.html';refs.textContent='Clichés ↗';panel.append(name,play,refs);document.body.append(panel);

 const update=()=>{const c=map.getCenter(),odd=Math.cos((map.getBearing()-55)*Math.PI/180)>0;play.href=buiretteWalkURL(odd&&c.lat>48.96127?15:odd);name.textContent=odd?'Buirette · 15–19':'Buirette · 12–20';panel.style.display=layer.getState().loaded&&Math.hypot((c.lng-BUIRETTE.center[0])*73000,(c.lat-BUIRETTE.center[1])*111320)<150&&map.getZoom()>17?'flex':'none';};map.on('moveend',update);update();

 map.on('remove',()=>panel.remove());

 map.on('click',e=>{const id=layer.pick(e.point),p=layer.index?.parts.find(p=>p.id===id);if(!p)return;const div=document.createElement('div'),title=document.createElement('h3'),text=document.createElement('p'),link=document.createElement('a');title.textContent=p.label;text.textContent=p.confidence;link.href='./buirette-references.html#'+p.refs[0];link.textContent='Voir la référence ↗';div.append(title,text,link);new maplibregl.Popup({maxWidth:'310px'}).setLngLat(e.lngLat).setDOMContent(div).addTo(map);});

}

