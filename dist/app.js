import {loadTerrain} from './terrain.js';
import {installMapTerrain} from './terrain-map.js';
import {CAMP127,installCamp127UI} from './camp127-ui.js';
import {PARC14,installParc14UI} from "./parc14-ui.js";
import {BUIRETTE,BUIRETTE_ODD,BUIRETTE_15,installBuiretteUI} from './buirette-ui.js';
import {SKY_STYLE,MapSkyLayer} from './scene-sky.js';
import {IMAGERY_TILES,installImageryProtocol} from './imagery.js';
import {installFacadeCatalogue} from './facade-layer.js';
import {RoofTextures} from './roof-textures.js';
import {getRoofMode,setRoofMode} from './roof-mode.js';
import {NervalLayer} from './nerval-layer.js';
import {CityRoadsLayer} from './city-roads-layer.js';
import {NervalUI,NERVAL,NERVAL_FOCUS,NERVAL_REAR,NERVAL_GARDEN,NERVAL_END,nervalFocusView,nervalRearView} from './nerval-ui.js';
import {ATTILA,ATTILA_REAR,ATTILA_STREET,ATTILA_TERRACE,ATTILA_CORNER,installAttilaUI} from './attila-ui.js';
import {WalkMode} from './walk-mode.js';
import {readWalkReturn} from './walk-return.js';
import {readWalkEntry} from './walk-url.js';
const $ = id => document.getElementById(id);
const HOME = {center:[4.3631,48.9566],zoom:15.85,pitch:55,bearing:-24};
const BOUNDS = [[4.26,48.89],[4.46,49.035]];
// Leave room around the extraction so an overview can show its full extent,
// including the area otherwise hidden by the controls.
const NAV_BOUNDS = [[4.16,48.81],[4.56,49.115]];
const walkReturn=readWalkReturn(location.hash,NAV_BOUNDS);
const walkEntry=readWalkEntry(location.search,NAV_BOUNDS);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 700px)').matches;
const transition = () => reducedMotion ? 0 : 1100;
const number = new Intl.NumberFormat('fr-FR');
let map, manifest, initialized=false;
let photoMode=true,roofTextures,cartographyReady=false;
let nervalLayer,nervalUI,attilaLayer,cityRoads;
const customLayers=new Map();let customModels=[];
let walking=false,walkMode;
let destinations=[{id:'centre',name:'Centre-ville de Châlons',center:HOME.center,zoom:HOME.zoom}];
const groups={buildings:['buildings-flat','buildings-3d'],green:['green'],labels:['road-labels','place-labels','landmark-labels','water-labels']};

