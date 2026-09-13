const $=id=>document.getElementById(id);
export const NERVAL={id:'nerval',name:'Rue Gérard-de-Nerval · détail',center:[4.38165,48.94738],zoom:18.3,pitch:65,bearing:155};
const STOPS=[
 {name:'Entrée · Albert-Camus',center:[4.38195,48.94840],zoom:20.1,bearing:154,photo:'15'},
 {name:'La courbe',center:[4.38225,48.94791],zoom:19.7,bearing:174,photo:'12'},
 {name:'Façades · secteur 17–23',center:[4.38226,48.94750],zoom:20.4,bearing:116,photo:'10'},
 {name:'Carrefour · Francis-Jammes',center:[4.38135,48.94708],zoom:19.7,bearing:126,photo:'23'},
 {name:'Vers l’impasse',center:[4.38071,48.94679],zoom:19.8,bearing:244,photo:'25'},
 {name:'Fond de l’impasse',center:[4.38008,48.94655],zoom:20.2,bearing:320,photo:'02'}
];
export class NervalUI {
 constructor(map){
  this.map=map;this.current=-1;this.photoIndex=0;
  $('nerval-next').onclick=()=>this.visit((this.current+1)%STOPS.length);
  $('nerval-prev').onclick=()=>this.visit(this.current<0?STOPS.length-1:(this.current+STOPS.length-1)%STOPS.length);
  $('nerval-overview').onclick=()=>map.flyTo({...NERVAL,duration:900});
  $('nerval-photos').onclick=()=>this.showPhoto(STOPS[Math.max(0,this.current)].photo);
  $('close-photo').onclick=()=>$('photo-dialog').close();
  $('photo-prev').onclick=()=>this.displayPhoto((this.photoIndex+27)%28);
  $('photo-next').onclick=()=>this.displayPhoto((this.photoIndex+1)%28);
  $('photo-select').onchange=e=>this.displayPhoto(Number(e.target.value));
  $('photo-position').onclick=()=>{const p=this.survey.photos[this.photoIndex];map.flyTo({center:[p.longitude,p.latitude],zoom:19.8,pitch:65,duration:900});$('photo-dialog').close();};
  this.update=()=>{const c=map.getCenter();$('nerval-tools').hidden=!(c.lng>4.379&&c.lng<4.384&&c.lat>48.9458&&c.lat<48.9493&&map.getZoom()>16.4);};map.on('moveend',this.update);
  $('photo-dialog').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();$('photo-prev').click();}if(e.key==='ArrowRight'){e.preventDefault();$('photo-next').click();}});
 }
 visit(index){this.current=index;const place=STOPS[index];$('nerval-stop').textContent=`${index+1} / ${STOPS.length} · ${place.name}`;this.map.flyTo({...place,pitch:72,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:1100});}
 async load(){if(this.survey)return;const r=await fetch('./data/nerval/survey.json');if(!r.ok)throw Error('Les clichés n’ont pas pu charger.');this.survey=await r.json();$('photo-select').replaceChildren(...this.survey.photos.map((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${p.id} · ${p.description}`;return o;}));}
 async showPhoto(id='01'){try{await this.load();this.displayPhoto(Math.max(0,this.survey.photos.findIndex(p=>p.id===id)));if(!$('photo-dialog').open)$('photo-dialog').showModal();}catch(error){$('nerval-note').textContent=error.message;}}
 displayPhoto(index){
  this.photoIndex=index;const p=this.survey.photos[index];$('photo-image').src=p.image;$('photo-image').alt=p.description;$('photo-select').value=index;
  $('photo-title').textContent=`Cliché ${p.id} · ${p.label}`;$('photo-date').textContent=`${p.date_image} · ${p.source}`;
  $('photo-description').textContent=p.description;$('photo-coordinates').textContent=`Position du panorama : ${p.latitude.toFixed(7)}, ${p.longitude.toFixed(7)}. Les adresses affichées dans les captures sont indicatives.`;
 }
 ready(index){$('nerval-note').textContent=`${index.stats.photoPatches} surfaces photo · dimensions estimées`;$('nerval-photos').disabled=false;this.update();}
 showBuilding(e){
  const p=e.features[0].properties;const box=document.createElement('div');box.className='building-popup';
  const add=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;box.append(el);return el;};
  add('p','RUE GÉRARD-DE-NERVAL','popup-meta');add('h2',p.description);add('p',p.confidence);
  add('p',`Égout ≈ ${p.eaves} m · faîtage ≈ ${p.height} m. Interprétation visuelle, sans relevé métrique.`,'popup-meta');
  const button=add('button','Voir le cliché de référence','nerval-reference-button');button.onclick=()=>this.showPhoto(String(p.photos).split(',')[0]);
  this.popup?.remove();this.popup=new maplibregl.Popup({maxWidth:'310px',offset:12}).setLngLat(e.lngLat).setDOMContent(box).addTo(this.map);
 }
 getState(){return {stop:this.current+1,stops:STOPS.map((s,i)=>({id:i+1,name:s.name})),referenceDialog:$('photo-dialog').open};}
}
