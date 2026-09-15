// Shared by the map and FPS renderer; all three images are material albedos.
export const GROUND_GLSL=`
bool detailedGround(vec3 p){return p.x < -22. && p.x > -165. && p.y < -20. && p.y > -153.;}
vec3 groundAlbedo(int kind,vec3 p,vec2 uv,vec3 tone){
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
