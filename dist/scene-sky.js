import {FPS_FOV} from './walk-core.js';
import {CITY} from './city-config.js';

// Each city's palette is shared by the aerial map, FPS sky and distant haze.
export const SKY_STYLE=Object.freeze({
 'sky-color':CITY.id==='chalons'?'#91aabc':'#55a9ef',
 'horizon-color':CITY.id==='chalons'?'#c1cdd5':'#a3d4fa',
 'sky-horizon-blend':.35,
 'atmosphere-blend':0
});
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const glslColor=hex=>`vec3(${rgb(hex).map(n=>n.toFixed(9)).join(',')})`;

// Match MapLibre 5.6's sky.fragment.glsl and mercator_utils.getMercatorHorizon.
// The region below the horizon also fills the space beyond the FPS loading radius.
export const SKY_GLSL=`
uniform float u_sky_horizon;
uniform float u_sky_band;
vec3 sceneSkyColor(float y){
 float t=clamp((y-u_sky_horizon)/max(u_sky_band,.0001),0.,1.);
 return mix(${glslColor(SKY_STYLE['sky-color'])},${glslColor(SKY_STYLE['horizon-color'])},(1.-t)*(1.-t));
}`;

export function skyProjection(height,pitch,fov=FPS_FOV){
 const cameraDistance=height/(2*Math.tan(fov*Math.PI/360));
 const horizon=cameraDistance*Math.min(Math.tan(-pitch)*.85,Math.tan(-pitch-.75*Math.PI/180));
 return {horizon:height/2+horizon,band:SKY_STYLE['sky-horizon-blend']*height/2};
}

const cloudFiles=new Map(),weatherStart=performance.now();
const SUN_AZIMUTH=75,SUN_ELEVATION=75;
export const SUN_DIRECTION=Object.freeze([Math.sin(SUN_AZIMUTH*Math.PI/180)*Math.cos(SUN_ELEVATION*Math.PI/180),Math.cos(SUN_AZIMUTH*Math.PI/180)*Math.cos(SUN_ELEVATION*Math.PI/180),Math.sin(SUN_ELEVATION*Math.PI/180)]);
const CLOUD_FRAGMENT=`
uniform sampler2D u_clouds;
uniform vec2 u_viewport;
uniform vec3 u_forward,u_right,u_up,u_sun;
uniform float u_tan_half_fov,u_cloud_drift;
uniform bool u_map_sky;
vec4 cloudPatch(vec2 angles,vec2 center,vec2 extent,float variant,float mirror){
 float longitude=mod(angles.x-center.x+3.14159265359,6.28318530718)-3.14159265359;
 vec2 uv=vec2(longitude,center.y-angles.y)/extent+.5;
 if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);
 uv.x=mix(uv.x,1.-uv.x,mirror);
 // Each half of the atlas has transparent padding, including its mipmaps.
 uv.x=(uv.x+variant)*.5;
 return texture(u_clouds,uv);
}
vec3 weatherColor(vec3 direction){
 vec3 color=sceneSkyColor(gl_FragCoord.y);
 if(direction.z<=0.)return color;
 vec2 angles=vec2(atan(direction.x,direction.y)+u_cloud_drift*6.28318530718,asin(clamp(direction.z,-1.,1.)));
 // Local cloud patches retain detail without a large full-sphere texture.
 const float rad=.01745329251994;
 vec4 cloud=cloudPatch(angles,vec2(18.,30.)*rad,vec2(42.,37.)*rad,0.,0.);
 vec4 next=cloudPatch(angles,vec2(73.,21.)*rad,vec2(46.,43.)*rad,1.,0.);cloud=next+cloud*(1.-next.a);
 next=cloudPatch(angles,vec2(133.,37.)*rad,vec2(52.,41.)*rad,0.,1.);cloud=next+cloud*(1.-next.a);
 next=cloudPatch(angles,vec2(190.,18.)*rad,vec2(32.,30.)*rad,1.,1.);cloud=next+cloud*(1.-next.a);
 next=cloudPatch(angles,vec2(246.,32.)*rad,vec2(38.,32.)*rad,0.,0.);cloud=next+cloud*(1.-next.a);
 next=cloudPatch(angles,vec2(305.,23.)*rad,vec2(44.,40.)*rad,1.,1.);cloud=next+cloud*(1.-next.a);
 next=cloudPatch(angles,vec2(55.,65.)*rad,vec2(80.,34.)*rad,1.,1.);cloud=next+cloud*(1.-next.a);
 float visibility=smoothstep(.02,.22,direction.z),alpha=cloud.a*visibility*.78;
 // Lift the shadows and retain a little blue atmospheric light in the whites.
 // Keep premultiplied alpha throughout to avoid halos along vapor edges.
 vec3 gentleCloud=cloud.rgb*.56+vec3(.87,.91,.95)*cloud.a*.44;
 gentleCloud=mix(gentleCloud,color*cloud.a,.10);
 color=color*(1.-alpha)+gentleCloud*visibility*.78;
 float angle=acos(clamp(dot(direction,u_sun),-1.,1.));
 float halo=exp(-angle*angle/.0012)*.18+pow(max(dot(direction,u_sun),0.),16.)*.025;
 color+=vec3(1.,.80,.48)*halo*(1.-alpha*.75);
 float edge=max(fwidth(angle),.0002),sun=1.-smoothstep(.00465-edge,.00465+edge,angle);
 return mix(color,vec3(1.,.985,.92),sun*(1.-alpha*.88));
}`;

