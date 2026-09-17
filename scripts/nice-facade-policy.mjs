import {facadeSpecs,materialId} from './nice-texture-catalogue.mjs';
export const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const pick=(a,s)=>a[(s>>>0)%a.length];
export const sectors=[
 {id:1,name:'Vieux-Nice / Masséna',refs:[3,4],anchors:[[7.2761,43.6962],[7.2702,43.6979]]},
 {id:2,name:'Centre / Carabacel',refs:[1,2],anchors:[[7.2739,43.702],[7.266,43.701]]},
 {id:3,name:'Libération',refs:[5,6],anchors:[[7.2621,43.7104],[7.2614,43.7141]]},
 {id:4,name:'Promenade / Baumettes',refs:[7,8],anchors:[[7.257,43.6946],[7.2488,43.6949]]},
 {id:5,name:'Port / Riquier',refs:[9,10],anchors:[[7.2846,43.6991],[7.2892,43.7069]]},
 {id:6,name:'Cimiez',refs:[11,12],anchors:[[7.2748,43.7192],[7.2797,43.7163]]},
 {id:7,name:'Saint-Roch / Pasteur / Ariane',refs:[13,14,22],anchors:[[7.2928,43.7144],[7.2995,43.7371],[7.2855,43.7248]]},
 {id:8,name:'Mont Boron',refs:[16,23],anchors:[[7.2964,43.6941],[7.3,43.701]]},
 {id:9,name:'Fabron / Caucade',refs:[17,18],anchors:[[7.2287,43.6887],[7.2192,43.6803]]},
 {id:10,name:'Saint-Augustin / Arénas',refs:[19,20],anchors:[[7.2156,43.6697],[7.2121,43.6685]]}
];
export function nearestSector(center){let best,distance=Infinity;for(const s of sectors)for(const a of s.anchors){const d=Math.hypot((center[0]-a[0])*80484,(center[1]-a[1])*111320);if(d<distance){best=s;distance=d;}}return {...best,distance};}
const familyRefs={town:[3,4,9],urban:[1,2,5,6,10],apartment:[7,8,10,11,13,14,17,18,22],house:[8,11,12,16,17,23],shop:[4,9],office:[19,20],industrial:[10,19,20],institution:[8,13,22],blank:[6,14,16],church:[4,9],historic:[1,8,16],garage:[8,17],annex:[12,17]};
const widths={town:5.8,urban:6.2,apartment:6.4,house:6,shop:7,office:6.8,industrial:10,institution:7,blank:6,church:8,historic:7,garage:6,annex:6};
export const materials=facadeSpecs.map((s,i)=>({id:materialId('facades',i),name:s[1],family:s[2],moduleWidth:widths[s[2]],floorHeight:['town','urban','historic','church'].includes(s[2])?3.3:s[2]==='industrial'?4:3,bays:2,referencePhotos:familyRefs[s[2]].map(n=>`references/${String(n).padStart(2,'0')}.png`)}));
const urban=[8,8,9,10,11,11,12,13,14,15],apartments=[16,17,17,18,19,20,21,22,23,24,25],houses=[26,26,27,28,29,30,31,32,33];
export function chooseNiceFacade(p,center,area,sector,seed){
 const h=p.height-p.min_height,k=p.kind,old=center[0]>7.27&&center[0]<7.2816&&center[1]>43.6926&&center[1]<43.7005;
 if(['church','cathedral','chapel','temple'].includes(k))return 44;
 if(['garage','garages'].includes(k)&&h<=4.5)return 46;
 if(['shed','service','kiosk','hut'].includes(k))return 47;
 if(['school','hospital','public','government','civic','train_station','university','kindergarten'].includes(k))return seed%7===0&&sector.id<6?45:pick([40,41],seed);
 if(k==='office')return pick([36,37],seed);
 if(['industrial','warehouse','barn','farm_auxiliary','silo','sports_centre','stadium'].includes(k))return pick([38,39],seed);
 if(['retail','commercial'].includes(k)&&h<5)return pick([34,35],seed);
 if(old){if(center[0]<7.273&&seed%4!==0)return 3;return pick([0,0,1,2,4,5,6,7,7],seed);}
 if(h<4.4&&area<22)return 47;
 if(sector.id===10&&area>450&&h>=12)return pick([36,37,22,19],seed);
 if([2,3,5].includes(sector.id)&&h>=7&&h<=27&&area<950)return seed%5===0?pick(apartments,seed>>>4):pick(urban,seed);
 if(sector.id===1&&h>=7&&h<=27)return pick([0,1,2,4,7,...urban],seed);
 if(h>=12||(['apartments','dormitory','hotel'].includes(k)&&h>=8)||(area>420&&h>=8))return pick(apartments,seed);
 if(area>1400&&h<12)return pick([38,39,40],seed);
 if(sector.id===4&&h>8&&seed%3!==0)return pick(apartments,seed);
 return pick(houses,seed);
}
export function niceWallMaterial(base,length,longest,height,ring,seed){
 const family=materials[base].family;
 // Narrow returns cannot contain a plausible window; longer courtyard faces can.
 if(length<1.15||(family==='church'&&length<2.3))return seed%2?42:43;
 if(family==='garage'&&(length<longest*.8||length<2.6))return seed%2?42:47;
 if(family==='house'&&length<2.8&&length<longest*.32&&seed%3!==0)return seed%2?42:43;
 return base;
}
export function niceRepeats(mat,length,height,levels){
 const m=materials[mat],f=m.family;
 const u=f==='blank'?Math.max(.2,length/m.moduleWidth):f==='garage'?Math.max(1,Math.round(length/m.moduleWidth)):Math.max(.5,Math.round(length/(m.moduleWidth/2))/2);
 const v=['garage','shop'].includes(f)?1:Math.max(1,Number.isFinite(levels)&&levels>0&&height/levels>=2&&height/levels<=5?Math.round(levels):Math.round(height/m.floorHeight));
 return [u,v];
}
