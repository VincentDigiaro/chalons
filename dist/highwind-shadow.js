import {SUN_DIRECTION} from './scene-sky.js';

// Project toward the visible sun at the elevation used by the sky.
const [sx,sy,sz]=SUN_DIRECTION,horizontal=Math.hypot(sx,sy);
const LIGHT_RIGHT=[sy/horizontal,-sx/horizontal,0];
const LIGHT_UP=[-sx*sz/horizontal,-sy*sz/horizontal,horizontal];
export const HIGHWIND_SHADOW_GLSL=`
uniform highp sampler2DShadow u_highwind_depth;
uniform bool u_highwind_shadow_ready;
uniform mat4 u_highwind_shadow_matrix;
uniform vec3 u_highwind_shadow_origin;
uniform vec2 u_highwind_shadow_texel;
uniform float u_highwind_shadow_bias;
float highwindShadow(vec3 world){
 if(!u_highwind_shadow_ready)return 0.;
 vec3 p=(u_highwind_shadow_matrix*vec4(world-u_highwind_shadow_origin,1.)).xyz*.5+.5;
 if(any(lessThanEqual(p.xy,vec2(0.)))||any(greaterThanEqual(p.xy,vec2(1.)))||p.z<=0.)return 0.;
 // Only the ship occupies the depth map. Receivers can be arbitrarily far
 // below it; keep empty texels (depth 1) lit even at high flight altitudes.
 float depth=min(p.z-u_highwind_shadow_bias,.999999),lit=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)lit+=texture(u_highwind_depth,vec3(p.xy+vec2(float(x),float(y))*u_highwind_shadow_texel,depth));
 return 1.-lit/9.;
}`;

// A rotation-independent sphere contains the hull and every rotor at every
// angle. Its stable footprint prevents resolution changes while turning.
export function highwindShadowRadius(index){
 const extent=index.bounds[0].map((v,i)=>Math.max(Math.abs(v),Math.abs(index.bounds[1][i])));
 return Math.hypot(...extent);
}

export function highwindShadowProjection(index,pose,size=1024,radius=highwindShadowRadius(index)){
 const r=Math.max(.01,radius*pose.longueurMetres)*1.02;
 // An orthographic view from the sun keeps detail even at low elevations.
 // Both passes subtract the ship anchor before projection for precision.
 const matrix=new Float32Array([LIGHT_RIGHT[0]/r,LIGHT_UP[0]/r,-sx/r,0,LIGHT_RIGHT[1]/r,LIGHT_UP[1]/r,-sy/r,0,LIGHT_RIGHT[2]/r,LIGHT_UP[2]/r,-sz/r,0,0,0,0,1]);
 return {matrix,origin:[pose.position.x,pose.position.y,pose.position.z],texel:[1/size,1/size],bias:.06/(2*r)};
}

const VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=2) in vec2 a_uv;
uniform mat4 u_model;
uniform mat4 u_shadow_matrix;
uniform vec3 u_shadow_origin;
out vec2 v_uv;
void main(){v_uv=a_uv;vec3 world=(u_model*vec4(a_position,1.)).xyz;gl_Position=u_shadow_matrix*vec4(world-u_shadow_origin,1.);}`;
const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
void main(){if(texture(u_texture,v_uv).a<.5)discard;}`;

export class HighwindShadow{
 constructor(gl){this.gl=gl;this.size=Math.min(1024,gl.getParameter(gl.MAX_TEXTURE_SIZE));this.ready=false;this.empty=this.depthTexture(1,new Uint32Array([0xffffffff]));}
 depthTexture(size,data=null){
  const gl=this.gl,texture=gl.createTexture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
  gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);return texture;
 }
 setup(){
  const gl=this.gl;this.depth=this.depthTexture(this.size);this.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.depth,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
  const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if(status!==gl.FRAMEBUFFER_COMPLETE)throw Error('Tampon de l’ombre du Hautvent incomplet.');
  this.program=gl.createProgram();
  for(const [kind,source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,FRAGMENT]]){
   const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(log);}
   gl.attachShader(this.program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['u_model','u_shadow_matrix','u_shadow_origin','u_texture'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
 }
 render(ship,renderer){
  this.ready=false;this.draws=0;
  const data=ship.residency?.data;
  if(!ship.enabled||!data?.gpu){this.release();return;}
  if(!this.program)this.setup();
  if(this.geometry!==data){
   // Include the complete swept volume of rotating blades without uploading
   // another mesh. Geometry and alpha textures are shared with the ship.
   let radius=highwindShadowRadius(ship.index);
   for(const range of ship.index.ranges){
    const rotor=ship.index.rotors?.[range.part];if(!rotor)continue;
    for(let i=range.first*11;i<(range.first+range.count)*11;i+=11)radius=Math.max(radius,Math.hypot(...rotor.pivot)+Math.hypot(...rotor.pivot.map((p,j)=>data.vertices[i+j]-p)));
   }
   this.radius=radius;this.geometry=data;
  }
  this.projection=highwindShadowProjection(ship.index,ship.pose,this.size,this.radius);
  const gl=this.gl,u=this.uniforms,p=this.projection;
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,this.size,this.size);
  gl.colorMask(false,false,false,false);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.disable(gl.POLYGON_OFFSET_FILL);gl.disable(gl.SCISSOR_TEST);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.useProgram(this.program);gl.uniformMatrix4fv(u.u_shadow_matrix,false,p.matrix);gl.uniform3fv(u.u_shadow_origin,p.origin);gl.uniform1i(u.u_texture,0);
  try{
   ship.draw((gpu,id,first,count,model)=>{
    const texture=renderer.textures.get(renderer.material(id).texture)?.gpu;if(!texture)return false;
    gl.uniformMatrix4fv(u.u_model,false,model);gl.bindTexture(gl.TEXTURE_2D,texture);gl.bindVertexArray(gpu.vao);gl.drawArrays(gl.TRIANGLES,first,count);this.draws++;return true;
   });
   this.ready=this.draws>0;
  }finally{gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.colorMask(true,true,true,true);}
 }
 apply(uniforms){
  const gl=this.gl,p=this.projection;
  gl.uniform1i(uniforms.u_highwind_shadow_ready,this.ready?1:0);gl.uniform1i(uniforms.u_highwind_depth,1);
  if(this.ready){gl.uniformMatrix4fv(uniforms.u_highwind_shadow_matrix,false,p.matrix);gl.uniform3fv(uniforms.u_highwind_shadow_origin,p.origin);gl.uniform2fv(uniforms.u_highwind_shadow_texel,p.texel);gl.uniform1f(uniforms.u_highwind_shadow_bias,p.bias);}
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.ready?this.depth:this.empty);gl.activeTexture(gl.TEXTURE0);
 }
 getState(){return {ready:this.ready,size:this.ready?this.size:0,draws:this.draws||0,gpuBytes:this.depth?this.size*this.size*4:0};}
 release(){const gl=this.gl;if(this.depth)gl.deleteTexture(this.depth);if(this.framebuffer)gl.deleteFramebuffer(this.framebuffer);if(this.program)gl.deleteProgram(this.program);this.depth=this.framebuffer=this.program=this.geometry=null;this.ready=false;}
 dispose(){this.release();this.gl.deleteTexture(this.empty);}
}
