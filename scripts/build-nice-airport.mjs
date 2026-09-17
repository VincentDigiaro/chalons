// Original geometry authored from the local OSM survey and visual references.
// No Google Earth mesh or texture is embedded in the game.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import earcut,{flatten} from 'earcut';
import {meshTools,rgb,clip,mix,norm,sub,dot,mul,add} from './attila-geometry.mjs';
import {CITIES} from '../dist/city-config.js';
import {buildSheratonCornerTower,buildAirPromenadeTip} from './nice-sheraton-details.mjs';
import {finishAirportPavement} from './airport-pavement.mjs';

const root='dist/data/cities/nice',surveyRoot='artifacts/nice-aeroport-releve-3d';
const read=async f=>JSON.parse(await fs.readFile(f));
const survey=await read(surveyRoot+'/releve.geojson'),context=await read(surveyRoot+'/contexte-batiments.geojson'),air=await read(surveyRoot+'/aeroport-surfaces.geojson');
const byId=new Map(survey.features.map(f=>[f.properties.id,f]));
const materials=[{name:'Béton, métal et peinture',kind:2},{name:'Vitrage bleu fumé',kind:12},{name:'Revêtement mat',kind:2}];
const C={white:rgb('#e5e4dc'),glass:rgb('#254754'),frame:rgb('#7b9297'),roof:rgb('#6a7476'),dark:rgb('#283339'),stone:rgb('#b6b7ad'),pool:rgb('#48b5c9'),red:rgb('#be5149'),yellow:rgb('#d5b65e')};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const round=n=>+n.toFixed(4),area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
const bounds=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const clean=r=>r.slice(0,-1).filter((p,i,a)=>!i||Math.hypot(...sub(p,a[i-1]))>.02);
const circle=(c,r,n=40,ry=r)=>Array.from({length:n},(_,i)=>[c[0]+r*Math.cos(i*2*Math.PI/n),c[1]+ry*Math.sin(i*2*Math.PI/n)]);
function soften(r,radius=1.1){const out=[];for(let i=0;i<r.length;i++){const p=r[i],a=r[(i+r.length-1)%r.length],b=r[(i+1)%r.length],l=Math.hypot(...sub(a,p)),m=Math.hypot(...sub(b,p));const pa=mix(p,a,Math.min(.23,radius/l)),pb=mix(p,b,Math.min(.23,radius/m));for(let k=0;k<4;k++){const t=k/3;out.push(mix(mix(pa,p,t),mix(p,pb,t),t));}}return out;}

