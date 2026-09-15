// Keep the flight HUD free of visible joystick instructions; use aria-labels.
export class HighwindUI{
 constructor(mode){
  this.mode=mode;this.walkHelp=mode.root.querySelector('.walk-keys').textContent;
  mode.root.insertAdjacentHTML('beforeend',`<button id="highwind-enter" type="button" hidden>Monter · E</button><p id="highwind-status" role="status" hidden></p><div id="highwind-look-stick" role="group" aria-label="Joystick : gauche et droite pour tourner, tirer vers le bas pour monter, pousser vers le haut pour descendre" hidden><span id="highwind-look-knob"></span></div>`);
  const signal=mode.events.signal,on=(target,event,fn)=>target.addEventListener(event,fn,{signal}),button=mode.root.querySelector('#highwind-enter');this.button=button;this.status=mode.root.querySelector('#highwind-status');this.stick=mode.root.querySelector('#highwind-look-stick');this.knob=mode.root.querySelector('#highwind-look-knob');
  on(button,'click',()=>{if(mode.phase==='playing')mode.interactHighwind();});
  mode.flightStick=[0,0];let pointer=null;
  const move=e=>{const r=this.stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,n=Math.max(1,Math.hypot(dx,dy)/40);mode.flightStick=[dx/n/40,-dy/n/40];this.knob.style.transform=`translate(${dx/n}px,${dy/n}px)`;};
  on(this.stick,'pointerdown',e=>{if(mode.phase!=='playing'||!mode.flight.active||pointer!==null)return;e.preventDefault();pointer=e.pointerId;this.stick.setPointerCapture(pointer);move(e);});on(this.stick,'pointermove',e=>{if(mode.phase==='playing'&&pointer===e.pointerId)move(e);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])on(this.stick,event,e=>{if(pointer===e.pointerId){pointer=null;this.reset();}});
  on(this.stick,'contextmenu',e=>e.preventDefault());
 }
 reset(){this.mode.flightStick=[0,0];this.knob.style.transform='';}
 update(){
  const m=this.mode,f=m.flight,active=f.active,playing=m.phase==='playing';m.root.classList.toggle('highwind-piloting',active);
  this.button.hidden=!playing||!f.ship.enabled||(!active&&!f.contact)||(active&&!m.touch);this.button.disabled=false;this.button.textContent=active?'Sortir':'Monter';this.button.setAttribute('aria-label',active?'Sortir sur le pont du Hautvent':'Monter dans le Hautvent');
  this.status.hidden=!active;this.status.textContent=`Hautvent · ${Math.round(f.speedKmh)} / ${f.ship.config?.vitesseMaxKmh??400} km/h${f.status?' · '+f.status:''}${m.music?.error?' · Musique indisponible':''}`;
  this.stick.hidden=!(active&&m.touch&&playing);
  const help=m.root.querySelector('.walk-keys');help.textContent=active?'':this.walkHelp;help.hidden=active;
 }
}
