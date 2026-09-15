// Local repeating albedos use the mesh UVs, so georeferencing the same
// geometry for the pedestrian scene cannot shift or rotate its texture.
export const ATTILA_GROUND_GLSL=`
vec3 attilaGround(int kind,vec2 uv,vec3 color){
 vec3 albedo=texture(u_texture,uv).rgb;
 if(kind==16)return albedo*mix(vec3(.72),vec3(1.18),color);
 if(kind==15)return albedo*mix(vec3(.90),color,.3);
 return albedo*color;
}
`;