class Model {
 constructor(id,name,origin,view){Object.assign(this,{id,name,origin,view});this.scale=[111320*Math.cos(origin[1]*Math.PI/180),111320];this.mesh=meshTools();this.parts=[];this.features=[];this.details=[];this.nextPart=0;}
 xy=p=>p.map((n,i)=>(n-this.origin[i])*this.scale[i]);
 geo=p=>p.map((n,i)=>n/this.scale[i]+this.origin[i]);
 feature(id,height,description){const f=byId.get(id);this.features.push(f);this.mesh.setPart(++this.nextPart);this.parts.push({id:this.nextPart,osmId:f.properties.osm_id,label:f.properties.name,footprint:f.geometry.coordinates[0],surveyId:id,height,description,heightEvidence:f.properties.height});return f.geometry.coordinates.map(r=>clean(r.map(this.xy)));}
 detail(type,position,extra={}){this.details.push({type,position,...extra});}
 face(p,col=C.white,mat=0,uv){
  if(this.groundCapture){this.groundCapture.push({points:p,color:col,material:mat,role:this.groundRole});return;}
  if(!this.ground){this.mesh.poly(p,mat,col,uv,true);return;}
  // Airport pavement follows the same fine terrain sampling as the ground.
  // Wide, unsplit strips otherwise intersect the relief between their edges.
  const emit=(p)=>{const lengths=p.map((a,i)=>Math.hypot(...sub(a.slice(0,2),p[(i+1)%3].slice(0,2)))),k=lengths.indexOf(Math.max(...lengths));if(lengths[k]>8){const a=p[k],b=p[(k+1)%3],c=p[(k+2)%3],mid=mix(a,b,.5);emit([a,mid,c]);emit([mid,b,c]);}else this.mesh.tri(p,mat,col);};
  for(let i=1;i<p.length-1;i++)emit([p[0],p[i],p[i+1]].map(q=>[q[0],q[1],q[2]+.14]));
 }
 beam(a,b,w=.12,col=C.white,mat=0){this.mesh.beam(a,b,w,col,mat);}
 box(c,w,d,z,h,col=C.white,u=[1,0],v=[0,1],mat=0){this.mesh.box(c,u,v,w,d,z,z+h,col,mat);}
 roof(rings,h,col=C.roof,mat=2){const offsets=[];let at=0;const flat=[];for(const [i,r]of rings.entries()){if(i)offsets.push(at);flat.push(...r.flat());at+=r.length;}const ids=earcut(flat,offsets),p=rings.flat();for(let i=0;i<ids.length;i+=3)this.face(ids.slice(i,i+3).map(j=>[...p[j],typeof h==='function'?h(p[j]):h]),col,mat);}
 walls(r,z,h,col=C.glass,glazed=true,step=3.2){if(area(r)<0)r=[...r].reverse();for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(...sub(b,a)),pieces=Math.max(1,Math.ceil(L/(glazed?3:12)));for(let j=0;j<pieces;j++){const p=mix(a,b,j/pieces),q=mix(a,b,(j+1)/pieces);for(let zz=z;zz<h-.01;zz+=step){const top=Math.min(h,zz+step);this.face([[...p,zz],[...q,zz],[...q,top],[...p,top]],col,glazed?1:0,[[0,0],[1,0],[1,1],[0,1]]);if(glazed&&L>3)this.beam([...p,zz],[...p,top],.09,C.frame);}}}}
 band(r,z,height=.48,width=.45,col=C.white){const ccw=area(r)>0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],d=norm(sub(b,a)),n=mul([d[1],-d[0]],ccw?width:-width),p=add(a,n),q=add(b,n);this.face([[...p,z],[...q,z],[...q,z+height],[...p,z+height]],col);this.face([[...a,z+height],[...b,z+height],[...q,z+height],[...p,z+height]],col);}}
 building(rings,h,{glass=true,band=3.4,roof=C.roof,wall=C.glass,bandHeight=.36,base=0}={}){for(const r of rings){this.walls(r,base,h,wall,glass);if(band)for(let z=band;z<h+.01;z+=band)if(z+bandHeight>=base)this.band(r,z-.2,bandHeight,.24);}if(base>0)this.roof(rings,base,C.white,0);this.roof(rings,h,roof);this.band(rings[0],h,.6,.25);}
 cylinder(c,r,z,h,col=C.white,r2=r,n=40){const a=circle(c,r,n),b=circle(c,r2,n);for(let i=0;i<n;i++)this.face([[...a[i],z],[...a[(i+1)%n],z],[...b[(i+1)%n],z+h],[...b[i],z+h]],col,col===C.glass?1:0,[[0,0],[1,0],[1,1],[0,1]]);this.roof([b],z+h,col);}
 hvac(r,h,spacing=12){const b=bounds(r);for(let x=b[0]+6;x<b[2]-4;x+=spacing)for(let y=b[1]+6;y<b[3]-4;y+=spacing){if(![[x-2,y-1],[x+2,y+1]].every(p=>inside(p,r)))continue;this.box([x,y],3.5,1.8,h+.1,1.1,C.stone);for(let k=-1;k<=1;k++)this.cylinder([x+k,y],.37,h+1.21,.08,C.dark,.37,12);}}
 text(label,p,u,v,size,col=C.white){const glyphs={U:['10001','10001','10001','10001','10001','10001','01110'],S:['11111','10000','10000','11111','00001','00001','11111'],H:['10001','10001','10001','11111','10001','10001','10001'],E:['11111','10000','10000','11110','10000','10000','11111'],R:['11110','10001','10001','11110','10100','10010','10001'],A:['01110','10001','10001','11111','10001','10001','10001'],T:['11111','00100','00100','00100','00100','00100','00100'],O:['01110','10001','10001','10001','10001','10001','01110'],N:['10001','11001','11001','10101','10011','10011','10001'],I:['111','010','010','010','010','010','111'],C:['01111','10000','10000','10000','10000','10000','01111'],M:['10001','11011','10101','10101','10001','10001','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],'0':['01110','10001','10011','10101','11001','10001','01110'],'1':['010','110','010','010','010','010','111'],'2':['01110','10001','00001','00010','00100','01000','11111'],'4':['00010','00110','01010','10010','11111','00010','00010']};let cursor=0;for(const char of label){const g=glyphs[char];if(!g){cursor+=4*size;continue;}g.forEach((row,y)=>[...row].forEach((on,x)=>{if(on==='1'){const q=(dx,dy)=>p.map((c,i)=>c+u[i]*(cursor+(x+dx)*size)+v[i]*(7-y-dy)*size);this.face([q(0,0),q(.85,0),q(.85,.85),q(0,.85)],col);}}));cursor+=(g[0].length+1)*size;}}
 async save(){const result=this.mesh.finish(),a=result.vertices,b=[Infinity,Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i+=11){const p=this.geo([a[i],a[i+1]]);b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}const excluded=[...new Set(this.features.map(f=>f.properties.osm_id))];const index={version:1,name:this.name,origin:this.origin,scale:this.scale,bounds:b,vertexCount:a.length/11,materials,textures:[],ranges:result.ranges,excludeIds:excluded,parts:this.parts,objectRanges:result.objects,pickTriangles:result.pickTriangles,siteDetails:this.details,stats:{buildingParts:this.parts.length,triangles:a.length/33},provenance:{survey:'artifacts/nice-aeroport-releve-3d/releve.geojson',surveySha256:sha(await fs.readFile(surveyRoot+'/releve.geojson')),footprints:'© OpenStreetMap contributors',architecture:'Géométrie originale, interprétation des captures Google Earth et de la référence utilisateur ; détails et hauteurs non mesurés simplifiés.'}};
  const folder=root+'/'+this.id;await fs.mkdir(folder+'/walk',{recursive:true});await fs.writeFile(folder+'/index.json',JSON.stringify(index));await fs.writeFile(folder+'/mesh.bin',Buffer.from(a.buffer));
  // Triangles must fit the pedestrian streaming radius. Split long walls/roofs
  // before packet assignment, otherwise an entire terminal may never load.
  const packs=new Map(),scale=CITIES.nice.scale,origin=CITIES.nice.origin;
  const emit=(points,mat)=>{const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%3][0],p[1]-points[(i+1)%3][1])),edge=lengths.indexOf(Math.max(...lengths));if(lengths[edge]>28){const p=points[edge],q=points[(edge+1)%3],r=points[(edge+2)%3],mid=mix(p,q,.5);emit([p,mid,r],mat);emit([mid,q,r],mat);return;}const cx=points.reduce((s,p)=>s+p[0],0)/3,cy=points.reduce((s,p)=>s+p[1],0)/3,key=Math.floor(cx/48)+'_'+Math.floor(cy/48);if(!packs.has(key))packs.set(key,new Map());const groups=packs.get(key);if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(...points.flat());};
  for(const range of result.ranges)for(let i=range.first;i<range.first+range.count;i+=3){const p=[0,1,2].map(k=>Array.from(a.subarray((i+k)*11,(i+k+1)*11)));for(const q of p){const geo=this.geo(q.slice(0,2));q[0]=(geo[0]-origin[0])*scale[0];q[1]=(geo[1]-origin[1])*scale[1];}emit(p,range.material);}
  const nodes=[];for(const [key,groups]of packs){const arrays=[],ranges=[],b=[Infinity,Infinity,-Infinity,-Infinity];let first=0;for(const [mat,values]of groups){ranges.push([mat,first,values.length/11]);first+=values.length/11;const v=new Float32Array(values);arrays.push(Buffer.from(v.buffer));for(let i=0;i<v.length;i+=11){b[0]=Math.min(b[0],v[i]);b[1]=Math.min(b[1],v[i+1]);b[2]=Math.max(b[2],v[i]);b[3]=Math.max(b[3],v[i+1]);}}const header=Buffer.from(JSON.stringify({customModel:true,ranges,segments:[]})),length=Math.ceil(header.length/4)*4,buf=Buffer.alloc(length+4,32);buf.writeUInt32LE(length);header.copy(buf,4);const data=Buffer.concat([buf,...arrays]),file=`walk/${key}-${sha(data).slice(0,12)}.bin`;await fs.writeFile(folder+'/'+file,data);nodes.push([`../${this.id}/${file}`,...b.map((v,i)=>(i<2?Math.floor(v*100):Math.ceil(v*100))/100)]);}
  const live=new Set(nodes.map(n=>n[0].split('/').at(-1)));
  for(const file of await fs.readdir(folder+'/walk'))if(/^-?\d+_-?\d+-[a-f0-9]{12}\.bin$/.test(file)&&!live.has(file))await fs.unlink(folder+'/walk/'+file);
  return {model:{id:this.id,layerId:this.id+'-detail',basePath:'./data/cities/nice/'+this.id,label:this.name,bounds:b,excludeIds:excluded,replacementGeometries:this.features.map(f=>f.geometry),view:this.view},nodes,index};
 }
}

