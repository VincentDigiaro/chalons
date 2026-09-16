import {WalkRenderer} from './walk-renderer.js';
import {walkReturnHash} from './walk-return.js';
import {clearWalkEntry} from './walk-url.js';
import {StreetLocator} from './walk-streets.js';
import {EYE_HEIGHT,LOAD_RADIUS,SPAWN,SPAWN_YAW,FPS_FOV,TURBO_SPEED,toLngLat,toLocal,movement} from './walk-core.js';
import {GROUND_HEIGHT,advancePlayer} from './walk-physics.js';
import {FPS_CONFIG} from './walk-config.js';
import {HighwindFlight,flightInputs} from './highwind-flight.js';
import {HighwindUI} from './highwind-ui.js';
import {HighwindTouchCamera} from './highwind-touch-camera.js';
import {HighwindMusic,preloadHighwindMusic} from './highwind-music.js';
import {WalkPissAction} from './walk-piss.js';

const JUMP_REPEAT_MS=FPS_CONFIG.delaiEntreSautsMs;

export class WalkMode {
 constructor({map,onStart=()=>{},onHandoff=()=>{}}){this.map=map;this.onStart=onStart;this.onHandoff=onHandoff;this.phase='map';this.keys=new Set();this.stick=[0,0];this.flash=false;this.position=[...SPAWN];this.feet=GROUND_HEIGHT;this.verticalSpeed=0;this.grounded=true;this.jumpQueued=false;this.yaw=SPAWN_YAW;this.pitch=0;this.touch=matchMedia('(pointer:coarse)').matches;this.events=new AbortController();this.playButton=document.getElementById('play');this.playHTML=this.playButton.innerHTML;this.playTitle=this.playButton.title;this.playButton.disabled=false;this.playButton.onclick=()=>this.phase==='map'?this.start():this.cancelStart();}
 loadingButton(active){
  this.playButton.classList.remove('is-entering');
  this.playButton.classList.toggle('is-loading',active);this.playButton.setAttribute('aria-busy',String(active));
  this.playButton.innerHTML=active?'<span class="play-spinner" aria-hidden="true"></span>Annuler':this.playHTML;
  this.playButton.title=active?'Annuler le chargement de la promenade':this.playTitle;
  if(active)this.playButton.setAttribute('aria-label','Annuler le chargement de la promenade');else this.playButton.removeAttribute('aria-label');
 }
 cancelStart(){
  if(!['loading','approaching','error'].includes(this.phase))return;
  this.events.abort();this.piss?.dispose();this.music?.dispose();this.renderer?.dispose();
  if(!this.map){this.exit();return;}
  this.phase='map';
  if(this.approachRestore){const {fov,maxZoom,maxPitch,...camera}=this.approachRestore;this.map.stop();this.map.setMaxZoom(maxZoom);this.map.setMaxPitch(maxPitch);this.map.setVerticalFieldOfView(fov);this.map.jumpTo(camera);this.approachRestore=null;}
  if(document.pointerLockElement===this.canvas)document.exitPointerLock();
  this.root.remove();this.keys.clear();this.loadingButton(false);this.playButton.focus({preventScroll:true});
 }
 async start({entry=null}={}){
  if(this.phase!=='map')return;
  const events=this.events=new AbortController(),current=()=>this.events===events&&!events.signal.aborted;
  this.approachRestore=null;this.streetName=undefined;this.streets=null;
  this.position=[...SPAWN];this.yaw=SPAWN_YAW;this.pitch=0;
  if(entry){this.position=[...entry.position];this.yaw=entry.yaw;this.pitch=entry.pitch;}
  else{const center=this.map.getCenter();if(Math.hypot((center.lng-4.3728)*73000,(center.lat-48.9651)*111320)<200){this.position=toLocal([4.372708,48.9651469]);this.yaw=335*Math.PI/180;}}
  this.phase='loading';this.onStart();this.loadingButton(true);
  this.root=document.createElement('section');this.root.id='walk-root';this.root.setAttribute('aria-label','Promenade dans Châlons');
  this.root.innerHTML=`<canvas id="walk-canvas" tabindex="0" aria-label="Vue à hauteur d’homme. ZQSD, WASD ou flèches pour marcher, Espace pour sauter, souris pour regarder, Échap pour mettre en pause."></canvas><p id="walk-position" class="walk-position" aria-label="Coordonnées de placement FPS"></p><div class="walk-bar"><button id="walk-exit">Carte</button><span id="walk-street" hidden></span><button id="walk-pause" aria-label="Mettre la promenade en pause">Pause</button></div><div id="walk-message" class="walk-message" role="status"><p id="walk-message-text">Arrivée au fond de l’impasse…</p><button id="walk-resume" hidden>Reprendre la promenade</button></div><p class="walk-keys">ZQSD / WASD / flèches : marcher · Souris : regarder · Maj : courir · Ctrl : ${Math.round(TURBO_SPEED*3.6)} km/h · Espace : sauter · P : piss · Échap : pause</p><div class="walk-touch"><div id="walk-stick" role="group" aria-label="Joystick de déplacement"><span id="walk-knob"></span></div><button id="walk-flash" type="button" aria-label="Activer le mode Flash : ${Math.round(TURBO_SPEED*3.6)} kilomètres par heure" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13 2 4 14h6l-1 8L20 9h-7z"/></svg></button><button id="walk-jump" type="button" aria-label="Sauter"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 11 12 4l7 7M12 4v16"/></svg></button></div>`;
  document.body.append(this.root);this.canvas=this.root.querySelector('canvas');this.root.classList.toggle('touch',this.touch);this.positionReadout=this.touch?null:this.root.querySelector('#walk-position');this.updatePositionReadout();this.bind();this.loadStreets();
  this.root.classList.add('scene-loading');this.root.inert=true;
  this.root.querySelector('#walk-message').hidden=true;
  // Keep the map and its play/cancel button usable throughout loading.
  try{
   this.renderer=new WalkRenderer(this.canvas);
   this.flight=new HighwindFlight(this.renderer.highwind);this.highwindUI=new HighwindUI(this);this.music=preloadHighwindMusic()||new HighwindMusic();this.piss=new WalkPissAction(this);
   this.highwindMusicArmed=false;
   // Prepare the scene before the approach so the zoom never stops to wait at its endpoint.
   await this.renderer.load(this.position);
   if(!current())return;
   this.feet=this.renderer.groundHeight(this.position);this.verticalSpeed=0;this.grounded=true;
   Object.assign(this,advancePlayer(this,0,0,.016,this.renderer.collisionScene(this.position)));
   this.loadingButton(false);this.playButton.classList.add('is-entering');
   if(entry){
    // Direct links open the requested camera immediately, without a map fly-in.
    // Mouse capture remains tied to the next click, as required by browsers.
    this.arrivalCamera={position:toLngLat(this.position),height:EYE_HEIGHT+this.feet,pitch:90+this.pitch*180/Math.PI,fov:FPS_FOV,direct:true};
   }else{
   this.phase='approaching';
   this.approachRestore={center:this.map.getCenter().toArray(),zoom:this.map.getZoom(),bearing:this.map.getBearing(),pitch:this.map.getPitch(),padding:this.map.getPadding(),fov:this.map.getVerticalFieldOfView(),maxPitch:this.map.getMaxPitch(),maxZoom:this.map.getMaxZoom()};
   this.map.stop();this.map.setVerticalFieldOfView(FPS_FOV);this.map.setMaxPitch(84);
   // Position the camera itself at the FPS start; centering the map there leaves it behind the hedge.
   // Above 84.26°, MapLibre's solver uses a distant elevated target instead of the ground.
   const approach=this.map.calculateCameraOptionsFromCameraLngLatAltRotation(toLngLat(this.position),EYE_HEIGHT+this.feet,this.yaw*180/Math.PI,84,0);
   this.map.setMaxZoom(Math.max(this.map.getMaxZoom(),approach.zoom));
   const fly=new Promise(resolve=>{let settled=false,timer;const done=()=>{if(!settled){settled=true;clearTimeout(timer);events.signal.removeEventListener('abort',done);this.map.off('moveend',done);resolve();}};this.map.once('moveend',done);events.signal.addEventListener('abort',done,{once:true});timer=setTimeout(done,2200);this.map.flyTo({...approach,duration:matchMedia('(prefers-reduced-motion:reduce)').matches?0:1800});});
   await fly;
   if(!current())return;
   this.map.jumpTo(approach);
   this.arrivalCamera={position:this.map.transform.getCameraLngLat().toArray(),height:this.map.transform.getCameraAltitude(),pitch:this.map.getPitch(),fov:this.map.getVerticalFieldOfView()};
   this.pitch=(this.arrivalCamera.pitch-90)*Math.PI/180;
   }
   // Draw the first FPS frame at the same pose before exposing its canvas.
   this.renderer.draw(this.position,EYE_HEIGHT+this.feet,this.yaw,this.pitch);
   this.root.querySelector('#walk-message').hidden=true;
   this.root.classList.remove('scene-loading');this.root.inert=false;this.loadingButton(false);this.approachRestore=null;
   this.root.classList.add('scene-ready');document.body.classList.add('walking');this.map?.remove();this.map=null;this.onHandoff();
   this.phase='playing';this.last=performance.now();
   this.canvas.focus({preventScroll:true});
   if(!entry&&navigator.userActivation?.isActive)this.lock();
   this.frame=requestAnimationFrame(t=>this.tick(t));this.expose();
  }catch(error){if(!current())return;console.error('Promenade :',error);this.phase='error';document.exitPointerLock?.();this.renderer?.dispose();this.loadingButton(false);this.root.classList.remove('scene-loading');this.root.inert=false;this.root.querySelector('#walk-message').hidden=false;this.root.querySelector('#walk-message-text').textContent=error.message;const button=this.root.querySelector('#walk-resume');button.hidden=false;button.textContent='Revenir à la carte';button.onclick=()=>this.cancelStart();}
 }
 async loadStreets(){
  const events=this.events;
  try{
   const response=await fetch(new URL('./data/lines.geojson',import.meta.url),{signal:events.signal});
   if(!response.ok)throw Error('Street data unavailable');
   const data=await response.json();if(events.signal.aborted||this.events!==events)return;
   this.streets=new StreetLocator(data);this.updateStreet();
  }catch{if(events.signal.aborted||this.events!==events)return;this.streets=null;this.updateStreet();}
 }
 updatePositionReadout(){
  if(!this.positionReadout)return;
  const fixed=n=>(Math.round(n*100)/100).toFixed(2),degrees=(this.yaw*180/Math.PI%360+360)%360;
  const text=`x=${fixed(this.position[0])}&y=${fixed(this.position[1])}&angle=${fixed(Math.round(degrees*100)%36000/100)}`;
  if(this.positionReadout.textContent!==text)this.positionReadout.textContent=text;
 }
 updateStreet(){
  const name=this.streets?.nameAt(this.position)||'';
  if(name===this.streetName)return;
  this.streetName=name;const label=this.root.querySelector('#walk-street');label.textContent=name;label.hidden=!name;
 }
 async lock(){
  if(this.touch||document.pointerLockElement===this.canvas||this.lockPending)return;
  const canvas=this.canvas,events=this.events;
  if(!canvas.requestPointerLock){this.dragLook=true;return;}
  this.lockPending=true;this.lookPointer=null;
  try{
   // Raw input avoids deriving FPS rotation from an accelerated/recentered cursor.
   try{await canvas.requestPointerLock({unadjustedMovement:true});}
   catch(error){
    if(error?.name!=='NotSupportedError')throw error;
    if(this.events!==events||events.signal.aborted||this.phase!=='playing')return;
    await canvas.requestPointerLock();
   }
  }catch{if(this.events===events&&!events.signal.aborted)this.dragLook=true;}
  finally{if(this.events===events)this.lockPending=false;}
 }
 bind(){
  const signal=this.events.signal,on=(target,name,fn,options={})=>target.addEventListener(name,fn,{...options,signal});
  this.root.querySelector('#walk-exit').onclick=()=>this.exit();this.root.querySelector('#walk-pause').onclick=()=>this.pause();this.root.querySelector('#walk-resume').onclick=()=>this.resume();
  const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyQ','KeyX','KeyC','PageUp','PageDown','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','ControlLeft','ControlRight']);
  this.jumpInputs=new Set();this.nextJumpAt=0;
  on(document,'keydown',e=>{if(e.code==='Escape'){if(this.phase==='playing')this.pause();return;}if(e.code==='KeyP'&&this.phase==='playing'){e.preventDefault();if(!e.repeat)this.piss?.start();return;}if(e.code==='KeyE'&&this.phase==='playing'){e.preventDefault();if(!e.repeat)this.interact();return;}if(e.code==='Space'&&this.phase==='playing'){e.preventDefault();if(this.flight?.active)this.keys.add(e.code);else if(!e.repeat)this.holdJump('keyboard');return;}if(movementKeys.has(e.code)&&this.phase==='playing'){e.preventDefault();this.keys.add(e.code);}});
  const jumpButton=this.root.querySelector('#walk-jump');
  on(jumpButton,'pointerdown',e=>{if(this.phase!=='playing'||e.button>0)return;e.preventDefault();jumpButton.setPointerCapture(e.pointerId);this.holdJump('pointer:'+e.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(jumpButton,event,e=>this.releaseJump('pointer:'+e.pointerId));
  on(jumpButton,'contextmenu',e=>e.preventDefault());
  const flashButton=this.root.querySelector('#walk-flash');
  on(flashButton,'pointerdown',e=>{if(this.phase!=='playing'||e.button>0)return;e.preventDefault();this.setFlash(!this.flash);});
  // Secondary touch contacts need pointer events; keep keyboard activation too.
  on(flashButton,'click',e=>{if(!e.detail&&this.phase==='playing')this.setFlash(!this.flash);});
  on(flashButton,'contextmenu',e=>e.preventDefault());
  on(document,'keyup',e=>{this.keys.delete(e.code);if(e.code==='Space')this.releaseJump('keyboard');});on(window,'blur',()=>this.pause());on(document,'visibilitychange',()=>{if(document.hidden)this.pause();});
  on(document,'pointerlockchange',()=>{this.lookPointer=null;this.flightTouch?.reset();if(document.pointerLockElement===this.canvas)this.dragLook=false;else if(this.phase==='playing'&&!this.dragLook)this.pause(false);});
  on(document,'pointerlockerror',()=>{if(!this.lockPending)this.dragLook=true;});
  on(document,'mousemove',e=>{if(this.phase==='playing'&&document.pointerLockElement===this.canvas)this.look(e.movementX,e.movementY,.0022);});
  on(this.canvas,'contextmenu',e=>e.preventDefault());
  on(this.canvas,'wheel',e=>{if(this.phase!=='playing'||!this.flight?.active)return;e.preventDefault();const scale=e.deltaMode===1?16:e.deltaMode===2?(this.canvas.clientHeight||800):1;this.flight.zoom(e.deltaY*scale);},{passive:false});
  const orbitButton=(e,down)=>{if(e.button!==0&&e.button!==2)return;const bit=e.button===0?1:2;this.mouseOrbitButtons=down?(this.mouseOrbitButtons||0)|bit:(this.mouseOrbitButtons||0)&~bit;this.mouseOrbit=!!this.mouseOrbitButtons;if(this.mouseOrbit&&this.flight)this.flight.resetMouseTurn();};
  on(this.canvas,'mousedown',e=>{if(this.phase==='playing'&&this.flight?.active)orbitButton(e,true);});
  on(document,'mouseup',e=>orbitButton(e,false));
  this.lookPointer=null;this.flightTouch=new HighwindTouchCamera(this);
  on(this.canvas,'pointerdown',e=>{if(this.phase==='paused'){this.resume();return;}if(this.flightTouch.down(e))return;if(this.phase==='playing'&&this.flight?.active)orbitButton(e,true);if(this.phase!=='playing'||this.lookPointer||document.pointerLockElement===this.canvas||this.lockPending)return;if(!this.touch&&!this.dragLook){this.lock();return;}this.lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);});
  on(document,'pointerup',e=>orbitButton(e,false));on(document,'pointercancel',()=>{this.mouseOrbit=false;this.mouseOrbitButtons=0;});
  on(this.canvas,'pointermove',e=>{if(this.flightTouch.move(e))return;if(this.phase!=='playing'||document.pointerLockElement===this.canvas||this.lockPending)return;const looking=this.lookPointer;if(this.flight?.active&&!this.touch&&!looking){this.look(e.movementX||0,e.movementY||0,.0022);return;}if(!looking||looking.id!==e.pointerId)return;this.look(e.clientX-looking.x,e.clientY-looking.y,this.touch?.008:.003);looking.x=e.clientX;looking.y=e.clientY;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(this.canvas,event,e=>{if(this.flightTouch.end(e))return;if(this.lookPointer?.id===e.pointerId)this.lookPointer=null;if(event==='pointerup')orbitButton(e,false);else if(document.pointerLockElement!==this.canvas){this.mouseOrbit=false;this.mouseOrbitButtons=0;}});
  const stick=this.root.querySelector('#walk-stick'),knob=this.root.querySelector('#walk-knob');let stickPointer=null;
  const moveStick=e=>{const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,n=Math.max(1,Math.hypot(dx,dy)/40);this.stick=[dx/n/40,-dy/n/40];knob.style.transform=`translate(${dx/n}px,${dy/n}px)`;};
  on(stick,'pointerdown',e=>{if(this.phase!=='playing'||stickPointer!==null)return;stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);e.preventDefault();});on(stick,'pointermove',e=>{if(this.phase==='playing'&&e.pointerId===stickPointer)moveStick(e);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(stick,event,e=>{if(e.pointerId===stickPointer){stickPointer=null;this.stick=[0,0];knob.style.transform='';}});
  on(this.canvas,'webglcontextlost',e=>{e.preventDefault();this.pause();this.root.querySelector('#walk-message-text').textContent='Le rendu a été interrompu. Revenez à la carte pour relancer la promenade.';this.root.querySelector('#walk-resume').hidden=true;this.phase='error';});
  on(window,'pagehide',()=>{this.clearJump();cancelAnimationFrame(this.frame);this.events.abort();this.piss?.dispose();this.music?.dispose();this.renderer?.dispose();});
 }
 look(dx,dy,sensitivity){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;if(this.flight?.active){this.flight.look(dx,dy,sensitivity,this.mouseOrbit);return;}this.yaw+=dx*sensitivity;this.pitch=Math.max(-1.45,Math.min(1.45,this.pitch-dy*sensitivity));}
 updateHighwindContact(){this.flight?.updateContact(this);if(!this.flight?.active&&!this.flight?.contact&&this.highwindMusicArmed){this.highwindMusicArmed=false;this.music?.stop();}}
 interact(){this.updateHighwindContact();if(this.flight?.active||this.flight?.contact)this.interactHighwind();}
 interactHighwind(){this.updateHighwindContact();const action=this.flight?.interact(this);if(!action)return;this.clearJump();this.keys.clear();this.stick=[0,0];this.lookPointer=null;this.flightTouch?.reset();this.mouseOrbit=false;this.mouseOrbitButtons=0;this.highwindUI?.reset();if(action==='board'){this.highwindMusicArmed=true;this.music?.start();this.canvas.focus();this.lock();}this.highwindUI?.update();}
 setFlash(enabled){this.flash=Boolean(enabled);const button=this.root.querySelector('#walk-flash');button.setAttribute('aria-pressed',String(this.flash));button.setAttribute('aria-label',`${this.flash?'Désactiver':'Activer'} le mode Flash : ${Math.round(TURBO_SPEED*3.6)} kilomètres par heure`);}
 jump(now=performance.now()){if(this.phase!=='playing'||this.jumpQueued||now<this.nextJumpAt)return;this.jumpQueued=true;this.nextJumpAt=now+JUMP_REPEAT_MS;}
 holdJump(source){if(this.phase!=='playing'||this.jumpInputs.has(source))return;this.jumpInputs.add(source);this.jump();}
 releaseJump(source){this.jumpInputs.delete(source);}
 clearJump(){this.jumpInputs?.clear();this.jumpQueued=false;}
 pause(unlock=true){if(this.phase!=='playing')return;this.phase='paused';this.lookPointer=null;this.flightTouch?.reset();this.mouseOrbit=false;this.mouseOrbitButtons=0;if(this.flight){this.flight.resetMouseTurn();this.flight.resetMovement();}this.piss?.update();this.keys.clear();this.setFlash(false);this.clearJump();this.stick=[0,0];this.highwindUI?.reset();this.music?.pause();if(unlock&&document.pointerLockElement===this.canvas)document.exitPointerLock();const box=this.root.querySelector('#walk-message');box.hidden=false;this.root.querySelector('#walk-message-text').textContent='Promenade en pause';this.root.querySelector('#walk-resume').hidden=false;this.root.querySelector('#walk-resume').focus();}
 resume(){if(this.phase!=='paused')return;this.lock();this.keys.clear();this.last=performance.now();this.phase='playing';this.piss?.update();this.music?.resume();this.root.querySelector('#walk-message').hidden=true;this.canvas.focus();}
 tick(now){
  if(this.phase==='error')return;const dt=(now-this.last)/1000;this.last=now;let cameraHeight=EYE_HEIGHT+this.feet,pitch=this.pitch;
  if(this.phase==='playing'&&this.flight?.active){
   this.flight.tick(Math.max(0,Math.min(dt,.05)),flightInputs(this.keys,this.stick,this.flightStick,this.touch),this.renderer);
   this.flight.updateCamera(dt,this.mouseOrbit||this.flightTouch?.active);
   const p=this.renderer.highwind.pose.position;this.position=[p.x,p.y];this.feet=p.z;this.yaw=this.renderer.highwind.pose.angleDegres*Math.PI/180;
  }else if(this.phase==='playing'){
   // Use the frame clock, independent of the keyboard's native repeat delay.
   if(this.jumpInputs.size&&now>=this.nextJumpAt)this.jump(now);
   const has=(...codes)=>codes.some(c=>this.keys.has(c)),forward=Number(has('KeyW','KeyZ','ArrowUp'))-Number(has('KeyS','ArrowDown'))+this.stick[1],right=Number(has('KeyD','ArrowRight'))-Number(has('KeyA','KeyQ','ArrowLeft'))+this.stick[0];
   const speedActive=this.flash||has('ControlLeft','ControlRight'),delta=movement(this.yaw,forward,right,dt,has('ShiftLeft','ShiftRight')||this.stick.some(value=>value!==0),speedActive);
   if(this.renderer.safeToMove(this.position,delta)){if(this.jumpQueued)this.jumpCount=(this.jumpCount||0)+1;Object.assign(this,advancePlayer(this,...delta,dt,this.renderer.collisionScene(this.position,delta),this.jumpQueued,speedActive));}
   this.jumpQueued=false;cameraHeight=EYE_HEIGHT+this.feet;
  }
  if(this.phase==='playing'){this.renderer.highwind?.animate(dt);if(this.flight&&!this.flight.active)this.updateHighwindContact();}
  this.highwindUI?.update();this.piss?.update();
  this.updateStreet();this.updatePositionReadout();
  this.renderer.trim(this.position);if(!this.refreshed||now-this.refreshed>350){this.renderer.refresh(this.position);this.refreshed=now;}
  const camera=this.flight?.active?this.flight.camera():{position:this.position,height:EYE_HEIGHT+this.feet,yaw:this.yaw,pitch:this.pitch};
  this.renderer.draw(camera.position,camera.height,camera.yaw,camera.pitch,this.piss?.getVisualState(),this.position);this.frame=requestAnimationFrame(t=>this.tick(t));
 }
 exit(){this.keys.clear();this.setFlash(false);this.clearJump();this.piss?.dispose();this.music?.dispose();if(document.pointerLockElement===this.canvas)document.exitPointerLock();const url=clearWalkEntry(location.href);url.hash=walkReturnHash(this.position);history.replaceState(null,'',url.href);location.reload();}
 getState(){return {mode:this.phase,piss:this.piss?.getState(),flight:this.flight?.getState(),music:this.music?.getState(),streetName:this.streetName||null,flashEnabled:this.flash,turboSpeedKmh:Math.round(TURBO_SPEED*3.6),position:toLngLat(this.position),localPosition:[...this.position],arrivalCamera:this.arrivalCamera,eyeHeight:EYE_HEIGHT,feetHeight:this.feet,grounded:this.grounded,verticalSpeed:this.verticalSpeed,jumps:this.jumpCount||0,yaw:this.yaw,pitch:this.pitch,pointerLocked:document.pointerLockElement===this.canvas,mobile:this.touch,streaming:this.renderer?.getState()};}
 expose(){const context=document.modelContext;if(!context?.registerTool)return;try{context.registerTool({name:'read_walk_state',description:`Lire la position du piéton, sa hauteur et le nombre de fichiers de bâtiments chargés dans le rayon de ${LOAD_RADIUS} mètres.`,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>this.getState()},{signal:this.events.signal});}catch{}}
}
