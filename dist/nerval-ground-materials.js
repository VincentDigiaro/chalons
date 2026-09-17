// Shared by the map and FPS renderer; all three images are material albedos.
export const GROUND_GLSL=`
bool detailedGround(vec3 p){return p.x < -22. && p.x > -165. && p.y < -20. && p.y > -153.;}
vec3 groundAlbedo(int kind,vec3 p,vec2 uv,vec3 tone){
 // Local UV style marker for house 42's pink pedestrian path. The garage
 // drive and every unmarked path retain the existing hexagonal paving.
 if(kind==9&&uv.x>=128.&&uv.x<192.){
  vec2 q=vec2(uv.x-128.,uv.y)/.22,cell=floor(q),f=fract(q);
  float edge=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
  float aa=max(fwidth(q.x),fwidth(q.y));
  float tile=smoothstep(.018,.032+aa*.5,edge);
  float shade=.92+.15*fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
  float grain=fract(sin(dot(floor(q*32.),vec2(12.9898,78.233)))*43758.5453);
  vec3 face=tone*shade*(.985+(.03*grain-.015)*(1.-smoothstep(.08,.25,aa)));
  return mix(vec3(.48,.455,.405),face,tile);
 }
 vec2 texCoord=kind==9?uv:p.xy/2.;
 vec3 sampled=texture(u_texture,texCoord).rgb;
 if(kind==8)return sampled*mix(vec3(1.),tone/vec3(.36,.43,.235),.45);
 if(kind==9)return sampled*tone/vec3(.65,.60,.50);
 // Footways use the same fine aggregate with a darker, older binder.
 float value=dot(sampled,vec3(.299,.587,.114));
 // Pale aggregate beds carry a distinct warm vertex tint. Reuse the fine
 // mineral albedo, with visible grain, instead of turning them into asphalt.
 bool whiteGravel=kind==7&&all(greaterThan(tone,vec3(.90)));
 bool gravel=kind==7&&((tone.r>.60&&tone.b<tone.r*.92)||whiteGravel);
 vec3 base=gravel?tone*.89:kind==7?vec3(.34,.355,.34):tone;
 if(gravel){vec2 cell=floor(p.xy*36.);float grain=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);return base*(.72+.45*grain)*(.85+.15*value/.48);}
 return base*(.55+.45*value/.48);
}
`;