const sheraton=new Model('nice-sheraton','Sheraton et Air Promenade',[7.2125,43.6671],{center:[7.21243,43.66704],zoom:18.8,pitch:64,bearing:12});
{
 const m=sheraton,r=m.feature('H01',25.8,'Corps sud 25,8 m, aile ouest 15 m ; piscine et bandeaux arrondis.')[0],o=m.xy(byId.get('H01').properties.center),u=norm([.969,.247]),v=[-u[1],u[0]],frame=p=>[dot(sub(p,o),u),dot(sub(p,o),v)],world=(x,y)=>add(o,add(mul(u,x),mul(v,y))),q=r.map(frame),main=clip(q,p=>-p[1]-4).map(p=>world(...p)),wing=clip(q,p=>p[1]+4).map(p=>world(...p));
 m.building([soften(clip(main,p=>frame(p)[0]+28))],25.8,{band:0});m.building([soften(wing)],15,{band:3,bandHeight:.75});
 const south=(x,z,offset=-.6)=>[...world(x,-23+offset),z];
 // Continuous white ribbons, each turning down the façade with a rounded elbow.
 for(let k=0;k<7;k++){const z=5.1+k*3.25,end=-5+k*5.1,R=1.25,path=[south(-29,z),south(end-R,z)];for(let i=1;i<=10;i++){const a=Math.PI/2*(1-i/10);path.push(south(end-R+R*Math.cos(a),z-R+R*Math.sin(a)));}path.push(south(end,.45));for(let i=0;i<path.length-1;i++)m.beam(path[i],path[i+1],.86,C.white);}
 buildSheratonCornerTower(m,world,u,v);
 m.box(world(-1,-15),48,12,25.81,.14,rgb('#b9b5a6'),u,v);m.box(world(-5,-15),23,5.7,26.02,.17,C.white,u,v);m.box(world(-5,-15),22,4.7,26.20,.015,C.pool,u,v);
 for(const side of [-1,1])for(let x=-22;x<16;x+=2.4){const p=world(x,-15+side*4.5);m.box(p,.85,1.8,26,.20,C.white,u,v);m.box(add(p,mul(v,side*.65)),.85,.5,26.2,.22,C.stone,u,v);}
 for(let x=-16;x<=5;x+=2.6){const p=world(x,-10);m.beam([...p,26],[...p,28.6],.11,C.white);m.beam([...p,28.6],[...world(x,-13),28.6],.13,C.white);}m.beam([...world(-16,-10),28.6],[...world(5,-10),28.6],.15,C.white);
 const pergola=world(18,-14);for(const a of [0,Math.PI/2,Math.PI,3*Math.PI/2]){const p=[pergola[0]+3*Math.cos(a),pergola[1]+3*Math.sin(a)];m.beam([...p,26],[...p,28],.13,C.white);}for(let y=-3;y<=3;y+=.42){const w=Math.sqrt(9-y*y);m.beam([pergola[0]-w,pergola[1]+y,28],[pergola[0]+w,pergola[1]+y,28],.12,C.white);}
 m.text('SHERATON',south(-22,20.25,-1.1),[...u,0],[0,0,1],.18,C.dark);m.detail('rooftop-pool',[...world(-5,-15),26.21],{length:22,width:4.7});m.detail('white-return-ribbons',south(0,18),{count:7});
}
{
 const m=sheraton,r=m.feature('H02',25.2,'Volume triangulaire arrondi à toiture végétalisée.')[0];m.building([soften(r,1.6)],25.2,{band:3.15,bandHeight:1,roof:rgb('#7d886b')});m.hvac(r,25.8,18);
 const rr=m.feature('H03',29,'Barre diagonale 29 m ; extrémité est 15 m, préau ouvert au rez-de-chaussée, tables rectangulaires en terrasse.')[0],o=m.xy(byId.get('H03').properties.center),u=norm([.86,-.51]),v=[-u[1],u[0]],frame=p=>[dot(sub(p,o),u),dot(sub(p,o),v)],world=(x,y)=>add(o,add(mul(u,x),mul(v,y))),q=rr.map(frame),main=clip(q,p=>28-p[0]).map(p=>world(...p)),tip=clip(q,p=>p[0]-28).map(p=>world(...p));m.building([soften(main)],29,{band:0});buildAirPromenadeTip(m,{ring:soften(tip,2),world,u,v});m.hvac(main,29,14);
 for(let x=-37;x<23;x+=16){const path=[[...world(x,-8.5),28.9],[...world(x-1.8,-8.5),7],[...world(x-1,-8.5),5.3],[...world(x+2,-8.5),4.5],[...world(x+13,-8.5),4.5]];for(let i=0;i<path.length-1;i++)m.beam(path[i],path[i+1],1.05,C.white);}m.detail('diagonal-office-and-low-tip',[...o,29]);
 for(const [id,h,style]of [['H04',30,'glass'],['H05',31,'mixed'],['H06',18,'mixed'],['H07',26,'mixed'],['H08',25,'bands']]){const rings=m.feature(id,h,'Volumes de contexte simplifiés, emprise et hauteur du relevé.');m.building(rings,h,{band:style==='bands'?3.55:3.3,bandHeight:style==='bands'?1.7:.26,wall:style==='mixed'?rgb('#567782'):C.glass,roof:rgb('#8e9391')});m.hvac(rings[0],h+.65,19);if(style==='mixed')for(let i=0;i<rings[0].length;i+=2){const a=rings[0][i],b=rings[0][(i+1)%rings[0].length];if(Math.hypot(...sub(a,b))<7)continue;m.beam([...a,.2],[...a,h],1.15,C.white);}}
}

