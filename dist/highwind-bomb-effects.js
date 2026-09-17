import {makeProgram} from './bomb-scorches.js';
import {BLAST_SECONDS,BOMB_CONFIG} from './highwind-bombs.js';
import {validateBombConfig} from './walk-config.js';
import {recentBombItems,selectBombSprites} from './bomb-limits.js';
import {FOG_START,FOG_END} from './walk-core.js';
import {BOMB_PROFILE,bombRotation} from './bomb-orientation.js';

const meshVS=`#version 300 es
layout(location=0) in vec3 a_position;layout(location=1) in vec3 a_normal;layout(location=2) in vec2 a_uv;
uniform mat4 u_matrix;uniform vec3 u_position;uniform vec2 u_origin;uniform mat3 u_rotation;uniform float u_scale;
out vec2 v_uv;out float v_light;
void main(){vec3 p=u_rotation*a_position*u_scale+u_position;v_uv=a_uv;v_light=.38+.62*max(0.,dot(u_rotation*a_normal,normalize(vec3(-.4,-.6,.8))));gl_Position=u_matrix*vec4(p.xy-u_origin,p.z,1.);}`;
const meshFS=`#version 300 es
precision highp float;uniform sampler2D u_texture;in vec2 v_uv;in float v_light;out vec4 fragColor;
void main(){vec3 c=texture(u_texture,v_uv).rgb;fragColor=vec4(c*v_light,1.);}`;
const effectVS=`#version 300 es
layout(location=0) in vec3 a_position;layout(location=1) in vec2 a_uv;layout(location=2) in vec4 a_color;layout(location=3) in float a_kind;
uniform mat4 u_matrix;uniform vec2 u_origin;uniform vec2 u_center;
out vec2 v_uv;out vec4 v_color;out float v_kind;out float v_distance;
void main(){v_uv=a_uv;v_color=a_color;v_kind=a_kind;v_distance=length(a_position.xy-u_center);gl_Position=u_matrix*vec4(a_position.xy-u_origin,a_position.z,1.);}`;
const effectFS=`#version 300 es
precision highp float;in vec2 v_uv;in vec4 v_color;in float v_kind;in float v_distance;uniform float u_time;uniform vec2 u_fog;out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){float r=length(v_uv),alpha;vec3 color=v_color.rgb;
 if(v_kind<-.5){alpha=1.-smoothstep(.6,.72,max(abs(v_uv.x)+v_uv.y*.35,abs(v_uv.y)));}
 else if(v_kind>2.5){alpha=(1.-smoothstep(.025,.075,abs(r-.86)))*.8;}
 else if(v_kind>1.5){alpha=pow(max(0.,1.-r),1.5);}
 else{float n=noise(v_uv*4.+vec2(u_time*.45,u_time*.8))*.65+noise(v_uv*11.-u_time*.3)*.35;alpha=(1.-smoothstep(.2,1.,r))*(.3+.7*n);
  if(v_kind>.5){float hot=clamp((1.-r)*1.4+n*.6,0.,1.);color=mix(vec3(1.,.07,.005),vec3(1.,.85,.28),hot);alpha*=1.5;}
  else color*=.55+.55*n;}
 alpha*=v_color.a*(1.-smoothstep(u_fog.x,u_fog.y,v_distance));if(alpha<.008)discard;fragColor=vec4(color,alpha);}`;

// A lathed, bulbous black casing and four sheet-metal tail fins, inspired by
// the supplied silhouette. One texture / draw per bomb, no external model.
export function bombMesh(){
 const data=[],profile=BOMB_PROFILE,sides=28;
 const vertex=(p,n,uv)=>data.push(...p,...n,...uv),point=(j,i)=>{const [z,r]=profile[j],a=i/sides*Math.PI*2;return [Math.cos(a)*r,Math.sin(a)*r,z];};
 for(let j=0;j<profile.length-1;j++)for(let i=0;i<sides;i++)for(const [row,col] of [[j,i],[j,i+1],[j+1,i],[j+1,i],[j,i+1],[j+1,i+1]]){const a=col/sides*Math.PI*2,slope=(profile[j][1]-profile[j+1][1])/(profile[j+1][0]-profile[j][0]),len=Math.hypot(1,slope);vertex(point(row,col),[Math.cos(a)/len,Math.sin(a)/len,slope/len],[col/sides,(profile[row][0]+2.8)/5.3]);}
 const sheet=(points,normal)=>{for(const i of [0,1,2,2,1,3])vertex(points[i],normal,[.01,.01]);};
 for(let i=0;i<4;i++){const a=i*Math.PI/2,c=Math.cos(a),s=Math.sin(a),p=(r,z)=>[c*r,s*r,z];sheet([p(.6,1.7),p(2.4,2.5),p(.6,4.2),p(2.4,4.2)],[-s,c,0]);const b=a+Math.PI/2;sheet([p(2.4,2.5),[Math.cos(b)*2.4,Math.sin(b)*2.4,2.5],p(2.4,4.2),[Math.cos(b)*2.4,Math.sin(b)*2.4,4.2]],[c,s,0]);}
 return new Float32Array(data);
}
export function paintBombTexture(canvas){
 canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');c.fillStyle='#252b2a';c.fillRect(0,0,1024,512);
 // Panel joins, rivets and two large ivory inscriptions: 雷神 (thunder god).
 c.strokeStyle='#121716';c.lineWidth=6;for(const y of [65,430]){c.beginPath();c.moveTo(0,y);c.lineTo(1024,y);c.stroke();}
 c.fillStyle='#69716d';for(let x=12;x<1024;x+=32)for(const y of [52,442]){c.beginPath();c.arc(x,y,3,0,Math.PI*2);c.fill();}
 c.font='900 172px "Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Noto Sans JP", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#eee7cf';
 // WebGL texture coordinates run opposite to canvas text rows.
 c.save();c.translate(0,512);c.scale(1,-1);c.fillText('雷神',256,255,395);c.fillText('雷神',768,255,395);c.restore();return canvas;
}