export class SceneSky {
 constructor(gl,{onReady=()=>{}}={}){
  this.gl=gl;this.program=gl.createProgram();this.vao=gl.createVertexArray();
  const vertex=`#version 300 es
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,1.,1.);}`;
  const fragment=`#version 300 es
  precision highp float;
  ${SKY_GLSL}
  ${CLOUD_FRAGMENT}
  out vec4 fragColor;
  void main(){
   if(u_map_sky&&gl_FragCoord.y<u_sky_horizon)discard;
   vec2 screen=(gl_FragCoord.xy/u_viewport*2.-1.)*vec2(u_viewport.x/u_viewport.y,1.)*u_tan_half_fov;
   vec3 direction=normalize(u_forward+u_right*screen.x+u_up*screen.y);
   fragColor=vec4(weatherColor(direction),1.);
  }`;
  for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
   const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
   gl.attachShader(this.program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.uniforms=Object.fromEntries(['u_sky_horizon','u_sky_band','u_clouds','u_viewport','u_forward','u_right','u_up','u_sun','u_tan_half_fov','u_cloud_drift','u_map_sky'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  const mobile=matchMedia('(pointer:coarse)').matches||matchMedia('(max-width:700px)').matches;
  this.resolution=mobile?1024:2048;
  const file='./data/sky/'+(mobile?'clouds-soft-mobile.webp':'clouds-soft.webp');
  if(!cloudFiles.has(file))cloudFiles.set(file,fetch(file).then(r=>{if(!r.ok)throw Error('Nuages indisponibles');return r.blob();}).catch(e=>{cloudFiles.delete(file);throw e;}));
  this.ready=cloudFiles.get(file).then(blob=>createImageBitmap(blob,{imageOrientation:'none',premultiplyAlpha:'premultiply'})).then(bitmap=>{if(this.disposed){bitmap.close();return;}this.pending=bitmap;onReady();}).catch(e=>{this.error=e.message;});
 }
 apply(uniforms,height,pitch,fov=FPS_FOV){
  const projection=skyProjection(height,pitch,fov),gl=this.gl;
  gl.uniform1f(uniforms.u_sky_horizon,projection.horizon);gl.uniform1f(uniforms.u_sky_band,projection.band);
 }
 draw(height,pitch,fov=FPS_FOV,yaw=0,mapSky=false){
  if(this.disposed)return;
  const gl=this.gl,u=this.uniforms,width=gl.drawingBufferWidth;
  if(mapSky){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);}else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  gl.useProgram(this.program);this.apply(this.uniforms,height,pitch,fov);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
  if(this.pending){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.pending);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.pending.close();this.pending=null;this.loaded=true;}
  const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
  gl.uniform1i(u.u_clouds,0);gl.uniform1i(u.u_map_sky,mapSky?1:0);gl.uniform2f(u.u_viewport,width,height);
  gl.uniform3f(u.u_forward,sy*cp,cy*cp,sp);gl.uniform3f(u.u_right,cy,-sy,0);gl.uniform3f(u.u_up,-sy*sp,-cy*sp,cp);gl.uniform3fv(u.u_sun,SUN_DIRECTION);
  gl.uniform1f(u.u_tan_half_fov,Math.tan(fov*Math.PI/360));gl.uniform1f(u.u_cloud_drift,(performance.now()-weatherStart)/1000*.00001);
  gl.bindVertexArray(this.vao);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);
  gl.depthMask(true);
 }
 getState(){return {cloudsLoaded:Boolean(this.loaded),cloudStyle:'soft-atlas',resolution:this.resolution,sunAzimuth:SUN_AZIMUTH,sunElevation:SUN_ELEVATION,error:this.error||null};}
 dispose(){if(this.disposed)return;this.disposed=true;this.pending?.close();this.pending=null;this.gl.deleteTexture(this.texture);this.gl.deleteVertexArray(this.vao);this.gl.deleteProgram(this.program);}
}

/** The same weather behind the map, never over roads, roofs or the 2D view. */
export class MapSkyLayer {
 constructor(){this.id='scene-weather';this.type='custom';this.renderingMode='3d';}
 onAdd(map,gl){
  this.map=map;this.sky=new SceneSky(gl,{onReady:()=>map.triggerRepaint()});
  this.restore=()=>{this.sky.dispose();this.sky=new SceneSky(gl,{onReady:()=>map.triggerRepaint()});};
  map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  this.timer=setInterval(()=>{if(!document.hidden&&map.getPitch()>60)map.triggerRepaint();},matchMedia('(pointer:coarse)').matches?250:120);
 }
 render(gl){if(this.map.getPitch()<1)return;this.sky.draw(gl.drawingBufferHeight,(this.map.getPitch()-90)*Math.PI/180,this.map.getVerticalFieldOfView(),this.map.getBearing()*Math.PI/180,true);}
 onRemove(map){clearInterval(this.timer);map.getCanvas().removeEventListener('webglcontextrestored',this.restore);this.sky.dispose();}
 getState(){return this.sky?.getState();}
}
