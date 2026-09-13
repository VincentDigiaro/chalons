import fs from 'node:fs/promises';
import osmtogeojson from 'osmtogeojson';

// One bounded extraction, served with the app: no per-visitor Overpass requests.
const bbox = [48.89, 4.26, 49.035, 4.46]; // south, west, north, east
const query = `[out:json][timeout:180][bbox:${bbox.join(',')}];(way[building];relation[building];way["building:part"];relation["building:part"];way[highway];way[railway=rail];way[waterway];way[natural=water];relation[natural=water];way[waterway=riverbank];relation[waterway=riverbank];way[landuse];relation[landuse];way[natural=wood];relation[natural=wood];way[leisure~"^(park|garden|pitch|golf_course|nature_reserve)$"];relation[leisure~"^(park|garden|nature_reserve)$"];node[place~"^(city|town|village|suburb|hamlet)$"];);out body;>;out skel qt;`;
await fs.mkdir('.cache', {recursive:true});
await fs.mkdir('dist/data', {recursive:true});
let raw;
try { raw = JSON.parse(await fs.readFile('.cache/osm.json','utf8')); console.log('Using cached OSM extraction'); }
catch {
  for (const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']) {
    try {
      console.log(`Extracting OSM from ${endpoint}`);
      const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'ChalonsAtlas3D/1.0 (local OSM visualization)'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(220000)});
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      raw = await response.json();
      if (raw.remark || !raw.elements?.length) throw Error(raw.remark || 'Empty extraction');
      await fs.writeFile('.cache/osm.json',JSON.stringify(raw));
      break;
    } catch (error) { console.error(error.message); }
  }
}
if (!raw) throw Error('OSM extraction failed. Run npm run data:refresh again later.');
console.log(`Converting ${raw.elements.length} OSM elements`);
const geojson = osmtogeojson(raw,{flatProperties:true});
const groups = {buildings:[],land:[],lines:[],places:[]};
const num = value => {
  if (!value) return null;
  const text=String(value).trim().replace(',','.');
  if (/^\d+(\.\d+)?\s*(m|metres|meters)?$/.test(text)) return parseFloat(text);
  if (/^\d+(\.\d+)?\s*(ft|')$/.test(text)) return parseFloat(text)*0.3048;
  return null;
};
function roundCoordinates(coords) {return typeof coords[0]==='number' ? coords.map(n=>Math.round(n*1e6)/1e6) : coords.map(roundCoordinates);}
let explicit=0, levels=0, estimated=0, tainted=0;
for(const f of geojson.features){
  const t=f.properties, polygon=/Polygon/.test(f.geometry.type), line=/LineString/.test(f.geometry.type);
  if(t.tainted){tainted++;continue;}
  f.geometry.coordinates=roundCoordinates(f.geometry.coordinates);
  const p={osm_id:f.id,name:t['name:fr']||t.name||''};
  if(polygon && ((t.building && t.building!=='no') || (t['building:part'] && t['building:part']!=='no'))){
    const type=t['building:part']||t.building;
    const measured=num(t.height ?? t['building:height']);
    const floors=num(t['building:levels']);
    const roof=num(t['roof:height'])??0;
    const min=num(t.min_height)??((num(t['building:min_level'])??0)*3);
    const defaults={house:7,detached:7,semidetached_house:7,terrace:8,apartments:14,garage:3,garages:3,shed:3,industrial:9,warehouse:9,retail:6,commercial:10,church:20,cathedral:25,chapel:12,school:10,hospital:16,tower:20,roof:4};
    const source=measured!==null?'osm':floors!==null?'levels':'estimated';
    let h=measured ?? (floors!==null ? floors*3+roof : (defaults[type]??9));
    if(h<0.5 || h>250 || min>=h){h=Math.max(defaults[type]??9,min+3);p.height_warning=true;}
    if(source==='osm')explicit++;else if(source==='levels')levels++;else estimated++;
    Object.assign(p,{kind:type,height:Math.round(h*10)/10,min_height:Math.round(min*10)/10,height_source:source,levels:floors,landmark:['church','cathedral','chapel','civic','townhall'].includes(type)||t.amenity==='townhall',address:[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ')});
    groups.buildings.push({...f,properties:p});
  } else if(polygon) {
    const kind = t.natural==='water'||t.waterway==='riverbank' ? 'water' : t.landuse || t.leisure || t.natural;
    if(kind){groups.land.push({...f,properties:{...p,kind}});}
  } else if(line && (t.highway||t.waterway||t.railway)){
    groups.lines.push({...f,properties:{...p,kind:t.highway||t.waterway||'rail',group:t.highway?'road':t.waterway?'water':'rail',bridge:t.bridge==='yes',tunnel:t.tunnel==='yes'}});
  } else if(f.geometry.type==='Point' && t.place && p.name){groups.places.push({...f,properties:{...p,kind:t.place}});}
}
// A building outline and its parts can overlap; keep both for complete footprints.
// MapLibre depth testing renders the higher parts without duplicate transparent faces.
const files={};
for(const [key,features] of Object.entries(groups)){
  const filename=`${key}.geojson`;
  const data=JSON.stringify({type:'FeatureCollection',features});
  await fs.writeFile(`dist/data/${filename}`,data);
  files[key]={url:`./${filename}`,features:features.length,bytes:Buffer.byteLength(data)};
}
const manifest={title:'Châlons-en-Champagne et alentours proches',source:'OpenStreetMap',copyright:'© OpenStreetMap contributors',license:'ODbL-1.0',license_url:'https://www.openstreetmap.org/copyright',osm_timestamp:raw.osm3s?.timestamp_osm_base,extracted_at:new Date().toISOString(),bbox:{south:bbox[0],west:bbox[1],north:bbox[2],east:bbox[3]},height_method:{osm:explicit,levels,estimated,description:'OSM height in metres; otherwise building:levels × 3 m + roof:height; otherwise indicative height by building type. Flat ground, simplified extruded footprints.'},omitted_incomplete_features:tainted,files,query};
await fs.writeFile('dist/data/manifest.json',JSON.stringify(manifest,null,2));
await fs.copyFile('node_modules/maplibre-gl/dist/maplibre-gl.js','dist/vendor/maplibre-gl.js');
await fs.copyFile('node_modules/maplibre-gl/dist/maplibre-gl.css','dist/vendor/maplibre-gl.css');
await fs.copyFile('node_modules/maplibre-gl/LICENSE.txt','dist/vendor/MAPLIBRE-LICENSE.txt');
console.log(JSON.stringify({files,heights:manifest.height_method,omitted:tainted},null,2));
