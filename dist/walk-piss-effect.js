// A small translucent stream in world space, drawn against the scene's depth.
const GRAVITY=9.81,STEP=.018,STEPS=64;
export const PISS_DRAIN_SECONDS=STEP*STEPS;
// Lose pressure over the final 0.7 seconds of the actual water recording.
export function pissPressure(time,duration=Infinity){
 if(time<0||time>=duration)return 0;
 const p=Math.max(0,Math.min(1,(duration-time)/Math.min(.7,duration)));
 return p*p*(3-2*p);
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);

// Intersect the short arc segments with the same walls and floors as the player.
function contact(a,b,scene){
 let hit=null;
 const accept=(t,normal)=>{if(t>=0&&t<=1&&(!hit||t<hit.t))hit={t,point:mix(a,b,t),normal};};
 if(a[2]>=.025&&b[2]<.025)accept((a[2]-.025)/(a[2]-b[2]),[0,0,1]);
 for(const s of scene.surfaces){
  if(Math.max(a[0],b[0])<s.bounds[0]||Math.min(a[0],b[0])>s.bounds[2]||Math.max(a[1],b[1])<s.bounds[1]||Math.min(a[1],b[1])>s.bounds[3])continue;
  const [p,q,r]=s.p,normal=unit(cross(q.map((v,i)=>v-p[i]),r.map((v,i)=>v-p[i])));
  const dot=v=>normal.reduce((sum,n,i)=>sum+n*(v[i]-p[i]),0),da=dot(a),db=dot(b);
  if(Math.abs(da-db)<1e-8)continue;
  const t=da/(da-db);if(t<0||t>1)continue;
  const [x,y]=mix(a,b,t),u=((q[1]-r[1])*(x-r[0])+(r[0]-q[0])*(y-r[1]))/s.det,v=((r[1]-p[1])*(x-r[0])+(p[0]-r[0])*(y-r[1]))/s.det;
  if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)accept(t,da<0?normal.map(n=>-n):normal);
 }
 for(const [x,y,ex,ey,bottom,top] of scene.segments){
  const dx=b[0]-a[0],dy=b[1]-a[1],sx=ex-x,sy=ey-y,den=dx*sy-dy*sx;
  if(Math.abs(den)<1e-8)continue;
  const t=((x-a[0])*sy-(y-a[1])*sx)/den,u=((x-a[0])*dy-(y-a[1])*dx)/den,z=a[2]+(b[2]-a[2])*t;
  if(u>=0&&u<=1&&z>=bottom&&z<=top){let normal=unit([-sy,sx,0]);if(normal[0]*dx+normal[1]*dy>0)normal=normal.map(n=>-n);accept(t,normal);}
 }
 return hit;
}

export function pissTrajectory({position,feet,yaw,pitch,time,duration=Infinity},scene={surfaces:[],segments:[]}){
 // Aim more strongly above the waist so looking up visibly lifts the arc.
 // atan keeps it forward-facing while responding across the full look range.
 const forward=[Math.sin(yaw),Math.cos(yaw)],right=[forward[1],-forward[0]],angle=.22+Math.atan(2*pitch);
 const launchSpeed=4.2+.7*Math.max(0,Math.min(1,pitch/1.45));
 const origin=[position[0]+forward[0]*.22,position[1]+forward[1]*.22,feet+.82];
 // Each piece keeps its launch speed, letting the far end finish falling
 // instead of retracting into the player when pressure drops.
 const sample=t=>{const pressure=pissPressure(time-t,duration),speed=launchSpeed*Math.sqrt(pressure),distance=speed*Math.cos(angle)*t,wobble=Math.sin(time*31-t*45)*.008*Math.min(1,t*7)*pressure;return {point:[origin[0]+forward[0]*distance+right[0]*wobble,origin[1]+forward[1]*distance+right[1]*wobble,origin[2]+speed*Math.sin(angle)*t-GRAVITY*t*t/2],time:t,pressure};};
 const firstAge=Math.max(0,time-duration);
 if(time>=duration+PISS_DRAIN_SECONDS)return {points:[],impact:null};
 const first=sample(firstAge),points=[first];let impact=null;
 if(firstAge>0&&contact(origin,first.point,scene))return {points:[],impact:null};
 for(let i=1;i<=STEPS;i++){
  const t=Math.min(firstAge+i*STEP,PISS_DRAIN_SECONDS,time);if(t<=points.at(-1).time)break;
  const previous=points.at(-1),next=sample(t),hit=contact(previous.point,next.point,scene);
  if(hit){impact={point:hit.point,normal:hit.normal,time:previous.time+(t-previous.time)*hit.t,pressure:previous.pressure+(next.pressure-previous.pressure)*hit.t};points.push(impact);break;}
  points.push(next);
 }
 return {points,impact};
}

