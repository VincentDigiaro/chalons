// Keep replacement exclusions independent of a possibly older FPS index.
// Only generic OSM packets match this path; detailed models and roads survive.
export function excludeReplacedWalkNodes(index,registry){
 const excluded=new Set(registry.models.flatMap(model=>model.excludeIds||[]));
 return {...index,nodes:index.nodes.filter(([file])=>{
  const match=/^\d+\/(way|relation)-(\d+)\.bin$/.exec(file);
  return !match||!excluded.has(match[1]+'/'+match[2]);
 })};
}
