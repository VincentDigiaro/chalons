import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
for(const file of ['dist/app.js','scripts/fetch-osm.mjs','scripts/fetch-fonts.mjs','scripts/serve.mjs'])execFileSync(process.execPath,['--check',file]);
const manifest=JSON.parse(await fs.readFile('dist/data/manifest.json','utf8'));
let total=0,compressed=0,central=0;
for(const name of ['buildings','land','lines','places']){
  const raw=await fs.readFile(`dist/data/${name}.geojson`);const data=JSON.parse(raw);
  assert.equal(data.type,'FeatureCollection');assert.equal(data.features.length,manifest.files[name].features);assert(data.features.length>0);
  total+=raw.length;compressed+=gzipSync(raw).length;
  const ids=new Set();
  for(const f of data.features){
    assert(!ids.has(f.id),`Duplicate ${f.id}`);ids.add(f.id);
    assert(f.geometry && f.properties.osm_id);
    const visit=c=>{if(typeof c[0]==='number'){assert.equal(c.length,2);assert(c.every(Number.isFinite));assert(c[0]>3 && c[0]<6 && c[1]>48 && c[1]<50);}else c.forEach(visit);};visit(f.geometry.coordinates);
    if(name==='buildings'){
      assert(f.properties.height>f.properties.min_height);assert(['osm','levels','estimated'].includes(f.properties.height_source));
      const rings=f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat();
      for(const ring of rings){assert(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));}
      const pt=rings[0][0];if(pt[0]>4.35&&pt[0]<4.375&&pt[1]>48.95&&pt[1]<48.965)central++;
    }
    for(const char of f.properties.name||''){const start=Math.floor(char.codePointAt(0)/256)*256;await fs.access(`dist/fonts/Noto Sans Regular/${start}-${start+255}.pbf`);}
  }
}
assert(central>500,'Not enough real buildings in Châlons centre');
const html=await fs.readFile('dist/index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g))await fs.access(`dist/${match[1]}`);
for(const file of ['dist/vendor/MAPLIBRE-LICENSE.txt','dist/fonts/OFL.txt'])await fs.access(file);
assert.match(html,/lang="fr"/);assert.match(html,/OpenStreetMap/);
console.log(JSON.stringify({checks:'passed',buildings:manifest.files.buildings.features,centralBuildings:central,dataMB:+(total/1e6).toFixed(2),gzippedDataMB:+(compressed/1e6).toFixed(2),heights:manifest.height_method},null,2));