const terminal1=new Model('nice-terminal1','Aéroport · Terminal 1 et vigie',[7.2123,43.6652],{center:[7.21434,43.66538],zoom:17.9,pitch:62,bearing:22});
{
 const m=terminal1,rings=m.feature('A01',18,'Corps principal à toiture nervurée, ailes basses, cours ouvertes.'),o=m.xy(byId.get('A01').properties.center),u=norm([.983,.183]),v=[-u[1],u[0]],frame=p=>[dot(sub(p,o),u),dot(sub(p,o),v)];
 const h=p=>{const [x,y]=frame(p);return x>45&&x<190?11+7*Math.max(0,1-Math.abs(y-10)/60):x>-100?11:6.5;};
 // Split each roof triangle on the hall boundaries and crest; keep OSM holes.
 const flattened=flatten(rings),ix=earcut(flattened.vertices,flattened.holes,2),all=rings.flat();for(let i=0;i<ix.length;i+=3){let cells=[ix.slice(i,i+3).map(j=>all[j])];for(const [axis,cut]of [[0,45],[0,190],[0,-100],[1,10]])cells=cells.flatMap(q=>[clip(q,p=>frame(p)[axis]-cut),clip(q,p=>cut-frame(p)[axis])]).filter(q=>q.length>2);for(const q of cells)m.face(q.map(p=>[...p,h(p)]),C.roof,2);}
 for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(Math.hypot(...sub(a,b))/3));for(let j=0;j<n;j++){const p=mix(a,b,j/n),q=mix(a,b,(j+1)/n);m.face([[...p,0],[...q,0],[...q,h(q)],[...p,h(p)]],C.glass,1,[[0,0],[1,0],[1,1],[0,1]]);m.beam([...p,.1],[...p,h(p)],.16,C.white);}}
 for(let x=49;x<187;x+=4){const world=y=>add(o,add(mul(u,x),mul(v,y)));for(let y=-40;y<65;y+=3){const a=world(y),b=world(y+3);if(inside(a,rings[0])&&inside(b,rings[0]))m.beam([...a,h(a)+.1],[...b,h(b)+.1],.18,C.white);}}
 const tower=m.feature('A03',26,'Fût nervuré, vigie polygonale élargie et antennes.')[0],c=m.xy(byId.get('A03').properties.center);m.cylinder(c,5.6,0,19.2,C.white,4.7,32);for(let k=0;k<24;k++){const a=k*2*Math.PI/24;m.beam([c[0]+5.4*Math.cos(a),c[1]+5.4*Math.sin(a),.3],[c[0]+4.65*Math.cos(a),c[1]+4.65*Math.sin(a),19.8],.18,k%3?C.white:C.dark);}m.cylinder(c,4.7,18.5,2.1,C.white,7.1,16);m.cylinder(c,7.1,20.6,3.7,C.glass,7.45,16);m.cylinder(c,7.65,24.3,.7,C.white,7.65,40);m.cylinder(c,7.65,25,.65,C.roof,5.6,40);for(let k=0;k<16;k++){const a=k*2*Math.PI/16;m.beam([c[0]+7.1*Math.cos(a),c[1]+7.1*Math.sin(a),20.6],[c[0]+7.45*Math.cos(a),c[1]+7.45*Math.sin(a),24.3],.12,C.white);}for(const [x,y,z]of [[0,0,30],[2,1,28.5],[-2,-1,27.4]])m.beam([c[0]+x,c[1]+y,25.5],[c[0]+x,c[1]+y,z],.09,C.dark);m.detail('control-cab',[...c,22.5],{structuralTop:26,antennaTopEstimated:30});
 const tech=m.feature('A04',8.4,'Bâtiment technique bas ; cour conservée.');m.building(tech,8.4,{band:2.8,wall:rgb('#788582')});m.hvac(tech[0],9,18);
}

