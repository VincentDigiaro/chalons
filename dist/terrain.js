// One bundled height field shared by the map, pedestrian and aircraft.
// Heights are relative to the spawn's IGN altitude; model heights stay local.
const ORIGIN=[4.3815,48.9475],SCALE=[73109.44253336328,111320];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export class Terrain {
 constructor(index,buffer){
  if(index.version!==1||index.encoding!=='int16-le-centimetres'||!Number.isInteger(index.width)||!Number.isInteger(index.height)||index.width<2||index.height<2||buffer.byteLength!==index.width*index.height*2||!index.bounds?.every(Number.isFinite)||!Number.isFinite(index.referenceAltitude))throw Error('Données de relief invalides.');
  this.index=index;this.samples=new Int16Array(buffer);
  const [w,s,e,n]=index.bounds;
  if(!(e>w&&n>s))throw Error('Emprise du relief invalide.');
  this.w=(w-ORIGIN[0])*SCALE[0];this.n=(n-ORIGIN[1])*SCALE[1];
  this.dx=(e-w)*SCALE[0]/(index.width-1);this.dy=(n-s)*SCALE[1]/(index.height-1);
 }
 height(x,y){
  const {width,height,referenceAltitude}=this.index;
  // Extend the edge continuously outside the extraction, never drop to zero.
  const u=clamp((x-this.w)/this.dx,0,width-1),v=clamp((this.n-y)/this.dy,0,height-1);
  const i=Math.min(width-2,Math.floor(u)),j=Math.min(height-2,Math.floor(v)),a=u-i,b=v-j,k=j*width;
  return ((1-b)*((1-a)*this.samples[k+i]+a*this.samples[k+i+1])+b*((1-a)*this.samples[k+width+i]+a*this.samples[k+width+i+1]))*.01-referenceAltitude;
 }
 maximum(bounds){
  const {width,height,referenceAltitude}=this.index;
  const x0=clamp(Math.floor((bounds[0]-this.w)/this.dx),0,width-1),x1=clamp(Math.ceil((bounds[2]-this.w)/this.dx),0,width-1);
  const y0=clamp(Math.floor((this.n-bounds[3])/this.dy),0,height-1),y1=clamp(Math.ceil((this.n-bounds[1])/this.dy),0,height-1);
  let max=-Infinity;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)max=Math.max(max,this.samples[y*width+x]);
  return max*.01-referenceAltitude;
 }
 flightHeight(x,y){
  // Average each ~25 m cell once. Blend neighbouring cell centres to avoid
  // vertical steps when the airship crosses a tile boundary.
  const width=this.index.width-1,height=this.index.height-1;
  if(!this.flightAverages){
   this.flightAverages=new Float32Array(width*height);
   for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const i=row*this.index.width+col;
    this.flightAverages[row*width+col]=(this.samples[i]+this.samples[i+1]+this.samples[i+this.index.width]+this.samples[i+this.index.width+1])*.0025-this.index.referenceAltitude;
   }
  }
  const u=clamp((x-this.w)/this.dx-.5,0,width-1),v=clamp((this.n-y)/this.dy-.5,0,height-1);
  const col=Math.floor(u),row=Math.floor(v),nextCol=Math.min(col+1,width-1),nextRow=Math.min(row+1,height-1),a=u-col,b=v-row,d=this.flightAverages;
  return (1-b)*((1-a)*d[row*width+col]+a*d[row*width+nextCol])+b*((1-a)*d[nextRow*width+col]+a*d[nextRow*width+nextCol]);
 }
}
let terrain=null;
export const terrainHeight=(x,y)=>terrain?.height(x,y)??0;
export const terrainMaxHeight=bounds=>terrain?.maximum(bounds)??0;
export const flightTerrainHeight=(x,y)=>terrain?.flightHeight(x,y)??0;
export const terrainLngLat=(lng,lat)=>terrainHeight((lng-ORIGIN[0])*SCALE[0],(lat-ORIGIN[1])*SCALE[1]);
export const terrainState=()=>terrain?{source:terrain.index.source,resolutionMetres:terrain.index.resolutionMetres,referenceAltitude:terrain.index.referenceAltitude}:null;
export async function loadTerrain({signal,fetchBuffer}={}){
 if(terrain)return terrain;
 const read=fetchBuffer??(async(url,options)=>{const r=await fetch(url,options);if(!r.ok)throw Error(`Relief : HTTP ${r.status}`);return r.arrayBuffer();});
 const options={signal};
 const [metadata,buffer]=await Promise.all([read('./data/terrain/index.json',options),read('./data/terrain/elevations.bin',options)]);
 if(signal?.aborted)throw new DOMException('Chargement interrompu','AbortError');
 return terrain=new Terrain(JSON.parse(new TextDecoder().decode(metadata)),buffer);
}
// Fresh runtime buffers only: source meshes and generation inputs are untouched.
export function drapeVertices(vertices,{origin=ORIGIN,scale=SCALE}={}){
 for(let i=0;i<vertices.length;i+=11){
  const x=(origin[0]-ORIGIN[0])*SCALE[0]+vertices[i]*SCALE[0]/scale[0],y=(origin[1]-ORIGIN[1])*SCALE[1]+vertices[i+1]*SCALE[1]/scale[1];
  vertices[i+2]+=terrainHeight(x,y);
  // Inverse transpose of z'=z+h(x,y), preserving vertical walls.
  const gx=(terrainHeight(x+.5,y)-terrainHeight(x-.5,y))*SCALE[0]/scale[0],gy=(terrainHeight(x,y+.5)-terrainHeight(x,y-.5))*SCALE[1]/scale[1];
  const nx=vertices[i+3]-gx*vertices[i+5],ny=vertices[i+4]-gy*vertices[i+5],nz=vertices[i+5],n=Math.hypot(nx,ny,nz)||1;
  vertices[i+3]=nx/n;vertices[i+4]=ny/n;vertices[i+5]=nz/n;
 }
 return vertices;
}
// Split long road triangles before displacement. Ranges and interpolated UVs
// remain valid, including markings and kerbs, in both renderers.
export function subdivideRoads(vertices,ranges,maxEdge=8){
 const output=[],result=[];
 const emit=(a,b,c)=>{
  const pairs=[[a,b,c],[b,c,a],[c,a,b]],lengths=pairs.map(([p,q])=>Math.hypot(p[0]-q[0],p[1]-q[1]));
  const edge=lengths.indexOf(Math.max(...lengths));
  if(lengths[edge]<=maxEdge){output.push(...a,...b,...c);return;}
  const [p,q,r]=pairs[edge],mid=p.map((v,i)=>(v+q[i])/2);emit(p,mid,r);emit(mid,q,r);
 };
 for(const [material,first,count] of ranges){const start=output.length/11;for(let i=first*11;i<(first+count)*11;i+=33)emit(...[0,11,22].map(o=>Array.from(vertices.subarray(i+o,i+o+11))));result.push([material,start,output.length/11-start]);}
 return {vertices:new Float32Array(output),ranges:result};
}
export function terrainTile(bounds,segments=16){
 const [w,s,e,n]=bounds,out=new Float32Array(segments*segments*66);let at=0;
 const vertex=(x,y)=>{const px=w+(e-w)*x/segments,py=s+(n-s)*y/segments;out.set([px,py,-.025,0,0,1,x/segments,1-y/segments,1,1,1],at);at+=11;};
 for(let y=0;y<segments;y++)for(let x=0;x<segments;x++)for(const [dx,dy] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]])vertex(x+dx,y+dy);
 return drapeVertices(out);
}
export function drapeRoofBuffer(buffer,index){
 const v=new Float32Array(buffer),n=2**index.zoom;
 for(const t of index.tiles)for(let i=t.first*3;i<(t.first+t.count)*3;i+=3){const lng=(t.x+v[i])/n*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*(t.y+v[i+1])/n)))*180/Math.PI;v[i+2]+=terrainLngLat(lng,lat);}
 return buffer;
}
