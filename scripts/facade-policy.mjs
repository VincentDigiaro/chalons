// Approximate architectural families, with scale constraints before random variety.
export const pick=(choices,seed)=>choices[(seed>>>0)%choices.length];
const house=[0,0,1,1,2,3,16,17,18,19,20,21,22,23];
const town=[4,4,5,5,6,7,24,25,26,27,28,29];
const apartment=[8,9,10,30,31,32,33,34,35];
const industrial=[40,40,41,42,43,43];
const institution=[11,38,39];
export function chooseFacade(p,center,area,sector,seed,inActivity){
 const kind=p.kind,h=p.height-p.min_height,old=center[0]>4.350&&center[0]<4.374&&center[1]>48.950&&center[1]<48.968;
 if(['church','cathedral','chapel','temple'].includes(kind))return pick([44,45],seed);
 // A garage-sized footprint does not imply a garage-height wall.
 if(['garage','garages','shed','service','kiosk'].includes(kind))return h<=3.8&&area>=18?13:47;
 if(['school','hospital','public','government','civic','train_station'].includes(kind))return old&&seed%4===0?46:pick(institution,seed);
 if(kind==='office')return seed%3===0?pick(institution,seed):37;
 if(['retail','commercial'].includes(kind))return h<=4.5?36:pick([37,11,39,40],seed);
 if(['industrial','warehouse','barn','farm_auxiliary','silo','sports_centre','stadium'].includes(kind))return pick(industrial,seed);
 if(['apartments','dormitory'].includes(kind)||h>=12||(area>420&&h>=8))return pick(apartment,seed);
 if(area<24)return h<=3.8&&area>=18?13:47;
 if(inActivity&&area>260&&h<12)return h<=4.5&&seed%3===0?36:pick(industrial,seed);
 if(area>1100&&h<12&&!old)return pick(industrial,seed);
 if(old)return seed%17===0?46:pick(town,seed);
 if(sector.id===6&&seed%3!==0)return pick([4,5,6,24,25,26,27,29,21],seed);
 if(sector.id===4&&seed%4===0)return pick(town,seed);
 return pick(house,seed);
}
export function wallMaterial(base,material,length,longest,height,seed){
 const family=material.family;
 if(family==='garage'&&(height>3.8||length<2.8))return 47;
 if(length<1.4)return ['church','historic','town'].includes(family)?15:14;
 if(family==='church'&&length<2.8)return 15;
 if(family==='industrial'&&length<8&&seed%4===0)return 12;
 if(family==='garage'&&length<longest*.85)return seed%2?14:47;
 if(family==='house'&&length<longest*.4&&length<4&&seed%3!==0)return 14;
 return base;
}
export function facadeRepeats(material,length,height){
 const family=material.family;
 const bays=material.bays||2;
 let u=family==='blank'||material.id==='13-industrial-metal'?length/material.moduleWidth:Math.max(1/bays,Math.round(length/(material.moduleWidth/bays))/bays);
 if(family==='garage')u=Math.max(1,Math.round(length/material.moduleWidth));
 const v=['garage','shop'].includes(family)?1:Math.max(1,Math.round(height/material.floorHeight));
 return [u,v];
}
