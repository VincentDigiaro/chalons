import{toLngLat}from'./walk-core.js';
export const CAMP127={id:'camp127',name:'127 · rue du Camp d’Attila',center:toLngLat([-407.54,2110.39]),zoom:20.7,pitch:58,bearing:-31.6};
export function installCamp127UI(map,layer){
 const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:5;display:flex;flex-wrap:wrap;justify-content:center;max-width:95vw;width:max-content;gap:12px;background:#fffffff0;border-radius:22px;padding:11px 18px;font:14px system-ui;white-space:nowrap';
 for(const [title,url]of [['Jouer au n° 127','./?fps=1&x=-407.54&y=2110.39&angle=328.4&pitch=13'],['Explorer le modèle','./camp127-preview.html'],['Photos','./camp127-references.html']]){const a=document.createElement('a');a.textContent=title;a.href=url;panel.append(a);}document.body.append(panel);
 const update=()=>{const c=map.getCenter();panel.style.display=layer.getState().loaded&&Math.hypot((c.lng-CAMP127.center[0])*73109,(c.lat-CAMP127.center[1])*111320)<100&&map.getZoom()>17?'flex':'none';};map.on('moveend',update);update();map.on('remove',()=>panel.remove());
 map.on('click',e=>{const id=layer.pick(e.point),p=layer.index?.parts.find(p=>p.id===id);if(!p)return;const div=document.createElement('div'),h=document.createElement('h3'),a=document.createElement('a');h.textContent=p.label;a.href='./camp127-references.html#'+p.refs[0];a.textContent='Voir les photos de référence';div.append(h,a);new maplibregl.Popup({maxWidth:'290px'}).setLngLat(e.lngLat).setDOMContent(div).addTo(map);});
}

