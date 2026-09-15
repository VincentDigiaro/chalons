// Camera contacts belong to the canvas only; joystick fingers stay independent.
export class HighwindTouchCamera {
 constructor(mode){this.mode=mode;this.points=new Map();this.gap=null;}
 get active(){return this.mode.phase==='playing'&&this.mode.flight?.active&&this.points.size>0;}
 distance(){const [a,b]=this.points.values();return b?Math.hypot(b.x-a.x,b.y-a.y):null;}
 down(e){
  const m=this.mode,touch=e.pointerType==='touch'||(!e.pointerType&&m.touch);
  if(!touch||m.phase!=='playing'||!m.flight?.active)return false;
  e.preventDefault();
  // A third finger must not replace either contact halfway through a pinch.
  if(this.points.size>=2||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return true;
  this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});this.gap=this.distance();
  m.flight.resetMouseTurn();m.canvas.setPointerCapture(e.pointerId);return true;
 }
 move(e){
  const p=this.points.get(e.pointerId);if(!p)return false;
  if(!this.active){this.reset();return true;}
  e.preventDefault();if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return true;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(this.points.size===1)this.mode.flight.look(dx,dy,.008,true);
  else{
   const next=this.distance();
   // Spread => shorter camera distance. Match the existing smooth wheel zoom;
   // a ratio gives the same gesture at every display density and zoom level.
   if(this.gap>=8&&next>=8)this.mode.flight.zoom(Math.log(this.gap/next)/.0015);
   this.gap=next;
  }
  return true;
 }
 end(e){if(!this.points.delete(e.pointerId))return false;this.gap=this.distance();return true;}
 reset(){const ids=[...this.points.keys()];this.points.clear();this.gap=null;for(const id of ids)if(this.mode.canvas.hasPointerCapture?.(id))this.mode.canvas.releasePointerCapture(id);}
}
