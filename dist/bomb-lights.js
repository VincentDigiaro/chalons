import {BOMB_CONFIG} from './highwind-bombs.js';
import {validateBombConfig} from './walk-config.js';
import {recentBombItems} from './bomb-limits.js';

// A texture stores the selected lights, avoiding a fixed shader array length.
export const BOMB_LIGHT_GLSL=`
uniform sampler2D u_bomb_lights;
uniform int u_bomb_light_count;
vec3 bombLighting(vec3 position){
 float amount=0.;
 for(int i=0;i<u_bomb_light_count;i++){
  vec4 light=texelFetch(u_bomb_lights,ivec2(0,i),0);
  float radius=texelFetch(u_bomb_lights,ivec2(1,i),0).x;
  amount+=light.w*max(0.,1.-length(position-light.xyz)/max(1.,radius));
 }
 return vec3(1.,.42,.09)*amount;
}`;
export class BombLights {
 constructor(gl,{config=BOMB_CONFIG}={}){this.gl=gl;this.config=validateBombConfig(config);this.count=0;}
 apply(bombs,uniforms){
  const gl=this.gl,live=(bombs?.blasts||[]).filter(b=>bombs.time-b.started<1.5),selected=recentBombItems(live,this.config.limites.eclairagesSimultanes),count=selected.length,height=Math.max(1,count);
  this.maxTextureSize??=gl.getParameter(gl.MAX_TEXTURE_SIZE);if(height>this.maxTextureSize)throw Error('Trop d’éclairages de bombes pour cette carte graphique : réduire highwind.bombes.limites.eclairagesSimultanes.');
  gl.activeTexture(gl.TEXTURE2);
  if(!this.texture){this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);for(const [key,value] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);}
  else gl.bindTexture(gl.TEXTURE_2D,this.texture);
  if(this.height!==height){this.height=height;this.data=new Float32Array(height*8);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,2,height,0,gl.RGBA,gl.FLOAT,this.data);}
  for(let i=0;i<count;i++){const b=selected[i];this.data.set([...b.position,Math.max(0,1-(bombs.time-b.started)/1.5),b.radius*1.8,0,0,0],i*8);}
  if(count)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,2,height,gl.RGBA,gl.FLOAT,this.data);
  gl.uniform1i(uniforms.u_bomb_lights,2);gl.uniform1i(uniforms.u_bomb_light_count,count);gl.activeTexture(gl.TEXTURE0);this.count=count;
 }
 dispose(){if(this.texture)this.gl.deleteTexture(this.texture);this.texture=null;}
}
