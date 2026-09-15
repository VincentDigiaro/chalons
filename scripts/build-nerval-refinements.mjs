import fs from 'node:fs/promises';
import {landscapeTools} from './nerval-landscape.mjs';

const prefix='nerval-refinement-';
const reference=name=>`${prefix}${name}-2026-09-13`;
export function frontBoundary(frame,x,y,streets,maxDepth=11){
 const origin=frame.center.map((n,i)=>n+frame.u[i]*x+frame.v[i]*y),r=frame.v.map(n=>-n),cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 let depth=Infinity;
 for(const street of streets)for(let i=1;i<street.points.length;i++){
  const a=street.points[i-1],b=street.points[i],s=b.map((n,j)=>n-a[j]),q=a.map((n,j)=>n-origin[j]),det=cross(r,s);if(Math.abs(det)<1e-6)continue;
  const t=cross(q,s)/det,u=cross(q,r)/det;if(t>0&&u>=0&&u<=1)depth=Math.min(depth,t-street.halfWidth-1.27);
 }
 return y-Math.max(.5,Math.min(maxDepth,Number.isFinite(depth)?depth:4.2));
}
// User observations override earlier guesses. All coordinates below are local
// metres in the existing OSM part frames; dimensions are visual estimates.
export async function applyNervalRefinements(survey){
 const refs=JSON.parse(await fs.readFile('scripts/nerval-refinement-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith(prefix)),...refs];
 const changed=[105,101,109,110,111,114,117,80,83,77,97];
 survey.openings=survey.openings.filter(o=>!changed.includes(o.part)&&!o.reference?.startsWith(prefix));
 const put=(part,side,along,bottom,width,height,extra={},ref='aerial')=>survey.openings.push({part,side,along,bottom,width,height,glassMaterial:true,...extra,reference:reference(ref),visibility:'Contours observés sur le nouveau cliché ; dimensions estimées'});
 const part=id=>survey.parts.find(p=>p.id===id);
 // House 42: the driveway-facing window belongs to the recessed side of
 // the low wing, not the outer edge of the garage in this L-shaped footprint.
 put(112,'right',.60,1.02,.90,1.18,{depth:3.54,span:[-5.9878,2.6044],frame:'white',leaves:2,shutters:'brown'},'house42-side-window');
 // Blue frontage: two white panelled garage doors, two upper windows, and
 // a lower entrance wing with blue eaves braces. The former tall brown wing
 // was an incorrect reading of the oblique photograph.
 Object.assign(part(101),{eaves:3,rise:3.55,roof:'gable',roofAxis:1,color:[.88,.875,.83]});
 for(const along of [.27,.73]){
  put(105,'front',along,3.45,1.18,1.40,{shutters:'blue'},'blue-house');
  put(105,'front',along,.12,2.66,2.22,{kind:'garage',color:'#d2d4ca',garageStyle:'panels'},'blue-house');
 }
 put(101,'front',.19,.12,.93,2.13,{kind:'door',color:'#dbdcd1',glazed:true},'blue-house');
 put(101,'front',.66,.78,1.45,1.43,{shutters:'blue'},'blue-house');
 // Paired frontage at the white/sage rails: a wide raised part with two
 // garages and two windows, then a low entrance and two French doors.
 Object.assign(part(110),{eaves:3,rise:3.9});
 for(const along of [.26,.74]){
  put(109,'front',along,3.52,1.02,1.44,{shutters:'brown',grid:true,lintel:true},'white-rails');
  put(109,'front',along,.10,2.46,2.13,{kind:'garage',color:'#57483c'},'white-rails');
 }
 put(110,'front',.53,.16,1.10,2.19,{kind:'door',frame:'wood',color:'#594533',glazed:true,lintel:true},'white-rails');
 for(const along of [.24,.76])put(111,'front',along,.15,1.36,2.23,{kind:'patio',shutters:'brown',grid:true,lintel:true},'white-rails');
 put(114,'front',.21,.15,1.03,2.17,{kind:'door',frame:'wood',color:'#805b36',glazed:true,lintel:true},'45-garage');
 put(114,'front',.71,.72,1.38,1.57,{shutters:'brown',lintel:true},'45-garage');
 put(114,'right',.46,3.8,1.43,1.55,{shutters:'brown',lintel:true},'45-garage');
 // The aerial view documents the previously blank end-house street face.
 put(117,'front',.15,.12,.90,2.12,{kind:'door',frame:'wood',color:'#665441'},'aerial');
 // Balance the two patio doors across the wall after the entrance: equal
 // clear wall gaps, counting the open shutters and the right corner trim.
 const streetSpan=part(117).surfaceBounds.front,streetWidth=streetSpan[1]-streetSpan[0];
 const shutterHalf=.92*.93+.08,entryRight=.15*streetWidth+.90/2+.0425;
 const wallGap=(streetWidth-.12-entryRight-4*shutterHalf)/3;
 for(const center of [entryRight+wallGap+shutterHalf,entryRight+2*wallGap+3*shutterHalf])put(117,'front',center/streetWidth,.18,.92,2.08,{kind:'patio',shutters:'brown'},'aerial');
 put(117,'front',.52,4.15,.62,.74,{leaves:1},'aerial');
 // Eastern court houses each have a raised garage bay beside the low living
 // wing. The roof sections preserve the complete original horizontal rings.
 for(const id of [80,83]){
  const p=part(id),[lo,hi]=p.bounds,split=lo[0]+3.25;
  Object.assign(p,{eaves:3,rise:4,roofAxis:1,roof:'gable',roofSections:[{from:lo[0],to:split,eaves:5.4,rise:1.55},{from:split,to:hi[0],eaves:3,rise:3.95}]});
  delete p.frontFlat;
  put(id,'front',.155,3.56,1.10,1.36,{shutters:'brown',roller:true},'loop-east');
  put(id,'front',.155,.10,2.35,2.15,{kind:'garage',color:'#775132'},'loop-east');
  put(id,'front',.47,.43,.93,2.16,{kind:'door',color:id===83?'#deddd3':'#735642',glazed:true},'loop-east');
  put(id,'front',.80,.45,1.22,2.11,{kind:'patio',shutters:'brown',roller:true},'loop-east');
 }
 for(const along of [.20,.50,.79])put(77,'front',along,along===.50?.14:.75,along===.50?.92:1.2,along===.50?2.12:1.45,{...(along===.50?{kind:'door',glazed:true,color:'#82725a'}:{shutters:'brown'})},'loop-west');
 for(const along of [.25,.70])put(97,'right',along,.82,1.20,1.42,{shutters:'brown'},'loop-west');
 // Preserve the user's corrected opening positions on house 42, changing
 // only the requested joinery. All three yellow bays match the supplied example.
 for(const o of survey.openings){
  if(o.part===115&&(o.side==='back'||(o.side==='left'&&o.kind==='patio'))){Object.assign(o,{kind:'patio',width:1.32,height:2.23,frame:'white',leaves:2,shutters:'brown',glassMaterial:true,handleOffset:.10,styleReference:reference('house42-door-styles')});}
  if(o.part===112&&o.side==='left'&&o.reference){Object.assign(o,{kind:'door',frame:'wood',color:'#765238',leaves:1,woodPanels:true,glazed:false,glassMaterial:false,styleReference:reference('house42-door-styles')});}
 }
 const newLights=[[101,.48,.46,.78,1.03],[101,.79,.46,.78,1.03],[80,.63,.51,.85,.95],[83,.66,.51,.82,.95],[77,.22,.50,.80,.90]];
 survey.skylights=survey.skylights.filter(k=>!newLights.some(n=>n[0]===k[0]));survey.skylights.push(...newLights);
 const streets=JSON.parse(await fs.readFile('scripts/nerval-footprints.json','utf8')).streets.map(f=>({points:f.geometry.coordinates.map(q=>q.map((n,i)=>(n-survey.origin[i])*survey.scale[i])),halfWidth:f.geometry.coordinates.length===2?2.65:f.properties.osm_id==='way/119936749'?2.5:3.1}));
 survey.refinements={references:refs.map(r=>r.id),streetPaths:streets,customFrontages:['nerval-26','nerval-31','nerval-32','nerval-33','nerval-39'],scope:'Du cul-de-sac à la boucle incluse',accuracy:'Emprises OSM conservées ; détails et aménagements estimés sur les clichés fournis.'};
}

export function buildNervalRefinements(ctx){
 const {parts,objects,survey,poly,beam,box,rgb,add,sub,mul,mix,norm,len,materials:M}=ctx;
 const {ground,path,hedge}=landscapeTools(ctx);
 const p=id=>parts.get(id),W=(id,q)=>p(id).world(q),A=(id,x,y,z)=>[...W(id,[x,y]),z];
 const boundary=(id,x)=>frontBoundary(p(id),x,p(id).bounds[0][1],survey.refinements.streetPaths);
 const solid=(id,x,y,w,d,z0,z1,color,mat=M.wall)=>box(W(id,[x,y]),p(id).u,p(id).v,w,d,z0,z1,rgb(color),mat);
 const line=(id,a,b,w,color)=>beam(A(id,...a),A(id,...b),w,rgb(color));
 function surface(id,pts,type='grass',tint,z=.057){
  const palette={grass:[.39,.44,.26],pavers:[.74,.57,.46],pave:[.55,.54,.49],road:[.32,.33,.30]};
  ground(pts.map(q=>W(id,q)),M[type],tint||palette[type],z);
  objects.push({type:'refined-ground',part:id,material:type,boundary:pts.map(q=>W(id,q)),reference:reference('aerial')});
 }
 function rect(id,x0,x1,y0,y1,type,tint,z){surface(id,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],type,tint,z);}
 function foliage(c,rx,ry,h,seed=0,tint=[.72,.80,.62]){
  const bands=7,steps=12,point=(j,k)=>{const a=j/bands*Math.PI,b=k/steps*Math.PI*2,r=1+.05*Math.sin(k*4+j*3+seed);return [c[0]+Math.sin(a)*Math.cos(b)*rx*r,c[1]+Math.sin(a)*Math.sin(b)*ry*r,c[2]+Math.cos(a)*h*.5];};
  for(let j=0;j<bands;j++)for(let k=0;k<steps;k++)poly([point(j,k),point(j+1,k),point(j+1,k+1),point(j,k+1)],M.hedge,tint,[[k/6,j/4],[k/6,(j+1)/4],[(k+1)/6,(j+1)/4],[(k+1)/6,j/4]]);
 }
 function plant(id,x,y,r,h,seed,tint){foliage(A(id,x,y,h*.5+.05),r,r*.86,h,seed,tint);}
 function gravel(id,x0,x1,y0,y1){
  rect(id,x0,x1,y0,y1,'pave',[.62,.61,.52],.066);
  let seed=id*37;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<Math.min(500,(x1-x0)*(y1-y0)*15);i++){const x=x0+random()*(x1-x0),y=y0+random()*(y1-y0),r=.015+random()*.035,c=.50+random()*.19;
   poly([A(id,x-r,y,.072),A(id,x,y-r,.076),A(id,x+r,y,.073),A(id,x,y+r,.077)],M.wall,[c,c*.98,c*.88]);}
 }
 function pier(id,x,y,h=1.2,color='#c8c6b6'){
  solid(id,x,y,.29,.31,.02,h,color);solid(id,x,y,.37,.38,h,h+.08,'#aa8a6d');
 }
 function fence(id,coords,{height=1.05,style='rails',color='#e4e4d6',base=.30}={}){
  const points=coords.map(q=>W(id,q));
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],d=norm(sub(b,a)),n=[-d[1],d[0]],l=len(sub(b,a));
   if(base){box(mix(a,b,.5),d,n,l,.20,0,base,rgb('#c9c6b7'),M.wall);box(mix(a,b,.5),d,n,l,.25,base,base+.10,rgb('#a27356'),M.wall);
    for(let j=.03;j<l;j+=.14){const q=add(a,mul(d,j));beam([...add(q,mul(n,-.13)),base+.10],[...add(q,mul(n,.13)),base+.10],.01,rgb('#c4b69e'));}}
   for(const z of style==='rails'?[base+.28,base+.55,base+.82]:[base+.13,height-.1])beam([...a,z],[...b,z],style==='rails'?.068:.035,rgb(color));
   const step=style==='rails'?1.9:style==='wood'?.17:.16;
   for(let j=.08;j<l;j+=step){const q=add(a,mul(d,j));box(q,d,n,style==='rails'?.11:style==='wood'?.10:.023,.06,base,style==='rails'?height+.10:height,rgb(style==='rails'?'#92ab8f':color),M.wall);}
  }
  objects.push({type:'refined-fence',part:id,style,path:points,reference:reference('white-rails')});
 }
 function gate(id,x0,x1,y,{color='#e4e4d9',height=1.25,style='bars'}={}){
  pier(id,x0,y,height+.05);pier(id,x1,y,height+.05);
  fence(id,[[x0+.08,y],[x1-.08,y]],{height,base:0,style,color});
  if(style==='solid')solid(id,(x0+x1)/2,y,x1-x0-.18,.065,.10,height-.08,color);
 }
 function lamp(id,x,y,z=1.9){
  solid(id,x,y,.13,.16,z,z+.22,'#384a43');solid(id,x,y-.065,.08,.055,z+.035,z+.16,'#d7d4a6');
  line(id,[x,y,z+.22],[x,y+.10,z+.30],.035,'#3b4842');
 }
 function mailbox(id,x,y,color='#697862'){
  solid(id,x,y,.055,.06,.03,1.17,'#526356');solid(id,x,y-.025,.37,.22,.94,1.24,color);
  solid(id,x,y-.141,.26,.012,1.15,1.172,'#dadbcf');solid(id,x+.10,y-.15,.023,.02,1.035,1.068,'#bab791');
 }
 function brackets(id,xs,color='#534534'){
  const q=p(id),y=q.bounds[0][1],z=q.eaves;
  for(const x of xs){line(id,[x,y-.09,z-.65],[x,y-.44,z-.055],.073,color);line(id,[x,y-.1,z-.05],[x,y-.48,z-.05],.085,color);}
 }
 function porch(id,x0,x1,y,depth=1.0,color='#79543b'){
  const z=p(id).eaves-.10;
  for(const x of [x0+.12,x1-.12]){solid(id,x,y-depth,.15,.15,.08,z,color);solid(id,x,y-depth,.22,.23,.02,.27,'#d8d3be');line(id,[x,y-depth,z-.63],[x+(x<(x0+x1)/2?.46:-.46),y-depth,z-.10],.072,color);}
  line(id,[x0,y-depth,z],[x1,y-depth,z],.16,color);
  const roof=[[x0-.13,y-depth-.12,z+.12],[x1+.13,y-depth-.12,z+.12],[x1+.13,y+.03,z+.40],[x0-.13,y+.03,z+.40]];
  poly(roof.map(q=>A(id,...q)),M.roof,[.9,.86,.78],[[0,0],[(x1-x0)/1.65,0],[(x1-x0)/1.65,depth/1.28],[0,depth/1.28]]);
  for(let x=x0+.12;x<x1;x+=.48)line(id,[x,y-depth,z-.06],[x,y,z+.22],.055,color);
  objects.push({type:'observed-entrance-porch',part:id,reference:reference(id===99?'36-porch':'white-rails'),posts:2});
 }
 function steps(id,x,y,width,rise,count){
  for(let i=0;i<count;i++)solid(id,x,y-i*.30,width,.34,.07,.07+(count-i)*rise,'#c4beab');
  objects.push({type:'entrance-steps',part:id,count,reference:reference('loop-east')});
 }
 function planter(id,x,y,z,w=.65){
  solid(id,x,y,w,.24,z,z+.17,'#98755b');
  for(let i=0;i<5;i++){const xx=x-w*.38+i*w*.19;foliage(A(id,xx,y,z+.25),.12,.13,.20,i,[.77,.83,.66]);
   for(let k=0;k<3;k++){const a=k*2.1;poly([A(id,xx-.04,y,z+.34),A(id,xx,y-.045,z+.37),A(id,xx+.045,y,z+.34),A(id,xx,y+.045,z+.30)],M.wall,rgb(i%2?'#b75b69':'#d0a3a9'));}}
 }

 // Every exposed front plot receives an actual ground surface extending to
 // the real façade. Individual paths and beds sit a few millimetres above it.
 for(const id of [100,102,103,104,109,110,111,113,114,108,105,101,77,86,80,83]){
  if(survey.roundabout?.parts.includes(id))continue;
  const q=p(id),[lo,hi]=q.bounds,left=lo[0]-.3,right=hi[0]+.3;
  surface(id,[[left,boundary(id,left)],[right,boundary(id,right)],[right,lo[1]+.05],[left,lo[1]+.05]],'grass',undefined,.052);
  if(![105,109,110,111,80,83].includes(id))gravel(id,lo[0]-.18,hi[0]+.18,lo[1]-.50,lo[1]-.10);
 }
 // Blue garage forecourt: reddish interlocking paving with light square inlays,
 // a broad open entrance, short steps and a low planted bed by the blue postbox.
 const blueEdge=Math.min(boundary(105,-7.15),boundary(105,.85));
 surface(105,[[-7.15,boundary(105,-7.15)],[.85,boundary(105,.85)],[.85,-3.65],[-7.15,-3.65]],'pavers',[.75,.56,.46],.080);
 for(const x of [-5.1,-1.6])for(const y of [-7.35,-5.0])rect(105,x-.46,x+.46,y-.46,y+.46,'pavers',[.90,.86,.70],.086);
 rect(101,.75,6.55,-7.2,-2.2,'grass');
 surface(101,[[.84,-7.2],[2.3,-7.2],[3,-4.2],[2.3,-2.2],[.84,-2.2]],'pavers',[.71,.53,.45],.078);
 surface(101,[[.84,boundary(101,.84)],[2.3,boundary(101,2.3)],[2.3,-7.2],[.84,-7.2]],'pavers',[.71,.53,.45],.078);
 steps(101,1.75,-2.65,1.26,.08,3);brackets(101,[1.05,3.22,6.02],'#357b99');
 for(const [x,y,r,h]of [[3.9,-5.8,.84,.65],[5.1,-5.8,.67,.90],[5.9,-4.6,.76,.88]])plant(101,x,y,r,h,x+y,[.83,.86,.57]);
 hedge([W(105,[-7.1,-8.5]),W(105,[-7.1,-3.8])],.65,.58,[.96,.91,.61],'blue-drive-left-flowering');
 mailbox(101,5.95,-6.65,'#33718a');planter(105,-4.8,-3.95,3.28,.68);
 // Side fence with thin pale welded wires on blue posts.
 fence(101,[[6.63,-6.8],[6.63,-2.25]],{style:'bars',base:.1,height:1.12,color:'#9aab96'});

 // White horizontal rails, sage posts, low brick coping and two separate gates.
 const fy=(boundary(109,-9.15)+boundary(111,8.55))/2;
 for(const [a,b] of [[-9.15,-7.8],[-2.3,-.2],[1.10,8.55]])fence(109,[[a,fy],[b,fy]],{style:'rails',height:1.18});
 gate(109,-7.8,-2.3,fy,{style:'rails',height:1.1,color:'#e4e6d7'});gate(109,-.2,1.1,fy,{style:'wood',height:1.1,color:'#d7ded0'});
 for(const x of [-9.15,-7.8,-2.3,-.2,1.1,8.55])pier(109,x,fy,1.2);
 rect(109,-8.65,-1.75,fy,-4.1,'pave',[.41,.41,.37],.075);
 gravel(110,-1.50,2.15,-4.05,-3.1);rect(110,-.20,1.05,fy,-3.1,'pave',[.60,.59,.53],.079);
 gravel(111,2.2,8.1,-4.0,-3.1);rect(111,2.2,8.1,-8.05,-4.05,'grass');
 porch(110,-1.2,2.1,-3.1,.46);porch(111,2.2,8.1,-3.1,.46);
 brackets(109,[-8.25,-5.4,-2.1]);lamp(109,-5.15,-4.24,2.38);lamp(110,-.86,-3.22,2.02);
 mailbox(109,.97,fy-.13,'#b9b9a7');

 // House 45: paved garage apron, a separate pedestrian walk, brown open gate,
 // brass letterbox, and a recessed exterior lantern.
 rect(113,-4.30,-.82,Math.min(boundary(113,-4.3),boundary(113,-.82)),-4.45,'pave',[.57,.56,.48],.075);
 for(let y=-8.3;y<-4.5;y+=.72)line(113,[-4.25,y,.083],[-.85,y,.083],.018,'#8d8c7c');
 rect(114,.15,1.35,boundary(114,.75),-4.0,'pavers',[.64,.56,.46],.081);
 lamp(114,1.8,-4.17);mailbox(114,1.4,-8.65,'#9d8c65');
 // Garage gate leaves parked at the sides, with the driveway kept clear.
 fence(113,[[-4.4,-8.1],[-4.4,-6.5]],{style:'wood',base:0,height:1.28,color:'#65503d'});
 fence(113,[[-.67,-8.1],[-.67,-6.5]],{style:'wood',base:0,height:1.28,color:'#65503d'});
 // Missing entry paths on the paired houses nearer the turning court.
 for(const id of [100,104]){
  const q=p(id),[lo,hi]=q.bounds,x=lo[0]+(hi[0]-lo[0])*.28;
  rect(id,x-.55,x+.55,boundary(id,x),lo[1],'pavers',[.69,.59,.48],.08);
  porch(id,lo[0]+.15,hi[0]-.15,lo[1],.40);lamp(id,x+.63,lo[1]-.1,1.95);
 }
 // Dead-end house: visible paths along the façade and a side garage slab.
 rect(117,-.70,9.2,-7.55,-6.78,'pavers',[.67,.59,.48],.078);
 rect(117,.22,1.35,-11.25,-6.78,'pavers',[.67,.59,.48],.079);
 rect(118,-4.2,-.70,-6.8,-1.1,'pave',[.55,.54,.46],.07);

 // Corner 36: sheltered glazed living-room entry and the hedge wrapping the
 // point of the property. A blue dead-end sign stands on the public edge.
 porch(99,-9.9,-3.3,-4.7,1.04,'#856241');
 rect(99,-10.2,-3.1,-6.0,-4.65,'pavers',[.69,.57,.44],.074);
 for(const id of [92,94,99]){const [lo,hi]=p(id).bounds;rect(id,lo[0]-.2,hi[0]+.2,lo[1]-7.5,lo[1],'grass');}
 rect(97,5.2,9.8,-1.0,6.8,'grass');
 hedge([W(99,[-14.1,-8.5]),W(99,[-11.4,-9.9]),W(99,[-3.1,-9.9])],1.68,.96,[.72,.81,.63],'36-rounded-corner-hedge');
 const signBase=W(99,[-13.5,-9.8]),su=p(99).u,sn=mul(p(99).v,-1),S=(x,z,d=.0)=>[...add(signBase,add(mul(su,x),mul(sn,d))),z];
 beam([...signBase,.03],[...signBase,2.65],.058,rgb('#999e95'));
 for(const [w,h,z,d,col]of [[.73,.88,2.33,.0,'#e2e4d9'],[.66,.81,2.33,.015,'#276fb1'],[.115,.48,2.26,.03,'#f1ecdb'],[.38,.14,2.53,.04,'#c54138']])poly([S(-w/2,z-h/2,d),S(w/2,z-h/2,d),S(w/2,z+h/2,d),S(-w/2,z+h/2,d)],M.wall,rgb(col));
 objects.push({type:'dead-end-sign',reference:reference('36-porch'),center:signBase});
 lamp(94,1.5,-4.82,2.15);planter(94,2.08,-4.86,3.54,.60);
 // Its court-facing hedge follows the curb arc; a single opening leads to
 // the red garage, without a diagonal generic fence across the neighbour.
 const court=[-64.1,-59.5],curve=(a,b)=>Array.from({length:Math.ceil((b-a)/3)+1},(_,i)=>{const t=(a+(b-a)*i/Math.ceil((b-a)/3))*Math.PI/180;return [court[0]+Math.cos(t)*14.1,court[1]+Math.sin(t)*14.1];});
 for(const [a,b]of survey.roundabout?[[190,202],[218,242]]:[[153,202],[218,242]])hedge(curve(a,b),1.60,.86,[.77,.83,.66],'36-court-curved-hedge');
 const gap=curve(202,218),ga=gap[0],gb=gap.at(-1),gc=mix(ga,gb,.5),gu=norm(sub(gb,ga)),gv=[-gu[1],gu[0]],gl=len(sub(gb,ga));
 for(const c of [ga,gb])box(c,gu,gv,.31,.32,0,1.35,rgb('#d4cfba'),M.wall);
 for(let x=-gl/2+.1;x<gl/2;x+=.15){const c=add(gc,mul(gu,x));beam([...c,.10],[...c,1.18],.025,rgb('#46554c'));}
 for(const z of [.14,1.18])beam([...ga,z],[...gb,z],.04,rgb('#47574d'));
 path(W(94,[1.1,-4.7]),gc,2.8,M.pave,[.44,.44,.40],.077);

 // North/west court plots: grass all the way to the houses, front paths,
 // pale gates, narrow gravel margins, planters and roof-mounted aerials.
 for(const id of [77,86]){
  if(survey.roundabout?.parts.includes(id))continue;
  const q=p(id),[lo,hi]=q.bounds;
  rect(id,lo[0]-.3,hi[0]+.3,lo[1]-4.6,lo[1]-.3,'grass');
  rect(id,(lo[0]+hi[0])/2-.65,(lo[0]+hi[0])/2+.65,boundary(id,(lo[0]+hi[0])/2),lo[1],'pavers',[.71,.61,.48],.081);
  lamp(id,(lo[0]+hi[0])/2+1,lo[1]-.11,1.90);
  planter(id,lo[0]+1.5,lo[1]-.28,.22,.7);
  if(id!==97)gate(id,(lo[0]+hi[0])/2-1.5,(lo[0]+hi[0])/2+1.5,lo[1]-4.4,{style:'solid',height:1.10,color:'#e0dfd3'});
 }

 // East curve: the cream wall follows the outside of the court and rises
 // gently at its ends; separate brick coping units make its arc legible.
 if(!survey.roundabout){
 const center=[-64.1,-59.5],arc=[];
 for(let i=0;i<=28;i++){const a=(-39+i*2.75)*Math.PI/180;arc.push([center[0]+Math.cos(a)*14.25,center[1]+Math.sin(a)*14.25]);}
 const lawn=[...arc,[-47.0,-47.6],[-38.0,-57.0],[-38.0,-64.8],[-45.5,-70.3]];
 ground(lawn,M.grass,[.49,.49,.29],.070);
 for(let i=0;i<arc.length-1;i++){
  const a=arc[i],b=arc[i+1],d=norm(sub(b,a)),n=[-d[1],d[0]],l=len(sub(b,a)),h=.71+.37*Math.pow(Math.abs((i-14)/14),4);
  box(mix(a,b,.5),d,n,l+.015,.25,0,h,rgb('#ddd8c4'),M.wall);
  box(mix(a,b,.5),d,n,l+.015,.30,h,h+.095,rgb('#ae8560'),M.wall);
  for(let j=.04;j<l;j+=.135){const q=add(a,mul(d,j));beam([...add(q,mul(n,-.16)),h+.098],[...add(q,mul(n,.16)),h+.098],.013,rgb('#c9b99b'));}
 }
 objects.push({type:'curved-cream-wall',reference:reference('loop-east'),path:arc,heightEstimated:[.71,1.08]});
 for(const id of [80,83]){
  const q=p(id),[lo,hi]=q.bounds,x=lo[0]+(hi[0]-lo[0])*.47;
  rect(id,lo[0],lo[0]+3.25,lo[1]-4.0,lo[1],'pave',[.43,.43,.38],.082);
  rect(id,x-.63,x+.63,lo[1]-3.75,lo[1],'pavers',[.76,.66,.52],.084);
  steps(id,x,lo[1]-.20,1.28,.10,4);lamp(id,x-.69,lo[1]-.13,2.17);planter(id,x+1.20,lo[1]-1.05,.13,.82);
 }
 // Small tiered planter visible behind the open white fence on the court.
 {
  const id=80,x=-8.25,y=-8.05;
  for(const [z,r]of [[.18,.58],[.62,.43],[1.01,.28]]){
   const ring=Array.from({length:16},(_,i)=>A(id,x+Math.cos(i/8*Math.PI)*r,y+Math.sin(i/8*Math.PI)*r,z));poly(ring,M.wall,rgb('#c7b494'));solid(id,x,y,.14,.14,z,z+.37,'#b4a286');
   for(let i=0;i<6;i++)plant(id,x+Math.cos(i)*r*.66,y+Math.sin(i)*r*.66,.10,z+.18,i,[.85,.72,.68]);
  }objects.push({type:'tiered-planter',part:id,reference:reference('loop-east')});
 }
 }
 // Gutter-mounted antennas and modest flower boxes are supported by the roof.
 for(const id of [108,109,114,99,80,83,77]){
  if(survey.roundabout?.parts.includes(id))continue;
  const q=p(id),[lo,hi]=q.bounds,x=lo[0]+(hi[0]-lo[0])*.26,y=(lo[1]+hi[1])/2,z=q.roofHeight([x,y]);
  line(id,[x,y,z],[x,y,z+1.8],.022,'#7a8078');line(id,[x-.66,y,z+1.62],[x+.66,y,z+1.62],.022,'#777e77');
  for(let i=0;i<6;i++){const xx=x-.55+i*.20;line(id,[xx,y-.23,z+1.63],[xx,y+.23,z+1.63],.016,'#82887d');}
  objects.push({type:'roof-aerial',part:id,reference:reference('aerial')});
 }
 // Utility cabinets and stormwater grates on the outside of the traffic lane.
 for(const [x,y,angle]of [[-57,-71,0],[-79,-64,1],[-51,-53,2],[-85,-99,0]]){
  const u=[Math.cos(angle),Math.sin(angle)],v=[-u[1],u[0]],c=[x,y];
  box(c,u,v,.64,.48,.15,.175,rgb('#777a70'),M.wall);
  for(let j=-.26;j<.30;j+=.072){const a=add(c,add(mul(u,j),mul(v,-.19))),b=add(c,add(mul(u,j),mul(v,.19)));beam([...a,.184],[...b,.184],.032,rgb('#343e38'));}
  objects.push({type:'stormwater-grate',center:c,reference:reference('loop-corner')});
 }
 for(const [id,x,y]of [[83,2.9,-8.8],[94,3.48,-9.32],[105,-7.1,-8.6]]){if(survey.roundabout?.parts.includes(id))continue;solid(id,x,y,.40,.28,.12,.98,'#c5c6bb');solid(id,x,y-.15,.33,.016,.25,.89,'#d1d1c5');}
}

