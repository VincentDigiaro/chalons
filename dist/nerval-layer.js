const VERTEX=`#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
in vec3 a_color;
uniform mat4 u_matrix;
out vec2 v_uv;
out vec3 v_color;
out float v_light;
void main(){
 gl_Position=u_matrix*vec4(a_position,1.0);v_uv=a_uv;v_color=a_color;
 v_light=.72+.28*abs(dot(normalize(a_normal),normalize(vec3(-.4,-.6,.8))));
}`;
const FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform int u_material;
uniform bool u_photos;
in vec2 v_uv;
in vec3 v_color;
in float v_light;
out vec4 fragColor;
void main(){
 if(u_material>0 && u_photos){vec4 p=texture(u_texture,v_uv);if(p.a<.55)discard;fragColor=vec4(p.rgb,1.0);}
 else {if(u_material>1)discard;fragColor=vec4((u_material==1?vec3(.39,.35,.29):v_color)*v_light,1.0);}
}`;

/** Small, static ENU model of the street; all GPU resources are bounded.
 * Facade atlas pixels are manually rectified from the supplied references.
 * Local metres avoid float32 jitter at close zooms; MapLibre supplies depth.
 */
export class NervalLayer {
 constructor({onReady=()=>{},onError=()=>{}}={}){
  this.id='nerval-detail';this.type='custom';this.renderingMode='3d';this.onReady=onReady;this.onError=onError;
  this.visible=true;this.photos=true;this.abort=new AbortController();this.stats={loaded:false,draws:0,errors:0};
 }
 onAdd(map,gl){
  this.map=map;this.gl=gl;
  this.restore=()=>{this.setupGL();this.textureObjects=[];this.map.triggerRepaint();};
  map.getCanvas().addEventListener('webglcontextrestored',this.restore);
  const json=async file=>{const r=await fetch(`./data/nerval/${file}`,{signal:this.abort.signal});if(!r.ok)throw Error(`Rue Gérard-de-Nerval : HTTP ${r.status}`);return r;};
  Promise.all([json('index.json').then(r=>r.json()),json('mesh.bin').then(r=>r.arrayBuffer())]).then(async([index,buffer])=>{
   this.index=index;this.vertices=new Float32Array(buffer);this.origin=maplibregl.MercatorCoordinate.fromLngLat(index.origin);this.metres=this.origin.meterInMercatorCoordinateUnits();
   this.bitmaps=await Promise.all(index.textures.map(async file=>createImageBitmap(await (await json(file)).blob(),{imageOrientation:'none',premultiplyAlpha:'none'})));
   if(this.abort.signal.aborted){for(const image of this.bitmaps)image.close();return;}
   this.setupGL();this.textureObjects=[];this.stats.loaded=true;await this.onReady(index);map.triggerRepaint();
  }).catch(error=>{if(error.name==='AbortError')return;this.stats.errors++;this.onError(error);});
 }
 setupGL(){
  if(!this.vertices||this.gl.isContextLost())return;
  const gl=this.gl,compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,VERTEX),fs=compile(gl.FRAGMENT_SHADER,FRAGMENT);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.vertices,gl.STATIC_DRAW);
  for(const [name,size,offset] of [['a_position',3,0],['a_normal',3,12],['a_uv',2,24],['a_color',3,32]]){const a=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,44,offset);}
  this.uniforms=Object.fromEntries(['u_matrix','u_texture','u_material','u_photos'].map(n=>[n,gl.getUniformLocation(this.program,n)]));this.matrix=new Float32Array(16);gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);
 }
 setVisible(buildings,photos){this.visible=buildings;this.photos=photos;this.map?.triggerRepaint();}
 render(gl,options){
  this.stats.draws=0;
  if(!this.stats.loaded||!this.visible||this.map.getPitch()<1||this.map.getZoom()<14)return;
  const b=this.map.getBounds(),[w,s,e,n]=this.index.bounds;if(b.getEast()<w||b.getWest()>e||b.getNorth()<s||b.getSouth()>n)return;
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.activeTexture(gl.TEXTURE0);
  for(let i=0;i<this.bitmaps.length;i++)if(!this.textureObjects[i]){const t=gl.createTexture();this.textureObjects[i]=t;gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.bitmaps[i]);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
  const m=options.defaultProjectionData.mainMatrix,o=this.matrix,k=this.metres,{x,y}=this.origin;
  for(let row=0;row<4;row++){o[row]=m[row]*k;o[4+row]=-m[4+row]*k;o[8+row]=m[8+row]*k;o[12+row]=m[row]*x+m[4+row]*y+m[12+row];}
  gl.uniformMatrix4fv(this.uniforms.u_matrix,false,o);gl.uniform1i(this.uniforms.u_texture,0);gl.uniform1i(this.uniforms.u_photos,this.photos?1:0);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  for(const range of this.index.ranges){gl.uniform1i(this.uniforms.u_material,range.material);if(range.material>0)gl.bindTexture(gl.TEXTURE_2D,this.textureObjects[range.material-1]);gl.drawArrays(gl.TRIANGLES,range.first,range.count);this.stats.draws++;}
  gl.bindVertexArray(null);gl.bindTexture(gl.TEXTURE_2D,null);
 }
 getState(){return {...this.stats,visible:this.visible,photos:this.photos,...this.index?.stats};}
 pick(point){
  if(!this.stats.draws||!this.visible)return null;
  const m=this.matrix,canvas=this.map.getCanvas(),project=p=>{const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];if(q[3]<=0)return null;return [(q[0]/q[3]+1)*canvas.clientWidth/2,(1-q[1]/q[3])*canvas.clientHeight/2,q[2]/q[3]];};
  let nearest=Infinity,part=null;
  for(const triangle of this.index.pickTriangles){const [a,b,c]=triangle.points.map(project);if(!a||!b||!c)continue;
   const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<.001)continue;
   const u=((b[1]-c[1])*(point.x-c[0])+(c[0]-b[0])*(point.y-c[1]))/det,v=((c[1]-a[1])*(point.x-c[0])+(a[0]-c[0])*(point.y-c[1]))/det,w=1-u-v;
   if(u<0||v<0||w<0)continue;const depth=u*a[2]+v*b[2]+w*c[2];if(depth<nearest){nearest=depth;part=triangle.part;}
  }
  return part;
 }
 onRemove(map,gl){this.abort.abort();map.getCanvas().removeEventListener('webglcontextrestored',this.restore);this.bitmaps?.forEach(b=>b.close());this.textureObjects?.forEach(t=>gl.deleteTexture(t));if(this.vao)gl.deleteVertexArray(this.vao);if(this.buffer)gl.deleteBuffer(this.buffer);if(this.program)gl.deleteProgram(this.program);}
}