export class WalkPissEffect{
 constructor(gl){
  this.gl=gl;this.vertices=new Float32Array((STEPS+25)*6*7);
  this.program=gl.createProgram();
  const vertex=`#version 300 es
  layout(location=0) in vec3 a_position;
  layout(location=1) in vec2 a_uv;
  layout(location=2) in float a_alpha;
  layout(location=3) in float a_round;
  uniform mat4 u_matrix;
  out vec2 v_uv;out float v_alpha;out float v_round;
  void main(){v_uv=a_uv;v_alpha=a_alpha;v_round=a_round;gl_Position=u_matrix*vec4(a_position,1.);}`;
  const fragment=`#version 300 es
  precision highp float;
  in vec2 v_uv;in float v_alpha;in float v_round;
  out vec4 fragColor;
  void main(){
   float radius=mix(abs(v_uv.x),length(v_uv),v_round);
   float edge=1.-smoothstep(.65,1.,radius);
   float shine=exp(-pow((v_uv.x+.23)*7.,2.));
   vec3 color=mix(vec3(.89,.73,.18),vec3(1.,.98,.76),shine*.8);
   fragColor=vec4(color,edge*v_alpha);if(fragColor.a<.01)discard;
  }`;
  for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
   const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
   gl.attachShader(this.program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.matrix=gl.getUniformLocation(this.program,'u_matrix');this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();
  gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
  for(const [location,size,offset] of [[0,3,0],[1,2,12],[2,1,20],[3,1,24]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,28,offset);}gl.bindVertexArray(null);
 }
 quad(corners,alpha,round,position){
  const uv=[[-1,-1],[1,-1],[-1,1],[1,1]];
  for(const i of [0,1,2,2,1,3]){const p=corners[i];this.vertices.set([p[0]-position[0],p[1]-position[1],p[2],...uv[i],alpha,round],this.count);this.count+=7;}
 }
 draw(state,scene,matrix,height){
  const {position,yaw,pitch,time}=state,{points,impact}=pissTrajectory(state,scene),eye=[...position,height];this.count=0;
  const right=[Math.cos(yaw),-Math.sin(yaw),0],up=[-Math.sin(yaw)*Math.sin(pitch),-Math.cos(yaw)*Math.sin(pitch),Math.cos(pitch)];
  const drop=(p,r,alpha)=>this.quad([[-1,-1],[1,-1],[-1,1],[1,1]].map(([x,y])=>p.map((v,i)=>v+r*(right[i]*x+up[i]*y))),alpha,1,position);
  const sides=points.map(({point,time:t,pressure},i)=>{
   const a=points[Math.max(0,i-1)].point,b=points[Math.min(points.length-1,i+1)].point;
   const side=unit(cross(b.map((v,k)=>v-a[k]),eye.map((v,k)=>v-point[k])));
   const radius=(.009+.002*Math.sin(time*38-t*65))*(1-.42*t/(STEPS*STEP))*Math.sqrt(pressure);
   return [-1,1].map(sign=>point.map((v,k)=>v+side[k]*radius*sign));
  });
  // Continue the emitting end behind the player, below the camera's view.
  // This hides the visible waist-level cut when looking down without moving
  // the physical arc or its impact. Detached final drops get no continuation.
  if(points.length>1&&points[0].time===0&&points[0].pressure>0){
   const start=sides[0].map(p=>[p[0]-Math.sin(yaw)*.85,p[1]-Math.cos(yaw)*.85,p[2]]);
   this.quad([...start,...sides[0]],.72*Math.min(1,points[0].pressure*12),0,position);
  }
  for(let i=1;i<points.length;i++){
   const pressure=(points[i-1].pressure+points[i].pressure)/2;
   // Break the weakest part of the thread into its last falling beads.
   if(pressure<.12&&Math.sin((time-points[i].time)*95)<0)continue;
   this.quad([...sides[i-1],...sides[i]],.72*Math.min(1,pressure*12),0,position);
  }
  // Small detached beads beside the far end make the flow read as liquid.
  for(let i=0;i<8;i++){
   const phase=(time*2.8+i/8)%1,index=Math.floor((.45+phase*.5)*(points.length-1));
   if(index<1)continue;
   const pressure=points[index].pressure,p=[...points[index].point],spread=(.008+phase*.045)*Math.sqrt(pressure);
   p[0]+=right[0]*Math.sin(i*9.3)*spread;p[1]+=right[1]*Math.sin(i*9.3)*spread;p[2]-=phase*.035;
   drop(p,.009*Math.sqrt(pressure),.46*(1-phase*.7)*Math.min(1,pressure*12));
  }
  if(impact)for(let i=0;i<16;i++){
   const strength=Math.sqrt(impact.pressure),age=((time-impact.time+i*.019)% .32),angle=i*2.39996,speed=(.3+(i%4)*.08)*strength;
   const p=impact.point.map((v,k)=>v+impact.normal[k]*(.016+age*.55*strength));
   p[0]+=Math.cos(angle)*speed*age;p[1]+=Math.sin(angle)*speed*age;p[2]+=.75*strength*age-GRAVITY*age*age/2;
   // Discard drops that have landed again, including on raised floors.
   if(p[2]<impact.point[2]&&impact.normal[2]>.5)continue;
   drop(p,.012*(1-age)*strength,.65*(1-age/.32)*Math.min(1,impact.pressure*12));
  }
  if(!this.count)return;
  const gl=this.gl;gl.useProgram(this.program);gl.uniformMatrix4fv(this.matrix,false,matrix);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices.subarray(0,this.count));
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.drawArrays(gl.TRIANGLES,0,this.count/7);gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);
 }
 dispose(){this.gl.deleteBuffer(this.buffer);this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
}