export function buildRefinedCourtIsland(ctx){
 const {poly,beam,box,rgb,add,mul,objects,materials:M}=ctx,center=[-64.1,-59.5];
 const ring=Array.from({length:48},(_,i)=>{const a=i/24*Math.PI;return [center[0]+Math.cos(a)*3.80,center[1]+Math.sin(a)*3.15];});
 const {ground,hedge}=landscapeTools(ctx);ground(ring,M.grass,[.55,.52,.28],.18);
 for(let i=0;i<48;i++){const a=ring[i],b=ring[(i+1)%48];poly([[...a,.022],[...b,.022],[...b,.19],[...a,.19]],M.wall,rgb('#b4b09e'));beam([...a,.20],[...b,.20],.11,rgb('#c2b9a0'));}
 hedge([[center[0]-1.65,center[1]+.2],[center[0],center[1]+.5],[center[0]+1.65,center[1]+.1]],2.18,2.85,[.82,.86,.65],'court-clipped-laurel');
 // Two curved arms and shallow bell-shaped lamps match the green streetlight.
 const c=[center[0]-.65,center[1]-1.05];beam([...c,.18],[...c,5.45],.085,rgb('#3b6550'));
 for(const sign of [-1,1]){
  const points=Array.from({length:9},(_,i)=>[c[0]+sign*i/8*1.25,c[1],5.08+.28*Math.sin(i/8*Math.PI)]);
  for(let i=1;i<points.length;i++)beam(points[i-1],points[i],.055,rgb('#426f53'));
  const end=points.at(-1),low=Array.from({length:20},(_,i)=>[end[0]+Math.cos(i/10*Math.PI)*.29,end[1]+Math.sin(i/10*Math.PI)*.23,end[2]-.16]);
  for(let i=0;i<20;i++)poly([low[i],low[(i+1)%20],[end[0],end[1],end[2]+.08]],M.wall,rgb('#648667'));
  poly(low,M.wall,rgb('#c2c2a1'));
 }
 objects.push({type:'planted-island',reference:reference('loop-west'),positionAccuracy:'Aerial and ground photographs',center,planting:'clipped laurel',light:'double curved arm'});
}
