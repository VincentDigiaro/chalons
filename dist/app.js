import {IGN_WMTS} from './imagery.js';
import {installFacadeCatalogue} from './facade-layer.js';
import {RoofTextures} from './roof-textures.js';
import {NervalLayer} from './nerval-layer.js';
import {NervalUI,NERVAL} from './nerval-ui.js';
const $ = id => document.getElementById(id);
const HOME = {center:[4.3631,48.9566],zoom:15.85,pitch:55,bearing:-24};
const BOUNDS = [[4.26,48.89],[4.46,49.035]];
// Leave room around the extraction so an overview can show its full extent,
// including the area otherwise hidden by the controls.
const NAV_BOUNDS = [[4.16,48.81],[4.56,49.115]];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 700px)').matches;
const transition = () => reducedMotion ? 0 : 1100;
const number = new Intl.NumberFormat('fr-FR');
let map, manifest, popup, selectedId, initialized=false;
let photoMode=true,roofTextures,imageryError=false,cartographyReady=false;
let nervalLayer,nervalUI;
let destinations=[{id:'centre',name:'Centre-ville de Châlons',center:HOME.center,zoom:HOME.zoom}];
const groups={buildings:['buildings-flat','buildings-3d'],green:['green'],labels:['road-labels','place-labels','landmark-labels','water-labels']};

function status(message,kind='ready'){
  $('status-text').textContent=message;$('status').className=`status ${kind}`;$('retry').hidden=kind!=='error';
}
function setPanel(open){$('explorer').classList.toggle('open',open);$('panel-toggle').setAttribute('aria-expanded',String(open));$('panel-toggle').setAttribute('aria-label',open?'Masquer les commandes':'Afficher les commandes');$('panel-toggle').textContent=open?'×':'☰';}
$('panel-toggle').onclick=()=>setPanel(!$('explorer').classList.contains('open'));
$('info-button').onclick=()=>{setPanel(false);$('info-dialog').showModal();};
$('close-info').onclick=()=>$('info-dialog').close();
$('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')setPanel(false);});
$('retry').onclick=()=>location.reload();

