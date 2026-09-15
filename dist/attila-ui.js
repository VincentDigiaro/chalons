export const ATTILA={id:'attila',name:'Camp d’Attila · 70–90',center:[4.37273,48.96513],zoom:20.05,pitch:58,bearing:-30};
export const ATTILA_REAR={id:'attila-rear',name:'Camp d’Attila · jardins arrière',center:[4.37271,48.964999],zoom:20.4,pitch:58,bearing:-30};
export const ATTILA_TERRACE={id:'attila-terrace',name:'Camp d’Attila · façades 72–78',center:[4.37271,48.964999],zoom:20.6,pitch:64,bearing:150};
export const ATTILA_STREET={id:'attila-street',name:'Camp d’Attila · façades 77–89',center:[4.3727,48.9652],zoom:21,pitch:75,bearing:-25};
export const ATTILA_CORNER={id:'attila-corner',name:'Camp d’Attila · entrée du 78',center:[4.372858,48.965095],zoom:20.95,pitch:60,bearing:195};
export function installAttilaUI(map,layer){
 const button=document.getElementById('attila-open'),panel=document.getElementById('attila-tools');
 button.disabled=false;
 const update=()=>{const c=map.getCenter();panel.hidden=Math.hypot((c.lng-ATTILA.center[0])*73000,(c.lat-ATTILA.center[1])*111320)>180||map.getZoom()<17;};
 map.on('moveend',update);update();
 map.on('click',e=>{
  const id=layer.pick(e.point),p=layer.index?.parts.find(p=>p.id===id);if(!p)return;
  const div=document.createElement('div'),h=document.createElement('h3'),text=document.createElement('p'),link=document.createElement('a');h.textContent=p.label;text.textContent=`${p.dimensions.eaves.toFixed(1)} m à l’égout · ${p.dimensions.ridge.toFixed(1)} m au faîtage (estimés). ${p.confidence||'Volume arrière interprété à partir de la vue aérienne.'}`;link.href='./attila-references.html?part='+p.id;link.textContent='Voir les clichés et leur position ↗';div.append(h,text,link);new maplibregl.Popup({maxWidth:'310px'}).setLngLat(e.lngLat).setDOMContent(div).addTo(map);
 });
}
