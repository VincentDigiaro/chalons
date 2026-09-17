// -1 means no application-imposed limit; zero explicitly disables that output.
export const recentBombItems=(items,limit)=>limit<0?items:limit===0?[]:items.slice(-limit);
export function trimBombItems(items,limit){if(limit>=0&&items.length>limit)items.splice(0,items.length-limit);}

// Allocate before transparency sorting: otherwise smoke at the front of that
// sort can consume the entire budget and remove every flame. Share each tier
// across emitters, so a single old trail cannot hide all the recent explosions.
export function selectBombSprites(sprites,limit){
 if(limit===0)return [];
 if(limit<0||sprites.length<=limit)return sprites.slice();
 const selected=[],tiers=new Map();
 for(const sprite of sprites){
  const priority=sprite.priority??0;let groups=tiers.get(priority);if(!groups)tiers.set(priority,groups=new Map());
  const source=sprite.source??'effects';let group=groups.get(source);if(!group)groups.set(source,group=[]);group.push(sprite);
 }
 for(const priority of [...tiers.keys()].sort((a,b)=>b-a)){
  const groups=[...tiers.get(priority).values()].reverse();
  for(let i=0;selected.length<limit;i++){
   let added=false;for(const group of groups){if(i<group.length){selected.push(group[i]);added=true;if(selected.length===limit)break;}}
   if(!added)break;
  }
  if(selected.length===limit)break;
 }
 return selected;
}
