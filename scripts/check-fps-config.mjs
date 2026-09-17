import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {FPS_CONFIG,validateFPSConfig,validateHighwindConfig} from '../dist/walk-config.js';
const root=fileURLToPath(new URL('..',import.meta.url));
assert.deepEqual(FPS_CONFIG,validateFPSConfig(JSON.parse(await fs.readFile(new URL('../fps-config.json',import.meta.url)))));
for(const value of [0,1.5,257,'40',null])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,batimentsParTelechargement:value}),/batimentsParTelechargement/);
for(const value of [1,2,40,256])assert.equal(validateFPSConfig({...FPS_CONFIG,batimentsParTelechargement:value}).batimentsParTelechargement,value);
for(const key of ['chargementsGeometrieSimultanes','chargementsTexturesSimultanes']){
 for(const value of [0,.5,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,[key]:value}),new RegExp(key));
 for(const value of [1,2,16,64])assert.equal(validateFPSConfig({...FPS_CONFIG,[key]:value})[key],value);
}
for(const key of Object.keys(FPS_CONFIG).filter(key=>key!=='highwind'&&key!=='orca'&&key!=='preparation'))for(const value of [undefined,null,'12',-1,Infinity,NaN])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,[key]:value}),new RegExp(key));
const withoutPreparation={...FPS_CONFIG};delete withoutPreparation.preparation;
assert.deepEqual(validateFPSConfig(withoutPreparation).preparation,{budgetParImageMs:4,budgetInitialParImageMs:8});
for(const preparation of [undefined,null,[],1,'4'])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,preparation}),/preparation/);
for(const key of ['budgetParImageMs','budgetInitialParImageMs']){
 for(const value of [0,.5,4,20,1000])assert.equal(validateFPSConfig({...FPS_CONFIG,preparation:{[key]:value}}).preparation[key],value);
 for(const value of [undefined,null,-1,'4',NaN,Infinity])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,preparation:{[key]:value}}),new RegExp('preparation.'+key));
}
assert.throws(()=>validateFPSConfig({...FPS_CONFIG,preparation:{typo:4}}),/preparation.typo/);
assert(Object.isFrozen(FPS_CONFIG.preparation));
const highwind={present:true,longueurMetres:237,position:{x:20,y:60,z:140},angleDegres:135,dureeAccelerationSecondes:.3,dureeFreinageSecondes:.18};
assert.equal(validateFPSConfig({...FPS_CONFIG,highwind:{...highwind,modele:'v5'}}).highwind.modele,'v5','The exported V5 must not prevent the game from starting');
assert.deepEqual(validateFPSConfig({...FPS_CONFIG,highwind}).highwind,highwind);
for(const [key,values] of Object.entries({present:[undefined,1,'true'],longueurMetres:[undefined,0,-2,'237',Infinity],angleDegres:[undefined,'90',NaN],position:[undefined,null,[]]}))for(const value of values)assert.throws(()=>validateHighwindConfig({...highwind,[key]:value}),/highwind/);
for(const axis of ['x','y','z'])for(const value of [undefined,'0',NaN,Infinity])assert.throws(()=>validateHighwindConfig({...highwind,position:{...highwind.position,[axis]:value}}),/position/);
assert.throws(()=>validateHighwindConfig({...highwind,typo:1}),/typo/);
assert(Object.isFrozen(validateHighwindConfig(highwind).position));
for(const vitesseNormaleKmh of [null,0,-1,'400',NaN,Infinity])assert.throws(()=>validateHighwindConfig({...highwind,vitesseNormaleKmh,vitesseMaxKmh:800}),/vitesseNormaleKmh/);
assert.throws(()=>validateHighwindConfig({...highwind,vitesseNormaleKmh:500,vitesseMaxKmh:400}),/vitesseMaxKmh/);
for(const [vitesseNormaleKmh,vitesseMaxKmh] of [[270,930],[400,400]])assert.equal(validateHighwindConfig({...highwind,vitesseNormaleKmh,vitesseMaxKmh}).vitesseNormaleKmh,vitesseNormaleKmh);
for(const distanceCameraMetres of [null,0,-1,'150',NaN,Infinity])assert.throws(()=>validateHighwindConfig({...highwind,distanceCameraMetres}),/distanceCameraMetres/);
assert.equal(validateHighwindConfig({...highwind,distanceCameraMetres:.5}).distanceCameraMetres,.5);
for(const angleCameraDegres of [null,-90,90,'20',NaN,Infinity])assert.throws(()=>validateHighwindConfig({...highwind,angleCameraDegres}),/angleCameraDegres/);
for(const angleCameraDegres of [-89,-20,0,20.25,89])assert.equal(validateHighwindConfig({...highwind,angleCameraDegres}).angleCameraDegres,angleCameraDegres);
for(const distanceEmbarquementMetres of [null,0,-1,'40',NaN,Infinity])assert.throws(()=>validateHighwindConfig({...highwind,distanceEmbarquementMetres}),/distanceEmbarquementMetres/);
assert.equal(validateHighwindConfig({...highwind,distanceEmbarquementMetres:65}).distanceEmbarquementMetres,65);
for(const key of ['dureeAccelerationSecondes','dureeFreinageSecondes']){
 for(const value of [undefined,null,-1,'0.3',NaN,Infinity])assert.throws(()=>validateHighwindConfig({...highwind,[key]:value}),new RegExp(key));
 for(const value of [0,.07,.8,2])assert.equal(validateHighwindConfig({...highwind,[key]:value})[key],value);
}
assert.throws(()=>validateFPSConfig({...FPS_CONFIG,graviteMps2:0}));
for(const finBrouillardMetres of [FPS_CONFIG.debutBrouillardMetres,FPS_CONFIG.debutBrouillardMetres-1])assert.throws(()=>validateFPSConfig({...FPS_CONFIG,finBrouillardMetres}),/finBrouillardMetres/);
assert.throws(()=>validateFPSConfig({...FPS_CONFIG,typo:1}),/inconnu/);
assert(Object.isFrozen(FPS_CONFIG));
await fs.mkdir(path.join(root,'artifacts/fps-config/tests'),{recursive:true});
const temp=await fs.mkdtemp(path.join(root,'artifacts/fps-config/tests/variant-'));
await fs.mkdir(path.join(temp,'dist'));await fs.mkdir(path.join(temp,'scripts'));
await fs.writeFile(path.join(temp,'package.json'),' {"type":"module"}');
for(const file of await fs.readdir(path.join(root,'dist')))if(file.endsWith('.js'))await fs.copyFile(path.join(root,'dist',file),path.join(temp,'dist',file));
await fs.copyFile(path.join(root,'scripts/check-walk-controls.mjs'),path.join(temp,'scripts/check-walk-controls.mjs'));
// Different values for every setting, without touching the user's live JSON.
const variant={chargementsGeometrieSimultanes:3,chargementsTexturesSimultanes:2,puissanceSautMps:7.2,multiplicateurHauteurSautSpeed:4,delaiEntreSautsMs:430,vitesseMarcheMps:2.6,vitesseCourseMps:7.9,superVitesseKmh:180,graviteMps2:9.8,highwind:{present:false,longueurMetres:118.5,position:{x:-150,y:240,z:80},angleDegres:90,distanceCameraMetres:181,angleCameraDegres:35,distanceEmbarquementMetres:65,dureeAccelerationSecondes:.8,dureeFreinageSecondes:.4}};
await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify(variant));
const probe=`
import assert from 'node:assert/strict';
import {WALK_SPEED,RUN_SPEED,TURBO_SPEED,movement} from './dist/walk-core.js';
import {JUMP_SPEED,GRAVITY,GROUND_HEIGHT,advancePlayer} from './dist/walk-physics.js';
import {FPS_CONFIG} from './dist/walk-config.js';
import {chaseCamera,HighwindFlight} from './dist/highwind-flight.js';
const ship={enabled:true,config:FPS_CONFIG.highwind,pose:FPS_CONFIG.highwind,contactDistance:()=>60},flight=new HighwindFlight(ship);flight.updateContact({});assert(flight.contact,'JSON boarding range must reach the flight controller');ship.contactDistance=()=>65;flight.updateContact({});assert(!flight.contact);
assert.equal(WALK_SPEED,2.6);assert.equal(RUN_SPEED,7.9);assert.equal(TURBO_SPEED,50);
assert.equal(JUMP_SPEED,7.2);assert.equal(GRAVITY,9.8);
assert.equal(FPS_CONFIG.highwind.present,false);assert.equal(FPS_CONFIG.highwind.longueurMetres,118.5);assert.equal(FPS_CONFIG.highwind.position.z,80);assert.equal(FPS_CONFIG.highwind.angleDegres,90);
const camera=chaseCamera(FPS_CONFIG.highwind),center=FPS_CONFIG.highwind.position;
assert(Math.abs(Math.hypot(camera.position[0]-center.x,camera.position[1]-center.y,camera.height-center.z)-181)<1e-8,'The JSON controls the driving camera distance');
assert(Math.abs(camera.pitch+35*Math.PI/180)<1e-10,'The JSON controls the driving camera elevation');
assert(Math.abs(Math.hypot(...movement(0,1,0,.05))-.13)<1e-10);
assert(Math.abs(Math.hypot(...movement(0,1,0,.05,true))-.395)<1e-10);
assert(Math.abs(Math.hypot(...movement(0,1,0,.05,false,true))-2.5)<1e-10);
const state=advancePlayer({position:[0,0],feet:GROUND_HEIGHT,grounded:true,verticalSpeed:0},0,0,.05,{segments:[],surfaces:[]},true);
assert(Math.abs(state.verticalSpeed-(7.2-9.8*.05))<1e-10);
assert(Math.abs(state.feet-GROUND_HEIGHT-(7.2*.05-9.8*.05**2/2))<1e-10);
const multiplier=FPS_CONFIG.multiplicateurHauteurSautSpeed,scene={segments:[],surfaces:[]};
for(const speed of [false,true]){
 let body={position:[0,0],feet:GROUND_HEIGHT,grounded:true,verticalSpeed:0},peak=0;
 for(let i=0;i<120*6;i++){body=advancePlayer(body,0,0,1/120,scene,i===0,speed);peak=Math.max(peak,body.feet-GROUND_HEIGHT);}
 assert(Math.abs(peak-7.2**2/(2*9.8)*(speed?multiplier:1))<.002,'JSON must scale jump height, not multiply impulse directly');
 assert(body.grounded);
}
console.log('Variant JSON drives movement, gravity and speed jump height ×'+multiplier+'.');
`;
for(const factor of [4,1,0]){
 await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify({...variant,multiplicateurHauteurSautSpeed:factor}));
 console.log(execFileSync(process.execPath,['--input-type=module','--eval',probe],{cwd:temp,encoding:'utf8'}).trim());
}
for(const delay of [430,0]){
 await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify({...variant,delaiEntreSautsMs:delay}));
 console.log(execFileSync(process.execPath,['scripts/check-walk-controls.mjs'],{cwd:temp,encoding:'utf8'}).trim());
}
// The renderer must use both JSON budgets verbatim, with no hidden draw-time cap.
const preparationProbe=`
import assert from 'node:assert/strict';
import {WalkRenderer} from './dist/walk-renderer.js';
const [initial,playing]=process.argv.slice(1).map(Number),renderer=Object.assign(Object.create(WalkRenderer.prototype),{entered:false,lastDrawMs:999});
assert.equal(renderer.preparationBudget(),initial);renderer.entered=true;assert.equal(renderer.preparationBudget(),playing);
console.log(JSON.stringify({jsonPreparationBudget:true,initial,playing}));
`;
for(const [initial,playing] of [[8,4],[20,12],[.5,1],[0,0]]){
 await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify({...variant,preparation:{budgetInitialParImageMs:initial,budgetParImageMs:playing}}));
 console.log(execFileSync(process.execPath,['--input-type=module','--eval',preparationProbe,String(initial),String(playing)],{cwd:temp,encoding:'utf8'}).trim());
}
// Read altered JSON in a fresh process and measure actual flight, not just fields.
const flightProbe=`
import assert from 'node:assert/strict';
import {FPS_CONFIG} from './dist/walk-config.js';
import {HighwindFlight} from './dist/highwind-flight.js';
import {meshCollider} from './dist/highwind-collision.js';
const config=FPS_CONFIG.highwind,acceleration=config.dureeAccelerationSecondes,braking=config.dureeFreinageSecondes;
const collider=meshCollider(new Float32Array([-.2,-.5,-.1,.2,-.5,-.1,0,.5,-.1]));
const idle={forward:0,strafe:0,turn:0,lift:0};
for(const axis of ['forward','strafe']){
 const ship={config,pose:{longueurMetres:10,angleDegres:0,pitch:0,position:{x:0,y:0,z:1000}},residency:{data:{collider}},updateBounds(){}};
 const flight=new HighwindFlight(ship);flight.mode='flying';const speed=config.vitesseMaxKmh/3.6,input={...idle,[axis]:1},position=axis==='forward'?'y':'x';
 flight.tick(.01,input);assert(Math.abs(ship.pose.position[position]-speed*(acceleration===0?.01:.01**2/(2*acceleration)))<1e-8,'The JSON changes the initial acceleration');
 for(let i=1;i<400;i++)flight.tick(.005,input);
 // Total flight time is 2.005 seconds, with a linear ramp up from zero.
 assert(Math.abs(ship.pose.position[position]-speed*(2.005-acceleration/2))<1e-7,'Acceleration duration comes from the JSON');
 assert(Math.abs(flight.speedKmh-config.vitesseMaxKmh)<1e-7,'The configured maximum stays reachable');
 const released=ship.pose.position[position];
 for(let i=0;i<250;i++)flight.tick(.005,idle);
 assert(Math.abs(ship.pose.position[position]-released-speed*braking/2)<1e-7,'Braking duration comes from the JSON');
 assert.equal(flight.speedKmh,0);const stopped=ship.pose.position[position];flight.tick(.05,idle);assert.equal(ship.pose.position[position],stopped);
}
console.log(JSON.stringify({jsonControlsFlight:true,acceleration,braking}));
`;
for(const [dureeAccelerationSecondes,dureeFreinageSecondes] of [[0,0],[.12,.06],[.8,.4],[1.4,.9]]){
 await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify({...variant,highwind:{...variant.highwind,vitesseMaxKmh:360,dureeAccelerationSecondes,dureeFreinageSecondes}}));
 console.log(execFileSync(process.execPath,['--input-type=module','--eval',flightProbe],{cwd:temp,encoding:'utf8'}).trim());
}
await fs.writeFile(path.join(temp,'fps-config.json'),'{"graviteMps2":0}');
assert.throws(()=>execFileSync(process.execPath,['--input-type=module','--eval',"await import('./dist/walk-core.js')"],{cwd:temp,stdio:'pipe'}),/configuration FPS/);
// The actual dev server reads edits immediately, without a restart or copy.
for(const file of ['serve.mjs','imagery-cache.mjs','ign-source.mjs','highwind-auto-export.mjs'])await fs.copyFile(path.join(root,'scripts',file),path.join(temp,'scripts',file));
await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify(variant));
// A stale generated copy must never override the editable root on redeployment.
await fs.writeFile(path.join(temp,'dist/fps-config.json'),JSON.stringify({...variant,multiplicateurHauteurSautSpeed:99}));
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:temp,env:{...process.env,PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
try{
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Dev server startup timeout')),10000);let output='';server.stdout.on('data',b=>{output+=b;const match=output.match(/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});server.once('error',e=>{clearTimeout(timer);reject(e);});server.once('exit',code=>{clearTimeout(timer);reject(Error('Dev server exited: '+code));});});
 const url=`http://127.0.0.1:${port}/fps-config.json`,first=await fetch(url);assert.match(first.headers.get('cache-control'),/no-store/);assert.deepEqual(await first.json(),variant);
 await fs.writeFile(path.join(temp,'fps-config.json'),JSON.stringify({...variant,vitesseMarcheMps:3.7,multiplicateurHauteurSautSpeed:6}));const reloaded=await fetch(url).then(r=>r.json());assert.equal(reloaded.vitesseMarcheMps,3.7);assert.equal(reloaded.multiplicateurHauteurSautSpeed,6);
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 assert.equal((await fetch(`http://127.0.0.1:${port}/package.json`)).status,404,'Do not expose other root files');
}finally{server.kill();}
console.log(JSON.stringify({configuration:'passed',allValuesChanged:true,speedHeightMultipliers:[4,1,0],staleDeployedCopyIgnored:true,keyboardAndMobile:true,zeroDelay:true,invalidConfigRejected:true,sourceJSONUnchanged:true}));