const terminal2=new Model('nice-terminal2','Aéroport · Terminal 2',[7.205,43.6596],{center:[7.20579,43.65959],zoom:17.5,pitch:58,bearing:-75});
{
 const m=terminal2,rings=m.feature('A02',21,'Jetées basses et rotunde centrale, verrières de toiture.');m.building(rings,8.7,{band:4.3,wall:rgb('#526e77')});
 const o=m.xy(byId.get('A02').properties.center),c=add(o,[111.5,53]),rotunda=circle(c,61,64,60);m.walls(rotunda,8.7,20.4,C.glass);m.roof([rotunda],20.4,rgb('#697578'));m.band(rotunda,20.4,.8,.8);m.band(rotunda,9.2,.6,.35);
 const u=norm([.67,.74]),v=[-u[1],u[0]];for(let x=-48;x<49;x+=9)for(let y=-44;y<45;y+=13){const p=add(c,add(mul(u,x),mul(v,y)));if(Math.hypot(...sub(p,c))>52)continue;m.box(p,3.6,1.8,20.46,.45,rgb('#a8bfc0'),u,v);}
 m.box(c,106,7,20.5,1.2,rgb('#9ea7a6'),u,v);m.text('TERMINAL 2',[c[0]-28,c[1]-55,12],[1,0,0],[0,0,1],.45,C.white);m.detail('central-rotunda',[...c,21],{diameter:122,heightSource:'OSM global height, visual decomposition'});
 const business=m.feature('A07',4,'Terminal aviation d’affaires, toiture basse.');m.building(business,4,{band:0});m.hvac(business[0],4.6,20);
}