function status(message,kind='ready'){
  $('status-text').textContent=message;$('status').className=`status ${kind}`;$('status').hidden=kind!=='error';$('retry').hidden=kind!=='error';
}
function setPanel(open){
  const panel=$('explorer');
  if(!open&&panel.contains(document.activeElement))$('panel-toggle').focus({preventScroll:true});
  panel.hidden=!open;panel.classList.toggle('open',open);
  $('panel-toggle').setAttribute('aria-expanded',String(open));
  $('panel-toggle').setAttribute('aria-label',open?'Masquer les réglages de la carte':'Afficher les réglages de la carte');
}
$('panel-toggle').onclick=()=>setPanel($('explorer').hidden);
$('panel-close').onclick=()=>setPanel(false);
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
  map.addSource('ign-photo',{type:'raster',tiles:[IMAGERY_TILES],tileSize:256,maxzoom:19,bounds:[4.16,48.81,4.56,49.115],attribution:'Photographies aériennes © <a href="https://cartes.gouv.fr/" target="_blank" rel="noopener">IGN</a>'});
  map.addLayer({id:'ign-ground',type:'raster',source:'ign-photo',paint:{'raster-fade-duration':200,'raster-resampling':'linear'}});
  map.addSource('city-roads-overview',{type:'geojson',data:'./data/city-roads/overview.geojson',maxzoom:14,tolerance:.4});
  map.addLayer({id:'city-roads-overview',type:'fill',source:'city-roads-overview',minzoom:11,maxzoom:15.5,paint:{'fill-color':['match',['get','material'],0,'#515355',1,'#45494b',2,'#9b907c','#a09274'],'fill-opacity':1}});
  cityRoads=new CityRoadsLayer();map.addLayer(cityRoads);
  map.addLayer({id:'buildings-flat',type:'fill',source:'buildings',minzoom:12,paint:{'fill-color':'#c6b59f','fill-outline-color':'#aa9e8a','fill-opacity':0.85}});
  map.addLayer({id:'buildings-3d',type:'fill-extrusion',source:'buildings',minzoom:13,paint:{'fill-extrusion-color':['case',['boolean',['feature-state','selected'],false],'#edab64',['get','landmark'],'#c8a281',['match',['get','kind'],['industrial','warehouse','retail'],'#bcc5c4','#ede3d0']],'fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','min_height'],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}});
  roofTextures=new RoofTextures({onState:state=>{
    $('texture-note').textContent=!photoMode?'Rendu cartographique sans photographie.':(getRoofMode()==='aerial'?'Sol et toitures · photographies aériennes':'Sol photographique · 32 textures de toiture');
  },onError:error=>{console.error('Roof textures:',error);}});
  map.addLayer(roofTextures);
  installFacadeCatalogue(map);
  nervalUI=new NervalUI(map);
  installCustomModels();
  const font=['Noto Sans Regular'];
  map.addLayer({id:'road-labels',type:'symbol',source:'lines',minzoom:15,filter:['all',['==',['get','group'],'road'],['!=',['get','name'],''],['!',['in',['get','kind'],['literal',['footway','path','service','steps']]]]],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':font,'text-size':12,'text-max-angle':35,'symbol-spacing':350,'text-padding':12},paint:{'text-color':'#606c67','text-halo-color':'#f4f4e9','text-halo-width':1.6}});
  map.addLayer({id:'water-labels',type:'symbol',source:'lines',minzoom:13,filter:['all',['==',['get','group'],'water'],['!=',['get','name'],'']],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':font,'text-size':13,'text-letter-spacing':0.08,'symbol-spacing':500},paint:{'text-color':'#3c797f','text-halo-color':'#c9e6df','text-halo-width':1}});
  map.addLayer({id:'place-labels',type:'symbol',source:'places',layout:{'text-field':['get','name'],'text-font':font,'text-size':['interpolate',['linear'],['zoom'],11,12,15,16],'text-padding':18,'text-max-width':12},paint:{'text-color':'#334c4c','text-halo-color':'#f3f5e9','text-halo-width':2,'text-opacity':['interpolate',['linear'],['zoom'],15,1,17,0]}});
  map.addLayer({id:'landmark-labels',type:'symbol',source:'buildings',minzoom:15,filter:['all',['==',['get','landmark'],true],['!=',['get','name'],'']],layout:{'text-field':['get','name'],'text-font':font,'text-size':12,'text-padding':10,'text-max-width':14,'text-offset':[0,1.5],'text-anchor':'top'},paint:{'text-color':'#805838','text-halo-color':'#fff9ec','text-halo-width':2}});
}
async function installCustomModels(){
 try{
  const response=await fetch('./data/custom-models.json');if(!response.ok)throw Error('Custom model registry HTTP '+response.status);
  const registry=await response.json();if(walking||!map)return;customModels=registry.models;
  for(const model of customModels){
   const layer=new NervalLayer({...model,id:model.layerId,onReady:index=>{
    if(walking)return;
    if(model.id==='nerval')nervalUI.ready(index);
    if(!layer.uiInstalled){if(model.id==='attila')installAttilaUI(map,layer);if(model.id==='buirette')installBuiretteUI(map,layer);if(model.id==='parc14')installParc14UI(map,layer);if(model.id==='camp127')installCamp127UI(map,layer);layer.uiInstalled=true;}
    syncBuildingVisibility();
   },onError:error=>console.error(model.label+':',error)});
   customLayers.set(model.id,layer);if(model.id==='nerval')nervalLayer=layer;if(model.id==='attila')attilaLayer=layer;
   layer.setVisible($('buildings-toggle').checked,photoMode);map.addLayer(layer);
  }
  // A destination can be visited before its heavy model has loaded.
  $('nerval-open').disabled=false;$('attila-open').disabled=false;
  for(const m of customModels){if(destinations.some(d=>d.id===m.id))continue;const d={id:m.id,name:m.label,center:[(m.bounds[0]+m.bounds[2])/2,(m.bounds[1]+m.bounds[3])/2],zoom:19,pitch:55,bearing:0};destinations.push(d);$('destination').append(new Option(d.name,d.id));}
  syncDetailedExclusions();
 }catch(error){if(!walking)console.error('Detailed models:',error);}
}
function syncDetailedExclusions(){
  const ids=customModels.flatMap(model=>model.excludeIds);
  const filter=['all',['!',['in',['get','osm_id'],['literal',ids]]]];
  // From zoom 14, catalogue walls and textured roofs replace the solid OSM
  // extrusion. Retain only the kinds deliberately excluded from the catalogue.
  if(photoMode&&map.getZoom()>=14)filter.push(['in',['get','kind'],['literal',['no','roof','greenhouse','construction']]]);
  if(JSON.stringify(map.getFilter('buildings-3d'))!==JSON.stringify(filter))map.setFilter('buildings-3d',filter);
}
function syncCamera(){
  if(walking)return;
  const p=Math.round(map.getPitch());$('pitch').value=p;$('pitch-value').value=`${p}°`;
  $('view-3d').setAttribute('aria-pressed',String(p>0));$('view-2d').setAttribute('aria-pressed',String(p===0));
  $('compass-needle').style.transform=`rotate(${-map.getBearing()}deg)`;
  const c=map.getCenter();$('coordinates').textContent=`${c.lat.toFixed(4)}° N · ${c.lng.toFixed(4)}° E`;
  syncBuildingVisibility();
}
function syncBuildingVisibility(){
  if(!initialized)return;
  const visibility=$('buildings-toggle').checked?'visible':'none';
  if(map.getLayoutProperty('buildings-3d','visibility')!==visibility)map.setLayoutProperty('buildings-3d','visibility',visibility);
  syncDetailedExclusions();
}
function navigate(id,mode){
  const place=id==='nerval-rear'?nervalRearView():id==='nerval-focus'?nervalFocusView():destinations.find(p=>p.id===id);if(!place)throw Error('Lieu inconnu.');
  if(id==='nerval-focus'&&nervalUI){nervalUI.current=4;$('nerval-stop').textContent='Zone sélectionnée · impasse et boucle';}
  $('destination').value=id;$('location-label').textContent=place.name.toLocaleUpperCase('fr');
  map.flyTo({center:place.center,zoom:place.zoom,pitch:mode?(mode==='3d'?(place.pitch||55):0):(place.pitch??map.getPitch()),bearing:place.bearing??(id==='centre'?HOME.bearing:map.getBearing()),duration:transition(),padding:cameraPadding()});setPanel(false);
  return place;
}
function cameraPadding(){return {top:0,bottom:0,left:0,right:0};}
function setMode(mode){if(!map)return;map.easeTo({pitch:mode==='3d'?55:0,duration:reducedMotion?0:650});}
function setPhotoMode(visible){
  photoMode=visible;$('photo-toggle').checked=visible;
  if(!initialized)return;
  map.setLayoutProperty('ign-ground','visibility',visible?'visible':'none');
  map.setPaintProperty('buildings-flat','fill-opacity',visible?0:0.85);
  map.setPaintProperty('buildings-3d','fill-extrusion-color',['case',['boolean',['feature-state','selected'],false],'#edab64',['get','landmark'],visible?'#b9b1a1':'#c8a281',['match',['get','kind'],['industrial','warehouse','retail'],visible?'#c1c3c1':'#bcc5c4',visible?'#d0cbc0':'#ede3d0']]);
  for(const id of groups.labels){map.setPaintProperty(id,'text-halo-color',visible?'#172728':'#f3f5e9');map.setPaintProperty(id,'text-color',visible?'#f9f5e9':id==='water-labels'?'#3c797f':id==='landmark-labels'?'#805838':'#334c4c');}
  $('green-toggle').disabled=visible;$('green-toggle').closest('label').title=visible?'Disponible lorsque les photographies aériennes sont désactivées':'';
  roofTextures.setVisible(visible,$('buildings-toggle').checked);
  for(const layer of customLayers.values())layer.setVisible($('buildings-toggle').checked,visible);
  syncBuildingVisibility();
  if(cartographyReady)status(visible?'Photographies aériennes prêtes':'Carte prête');
  if(!visible)$('texture-note').textContent='Rendu cartographique sans photographie.';
}
function setLayer(name,visible){if(!initialized)return;for(const id of groups[name])map.setLayoutProperty(id,'visibility',visible?'visible':'none');$(name==='buildings'?'buildings-toggle':name==='green'?'green-toggle':'labels-toggle').checked=visible;if(name==='buildings'){roofTextures?.setVisible(photoMode,visible);for(const layer of customLayers.values())layer.setVisible(visible,photoMode);syncBuildingVisibility();}}
function wireControls(){
  $('roof-mode').value=getRoofMode();
  $('roof-mode').onchange=e=>setRoofMode(e.target.value);
  $('nerval-open').onclick=()=>navigate('nerval-focus','3d');
  $('attila-open').onclick=()=>navigate('attila','3d');
  $('attila-rear').onclick=()=>navigate('attila-rear','3d');
  $('attila-street').onclick=()=>navigate('attila-street','3d');
  $('attila-terrace').onclick=()=>navigate('attila-terrace','3d');
  $('photo-toggle').onchange=e=>setPhotoMode(e.target.checked);
  $('view-3d').onclick=()=>setMode('3d');$('view-2d').onclick=()=>setMode('2d');
  $('pitch').oninput=e=>map.setPitch(Number(e.target.value));
  $('north').onclick=()=>map.easeTo({bearing:0,duration:reducedMotion?0:650});
  $('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();
  $('overview').onclick=()=>{map.fitBounds(BOUNDS,{padding:isMobile()?{top:80,bottom:80,left:35,right:35}:{top:80,bottom:90,left:80,right:80},pitch:0,bearing:0,duration:transition()});$('location-label').textContent='CHÂLONS ET ALENTOURS';$('destination').value='';setPanel(false);};
  $('destination').onchange=e=>navigate(e.target.value);
  for(const name of Object.keys(groups)){const id=name==='buildings'?'buildings-toggle':name==='green'?'green-toggle':'labels-toggle';$(id).onchange=e=>setLayer(name,e.target.checked);}
  map.on('move',syncCamera);
  map.on('dragstart',()=>{setPanel(false);$('location-label').textContent='EXPLORATION LIBRE';$('destination').value='';});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(walking)return;map.resize();map.setPadding(cameraPadding());},150);});
}
async function loadMetadata(){
  const responses=await Promise.all(['manifest.json','places.geojson'].map(async f=>{const r=await fetch(`./data/${f}`);if(!r.ok)throw Error(`Données indisponibles (${r.status})`);return r.json();}));
  manifest=responses[0];const places=responses[1].features;
  const wanted=['Fagnières','Saint-Memmie','Compertrix','Sarry','Saint-Martin-sur-le-Pré','Recy','Coolus','Moncetz-Longevas','Saint-Gibrien','Cheniers'];
  destinations=[destinations[0],CAMP127,PARC14,BUIRETTE,BUIRETTE_ODD,BUIRETTE_15,ATTILA,ATTILA_REAR,ATTILA_STREET,ATTILA_TERRACE,ATTILA_CORNER,NERVAL_FOCUS,NERVAL_REAR,NERVAL_GARDEN,NERVAL_END,NERVAL,...wanted.map(name=>places.find(f=>f.properties.name===name)).filter(Boolean).map(f=>({id:f.properties.osm_id,name:f.properties.name,center:f.geometry.coordinates,zoom:15.3}))];
  const overviewOption=document.createElement('option');overviewOption.value='';overviewOption.textContent='Vue d’ensemble';overviewOption.disabled=true;overviewOption.selected=true;
  $('destination').replaceChildren(overviewOption,...destinations.map(p=>{const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name;return opt;}));$('destination').disabled=false;
  $('building-count').textContent=number.format(manifest.files.buildings.features);
  const date=new Date(manifest.osm_timestamp||manifest.extracted_at).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  $('data-date').textContent=`Données OSM du ${date}. Extrait fixe d’environ 15 × 16 km, disponible avec l’application. Les modifications ultérieures d’OSM nécessitent un nouvel extrait.`;
}
function exposeMapTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_map_state',description:'Lire le point de vue actuel, le rendu photo et les destinations disponibles de la carte de Châlons.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>walking?walkMode.getState():({center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),rendering:photoMode?'photo':'map',roofs:roofTextures?.getState(),roads:cityRoads?.getState(),nerval:nervalLayer?.getState(),attila:attilaLayer?.getState(),customModels:Object.fromEntries([...customLayers].map(([id,l])=>[id,l.getState()])),streetViews:nervalUI?.getState(),destinations})});
  register({name:'visit_nerval',description:'Afficher l’un des six points de vue de la rue Gérard-de-Nerval.',inputSchema:{type:'object',properties:{stop:{type:'integer',minimum:1,maximum:6}},required:['stop'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{if(!Number.isInteger(input?.stop)||input.stop<1||input.stop>6)throw Error('Point de vue entre 1 et 6 requis.');nervalUI.visit(input.stop-1);if(map.isMoving())await map.once('moveend');return nervalUI.getState();}});
  register({name:'set_map_rendering',description:'Activer les photographies aériennes sur le sol et les toitures ou revenir au rendu cartographique.',inputSchema:{type:'object',properties:{photographs:{type:'boolean'}},required:['photographs'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(typeof input?.photographs!=='boolean')throw Error('photographs doit être un booléen.');setPhotoMode(input.photographs);return {photographs:photoMode};}});
  register({name:'navigate_map',description:'Déplacer la carte visible vers une destination disponible et choisir une vue 2D ou 3D.',inputSchema:{type:'object',properties:{destination:{type:'string'},mode:{type:'string',enum:['2d','3d']}},required:['destination'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input=>{if(!input||typeof input.destination!=='string'||!destinations.some(p=>p.id===input.destination)||(input.mode&&!['2d','3d'].includes(input.mode)))throw Error('Destination ou mode invalide.');const place=navigate(input.destination,input.mode);if(map.isMoving())await map.once('moveend');return {destination:place.name,center:map.getCenter().toArray(),pitch:map.getPitch()};}});
}
async function boot(){
  if(walkEntry){
    walkMode=new WalkMode({map:null,onStart:()=>{walking=true;setPanel(false);}});
    await walkMode.start({entry:walkEntry});
    return;
  }
  status('Chargement du territoire…','loading');
  if(!window.maplibregl){$('fallback').hidden=false;status('Le moteur cartographique n’a pas pu charger.','error');return;}
  try{
    map=new maplibregl.Map({container:'map',style:{version:8,glyphs:`${location.origin}${location.pathname.replace(/[^/]*$/,'')}fonts/{fontstack}/{range}.pbf`,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf0e3'}}],light:{anchor:'viewport',color:'#fff6e8',intensity:0.42,position:[1.3,200,45]}},...(walkReturn??(location.hash==='#camp127'?CAMP127:location.hash==='#parc14'?PARC14:location.hash==='#buirette-15'?BUIRETTE_15:location.hash==='#buirette-17-19'?BUIRETTE_ODD:location.hash==='#buirette'?BUIRETTE:location.hash==='#attila'?ATTILA:location.hash==='#attila-rear'?ATTILA_REAR:location.hash==='#attila-street'?ATTILA_STREET:location.hash==='#attila-terrace'?ATTILA_TERRACE:location.hash==='#nerval-rear'?nervalRearView():location.hash==='#nerval-focus'?nervalFocusView():location.hash==='#nerval'?NERVAL:{bounds:BOUNDS,fitBoundsOptions:{padding:isMobile()?40:80},pitch:0,bearing:0})),maxBounds:NAV_BOUNDS,minZoom:10.4,maxZoom:22,maxPitch:80,canvasContextAttributes:{antialias:!isMobile()},pixelRatio:Math.min(devicePixelRatio||1,isMobile()?1.5:2),renderWorldCopies:false,attributionControl:false,locale:{'Popup.Close':'Fermer la fiche'}});

    map.addControl(new maplibregl.ScaleControl({maxWidth:100,unit:'metric'}),'bottom-left');
    map.getCanvas().setAttribute('aria-label','Carte : flèches pour déplacer, plus et moins pour zoomer, Maj et flèches pour tourner.');
    let dataError=false;
    map.on('error',e=>{console.error('Map error:',e.error);if(e.sourceId==='ign-photo'||String(e.error?.url||e.error).includes('/data/imagery/ign/'))return;dataError=true;status('Certaines données n’ont pas pu charger.','error');});
    map.getCanvas().addEventListener('webglcontextlost',()=>status('Rendu interrompu. Restauration en cours…','loading'));
    map.getCanvas().addEventListener('webglcontextrestored',()=>status('Rendu restauré'));
    // Register the event promise before awaiting metadata, so an early map load cannot be missed.
    await Promise.all([map.once('load'),loadMetadata(),loadTerrain()]);
    installMapTerrain(map,maplibregl);
    map.setSky({...SKY_STYLE});
    map.addLayer(new MapSkyLayer());
    map.setPadding(cameraPadding());addLayers();initialized=true;setLayer('labels',false);setPhotoMode(photoMode);wireControls();syncCamera();
    map.once('idle',()=>{cartographyReady=true;if(!dataError)status(photoMode?'Photographies aériennes prêtes':'Carte prête');});
    exposeMapTools();
    walkMode=new WalkMode({map,onStart:()=>setPanel(false),onHandoff:()=>{walking=true;roofTextures=null;nervalLayer=null;nervalUI=null;attilaLayer=null;map=null;}});
    if(['#attila','#attila-rear','#attila-street','#attila-terrace','#attila-corner'].includes(location.hash))navigate(location.hash.slice(1),'3d');
    if(location.hash==='#buirette')navigate('buirette','3d');
    if(location.hash==='#nerval')navigate('nerval','3d');
    if(location.hash==='#nerval-focus')navigate('nerval-focus','3d');
    if(location.hash==='#nerval-rear')navigate('nerval-rear','3d');
    if(location.hash==='#nerval-garden')navigate('nerval-garden','3d');
    if(location.hash==='#nerval-end')navigate('nerval-end','3d');
    if(walkReturn){$('location-label').textContent='RETOUR DE PROMENADE';const option=new Option('Position à la sortie de promenade','walk-return',true,true);option.disabled=true;$('destination').append(option);}
  }catch(error){console.error(error);if(!map)$('fallback').hidden=false;status('Le chargement de la carte a échoué.','error');}
}
if(window.maplibregl)installImageryProtocol(window.maplibregl);
boot();
