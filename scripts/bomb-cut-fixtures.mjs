export function boxMesh(x0,y0,x1,y1,{bottom=0,top=15,slope=0,material=0}={}){
 const out=[],vertex=(x,y,z,n)=>[x,y,z,...n,(x-x0)/(x1-x0),(z-bottom)/(top-bottom),.8,.7,.6];
 const z=x=>top+slope*(x-x0);
 const quad=(p,n)=>{const v=p.map(q=>vertex(...q,n));for(const i of [0,1,2,0,2,3])out.push(...v[i]);};
 quad([[x0,y0,bottom],[x1,y0,bottom],[x1,y0,z(x1)],[x0,y0,z(x0)]],[0,-1,0]);
 quad([[x1,y0,bottom],[x1,y1,bottom],[x1,y1,z(x1)],[x1,y0,z(x1)]],[1,0,0]);
 quad([[x1,y1,bottom],[x0,y1,bottom],[x0,y1,z(x0)],[x1,y1,z(x1)]],[0,1,0]);
 quad([[x0,y1,bottom],[x0,y0,bottom],[x0,y0,z(x0)],[x0,y1,z(x0)]],[-1,0,0]);
 quad([[x0,y0,z(x0)],[x1,y0,z(x1)],[x1,y1,z(x1)],[x0,y1,z(x0)]],[-slope,0,1]);
 return {vertices:new Float32Array(out),ranges:[[material,0,out.length/11]]};
}
export function combineMeshes(...meshes){
 const vertices=new Float32Array(meshes.reduce((n,m)=>n+m.vertices.length,0)),ranges=[];let offset=0;
 for(const m of meshes){vertices.set(m.vertices,offset);for(const [id,first,count] of m.ranges)ranges.push([id,first+offset/11,count]);offset+=m.vertices.length;}
 return {vertices,ranges};
}
export const drain=iterator=>{let r;do{r=iterator.next();}while(!r.done);return r.value;};