const radar=new Model('nice-radar','Aéroport · Tour radar et hangar',[7.2047,43.6645],{center:[7.20452,43.66464],zoom:18.4,pitch:64,bearing:35});
{
 const m=radar;for(const id of ['A05','A05a','A05b','A05c','A05d'])m.feature(id,byId.get(id).properties.height.value_m,'Parties superposées, altitudes relatives non additionnées.');const c=m.xy(byId.get('A05').properties.center);m.cylinder(c,4.1,0,34,C.white,3.4,40);for(const z of [2,10,18,26,33.5])m.cylinder(c,4.18-(z/34)*.7,z,.22,C.stone,4.18-(z/34)*.7,40);m.cylinder(c,3.4,32.4,1.6,C.white,8,48);m.cylinder(c,8,34,2,C.white,8,48);m.cylinder(c,.65,36,1,C.dark,.65,16);const u=norm([.74,.67]),v=[-u[1],u[0]];m.box(c,10,.9,37,1,C.red,u,v);for(let x=-4.8;x<5;x+=.55){const p=add(c,mul(u,x));m.beam([...add(p,mul(v,-.47)),37.05],[...add(p,mul(v,-.47)),37.95],.035,C.white);}m.detail('radar-stack',[...c,38],{shaftTop:34,platform:[34,36],support:[36,37],antenna:[37,38],antennaSimplified:true});
 const envelope=context.features.find(f=>f.properties.osm_id==='way/432744896');if(envelope){m.features.push(envelope);m.features[m.features.length-1]={...envelope,properties:{...envelope.properties,osm_id:'way/432744896'}};const r=clean(envelope.geometry.coordinates[0].map(m.xy));m.building([r],4.5,{band:0,glass:false,wall:C.stone});}
 const rings=m.feature('A08',12,'Hangar à toiture bombée, annexes basses et cour ouverte.'),r=rings[0],b=bounds(r),cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2; m.building(rings,7.5,{band:0,glass:false,wall:rgb('#b8b9b3')});const z=x=>7.5+4.5*Math.sqrt(Math.max(0,1-((x-cx)/((b[2]-b[0])/2))**2));for(let x=b[0];x<b[2]-.01;x+=1){const end=Math.min(b[2],x+1),q=clip(clip(r,p=>p[0]-x),p=>end-p[0]);if(q.length<3)continue;m.face(q.map(p=>[...p,z(p[0])]),C.roof,2);}for(let x=b[0]+2;x<b[2];x+=4)m.beam([x,b[1]+1,7.5],[x,b[1]+1,z(x)],.13,C.white);m.detail('barrel-roof',[cx,cy,12]);
}

