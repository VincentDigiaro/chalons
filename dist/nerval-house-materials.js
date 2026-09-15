// Opaque glazing avoids sorting errors on overlapping panes in the shared map
// depth buffer. Soft reflections and curtain folds remain subtle at close range.
export const HOUSE_GLSL=`
vec3 houseGlazing(vec2 uv,vec3 tint){
 float sky=smoothstep(.20,.95,uv.y);
 float fold=.965+.035*cos(uv.x*112.);
 float reflection=exp(-pow((uv.x+.18*uv.y-.55)*6.,2.));
 vec3 glass=tint*mix(.78,1.10,sky)*fold;
 return mix(glass,vec3(.69,.74,.72),reflection*.16);
}
`;
