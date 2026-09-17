export const IDENTITY=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export function multiply(a,b){const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;}
export function shipMatrix(pose){
 const a=pose.angleDegres*Math.PI/180,c=Math.cos(a),s=Math.sin(a),p=pose.pitch||0,cp=Math.cos(p),sp=Math.sin(p),l=pose.longueurMetres,{x,y,z}=pose.position;
 const r=pose.roll||0,cr=Math.cos(r),sr=Math.sin(r);
 return new Float32Array([(cr*c+sr*s*sp)*l,(-cr*s+sr*c*sp)*l,-sr*cp*l,0,s*cp*l,c*cp*l,sp*l,0,(sr*c-cr*s*sp)*l,(-sr*s-cr*c*sp)*l,cr*cp*l,0,x,y,z,1]);
}
export const transform=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
export function inversePoint(pose,p){const a=pose.angleDegres*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cp=Math.cos(pose.pitch||0),sp=Math.sin(pose.pitch||0),x=p[0]-pose.position.x,y=p[1]-pose.position.y,z=p[2]-pose.position.z,l=pose.longueurMetres,cr=Math.cos(pose.roll||0),sr=Math.sin(pose.roll||0),right=c*x-s*y,up=-sp*(s*x+c*y)+cp*z;return [(cr*right-sr*up)/l,(cp*(s*x+c*y)+sp*z)/l,(sr*right+cr*up)/l];}
export function rotorMatrix(rotor,angle){const a=angle*rotor.direction,c=Math.cos(a),s=Math.sin(a),t=1-c,[x,y,z]=rotor.axis||[0,0,1],p=rotor.pivot,m=new Float32Array([t*x*x+c,t*x*y+s*z,t*x*z-s*y,0,t*x*y-s*z,t*y*y+c,t*y*z+s*x,0,t*x*z+s*y,t*y*z-s*x,t*z*z+c,0,0,0,0,1]);for(let i=0;i<3;i++)m[12+i]=p[i]-m[i]*p[0]-m[4+i]*p[1]-m[8+i]*p[2];return m;}
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>Array.from(a,(v,i)=>v-b[i]);
// Closest point on a triangle (including edges), used for actual hull contact.
export function triangleDistance(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],len=Math.hypot(...n);
 if(len<1e-12){const edge=(x,y)=>{const v=sub(y,x),q=sub(p,x),d=dot(v,v),t=d?Math.max(0,Math.min(1,dot(q,v)/d)):0;return Math.hypot(...q.map((n,i)=>n-t*v[i]));};return Math.min(edge(a,b),edge(b,c),edge(c,a));}
 const d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return Math.hypot(...ap);
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return Math.hypot(...bp);
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return Math.hypot(...sub(p,a.map((x,i)=>x+v*ab[i])));}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return Math.hypot(...cp);
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return Math.hypot(...sub(p,a.map((x,i)=>x+w*ac[i])));}
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/(d4-d3+d5-d6);return Math.hypot(...sub(p,b.map((x,i)=>x+w*(c[i]-x))));}
 return Math.abs(dot(ap,n))/len;
}