// Gate satellites and service annexes retain their individual OSM footprints.
// They must also replace the generic city façades around the main terminals.
function annex(m,f,h,label,canopy=false){const id=f.properties.osm_id||f.properties.id;if(m.features.some(f=>f.properties.osm_id===id))return;m.features.push({...f,properties:{...f.properties,osm_id:id}});m.mesh.setPart(++m.nextPart);m.parts.push({id:m.nextPart,osmId:id,label,footprint:f.geometry.coordinates[0],height:h,heightEvidence:{status:f.properties.height?'osm_or_existing_import':'visual_estimate'},description:'Volume secondaire simplifié à partir de son emprise OSM.'});const rings=f.geometry.coordinates.map(r=>clean(r.map(m.xy)));if(canopy){m.roof(rings,h,C.white,0);for(const p of rings[0].filter((_,i)=>i%2===0))m.beam([...p,0],[...p,h],.25,C.stone);}else m.building(rings,h,{band:3.1,wall:rgb('#526871')});}
for(const f of air.features.filter(f=>f.properties.aeroway==='terminal'&&f.geometry.type==='Polygon')){if([...terminal1.features,...terminal2.features].some(a=>a.properties.osm_id===f.properties.id))continue;const p=f.geometry.coordinates[0][0];annex(p[1]>43.663?radar:terminal2,f,Number(f.properties.height)||7.2,f.properties.name||'Satellite d’embarquement');}
for(const id of ['way/300978552','way/1229255686','way/1229256174','way/1229256242','way/1229256663','way/1229256665','way/1229444837','way/960814735','way/1230154054','way/1230154055']){const f=context.features.find(f=>f.properties.osm_id===id);if(f)annex(terminal1,f,f.properties.kind==='roof'?4.5:8.2,'Annexe du terminal 1',f.properties.kind==='roof');}
for(const id of ['way/1225488161','way/1225488454','way/1225488455','way/1226181971']){const f=context.features.find(f=>f.properties.osm_id===id);if(f)annex(terminal2,f,f.properties.kind==='roof'?4.5:7.2,'Annexe du terminal 2',f.properties.kind==='roof');}

// OSM boarding bridges: independent elevated corridors, support legs and cabs.
for(const f of air.features.filter(f=>f.properties.aeroway==='jet_bridge'&&f.geometry.type==='LineString')){const mean=f.geometry.coordinates.reduce((p,q)=>add(p,q),[0,0]).map(x=>x/f.geometry.coordinates.length),m=mean[0]>7.208?terminal1:terminal2,p=f.geometry.coordinates.map(m.xy);m.mesh.setPart(null);for(let i=0;i<p.length-1;i++){const a=p[i],b=p[i+1],u=norm(sub(b,a)),v=[-u[1],u[0]],c=mix(a,b,.5),length=Math.hypot(...sub(b,a));m.box(c,length,2.8,4.5,2.7,C.stone,u,v);m.box(c,length,2.86,5.1,1.4,C.glass,u,v,1);for(const q of [a,b])m.box(q,.55,.55,0,4.5,C.dark);}m.detail('boarding-bridge',[...p.at(-1),4.5],{osmId:f.properties.id});}

