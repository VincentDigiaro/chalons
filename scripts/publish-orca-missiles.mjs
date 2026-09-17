// Publish only the Orca weapon/music changes to the existing server.
// The root config is aliased by nginx: activate it after compatible JS is live.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {ORCA_MISSILE_DEFAULTS,validateFPSConfig} from '../dist/walk-config.js';
assert(process.argv[3]===undefined||['--forward-cone','--inertia','--vertical'].includes(process.argv[3]));
const forwardCone=process.argv[3]==='--forward-cone',inertia=process.argv[3]==='--inertia',vertical=process.argv[3]==='--vertical';
const project=path.resolve(import.meta.dirname,'..'),release=path.join(project,vertical?'artifacts/ship-vertical-flight/publication':inertia?'artifacts/ship-inertia/publication':forwardCone?'artifacts/orca-forward-cone/publication':'artifacts/orca-missiles/publication');
const live='C:/nginx/html/chalons',baseURL='https://digiaro.duckdns.org/chalons/';
const files=inertia||vertical?['walk-config.js','highwind-flight.js']:forwardCone?['walk-config.js','orca-missiles.js']:['data/orca/act-on-instinct.mp3','walk-config.js','highwind-math.js','highwind-bombs.js','bomb-scorches.js','highwind-bomb-effects.js','orca-missiles.js','orca-missile-effects.js','orca-missile-audio.js','bomb-stock.js','highwind-session.js','fps-highwind.js','highwind-flight.js','highwind-ui.js','highwind-music.js','walk-renderer.js','walk-mode.js'];
const digest=b=>b?crypto.createHash('sha256').update(b).digest('hex'):null;
const read=p=>fs.readFile(p).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const put=async(root,file,bytes)=>{const p=path.join(root,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);};
const configPath=path.join(project,'fps-config.json'),manifestPath=path.join(release,'manifest.json'),mode=process.argv[2];
assert(['prepare','publish','verify'].includes(mode));
if(mode==='prepare'){
 assert(!await read(manifestPath),'Release already prepared');const entries=[];
 for(const file of files){const source=await fs.readFile(path.join(project,'dist',file)),previous=await read(path.join(live,file)),oldGzip=await read(path.join(live,file+'.gz')),gzip=/\.js$/.test(file)?gzipSync(source,{level:6}):null;
  await put(path.join(release,'source'),file,source);if(gzip)await put(path.join(release,'source'),file+'.gz',gzip);if(previous)await put(path.join(release,'backup'),file,previous);if(oldGzip)await put(path.join(release,'backup'),file+'.gz',oldGzip);
  entries.push({file,hash:digest(source),gzipHash:digest(gzip),oldHash:digest(previous),oldGzipHash:digest(oldGzip)});
 }
 const previous=await fs.readFile(configPath),config=JSON.parse(previous),old=config.orca.bombes||{};
 const explosion=Object.fromEntries(Object.entries(old).filter(([k])=>!['nombreBombes','dureeRechargeSecondes','tailleMetres','simulation'].includes(k)));
 if(vertical){for(const id of ['highwind','orca']){const ship=config[id],speed=(ship.vitesseNormaleKmh??ship.vitesseMaxKmh??400)*.5;ship.vitesseMonteeKmh??=speed;ship.vitesseDescenteKmh??=speed;}}
 else if(inertia){config.highwind.inertie=1;config.orca.inertie=.2;}
 else if(forwardCone){const missiles=config.orca.missiles;missiles.vitesseMps=missiles.vitesseMps??missiles.vitesseMaxMps??ORCA_MISSILE_DEFAULTS.vitesseMps;missiles.angleConeDepartDegres=45;for(const key of ['distanceDispersionMetres','dureeAccelerationSecondes','vitesseRotationDegresParSeconde'])missiles[key]??=ORCA_MISSILE_DEFAULTS[key];delete missiles.vitesseMaxMps;delete missiles.dureeDispersionSecondes;config.orca.missiles={...ORCA_MISSILE_DEFAULTS,...missiles};}
 else{config.orca.missiles={...structuredClone(ORCA_MISSILE_DEFAULTS),explosion,...config.orca.missiles};delete config.orca.bombes;}
 validateFPSConfig(config);
 const next=Buffer.from(JSON.stringify(config,null,2)+'\n');await put(release,'fps-config.before.json',previous);await put(release,'fps-config.next.json',next);
 await put(release,'manifest.json',JSON.stringify({created:new Date().toISOString(),live,baseURL,oldConfigHash:digest(previous),configHash:digest(next),entries},null,2));
 console.log(JSON.stringify({prepared:true,files:entries.length,configValidated:true,backup:release}));
}else{
 const m=JSON.parse(await fs.readFile(manifestPath));assert.equal(m.live,live);assert.equal(m.baseURL,baseURL);assert.deepEqual(m.entries.map(e=>e.file),files);
 if(mode==='publish'){
  assert.equal(path.resolve(await fs.realpath(live)).toLowerCase(),path.resolve(live).toLowerCase());assert.equal(digest(await fs.readFile(configPath)),m.oldConfigHash,'Config changed since preparation');
  assert.equal(digest(await fs.readFile(path.join(release,'fps-config.next.json'))),m.configHash);
  for(const e of m.entries){assert.equal(digest(await fs.readFile(path.join(project,'dist',e.file))),e.hash,'Local source changed: '+e.file);assert.equal(digest(await fs.readFile(path.join(release,'source',e.file))),e.hash);assert.equal(digest(await read(path.join(live,e.file))),e.oldHash,'Server changed: '+e.file);assert.equal(digest(await read(path.join(live,e.file+'.gz'))),e.oldGzipHash);if(e.gzipHash)assert.equal(digest(await fs.readFile(path.join(release,'source',e.file+'.gz'))),e.gzipHash);}
  for(const e of m.entries)for(const file of [e.file,...(e.gzipHash?[e.file+'.gz']:[])]){
   const target=path.resolve(live,file);assert(target.startsWith(path.resolve(live)+path.sep));await fs.mkdir(path.dirname(target),{recursive:true});const parent=path.resolve(await fs.realpath(path.dirname(target))).toLowerCase();assert(parent===path.resolve(live).toLowerCase()||parent.startsWith(path.resolve(live).toLowerCase()+path.sep));
   const temp=target+'.orca-missiles-tmp';await fs.copyFile(path.join(release,'source',file),temp);await fs.rename(temp,target);
  }
  assert.equal(digest(await fs.readFile(configPath)),m.oldConfigHash,'Config changed during publication');await fs.copyFile(path.join(release,'fps-config.next.json'),configPath+'.orca-tmp');await fs.rename(configPath+'.orca-tmp',configPath);
  console.log(JSON.stringify({published:true,files:m.entries.length,configurationActivated:true}));
 }else{
  const results=[];for(const e of [...m.entries,{file:'fps-config.json',hash:m.configHash}]){const r=await fetch(baseURL+e.file,{cache:'no-store'});assert.equal(r.status,200,e.file);assert.equal(digest(Buffer.from(await r.arrayBuffer())),e.hash,'Served bytes differ: '+e.file);results.push(e.file);}
  await put(release,'https-validation.json',JSON.stringify({checked:new Date().toISOString(),files:results},null,2));console.log(JSON.stringify({https:'passed',files:results.length}));
 }
}
