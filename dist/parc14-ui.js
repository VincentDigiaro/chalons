import{toLngLat}from'./walk-core.js';
export const PARC14={id:'parc14',name:'14 · rue de la Résidence du Parc',center:toLngLat([-413,2800]),zoom:20.7,pitch:58,bearing:162};
export function installParc14UI(map,layer){
 const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:5;display:flex;flex-wrap:wrap;justify-content:center;max-width:95vw;width:max-content;gap:12px;background:#fffffff0;border-radius:22px;padding:11px 18px;font:14px system-ui;white-space:nowrap';
 for(const [title,url]of [['Jouer au n° 14','./?fps=1&x=-418.51&y=2816.94&angle=162&pitch=11'],['Explorer le modèle','./parc14-preview.html'],['Photos','./parc14-references.html']]){const a=document.createElement('a');a.textContent=title;a.href=url;panel.append(a);}document.body.append(panel);
 const update=()=>{const c=map.getCenter();panel.style.display=layer.getState().loaded&&Math.hypot((c.lng-PARC14.center[0])*73109,(c.lat-PARC14.center[1])*111320)<100&&map.getZoom()>17?'flex':'none';};map.on('moveend',update);update();map.on('remove',()=>panel.remove());
 map.on('click',e=>{const id=layer.pick(e.point),p=layer.index?.parts.find(p=>p.id===id);if(!p)return;const div=document.createElement('div'),h=document.createElement('h3'),a=document.createElement('a');h.textContent=p.label;a.href='./parc14-references.html#'+p.refs[0];a.textContent='Voir les photos de référence';div.append(h,a);new maplibregl.Popup({maxWidth:'290px'}).setLngLat(e.lngLat).setDOMContent(div).addTo(map);});
}