const runways=new Model('nice-pistes','Aéroport · Pistes et voies de circulation',[7.214,43.655],{center:[7.214,43.655],zoom:14.6,pitch:45,bearing:45});
runways.ground=true;runways.groundCapture=[];runways.groundAxes=[];
{
 const m=runways;const strip=(a,b,width,z,col)=>{const L=Math.hypot(...sub(b,a)),u=norm(sub(b,a)),v=mul([-u[1],u[0]],width/2),n=Math.ceil(L/20);for(let j=0;j<n;j++){const p=mix(a,b,j/n),q=mix(a,b,(j+1)/n);m.face([[...add(p,v),z],[...sub(p,v),z],[...sub(q,v),z],[...add(q,v),z]],col,2);}};
 for(const f of air.features.filter(f=>['runway','taxiway'].includes(f.properties.aeroway)&&f.geometry.type==='LineString')){const p=f.geometry.coordinates.map(m.xy),isRunway=f.properties.aeroway==='runway',w=Number(f.properties.width)|| (isRunway?45:23);m.groundRole=isRunway?'runway':'taxiway';m.groundAxes.push({role:m.groundRole,points:p,width:w,osmId:f.properties.id});for(let i=0;i<p.length-1;i++){strip(p[i],p[i+1],w,.045,isRunway?rgb('#50595b'):rgb('#747975'));if(!isRunway)strip(p[i],p[i+1],.23,.066,C.yellow);else{const L=Math.hypot(...sub(p[i+1],p[i])),u=norm(sub(p[i+1],p[i])),v=[-u[1],u[0]];for(const side of [-1,1])strip(add(p[i],mul(v,side*(w/2-1))),add(p[i+1],mul(v,side*(w/2-1))),.28,.072,C.white);for(let d=30;d<L-15;d+=60)strip(add(p[i],mul(u,d)),add(p[i],mul(u,Math.min(L-15,d+30))),.65,.074,C.white);}}
  if(isRunway&&p.length>=2&&Math.hypot(...sub(p.at(-1),p[0]))>500){for(const flip of [false,true]){const a=flip?p.at(-1):p[0],b=flip?p[0]:p.at(-1),u=norm(sub(b,a)),v=[u[1],-u[0]];for(let k=-6;k<=6;k++){if(!k)continue;strip(add(add(a,mul(u,12)),mul(v,k*2.3)),add(add(a,mul(u,42)),mul(v,k*2.3)),1.5,.074,C.white);}const heading=u[1]>0?'04':'22',label=(f.properties.ref||heading).split('/').find(s=>s.startsWith(heading))||heading;m.text(label,[...add(add(a,mul(u,60)),mul(v,-7)),.076],[...v,0],[...u,0],.65,C.white);m.detail('threshold-marking',[...a,0],{label,direction:u,osmId:f.properties.id});}m.detail('runway-axis',[...p[0],0],{osmId:f.properties.id,ref:f.properties.ref,width:w});}
 }
}

await finishAirportPavement(runways);
const flags=process.argv.slice(2);if(flags.some(f=>f!=='--only-runways'))throw Error('Use --only-runways to rebuild only airport pavement');
const built=[];for(const model of flags.includes('--only-runways')?[runways]:[sheraton,terminal1,terminal2,radar,runways]){built.push(await model.save());console.log(model.name+': '+built.at(-1).index.stats.triangles+' triangles');}
const registry=await read(root+'/custom-models.json'),ours=new Set(built.map(b=>b.model.id));registry.models=[...registry.models.filter(m=>!ours.has(m.id)),...built.map(b=>b.model)];
// Preserve independent additions such as aircraft when rebuilding terminals.
const otherNodes=(registry.walk?.nodes||[]).filter(([file])=>![...ours].some(id=>file.startsWith('../'+id+'/')));
registry.walk={version:1,materials:[...materials,...(registry.walk?.materials||[]).slice(materials.length)],nodes:[...otherNodes,...built.flatMap(b=>b.nodes)]};await fs.writeFile(root+'/custom-models.json',JSON.stringify(registry));
const reportFolder=flags.includes('--only-runways')?'artifacts/nice-runway-priority':'artifacts/nice-airport-models';
await fs.mkdir(reportFolder,{recursive:true});await fs.writeFile(reportFolder+'/build.json',JSON.stringify({version:1,models:built.map(b=>({id:b.model.id,stats:b.index.stats,walkPackets:b.nodes.length,bounds:b.model.bounds,excludeIds:b.model.excludeIds})),triangles:built.reduce((n,b)=>n+b.index.stats.triangles,0),walkPackets:registry.walk.nodes.length,notes:'Volumes extérieurs interprétés ; hauteurs estimées et détails simplifiés dans les index de chaque modèle.'},null,2));
