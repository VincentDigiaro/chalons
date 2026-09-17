// Keep the flight HUD free of visible joystick instructions; use aria-labels.
import {BOMB_CONFIG} from './highwind-bombs.js';
const BOMB_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/></svg>';
export class HighwindUI{
 constructor(mode){
  this.mode=mode;this.walkHelp=mode.root.querySelector('.walk-keys').textContent;
  mode.root.insertAdjacentHTML('beforeend',`<button id="highwind-enter" type="button" hidden>Monter · E</button><p id="highwind-status" role="status" hidden></p><div id="highwind-look-stick" role="group" aria-label="Joystick : gauche et droite pour tourner, tirer vers le bas pour monter, pousser vers le haut pour descendre" hidden><span id="highwind-look-knob"></span></div>`);
  const signal=mode.events.signal,on=(target,event,fn)=>target.addEventListener(event,fn,{signal}),button=mode.root.querySelector('#highwind-enter');this.button=button;this.status=mode.root.querySelector('#highwind-status');this.stick=mode.root.querySelector('#highwind-look-stick');this.knob=mode.root.querySelector('#highwind-look-knob');
  on(button,'click',()=>{if(mode.phase==='playing')mode.interactHighwind();});
  mode.root.insertAdjacentHTML('beforeend',`<button id="highwind-bomb" type="button" aria-label="Maintenir pour larguer des bombes · B" hidden>${BOMB_ICON}<span></span></button><div id="highwind-blast-flash" aria-hidden="true"></div>`);
  this.bomb=mode.root.querySelector('#highwind-bomb');
  this.ammoCount=mode.root.querySelector('#highwind-bomb span');
  on(this.bomb,'pointerdown',e=>{if(mode.phase!=='playing'||!mode.flight.active||e.button!==0&&e.pointerType!=='touch')return;e.preventDefault();this.bomb.setPointerCapture(e.pointerId);mode.holdBomb('pointer:'+e.pointerId);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(this.bomb,event,e=>mode.releaseBomb('pointer:'+e.pointerId));
  on(this.bomb,'click',e=>{if(!e.detail)mode.dropBomb();});
  on(this.bomb,'contextmenu',e=>e.preventDefault());
  mode.flightStick=[0,0];let pointer=null;
  const move=e=>{const r=this.stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,n=Math.max(1,Math.hypot(dx,dy)/40);mode.flightStick=[dx/n/40,-dy/n/40];this.knob.style.transform=`translate(${dx/n}px,${dy/n}px)`;};
  on(this.stick,'pointerdown',e=>{if(mode.phase!=='playing'||!mode.flight.active||pointer!==null)return;e.preventDefault();pointer=e.pointerId;this.stick.setPointerCapture(pointer);move(e);});on(this.stick,'pointermove',e=>{if(mode.phase==='playing'&&pointer===e.pointerId)move(e);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(this.stick,event,e=>{if(pointer===e.pointerId){pointer=null;this.reset();}});
  on(this.stick,'contextmenu',e=>e.preventDefault());
 }
 reset(){this.mode.flightStick=[0,0];this.knob.style.transform='';}
 update(){
  const m=this.mode,f=m.flight,active=f.active,playing=m.phase==='playing';m.root.classList.toggle('highwind-piloting',active);
  this.button.hidden=!playing||!f.ship.enabled||(!active&&!f.contact)||(active&&!m.touch);this.button.disabled=false;this.button.textContent=active?'Sortir':'Monter';this.button.setAttribute('aria-label',active?'Sortir du '+f.ship.label:'Monter dans le '+f.ship.label);
  this.status.hidden=!active;this.status.textContent=`${f.ship.label} · ${Math.round(f.speedKmh)} / ${f.maxSpeedKmh??f.ship.config?.vitesseMaxKmh??400} km/h${f.boost&&!m.touch?' · Maj':''}${f.status?' · '+f.status:''}${m.music?.error?' · Musique indisponible':''}`;
  this.stick.hidden=!(active&&m.touch&&playing);
  this.bomb.hidden=!(active&&playing);const bombs=m.renderer?.bombs,empty=bombs?.remainingBombs===0;this.bomb.disabled=empty||(bombs?.weapon==='missiles'&&!bombs.target);this.bomb.setAttribute('data-recharging',String(!bombs?.ready&&!empty));
  const stock=bombs?.remainingBombs??BOMB_CONFIG.nombreBombes,count=stock===-1?'∞':String(stock);
  if(this.ammoCount.textContent!==count){this.ammoCount.textContent=count;const missiles=bombs?.weapon==='missiles',shortcut=missiles&&!m.touch?'B ou clic gauche':'B';this.bomb.title=missiles?`Tirer des missiles · ${shortcut}`:'Larguer des bombes · B';this.bomb.setAttribute('aria-label',`${missiles?'Maintenir pour tirer des missiles':'Maintenir pour larguer des bombes'} · ${shortcut} · ${missiles?'Missiles restants':'Bombes restantes'} : ${stock===-1?'infini':stock} · rayon de destruction de ${BOMB_CONFIG.rayonDestructionBatimentsMetres} mètres`);}
  const help=m.root.querySelector('.walk-keys');help.textContent=active?'':this.walkHelp;help.hidden=active;
 }
}
