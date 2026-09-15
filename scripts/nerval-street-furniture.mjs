import {frontBoundary} from './build-nerval-refinements.mjs';
const add=(a,b)=>a.map((n,i)=>n+b[i]),sub=(a,b)=>a.map((n,i)=>n-b[i]),mul=(a,t)=>a.map(n=>n*t),norm=a=>mul(a,1/Math.hypot(...a));
export function annotatedBollards(path){
 const j=path[2],d=norm(sub(path[1],j)),n=[-d[1],d[0]],c=add(j,mul(d,5.5));
 return [[-117.1,-116.2],[-116.5,-118.0],add(c,mul(n,.72)),add(c,mul(n,-.72))];
}
export function street45Lamp(survey){
 const p=survey.parts.find(p=>p.id===114),x=2.5,y=frontBoundary(p,x,p.bounds[0][1],survey.refinements.streetPaths)-.55;
 return {center:add(p.center,add(mul(p.u,x),mul(p.v,y))),arm:mul(p.v,-1),framePart:114,local:[x,y]};
}
export function curvedStreetlamp(ctx,center,arm,{type='observed-streetlamp',reference}={}){
 const {poly,beam,box,objects,materials:M,rgb}=ctx,dark=rgb('#365144'),at=(x,y,z)=>[center[0]+x,center[1]+y,z],side=[-arm[1],arm[0]];
 box(center,[1,0],[0,1],.19,.19,.025,.20,dark,M.wall);beam(at(0,0,.08),at(0,0,5.16),.075,dark);
 const curve=Array.from({length:13},(_,i)=>{const t=i/12;return [...add(center,mul(arm,.95*t)),5.12+.57*Math.sin(t*Math.PI*.82)];});for(let i=1;i<curve.length;i++)beam(curve[i-1],curve[i],.055,dark);
 const head=add(center,mul(arm,.95)),z=curve.at(-1)[2]-.1,cap=Array.from({length:20},(_,i)=>{const a=i*Math.PI/10;return [...add(head,add(mul(arm,.30*Math.cos(a)),mul(side,.21*Math.sin(a)))),z];});
 poly(cap,M.wall,rgb('#dddcc1'));for(let i=0;i<cap.length;i++)poly([cap[i],cap[(i+1)%cap.length],[...head,z+.17]],M.wall,dark);
 objects.push({type,center,heightEstimated:5.75,curvedArm:true,arm,reference});
}