const roadWidth=['match',['get','kind'],['motorway','trunk'],6,['primary','secondary'],4.2,['tertiary'],3.1,['residential','unclassified','living_street'],2.4,['service'],1.5,0.7];
const width=mult=>['interpolate',['exponential',1.8],['zoom'],11,['*',roadWidth,0.10*mult],14,['*',roadWidth,0.6*mult],17,['*',roadWidth,4*mult],20,['*',roadWidth,22*mult]];
const greenKinds=['forest','wood','grass','meadow','orchard','vineyard','park','garden','allotments','village_green','recreation_ground','nature_reserve','golf_course','cemetery'];
function addLayers(){
  const source=(name,extra={})=>map.addSource(name,{type:'geojson',data:`./data/${name}.geojson`,maxzoom:16,tolerance:name==='buildings'?0.2:0.6,...extra});
  source('land');source('lines');source('buildings',{promoteId:'osm_id'});source('places');
  map.addLayer({id:'landuse',type:'fill',source:'land',paint:{'fill-color':['match',['get','kind'],['residential'],'#e2e4da',['industrial','commercial','retail'],'#dce0dc',['farmland','farmyard'],'#e5e8cf','pitch','#bad0ae','#e9ece0'],'fill-opacity':0.8},filter:['!=',['get','kind'],'water']});
  map.addLayer({id:'green',type:'fill',source:'land',filter:['in',['get','kind'],['literal',greenKinds]],paint:{'fill-color':['match',['get','kind'],['wood','forest'],'#9fbea1',['park','garden'],'#adccac','cemetery','#b8c4aa','#c3d2ae'],'fill-opacity':0.88}});
  map.addLayer({id:'water-area',type:'fill',source:'land',filter:['==',['get','kind'],'water'],paint:{'fill-color':'#8ac9ca','fill-outline-color':'#76b7bb'}});
  map.addLayer({id:'water-lines',type:'line',source:'lines',filter:['==',['get','group'],'water'],paint:{'line-color':'#8ac9ca','line-width':['interpolate',['exponential',2],['zoom'],11,0.6,15,['match',['get','kind'],'river',12,'canal',9,2.5],19,['match',['get','kind'],'river',190,'canal',140,32]]},layout:{'line-cap':'round','line-join':'round'}});
  const roads=['all',['==',['get','group'],'road'],['!=',['get','tunnel'],true]];
  map.addLayer({id:'roads-casing',type:'line',source:'lines',filter:roads,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#bdc5be','line-width':width(1.18),'line-opacity':0.6}});
  map.addLayer({id:'roads',type:'line',source:'lines',filter:roads,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','kind'],['motorway','trunk','primary','secondary'],'#fff8e7',['footway','path','cycleway','steps'],'#f3eddc','#f9faf3'],'line-width':width(1)}});
  map.addLayer({id:'rail',type:'line',source:'lines',filter:['==',['get','group'],'rail'],paint:{'line-color':'#8e9a98','line-width':['interpolate',['linear'],['zoom'],12,0.5,17,3],'line-dasharray':[3,2]}});
  map.addSource('ign-photo',{type:'raster',tiles:[IGN_WMTS],tileSize:256,maxzoom:19,bounds:[4.16,48.81,4.56,49.115],attribution:'Photographies aériennes © <a href="https://cartes.gouv.fr/" target="_blank" rel="noopener">IGN</a>'});
  map.addLayer({id:'ign-ground',type:'raster',source:'ign-photo',paint:{'raster-fade-duration':200,'raster-resampling':'linear'}});
  map.addLayer({id:'buildings-flat',type:'fill',source:'buildings',minzoom:12,paint:{'fill-color':'#c6b59f','fill-outline-color':'#aa9e8a','fill-opacity':0.85}});
  map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'buildings',minzoom:13,paint:{'fill-extrusion-color':['case',['boolean',['feature-state','selected'],false],'#edab64',['get','landmark'],'#c8a281',['match',['get','kind'],['industrial','warehouse','retail'],'#bcc5c4','#ede3d0']],'fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','min_height'],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}});
  roofTextures=new RoofTextures({onState:state=>{
    if(imageryError)return;
    $('texture-note').textContent=!photoMode?'Rendu cartographique sans photographie.':!state.active?'Photographies aériennes IGN.':state.errors?'Certaines photos IGN sont indisponibles.':state.loading?'Les toitures se précisent progressivement…':'Sol et toitures · photographies IGN';
  },onError:error=>{console.error('Roof textures:',error);$('texture-note').textContent='Toitures photo indisponibles ; volumes conservés.';}});
  map.addLayer(roofTextures);
  installFacadeCatalogue(map);
  nervalUI=new NervalUI(map);
  nervalLayer=new NervalLayer({onReady:async index=>{
    map.setFilter('buildings-3d',['!',['in',['get','osm_id'],['literal',index.excludeIds]]]);
    const response=await fetch('./data/nerval/buildings.geojson');if(!response.ok)throw Error('Fiches des bâtiments indisponibles');const buildings=await response.json();
    const byPart=new Map(buildings.features.map(f=>[f.properties.part_id,f]));
    map.on('click',e=>{const part=nervalLayer.pick(e.point),feature=byPart.get(part);if(!feature)return;popup?.remove();nervalUI.showBuilding({...e,features:[feature]});setPanel(false);});
    nervalUI.ready(index);syncBuildingVisibility();
  },onError:error=>{console.error('Nerval detail:',error);$('nerval-note').textContent='La maquette détaillée n’a pas pu charger. Rechargez la page.';}});
  map.addLayer(nervalLayer);
  const font=['Noto Sans Regular'];
  map.addLayer({id:'road-labels',type:'symbol',source:'lines',minzoom:15,filter:['all',['==',['get','group'],'road'],['!=',['get','name'],''],['!',['in',['get','kind'],['literal',['footway','path','service','steps']]]]],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':font,'text-size':12,'text-max-angle':35,'symbol-spacing':350,'text-padding':12},paint:{'text-color':'#606c67','text-halo-color':'#f4f4e9','text-halo-width':1.6}});
  map.addLayer({id:'water-labels',type:'symbol',source:'lines',minzoom:13,filter:['all',['==',['get','group'],'water'],['!=',['get','name'],'']],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':font,'text-size':13,'text-letter-spacing':0.08,'symbol-spacing':500},paint:{'text-color':'#3c797f','text-halo-color':'#c9e6df','text-halo-width':1}});
  map.addLayer({id:'place-labels',type:'symbol',source:'places',layout:{'text-field':['get','name'],'text-font':font,'text-size':['interpolate',['linear'],['zoom'],11,12,15,16],'text-padding':18,'text-max-width':12},paint:{'text-color':'#334c4c','text-halo-color':'#f3f5e9','text-halo-width':2,'text-opacity':['interpolate',['linear'],['zoom'],15,1,17,0]}});
  map.addLayer({id:'landmark-labels',type:'symbol',source:'buildings',minzoom:15,filter:['all',['==',['get','landmark'],true],['!=',['get','name'],'']],layout:{'text-field':['get','name'],'text-font':font,'text-size':12,'text-padding':10,'text-max-width':14,'text-offset':[0,1.5],'text-anchor':'top'},paint:{'text-color':'#805838','text-halo-color':'#fff9ec','text-halo-width':2}});
}
function syncCamera(){
  const p=Math.round(map.getPitch());$('pitch').value=p;$('pitch-value').value=`${p}°`;
  $('view-3d').setAttribute('aria-pressed',String(p>0));$('view-2d').setAttribute('aria-pressed',String(p===0));
  $('compass-needle').style.transform=`rotate(${-map.getBearing()}deg)`;
  const c=map.getCenter();$('coordinates').textContent=`${c.lat.toFixed(4)}° N · ${c.lng.toFixed(4)}° E`;
  syncBuildingVisibility();
}
function syncBuildingVisibility(){
  if(!initialized)return;
  const visibility=$('buildings-toggle').checked&&!(photoMode&&map.getPitch()<1)?'visible':'none';
  if(map.getLayoutProperty('buildings-3d','visibility')!==visibility)map.setLayoutProperty('buildings-3d','visibility',visibility);
}
function navigate(id,mode){
  const place=destinations.find(p=>p.id===id);if(!place)throw Error('Lieu inconnu.');
  popup?.remove();$('destination').value=id;$('location-label').textContent=place.name.toLocaleUpperCase('fr');
  map.flyTo({center:place.center,zoom:place.zoom,pitch:mode?(mode==='3d'?(place.pitch||55):0):(place.pitch??map.getPitch()),bearing:place.bearing??(id==='centre'?HOME.bearing:map.getBearing()),duration:transition(),padding:cameraPadding()});setPanel(false);
  return place;
}
function cameraPadding(){return isMobile()?{top:90,bottom:80,left:0,right:0}:{top:0,bottom:0,left:310,right:20};}
function setMode(mode){if(!map)return;map.easeTo({pitch:mode==='3d'?55:0,duration:reducedMotion?0:650});}
function setPhotoMode(visible){
  photoMode=visible;$('photo-toggle').checked=visible;
  if(!initialized)return;
  map.setLayoutProperty('ign-ground','visibility',visible?'visible':'none');
  map.setPaintProperty('buildings-flat','fill-opacity',visible?0:0.85);
  map.setPaintProperty('buildings-3d','fill-extrusion-color',['case',['boolean',['feature-state','selected'],false],'#edab64',['get','landmark'],visible?'#b9b1a1':'#c8a281',['match',['get','kind'],['industrial','warehouse','retail'],visible?'#c1c3c1':'#bcc5c4',visible?'#d0cbc0':'#ede3d0']]);
  for(const id of groups.labels){map.setPaintProperty(id,'text-halo-color',visible?'#172728':'#f3f5e9');map.setPaintProperty(id,'text-color',visible?'#f9f5e9':id==='water-labels'?'#3c797f':id==='landmark-labels'?'#805838':'#334c4c');}
  $('green-toggle').disabled=visible;$('green-toggle').closest('label').title=visible?'Disponible lorsque les photographies IGN sont désactivées':'';
  roofTextures.setVisible(visible,$('buildings-toggle').checked);
  nervalLayer?.setVisible($('buildings-toggle').checked,visible);
  syncBuildingVisibility();
  if(cartographyReady)status(visible?'OpenStreetMap · photographies IGN':'Données OpenStreetMap · prêtes');
  if(!visible)$('texture-note').textContent='Rendu cartographique sans photographie.';
}
function setLayer(name,visible){if(!initialized)return;for(const id of groups[name])map.setLayoutProperty(id,'visibility',visible?'visible':'none');$(name==='buildings'?'buildings-toggle':name==='green'?'green-toggle':'labels-toggle').checked=visible;if(name==='buildings'){roofTextures?.setVisible(photoMode,visible);nervalLayer?.setVisible(visible,photoMode);syncBuildingVisibility();if(!visible){popup?.remove();nervalUI?.popup?.remove();}}}
function wireControls(){
  $('nerval-open').onclick=()=>navigate('nerval','3d');
  $('photo-toggle').onchange=e=>setPhotoMode(e.target.checked);
  $('view-3d').onclick=()=>setMode('3d');$('view-2d').onclick=()=>setMode('2d');
  $('pitch').oninput=e=>map.setPitch(Number(e.target.value));
  $('north').onclick=()=>map.easeTo({bearing:0,duration:reducedMotion?0:650});
  $('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();
  $('reset').onclick=()=>{map.easeTo({...HOME,padding:cameraPadding(),duration:transition()});$('destination').value='centre';$('location-label').textContent='CENTRE-VILLE';popup?.remove();setPanel(false);};
  $('overview').onclick=()=>{map.fitBounds(BOUNDS,{padding:isMobile()?{top:150,bottom:90,left:30,right:70}:{top:90,bottom:110,left:340,right:100},pitch:0,bearing:0,duration:transition()});$('location-label').textContent='CHÂLONS ET ALENTOURS';$('destination').value='';popup?.remove();setPanel(false);};
  $('destination').onchange=e=>navigate(e.target.value);
  for(const name of Object.keys(groups)){const id=name==='buildings'?'buildings-toggle':name==='green'?'green-toggle':'labels-toggle';$(id).onchange=e=>setLayer(name,e.target.checked);}
  map.on('move',syncCamera);
  map.on('dragstart',()=>{setPanel(false);$('location-label').textContent='EXPLORATION LIBRE';$('destination').value='';});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{map.resize();map.setPadding(cameraPadding());},150);});
}
function showBuilding(e){
  if(nervalLayer?.pick(e.point))return;
  if(!$('buildings-toggle').checked)return;
  const f=e.features?.[0];if(!f)return;
  popup?.remove();
  if(selectedId)map.setFeatureState({source:'buildings',id:selectedId},{selected:false});
  selectedId=f.properties.osm_id;map.setFeatureState({source:'buildings',id:selectedId},{selected:true});
  const p=f.properties, box=document.createElement('section');
  const types={house:'Maison',detached:'Maison individuelle',apartments:'Immeuble résidentiel',industrial:'Bâtiment industriel',warehouse:'Entrepôt',church:'Église',cathedral:'Cathédrale',chapel:'Chapelle',school:'Établissement scolaire',garage:'Garage',garages:'Garages',retail:'Commerce',commercial:'Bâtiment commercial',roof:'Structure couverte'};
  function el(tag,text,cls){const elem=document.createElement(tag);elem.textContent=text;if(cls)elem.className=cls;box.append(elem);return elem;}
  el('p','BÂTIMENT OPENSTREETMAP','popup-meta');el('h2',p.name||types[p.kind]||'Bâtiment');
  el('div',`${number.format(p.height)} m de hauteur`,'height-badge');
  const origins={osm:'Hauteur renseignée dans OpenStreetMap.',levels:`Hauteur calculée à partir de ${p.levels} étage(s), à 3 m par étage, plus la toiture renseignée.`,estimated:'Hauteur indicative estimée selon le type de bâtiment.'};
  el('p',p.height_warning?'Valeur OSM incohérente : hauteur indicative corrigée.':origins[p.height_source]);
  if(p.address)el('p',p.address,'popup-meta');
  if(p.min_height>0)el('p',`Base du volume : ${number.format(p.min_height)} m.`,'popup-meta');
  if(/^(way|relation)\/\d+$/.test(p.osm_id)){const link=el('a','Voir la fiche OpenStreetMap ↗');link.href=`https://www.openstreetmap.org/${p.osm_id}`;link.target='_blank';link.rel='noopener';}
  popup?.remove();popup=new maplibregl.Popup({closeButton:true,maxWidth:'285px',offset:12}).setLngLat(e.lngLat).setDOMContent(box).addTo(map);
  const id=selectedId;popup.on('close',()=>map.setFeatureState({source:'buildings',id},{selected:false}));setPanel(false);
}
async function loadMetadata(){
  const responses=await Promise.all(['manifest.json','places.geojson'].map(async f=>{const r=await fetch(`./data/${f}`);if(!r.ok)throw Error(`Données indisponibles (${r.status})`);return r.json();}));
  manifest=responses[0];const places=responses[1].features;
  const wanted=['Fagnières','Saint-Memmie','Compertrix','Sarry','Saint-Martin-sur-le-Pré','Recy','Coolus','Moncetz-Longevas','Saint-Gibrien','Cheniers'];
  destinations=[destinations[0],NERVAL,...wanted.map(name=>places.find(f=>f.properties.name===name)).filter(Boolean).map(f=>({id:f.properties.osm_id,name:f.properties.name,center:f.geometry.coordinates,zoom:15.3}))];
  $('destination').replaceChildren(...destinations.map(p=>{const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name;return opt;}));$('destination').disabled=false;
  $('building-count').textContent=number.format(manifest.files.buildings.features);
  const date=new Date(manifest.osm_timestamp||manifest.extracted_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  $('data-date').textContent=`Données OSM du ${date}. Extrait fixe d’environ 15 × 16 km, disponible avec l’application. Les modifications ultérieures d’OSM nécessitent un nouvel extrait.`;
}
function exposeMapTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_map_state',description:'Lire le point de vue actuel, le rendu photo et les destinations disponibles de la carte de Châlons.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),rendering:photoMode?'photo':'map',roofs:roofTextures?.getState(),nerval:nervalLayer?.getState(),streetViews:nervalUI?.getState(),destinations})});
  register({name:'visit_nerval',description:'Afficher l’un des six points de vue de la rue Gérard-de-Nerval.',inputSchema:{type:'object',properties:{stop:{type:'integer',minimum:1,maximum:6}},required:['stop'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{if(!Number.isInteger(input?.stop)||input.stop<1||input.stop>6)throw Error('Point de vue entre 1 et 6 requis.');nervalUI.visit(input.stop-1);if(map.isMoving())await map.once('moveend');return nervalUI.getState();}});
  register({name:'set_map_rendering',description:'Activer les photographies IGN sur le sol et les toitures ou revenir au rendu cartographique.',inputSchema:{type:'object',properties:{photographs:{type:'boolean'}},required:['photographs'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(typeof input?.photographs!=='boolean')throw Error('photographs doit être un booléen.');setPhotoMode(input.photographs);return {photographs:photoMode};}});
  register({name:'navigate_map',description:'Déplacer la carte visible vers une destination disponible et choisir une vue 2D ou 3D.',inputSchema:{type:'object',properties:{destination:{type:'string'},mode:{type:'string',enum:['2d','3d']}},required:['destination'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||typeof input.destination!=='string'||!destinations.some(p=>p.id===input.destination)||(input.mode&&!['2d','3d'].includes(input.mode)))throw Error('Destination ou mode invalide.');const place=navigate(input.destination,input.mode);if(map.isMoving())await map.once('moveend');return {destination:place.name,center:map.getCenter().toArray(),pitch:map.getPitch()};}});
}
async function boot(){
  status('Chargement du territoire…','loading');
  if(!window.maplibregl){$('fallback').hidden=false;status('Le moteur cartographique n’a pas pu charger.','error');return;}
  try{
    map=new maplibregl.Map({container:'map',style:{version:8,glyphs:`${location.origin}${location.pathname.replace(/[^/]*$/,'')}fonts/{fontstack}/{range}.pbf`,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf0e3'}}],light:{anchor:'viewport',color:'#fff6e8',intensity:0.42,position:[1.3,200,45]}},...(location.hash==='#nerval'?NERVAL:HOME),maxBounds:NAV_BOUNDS,minZoom:10.4,maxZoom:22,maxPitch:80,canvasContextAttributes:{antialias:!isMobile()},pixelRatio:Math.min(devicePixelRatio||1,isMobile()?1.5:2),renderWorldCopies:false,attributionControl:false,locale:{'AttributionControl.ToggleAttribution':'Afficher ou masquer les crédits','Popup.Close':'Fermer la fiche'}});
    map.addControl(new maplibregl.AttributionControl({compact:isMobile(),customAttribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a>'}));
    map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
    map.getCanvas().setAttribute('aria-label','Carte : flèches pour déplacer, plus et moins pour zoomer, Maj et flèches pour tourner.');
    let dataError=false;
    map.on('error',e=>{console.error('Map error:',e.error);if(e.sourceId==='ign-photo'||String(e.error).includes('data.geopf.fr')){imageryError=true;$('texture-note').textContent='Certaines photos IGN sont indisponibles. Le plan reste accessible.';return;}dataError=true;status('Certaines données n’ont pas pu charger.','error');});
    map.getCanvas().addEventListener('webglcontextlost',()=>status('Rendu interrompu. Restauration en cours…','loading'));
    map.getCanvas().addEventListener('webglcontextrestored',()=>status('Rendu restauré'));
    // Register the event promise before awaiting metadata, so an early map load cannot be missed.
    await Promise.all([map.once('load'),loadMetadata()]);
    map.setPadding(cameraPadding());addLayers();initialized=true;setPhotoMode(photoMode);wireControls();syncCamera();
    for(const id of ['buildings-3d','buildings-flat'])map.on('click',id,e=>{if(e.originalEvent._buildingHandled)return;e.originalEvent._buildingHandled=true;showBuilding(e);});
    map.on('mousemove',e=>{const features=map.queryRenderedFeatures(e.point,{layers:groups.buildings});map.getCanvas().style.cursor=features.length?'pointer':'';});
    map.once('idle',()=>{cartographyReady=true;if(!dataError)status(photoMode?'OpenStreetMap · photographies IGN':'Données OpenStreetMap · prêtes');});
    exposeMapTools();
    if(location.hash==='#nerval')navigate('nerval','3d');
  }catch(error){console.error(error);if(!map)$('fallback').hidden=false;status('Le chargement de la carte a échoué.','error');}
}
boot();
