import fs from 'node:fs/promises';
import {landscapeTools} from './nerval-landscape.mjs';
import {buildHouse42} from './build-nerval-house42.mjs';
import {buildHouse42Rear} from './build-nerval-house42-rear.mjs';
import {buildImpasseJunction,buildPathVerges} from './nerval-impasse-layout.mjs';
import {annotatedBollards} from './nerval-street-furniture.mjs';
import {gardenBoundary} from './nerval-garden-boundary.mjs';

// Close interpretation of photographs 01/02/03/25/27. Horizontal public-path
// geometry is OSM; garden layouts, planting and all heights are estimates.
export async function buildEndSite(ctx){
 const {parts,survey,objects,poly,beam,box,rgb,add,sub,mul,norm,len,mix,toXY,crown,materials:M}=ctx;
 const boundary=gardenBoundary(survey),pathPoly=(points,...rest)=>{const clipped=boundary.clip(points);if(clipped.length>=3)poly(clipped,...rest);};
 const solid=(c,u,v,w,d,z0,z1,col)=>box(c,u,v,w,d,z0,z1,rgb(col),M.wall);
 const north=[0,1],east=[1,0];
 function strip(path,a,b,z,mat,col){
  const offsets=path.map((p,i)=>{const prev=path[Math.max(0,i-1)],next=path[Math.min(path.length-1,i+1)],d=norm(sub(next,prev));return [-d[1],d[0]];});
  for(let i=0;i<path.length-1;i++)pathPoly([[...add(path[i],mul(offsets[i],a)),z],[...add(path[i+1],mul(offsets[i+1],a)),z],[...add(path[i+1],mul(offsets[i+1],b)),z],[...add(path[i],mul(offsets[i],b)),z]],mat,col);
 }
 function stoneBollard(c){
  const ring=(z,r)=>Array.from({length:7},(_,i)=>[c[0]+Math.cos(i/7*Math.PI*2)*r,c[1]+Math.sin(i/7*Math.PI*2)*r,z]);
  const low=ring(.04,.19),high=ring(.43,.115);for(let i=0;i<7;i++)poly([low[i],low[(i+1)%7],high[(i+1)%7],high[i]],M.wall,rgb(i%2?'#a6a18a':'#b4ac91'));poly(high,M.wall,rgb('#bcb69f'));
 }
 const lines=JSON.parse(await fs.readFile('dist/data/lines.geojson','utf8')).features;
 const pathFeature=lines.find(f=>f.properties.osm_id===survey.endSite.pathOsmId);
 if(!pathFeature)throw Error('Missing surveyed pedestrian path');
 const path=pathFeature.geometry.coordinates.map(toXY);
 buildPathVerges({...ctx,poly:pathPoly},path);
 strip(path,-.93,.93,.033,M.road,[.32,.34,.33]);
 buildImpasseJunction(ctx,path);
 // Hedge on the far side of the path, with a narrow mown verge at its foot.
 const hedgeLine=path.slice(0,-1).map((p,i,pts)=>{const d=norm(sub(pts[Math.min(i+1,pts.length-1)],pts[Math.max(0,i-1)]));return add(p,mul([-d[1],d[0]],1.75));});
 landscapeTools(ctx).hedge(boundary.trimHedge(hedgeLine),1.62,1.05,[.74,.80,.65],'pedestrian-path-far-hedge');
 objects.push({type:'pedestrian-path',osm_id:pathFeature.properties.osm_id,photos:['01','02','27'],widthEstimated:1.86});
 objects.push({type:'continuous-end-hedge',photos:['01','02','27'],heightEstimated:1.62});
 // Paired short stone bollards leave the pedestrian centre unobstructed.
 for(const [i,c] of annotatedBollards(path).entries()){stoneBollard(c);objects.push({type:'pedestrian-bollard',id:i,center:c,reference:i>1?'user-nerval-furniture-20260914-1':'01'});}

 const p=parts.get(112),{u,v}=p,world=p.world,at=(x,y,z)=>[...world([x,y]),z];
 function ground(x0,x1,y0,y1,z,mat,col){poly([at(x0,y0,z),at(x1,y0,z),at(x1,y1,z),at(x0,y1,z)],mat,col,[[x0/2,y0/2],[x1/2,y0/2],[x1/2,y1/2],[x0/2,y1/2]]);}
 // The entrance is reached along the house, from the gate at the garage drive.
 ground(-8.9,8.5,-11.0,-4.85,.027,M.grass,[.36,.43,.235]);
 ground(4.75,8.50,-11.0,2.56,.040,M.pavers,[.65,.60,.47]);
 // Low cream masonry wall, brick insets and fine green welded-wire mesh.
 const y=-11.0,g0=4.95,g1=8.1;
 for(const [a,b] of [[-8.9,g0],[g1,8.5]]){
  solid(world([(a+b)/2,y]),u,v,b-a,.23,0,.44,'#c5c1aa');
  solid(world([(a+b)/2,y]),u,v,b-a,.29,.44,.50,'#e0dbc6');
  poly([at(a,y-.01,.50),at(b,y-.01,.50),at(b,y-.01,1.32),at(a,y-.01,1.32)],M.wire,rgb('#305847'),[[a*12,0],[b*12,0],[b*12,10],[a*12,10]]);
  for(let x=a;x<=b;x+=2.0)solid(world([x,y]),u,v,.055,.065,.40,1.42,'#275344');
  for(let x=a+1.0;x<b-.5;x+=2.7)for(const [dx,z,w] of [[0,.17,.42],[.17,.26,.40],[-.05,.35,.22]])solid(world([x+dx,y-.12]),u,v,w,.025,z,z+.065,'#aa8760');
 }
 for(const x of [g0,g1]){
  solid(world([x,y]),u,v,.4,.43,0,1.74,'#aca28b');
  const colors=['#927049','#b69a6a','#867555','#a17f51','#ba9d71','#6c6858'];
  for(let row=0,z=.024;z<1.72;z+=.066,row++)for(let face=0;face<4;face++){
   const along=face%2?v:u,out=face===0?mul(v,-1):face===1?u:face===2?v:mul(u,-1),half=face%2?.215:.2;
   for(let i=-1;i<3;i++){const a=Math.max(-half,-half+i*.204+(row%2)*.102),b=Math.min(half,-half+(i+1)*.204+(row%2)*.102-.010);if(b-a<.018)continue;
    const c=add(world([x,y]),mul(out,face%2?.207:.222)),aa=add(c,mul(along,a)),bb=add(c,mul(along,b));
    poly([[...aa,z],[...bb,z],[...bb,Math.min(z+.055,1.73)],[...aa,Math.min(z+.055,1.73)]],M.wall,rgb(colors[(row*5+i+face+20)%colors.length]));
   }
  }
  solid(world([x,y]),u,v,.50,.51,1.74,1.82,'#bfad8e');
 }
 for(let x=g0+.1;x<g1;x+=.14)beam(at(x,y-.02,.17),at(x,y-.02,1.37),.023,rgb('#dedccd'));
 for(const z of [.17,.58,1.37])beam(at(g0,y-.02,z),at(g1,y-.02,z),.044,rgb('#e4dfca'));
 // Solid lower gate panels match the pale hinged gate in the close views.
 solid(world([(g0+g1)/2,y]),u,v,g1-g0-.12,.06,.17,.60,'#d9d4c0');
 for(const x of [g1+.46,g1+1.02]){
  solid(world([x,y+.18]),u,v,.45,.21,.40,1.20,'#959d94');
  solid(world([x,y-.025]),u,v,.34,.025,.53,1.08,'#afb3a5');
  solid(world([x+.10,y-.05]),u,v,.035,.045,.77,.86,'#505b51');
 }
 solid(world([g0-.58,y-.12]),u,v,.37,.22,.92,1.25,'#c7bd9f');
 solid(world([g0-.58,y-.24]),u,v,.24,.025,1.14,1.16,'#666957');
 // The folded green screen was explicitly rejected in the user's annotated
 // correction. Keep the street-facing low wall and wire fence only.
 objects.push({type:'end-house-garden',parts:[112,115],photos:['02','03','27'],details:['wire mesh','cream wall with brick insets','paved walk','garage drive']});

 buildHouse42(ctx);
 buildHouse42Rear(ctx);
 // Ivy-like low planting below the windows, and a few stiff-leaved plants.
 for(let i=0;i<10;i++){const xx=.1+i*.47; crown(at(xx,-6.75,.40),.38,[.27,.39,.24],60+i);}
 function yucca(c){for(let i=0;i<13;i++){const a=i/13*Math.PI*2,r=.34+.11*Math.sin(i*5),tip=[c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r,c[2]+.45+.10*Math.cos(i*7)],side=[Math.cos(a+Math.PI/2)*.035,Math.sin(a+Math.PI/2)*.035,0];poly([add(c,side),sub(c,side),tip],M.wall,rgb(i%3?'#4b6044':'#798164'));}}
 for(const xy of [[-4.7,-8.0],[-7.8,-8.4],[1.5,-6.75],[3.7,-6.7]])yucca(at(...xy,.10));
 // Chimney with its open black rain cap, aerials, dish and upper-window trim.
 const tall=parts.get(115),[lo,hi]=tall.bounds,cq=[lo[0]+(hi[0]-lo[0])*.62,lo[1]+1.75],cc=tall.world(cq),cz=tall.roofHeight(cq);
 solid(cc,u,v,.40,.50,cz-.08,7.35,'#b5b19d');solid(cc,u,v,.5,.58,7.30,7.39,'#747971');
 for(const a of [-1,1])for(const b of [-1,1])solid(add(cc,add(mul(u,a*.17),mul(v,b*.21))),u,v,.045,.045,7.39,7.63,'#4b534e');
 solid(cc,u,v,.64,.66,7.63,7.73,'#3c4542');
 const mast=tall.world([hi[0]-.30,(lo[1]+hi[1])/2]);beam([...mast,6.83],[...mast,7.80],.025,rgb('#787e75'));
 for(let z=7.12;z<7.78;z+=.22)beam([...add(mast,mul(u,-.30)),z],[...add(mast,mul(u,.30)),z],.018,rgb('#7c8078'));
 const dish=tall.world([lo[0]-.09,lo[1]+.45]),dishRing=Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2;return [...add(dish,mul(v,.25*Math.cos(a))),4.5+.31*Math.sin(a)];});poly(dishRing,M.wall,rgb('#bbbfb5'));beam([...dish,4.45],[...add(dish,mul(u,-.3)),4.29],.025,rgb('#68756e'));

 // Correct house across the path, with an open timber structure on OSM 119.
 const canopy=parts.get(119),[aa,bb]=canopy.bounds,wood='#594735';
 for(const xx of [aa[0]+.12,bb[0]-.12])for(const yy of [aa[1]+.12,bb[1]-.12]){const c=canopy.world([xx,yy]),h=canopy.roofHeight([xx,yy]);solid(c,canopy.u,canopy.v,.15,.15,.05,h,wood);}
 for(const yy of [aa[1]+.12,bb[1]-.12]){const a=[aa[0]+.12,yy],b=[bb[0]-.12,yy];beam([...canopy.world(a),canopy.roofHeight(a)-.05],[...canopy.world(b),canopy.roofHeight(b)-.05],.15,rgb(wood));}
 for(const xx of [aa[0]+.12,bb[0]-.12]){const z=canopy.roofHeight([xx,aa[1]]);beam([...canopy.world([xx,aa[1]]),z-.06],[...canopy.world([xx,bb[1]]),z-.06],.15,rgb(wood));for(const yy of [aa[1]+.12,bb[1]-.12]){const dir=yy<(aa[1]+bb[1])/2?1:-1;beam([...canopy.world([xx,yy]),z-.7],[...canopy.world([xx,yy+dir*.6]),z-.1],.095,rgb(wood));}}
 objects.push({type:'timber-porch',part:119,photo:'01',dimensions:'estimated'});
 // Taller foliage at the path ends and behind the last garden, as photographed.
 // The former guessed tree at [-127,-99] stood in house 42's rear terrace.
 // Its observed planting now belongs to the dedicated rear-garden model.
 for(const [c,h,r,seed] of [[[-123,-121],5.3,2.6,90],[[-139,-116],6.6,2.5,100]]){
  beam([...c,.08],[...c,h*.7],.22,rgb('#7b7960'));
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2;crown([c[0]+Math.cos(a)*r*.42,c[1]+Math.sin(a)*r*.42,h-r*.7+.45*Math.sin(i*3)],r*.65,[.31,.41,.23],seed+i);}crown([...c,h-.7],r*.58,[.35,.44,.25],seed+9);
 }
 // Drain covers and gutter grilles visible at the entrance to the loop/path.
 const cover=(c,diameter)=>{const ring=Array.from({length:24},(_,i)=>[c[0]+Math.cos(i/24*Math.PI*2)*diameter/2,c[1]+Math.sin(i/24*Math.PI*2)*diameter/2,.044]);poly(ring,M.wall,rgb('#555b52'));};
 cover([-111.2,-116.8],.58);cover([-115.3,-113.2],.57);
 for(const c of [[-57.0,-76.0]]){solid(c,east,north,.54,.35,.029,.05,'#323e38');for(let i=0;i<7;i++)beam([c[0]-.23+i*.075,c[1]-.15,.062],[c[0]-.23+i*.075,c[1]+.15,.062],.024,rgb('#85867a'));}
}
