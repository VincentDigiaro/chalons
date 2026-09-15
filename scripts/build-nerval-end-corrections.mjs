import fs from 'node:fs/promises';
import {curvedStreetlamp} from './nerval-street-furniture.mjs';
const prefix='nerval-end-20260914-',ref=name=>prefix+name;
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),mul=(a,s)=>a.map(x=>x*s),norm=a=>mul(a,1/Math.hypot(...a));
const rgb=h=>h.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255);

export async function applyEndCorrections(survey){
 const references=JSON.parse(await fs.readFile('scripts/nerval-end-correction-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith(prefix)),...references];
 const background=JSON.parse(await fs.readFile('scripts/nerval-end-background.json','utf8'));
 const ids=background.map(p=>p.id);
 survey.parts=survey.parts.filter(p=>!ids.includes(p.id));survey.groups=survey.groups.filter(g=>!g.id.startsWith('nerval-background-'));survey.focusParts=survey.focusParts.filter(id=>!ids.includes(id));
 survey.openings=survey.openings.filter(o=>!o.reference?.startsWith(prefix)&&!ids.includes(o.part));
 const put=(part,side,along,bottom,width,height,extra={},source='garden-doors-reference')=>survey.openings.push({part,side,along,bottom,width,height,glassMaterial:true,frame:'white',leaves:2,...extra,reference:ref(source),visibility:source==='garden-doors-reference'?'Portes-fenêtres visibles sur la vue aérienne ; proportions et espacement estimés':'Baies du fond du cliché, en partie masquées ; motif et dimensions simplifiés'});
 // Latest user photograph: the street elevation sits BELOW a roof slope.
 // Rotate the former street-facing gable by 90 degrees; keep the OSM ring.
 const house=survey.parts.find(p=>p.id===117);
 Object.assign(house,{roof:'gable',roofAxis:1,eaves:3,rise:4.05,roofCorrection:ref('roof-street-reference')});
 // The high opening belongs to the new lateral gable, not to the roof slope.
 survey.openings=survey.openings.filter(o=>!(o.part===117&&(o.side==='right'||o.bottom>3)));
 for(const along of [.20,.50,.80])put(117,'right',along,.16,.96,2.14,{kind:'patio',shutters:'brown',handleOffset:.08,visibility:'Trois portes-fenêtres confirmées par l’utilisateur le 14 septembre 2026 ; espacement estimé'});
 put(117,'right',.50,4.05,.78,1.26,{kind:'window',shutters:'brown'},'roof-street-reference');
 const source=JSON.parse(await fs.readFile('dist/data/buildings.geojson','utf8'));
 for(const b of background){
  const f=source.features.find(f=>f.properties.osm_id===b.osm_id);if(!f||f.geometry.type!=='Polygon')throw Error('Missing background footprint '+b.osm_id);
  const ring=f.geometry.coordinates[0].slice(0,-1).map(q=>q.map((n,i)=>(n-survey.origin[i])*survey.scale[i]));
  const center=[0,1].map(i=>ring.reduce((s,p)=>s+p[i],0)/ring.length);
  // Common row axis follows the six neighbouring footprints, toward the SW.
  const wanted=norm(b.type==='terrace'?[-.62,-.78]:[-.76,.65]);let u=wanted,score=-1;
  for(let i=0;i<ring.length;i++){const e=sub(ring[(i+1)%ring.length],ring[i]);if(Math.hypot(...e)<2)continue;let d=norm(e),s=Math.abs(dot(d,wanted));if(s>score){score=s;u=dot(d,wanted)<0?mul(d,-1):d;}}
  if(b.type==='terrace')u=norm([-.608,-.794]);
  const v=[-u[1],u[0]],local=ring.map(q=>[dot(sub(q,center),u),dot(sub(q,center),v)]),lo=[0,1].map(i=>Math.min(...local.map(p=>p[i]))),hi=[0,1].map(i=>Math.max(...local.map(p=>p[i])));
  const surfaceBounds={front:[lo[0],hi[0]],back:[lo[0],hi[0]],left:[lo[1],hi[1]],right:[lo[1],hi[1]]};
  for(const side of Object.keys(surfaceBounds)){const dim=['front','back'].includes(side)?0:1,depth=1-dim,edge=['front','left'].includes(side)?lo[depth]:hi[depth],values=local.filter(p=>Math.abs(p[depth]-edge)<.65).map(p=>p[dim]);if(values.length>1)surfaceBounds[side]=[Math.min(...values),Math.max(...values)];}
  const part={...b,ring,center,u,v,bounds:[lo,hi],surfaceBounds,color:rgb(b.color),roofTint:[.90,.86,.80],roofAxis:1,group:'nerval-background-'+b.id,photos:['01'],patches:[],focus:true,background:true};
  survey.parts.push(part);survey.groups.push({id:part.group,parts:[part.id],center,u,v,photos:['01'],description:b.description,roof:b.roof});survey.focusParts.push(b.id);
  if(b.type==='annex')continue;
  for(const side of ['front','back']){
   for(const along of [.27,.73]){put(b.id,side,along,3.7,1.02,1.4,{},'cul-de-sac-reference');put(b.id,side,along,.83,1.02,1.45,{},'cul-de-sac-reference');}
  }
  if(b.type==='pavilion')put(b.id,'right',.49,.85,1.12,1.4,{},'cul-de-sac-reference');
 }
 // One continuous roof across the row, even where OSM divides it into
 // slightly different footprints. Wall and opening bounds stay unchanged.
 const row=survey.parts.filter(p=>p.background&&p.type==='terrace'),depths=row.flatMap(p=>p.ring.map(q=>dot(q,p.v)));
 for(const p of row){p.roofStart=Math.min(...depths)-dot(p.center,p.v);p.roofEnd=Math.max(...depths)-dot(p.center,p.v);}
 survey.endCorrections={referenceIds:references.map(r=>r.id),backgroundParts:ids,gardenDoorPart:117,doorSide:'right',tree:{framePart:117,local:[20,-7.9],height:9.4,radius:3.25},streetlamp:{framePart:117,local:[23.7,-10.58],height:5.75},accuracy:'Clichés utilisateur ; positions, hauteurs et détails estimés, emprises OSM conservées.'};
 const furniture=JSON.parse(await fs.readFile('scripts/nerval-furniture-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith('user-nerval-furniture-20260914')), ...furniture];
 const entryTrees=JSON.parse(await fs.readFile('scripts/nerval-entry-tree-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith('user-nerval-entry-trees-20260914')), ...entryTrees];
 const gardenBoundary=JSON.parse(await fs.readFile('scripts/nerval-garden-boundary-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith('user-nerval-garden-boundary-20260914')), ...gardenBoundary];
 const secondHouse=JSON.parse(await fs.readFile('scripts/nerval-second-house-doors-references.json','utf8'));
 const secondHouseRef='user-nerval-second-house-doors-20260914-1';
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith('user-nerval-second-house-doors-20260914-')),...secondHouse];
 survey.openings=survey.openings.filter(o=>o.reference!==secondHouseRef);
 // The two red circles mark the ground-floor gable opening below the upper
 // window, and the blank front wall to the left of the existing window.
 for(const [side,along,width] of [['left',.47,1.08],['front',.22,1.20]])survey.openings.push({part:108,side,along,bottom:.12,width,height:2.14,kind:'patio',glassMaterial:true,frame:'white',leaves:2,shutters:'brown',reference:secondHouseRef,visibility:'Emplacements indiqués par l’utilisateur ; dimensions estimées et menuiseries assorties à la maison.'});
 const latest=JSON.parse(await fs.readFile('scripts/nerval-impasse-correction-references.json','utf8'));
 survey.supplementaryReferences=[...survey.supplementaryReferences.filter(r=>!r.id.startsWith('user-impasse-corrections-20260914')), ...latest];
}

export function buildEndCorrections(ctx){
 const {parts,survey,objects,poly,beam,box,mix,materials:M}=ctx,c=survey.endCorrections,p=parts.get(117),world=q=>p.world(q),dark=rgb('#365144');
 // Deep door reveals are generated by the shared opening builder. Add the
 // narrow stone terrace along this previously blank garden elevation.
 const [lo,hi]=p.bounds,x=hi[0];
 const terrace=[[x-.02,lo[1]],[x+1.02,lo[1]],[x+1.02,hi[1]],[x-.02,hi[1]]].map(q=>[...world(q),.085]);
 poly(terrace,M.pavers,[.67,.60,.49],[[0,0],[.5,0],[.5,6],[0,6]]);
 objects.push({type:'garden-door-terrace',part:117,side:'right',reference:ref('garden-doors-reference')});
 const tree=world(c.tree.local),base=[...tree,.05],fork=[tree[0]-.12,tree[1]+.08,3.6];
 beam(base,fork,.33,rgb('#9b9680'));beam(fork,[tree[0]-.28,tree[1]+.12,6.2],.18,rgb('#a9a591'));
 for(let z=.35;z<3.4;z+=.38)beam([tree[0]-.14,tree[1]-.02,z],[tree[0]+.10,tree[1]+.02,z+.08],.055,rgb('#5f6658'));
 function foliage(center,rx,ry,rz,seed){
  const steps=13,bands=8,at=(j,k)=>{const a=j/bands*Math.PI,b=k/steps*Math.PI*2,r=1+.09*Math.sin(j*5+k*11+seed);return [center[0]+Math.sin(a)*Math.cos(b)*rx*r,center[1]+Math.sin(a)*Math.sin(b)*ry*r,center[2]+Math.cos(a)*rz*r];};
  for(let j=0;j<bands;j++)for(let k=0;k<steps;k++){const shade=.86+.14*(.5+.5*Math.sin(seed+j*9+k*3));poly([at(j,k),at(j+1,k),at(j+1,k+1),at(j,k+1)],M.hedge,[.78*shade,.88*shade,.58*shade],[[k/3,j/3],[k/3,(j+1)/3],[(k+1)/3,(j+1)/3],[(k+1)/3,j/3]]);}
 }
 for(let i=0;i<7;i++){const a=i*Math.PI*2/7,rr=i%2?1.9:1.45,h=5.9+.65*Math.sin(i*3.1),tip=[tree[0]+Math.cos(a)*rr,tree[1]+Math.sin(a)*rr,h];beam([tree[0],tree[1],2.65+i*.16],tip,.10,rgb('#8a8b72'));foliage(add(tip,[0,0,.7]),1.55,1.7,2.05,100+i);
  const end=add(tip,[Math.cos(a)*.55,Math.sin(a)*.55,-1.15]);beam(tip,end,.029,rgb('#7a7d63'));foliage(end,.67,.68,1.20,200+i);
 }
 foliage([tree[0]-.1,tree[1]+.1,7.55],1.8,1.75,1.65,300);
 objects.push({type:'observed-garden-tree',part:117,center:tree,heightEstimated:9.4,crownRadiusEstimated:3.25,reference:ref('cul-de-sac-reference')});
 // Slender green pole on the pavement, with the curved arm and shallow
 // pendant visible just beyond the garden tree in the supplied Street View.
 curvedStreetlamp(ctx,world(c.streetlamp.local),mul(p.v,-1),{reference:'user-nerval-furniture-20260914-1'});
 for(const id of c.backgroundParts){const b=parts.get(id);if(b.type==='annex')continue;const [l,h]=b.bounds,q=[l[0]+(h[0]-l[0])*.20,(l[1]+h[1])/2],cc=b.world(q),z=b.roofHeight(q);box(cc,b.u,b.v,.38,.48,z-.12,z+.85,rgb('#c9c3b2'),M.wall);box(cc,b.u,b.v,.50,.58,z+.84,z+.95,rgb('#77786d'),M.wall);objects.push({type:'background-house',part:id,osm_id:b.osm_id,reference:b.reference,accuracy:b.accuracy});}
}
