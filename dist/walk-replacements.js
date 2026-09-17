// Keep replacement exclusions independent of a possibly older FPS index.
// Only generic OSM packets match this path; detailed models and roads survive.
export function excludeReplacedWalkNodes(index,registry){
 const excluded=new Set(registry.models.flatMap(model=>model.excludeIds||[]));
 const nodes=index.nodes.filter(([file])=>{
  const match=/^\d+\/(way|relation)-(\d+)\.bin$/.exec(file);
  return !match||!excluded.has(match[1]+'/'+match[2]);
 });
 // City-local additions leave the imported geometry and download archives
 // intact. Their material IDs are relative to this appended table.
 if(!registry.walk)return {...index,nodes};
 if(registry.walk.version!==1)throw Error('Version de modèles piétons inconnue');
 return {...index,customModelMaterialBase:index.materials.length,
  materials:[...index.materials,...registry.walk.materials],
  nodes:[...nodes,...registry.walk.nodes]};
}
