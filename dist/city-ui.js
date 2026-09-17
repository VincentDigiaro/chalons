import {CITY,cityDataURL,citySwitchURL} from './city-config.js';

export function installCatalogueCityUI(kind){
 document.title=`Catalogue des ${kind} · ${CITY.label} en 3D`;
 document.querySelector('.eyebrow').textContent=CITY.name.toLocaleUpperCase('fr-FR')+' EN 3D';
 for(const link of document.querySelectorAll('a[href^="./"]')){const url=new URL(link.getAttribute('href'),location.href);url.searchParams.set('ville',CITY.id);link.href=url.href;}
 if(CITY.id==='nice')for(const paragraph of document.querySelectorAll('section p'))if(paragraph.textContent.includes('Gérard-de-Nerval'))paragraph.textContent='Les façades, le sol photographique et les toitures utilisent les données de Nice. Les textures légères s’affinent lorsqu’on se rapproche.';
}

export function installCityUI(){
 document.title=CITY.label+' FPS';
 document.querySelector('meta[name="description"]')?.setAttribute('content',CITY.label+' : carte 3D, promenade et Hautvent');
 document.getElementById('map')?.setAttribute('aria-label','Carte interactive de '+CITY.label);
 for(const button of document.querySelectorAll('[data-city]')){
  button.setAttribute('aria-pressed',String(button.dataset.city===CITY.id));
  button.onclick=()=>{const url=citySwitchURL(location.href,button.dataset.city);if(url)location.assign(url);};
 }
 if(CITY.id==='nice'){
  for(const element of document.querySelectorAll('[data-chalons-only]'))element.hidden=true;
  const coverage=document.querySelector('.coverage');if(coverage)coverage.textContent='Nice et ses abords';
  const intro=document.getElementById('city-description');if(intro)intro.textContent='Une maquette cartographique de Nice et de ses abords, construite à partir des bâtiments OpenStreetMap, du relief IGN et des photographies aériennes.';
  const roofs=document.getElementById('roof-mode-note');if(roofs)roofs.firstChild.textContent='Choix mémorisé après rechargement. ';
 }
 const locationLabel=document.getElementById('location-label');if(locationLabel)locationLabel.textContent=CITY.name.toLocaleUpperCase('fr-FR')+' ET ALENTOURS';
 const coordinates=document.getElementById('coordinates');if(coordinates)coordinates.textContent=`${CITY.home.center[1].toFixed(4)}° N · ${CITY.home.center[0].toFixed(4)}° E`;
 const fallback=document.querySelector('#fallback a');if(fallback){fallback.href=`https://www.openstreetmap.org/#map=14/${CITY.home.center[1]}/${CITY.home.center[0]}`;fallback.textContent='Voir '+CITY.name+' sur une carte ↗';}
 for(const link of document.querySelectorAll('a[href]')){
  const href=link.getAttribute('href');
  if(/^\.\/data\/(terrain\/|manifest\.json|imagery\.json)/.test(href))link.href=cityDataURL(href.slice(7));
  if(['./roof-catalogue.html','./facade-catalogue.html'].includes(href)){const url=new URL(href,location.href);url.searchParams.set('ville',CITY.id);link.href=url.href;}
 }
}