export class HighwindBombEffects {
 constructor(gl,{mobile=false,config=BOMB_CONFIG}={}){this.gl=gl;this.mobile=mobile;this.config=validateBombConfig(config);this.vertices=new Float32Array(60);this.sprites=[];this.draws=0;}
 mesh(){return bombMesh();}
 paintTexture(canvas){return paintBombTexture(canvas);}
 hasEffects(state){return state.bombs.length||state.blasts.length;}
 trailSprites(state,visibleBombs){for(const b of visibleBombs){this.spriteSource='trail:'+b.id;const axis=(b.rotation??bombRotation(b.velocity,b.heading)).slice(6);for(let i=1;i<=this.config.particules.particulesParTrainee;i++)this.sprite(b.position.map((p,k)=>p+axis[k]*(4+i*1.5)*(b.scale??1)-b.velocity[k]*i*.025),(.5+i*.28)*(b.scale??1),[.52,.5,.45,.12],0);}}
 setup(){
  const gl=this.gl;this.program=makeProgram(gl,effectVS,effectFS);this.meshProgram=makeProgram(gl,meshVS,meshFS);
  const uniforms=(program,names)=>Object.fromEntries(names.map(k=>[k,gl.getUniformLocation(program,k)]));
  this.u=uniforms(this.program,['u_matrix','u_origin','u_center','u_time','u_fog']);this.mu=uniforms(this.meshProgram,['u_matrix','u_position','u_origin','u_rotation','u_texture','u_scale']);
  this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
  for(const [i,n,o] of [[0,3,0],[1,2,12],[2,4,20],[3,1,36]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,40,o);}
  this.meshVAO=gl.createVertexArray();this.meshBuffer=gl.createBuffer();gl.bindVertexArray(this.meshVAO);gl.bindBuffer(gl.ARRAY_BUFFER,this.meshBuffer);const mesh=this.mesh();this.meshCount=mesh.length/8;gl.bufferData(gl.ARRAY_BUFFER,mesh,gl.STATIC_DRAW);
  for(const [i,n,o] of [[0,3,0],[1,3,12],[2,2,24]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,n,gl.FLOAT,false,32,o);}gl.bindVertexArray(null);
  this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.paintTexture(document.createElement('canvas')));gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 }
 sprite(p,size,color,kind=0,ground=false){this.sprites.push({p,size,color,kind,ground,source:this.spriteSource,priority:this.spritePriority??(kind>0?1:0)});}
 draw(state,matrix,camera,center=camera.position){
  this.draws=0;this.particles=0;this.skippedParticles=0;this.visibleBombs=0;this.renderedSprites=[];if(!this.hasEffects(state))return;if(!this.program)this.setup();const gl=this.gl;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);gl.useProgram(this.meshProgram);gl.uniformMatrix4fv(this.mu.u_matrix,false,matrix);gl.uniform2fv(this.mu.u_origin,camera.position);gl.uniform1i(this.mu.u_texture,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.bindVertexArray(this.meshVAO);
  const limits=this.config.limites,quality=this.config.particules,visibleBombs=recentBombItems(state.bombs,this.mobile?limits.bombesVisiblesMobile:limits.bombesVisiblesOrdinateur);this.visibleBombs=visibleBombs.length;
  for(const b of visibleBombs){gl.uniform3fv(this.mu.u_position,b.position);gl.uniform1f(this.mu.u_scale,b.scale??1);gl.uniformMatrix3fv(this.mu.u_rotation,false,b.rotation??bombRotation(b.velocity,b.heading));gl.drawArrays(gl.TRIANGLES,0,this.meshCount);this.draws++;}
  this.sprites.length=0;this.spritePriority=undefined;this.spriteSource=undefined;
  this.trailSprites(state,visibleBombs);
  for(const b of state.blasts){
   this.spriteSource='blast:'+b.id;this.spritePriority=undefined;
   const t=state.time-b.started,p=b.position,fade=Math.max(0,1-t/BLAST_SECONDS),reach=100*(1-Math.exp(-t*2.8)),n=this.mobile?quality.groupesFumeeMobile:quality.groupesFumeeOrdinateur;
   const scale=b.radius/100,puff=(point,size,...args)=>this.sprite(point.map((v,i)=>p[i]+(v-p[i])*scale),size*scale,...args);
   if(t<1.65)puff([p[0],p[1],p[2]+2],Math.max(1,reach/ .86),[1,.66,.25,(1-t/1.65)*.9],3,true);
   // Rolling dust stays near ground; rising smoke remains after the fire fades.
   for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2+b.id*.7,seed=(Math.sin(i*127+b.id*31)*437.5)%1,spread=.55+.4*Math.abs(seed),x=p[0]+Math.cos(a)*reach*spread,y=p[1]+Math.sin(a)*reach*spread;
    puff([x,y,p[2]+4+t*3],8+t*4,[.34,.29,.23,Math.min(1,t*5)*fade*.52],0);
    const lift=12+t*(9+i%4),swirl=a+t*.18;
    puff([p[0]+Math.cos(swirl)*(8+t*4),p[1]+Math.sin(swirl)*(8+t*4),p[2]+lift],12+t*4.2,[.19,.18,.17,Math.min(1,t*4)*fade*.7],0);
    if(t<2.3){const expansion=1-Math.exp(-t*6);puff([p[0]+Math.cos(a)*(12+i%3*10)*expansion,p[1]+Math.sin(a)*(12+i%3*10)*expansion,p[2]+12+expansion*(i%4)*12],(13+i%3*7)*expansion+2,[1,.45,.04,Math.max(0,1-t/2.3)*.85],1);}
   }
   const sparks=this.mobile?quality.etincellesMobile:quality.etincellesOrdinateur;
   for(let i=0;i<sparks;i++){const a=i*2.39996+b.id,velocity=25+i%7*9,z=p[2]+3+(32+i%5*13)*t-18*t*t;if(z<p[2]||t>4)continue;const point=[p[0]+Math.cos(a)*velocity*t*.55,p[1]+Math.sin(a)*velocity*t*.55,z];puff(point,(i%3===0?1.8:.7)*fade,[1,.5,.08,fade],2);if(i%4===0)puff([p[0]+(point[0]-p[0])*.8,p[1]+(point[1]-p[1])*.8,z-2],1.8*fade,[.15,.13,.1,fade],-1);}
   if(t<.65)puff([p[0],p[1],p[2]+18],25+80*t,[1,.92,.7,(1-t/.65)*.8],2);
  }
  const right=[Math.cos(camera.yaw),-Math.sin(camera.yaw),0],up=[-Math.sin(camera.yaw)*Math.sin(camera.pitch),-Math.cos(camera.yaw)*Math.sin(camera.pitch),Math.cos(camera.pitch)],forward=[Math.sin(camera.yaw)*Math.cos(camera.pitch),Math.cos(camera.yaw)*Math.cos(camera.pitch),Math.sin(camera.pitch)];
  // Back-to-front smoke, then one additive pass for all fire / sparks / waves.
  const selected=this.renderedSprites=selectBombSprites(this.sprites,limits.particulesVisibles);
  selected.sort((a,b)=>(a.kind>0)-(b.kind>0)||b.p.reduce((s,v,i)=>s+(v-a.p[i])*forward[i],0));
  const count=selected.length,needed=count*60;this.skippedParticles=this.sprites.length-count;
  if(needed>this.vertices.length){this.vertices=new Float32Array(Math.max(needed,this.vertices.length*2));gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);}
  let offset=0,smoke=0;for(let index=0;index<count;index++){const s=selected[index];if(s.kind<=0)smoke+=6;
   for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]){const p=s.p.map((v,i)=>v+s.size*(s.ground?(i===0?x:i===1?y:0):right[i]*x+up[i]*y));this.vertices.set([...p,x,y,...s.color,s.kind],offset);offset+=10;}
  }
  gl.useProgram(this.program);gl.uniformMatrix4fv(this.u.u_matrix,false,matrix);gl.uniform2fv(this.u.u_origin,camera.position);gl.uniform2fv(this.u.u_center,center);gl.uniform1f(this.u.u_time,state.time);gl.uniform2f(this.u.u_fog,FOG_START,FOG_END);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices.subarray(0,offset));gl.depthMask(false);gl.enable(gl.BLEND);
  if(smoke){gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,smoke);this.draws++;}if(offset/10>smoke){gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.drawArrays(gl.TRIANGLES,smoke,offset/10-smoke);this.draws++;}
  gl.depthMask(true);gl.disable(gl.BLEND);gl.bindVertexArray(null);this.particles=offset/60;
 }
 getState(){return {draws:this.draws,particles:this.particles||0,skippedParticles:this.skippedParticles||0,visibleBombs:this.visibleBombs||0,mobile:this.mobile};}
 dispose(){const gl=this.gl;for(const p of [this.program,this.meshProgram])if(p)gl.deleteProgram(p);for(const b of [this.buffer,this.meshBuffer])if(b)gl.deleteBuffer(b);for(const v of [this.vao,this.meshVAO])if(v)gl.deleteVertexArray(v);if(this.texture)gl.deleteTexture(this.texture);}
}
