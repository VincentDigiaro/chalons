import {toLocal,segmentDistance} from './walk-core.js';

const CELL=64,SEARCH_RADIUS=12;
const streetRadius=kind=>({motorway:12,trunk:12,primary:10,secondary:9,tertiary:8,residential:7,unclassified:7,living_street:7,pedestrian:7,service:5,track:4})[kind]||3;

// Index every road, including unnamed paths. A nearby named street must not
// supply the label when the pedestrian is actually on an unnamed way.
export class StreetLocator {
 constructor(data){
  this.cells=new Map();
  for(const feature of data.features||[]){
   const p=feature.properties||{},g=feature.geometry;
   if(p.group!=='road'||p.tunnel||!g)continue;
   const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
   const name=typeof p.name==='string'?p.name.trim():'',radius=streetRadius(String(p.kind||'').replace(/_link$/,''));
   for(const line of lines){
    const points=line.map(toLocal);
    for(let i=1;i<points.length;i++){
     const a=points[i-1],b=points[i],segment={line:[...a,...b],name,radius};
     for(let x=Math.floor((Math.min(a[0],b[0])-SEARCH_RADIUS)/CELL);x<=Math.floor((Math.max(a[0],b[0])+SEARCH_RADIUS)/CELL);x++)
      for(let y=Math.floor((Math.min(a[1],b[1])-SEARCH_RADIUS)/CELL);y<=Math.floor((Math.max(a[1],b[1])+SEARCH_RADIUS)/CELL);y++){
       const key=x+','+y;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(segment);
      }
    }
   }
  }
 }
 nameAt(position){
  const candidates=this.cells.get(Math.floor(position[0]/CELL)+','+Math.floor(position[1]/CELL))||[];
  let closest=null,distance=SEARCH_RADIUS;
  for(const segment of candidates){const d=segmentDistance(position,segment.line);if(d<distance){closest=segment;distance=d;}}
  return closest&&distance<=closest.radius?closest.name:'';
 }
}
