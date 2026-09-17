import {HighwindBombEffects} from './highwind-bomb-effects.js';
import {makeProgram} from './bomb-scorches.js';
import {ORCA_MISSILE_CONFIG,missileImpactConfig} from './walk-config.js';

// Local -Z is the nose, matching the common projectile orientation matrix.
export function missileMesh(){
 const data=[],profile=[[-.5,0],[-.28,.065],[.36,.065],[.5,.045]],sides=16;
 const vertex=(p,n,uv)=>data.push(...p,...n,...uv);
 for(let j=0;j<profile.length-1;j++)for(let i=0;i<sides;i++){
  const slope=(profile[j][1]-profile[j+1][1])/(profile[j+1][0]-profile[j][0]),length=Math.hypot(1,slope);
  for(const [row,col] of [[j,i],[j,i+1],[j+1,i],[j+1,i],[j,i+1],[j+1,i+1]]){const a=col/sides*Math.PI*2,[z,r]=profile[row];vertex([Math.cos(a)*r,Math.sin(a)*r,z],[Math.cos(a)/length,Math.sin(a)/length,slope/length],[col/sides,z+.5]);}
 }
 for(let i=0;i<4;i++){const a=i*Math.PI/2,c=Math.cos(a),s=Math.sin(a),points=[[c*.06,s*.06,.15],[c*.21,s*.21,.43],[c*.06,s*.06,.47]];for(const p of points)vertex(p,[-s,c,0],[.1,.82]);}
 return new Float32Array(data);
}

export class SurfaceReticle{
 constructor(gl,height){this.gl=gl;this.height=height;this.visible=false;}
 setup(){
  const gl=this.gl;this.program=makeProgram(gl,`#version 300 es
layout(location=0) in vec3 a;uniform mat4 u_matrix;uniform vec2 u_origin;void main(){gl_Position=u_matrix*vec4(a.xy-u_origin,a.z,1.);}`,`#version 300 es
precision highp float;out vec4 color;void main(){color=vec4(.25,1.,.75,.92);}`);
  this.matrix=gl.getUniformLocation(this.program,'u_matrix');this.origin=gl.getUniformLocation(this.program,'u_origin');this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.bindVertexArray(null);
 }
 draw(target,matrix,camera,normal=null){
  this.visible=!!target;if(!target)return;if(!this.program)this.setup();const gl=this.gl;
  const distance=Math.hypot(target[0]-camera.position[0],target[1]-camera.position[1],target[2]-camera.height),radius=Math.max(1.7,Math.min(10,distance*.018)),width=radius*.055,points=[];
  const tangent=normal?(Math.abs(normal[2])>.99?[normal[2],0,-normal[0]]:[-normal[1],normal[0],0]):null;
  if(tangent){const length=Math.hypot(...tangent);for(let i=0;i<3;i++)tangent[i]/=length;}
  const bitangent=normal?[normal[1]*tangent[2]-normal[2]*tangent[1],normal[2]*tangent[0]-normal[0]*tangent[2],normal[0]*tangent[1]-normal[1]*tangent[0]]:null;
  const put=(x,y)=>{if(normal){for(let i=0;i<3;i++)points.push(target[i]+tangent[i]*x+bitangent[i]*y+normal[i]*.08);}else{const p=[target[0]+x,target[1]+y];points.push(...p,this.height(p)+.16);}};
  const strip=(a,b,c,d)=>{for(const p of [a,b,c,c,b,d])put(...p);};
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2,b=(i+1)/64*Math.PI*2;strip([Math.cos(a)*(radius-width),Math.sin(a)*(radius-width)],[Math.cos(a)*(radius+width),Math.sin(a)*(radius+width)],[Math.cos(b)*(radius-width),Math.sin(b)*(radius-width)],[Math.cos(b)*(radius+width),Math.sin(b)*(radius+width)]);}
  for(let i=0;i<4;i++){const a=i*Math.PI/2,c=Math.cos(a),s=Math.sin(a),p=(r,w)=>[c*r-s*w,s*r+c*w];strip(p(radius*.7,-width),p(radius*1.3,-width),p(radius*.7,width),p(radius*1.3,width));}
  strip([-width,-radius*.18],[width,-radius*.18],[-width,radius*.18],[width,radius*.18]);strip([-radius*.18,-width],[radius*.18,-width],[-radius*.18,width],[radius*.18,width]);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(this.program);gl.uniformMatrix4fv(this.matrix,false,matrix);gl.uniform2fv(this.origin,camera.position);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,points.length/3);gl.bindVertexArray(null);gl.depthMask(true);gl.disable(gl.BLEND);
 }
 dispose(){const gl=this.gl;if(this.program)gl.deleteProgram(this.program);if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);}
}

export class OrcaMissileEffects extends HighwindBombEffects{
 constructor(gl,{groundHeight=()=>0,config=missileImpactConfig(ORCA_MISSILE_CONFIG),...options}={}){super(gl,{...options,config});this.reticle=new SurfaceReticle(gl,groundHeight);}
 mesh(){return missileMesh();}
 paintTexture(canvas){canvas.width=32;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#e1dfcc';c.fillRect(0,0,32,128);c.fillStyle='#ce6724';c.fillRect(0,0,32,27);c.fillRect(0,86,32,10);c.fillStyle='#3b4546';c.fillRect(0,121,32,7);return canvas;}
 hasEffects(state){return super.hasEffects(state)||state.trails.length;}
 trailSprites(state,visible){
  const settings=state.settings.trainee,step=this.mobile?2:1,recent=this.config.particules.particulesParTrainee,counts=new Map();
  // Protect the configured number of newest smoke points per missile. Older
  // persistent smoke uses only the remaining budget; zero disables trail smoke.
  for(let i=state.trails.length-1;recent>0&&i>=0;i--){const trail=state.trails[i],age=state.time-trail.born,fade=Math.max(0,1-age/settings.dureeSecondes),drift=age*.12;
   if(fade<=0)continue;const count=counts.get(trail.id)||0;counts.set(trail.id,count+1);if(count%step)continue;this.spriteSource='trail:'+trail.id;this.spritePriority=count/step<recent?2:0;
   this.sprite([trail.position[0]+Math.sin(trail.seed*6.28)*drift,trail.position[1]+drift,trail.position[2]+age*.28],settings.tailleMetres*(.3+age*.33),[.8,.83,.84,fade*fade*.72],0);
  }
  for(const m of visible){this.spriteSource='missile:'+m.id;this.spritePriority=3;const rear=m.position.map((v,i)=>v-m.direction[i]*m.scale*.52);this.sprite(rear,m.scale*.48,[1,.51,.12,.95],2);this.sprite(rear,m.scale*.2,[1,.94,.73,1],2);}
  this.spritePriority=undefined;this.spriteSource=undefined;
 }
 draw(state,matrix,camera,center){super.draw(state,matrix,camera,center);this.reticle.draw(state.target,matrix,camera,state.targetNormal);}
 getState(){const state=super.getState();state.visibleMissiles=state.visibleBombs;delete state.visibleBombs;return {...state,reticleVisible:this.reticle.visible};}
 dispose(){super.dispose();this.reticle.dispose();}
}
