import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Apply the same small integration to the local tree or an isolated public tree.
// Each replacement is checked, so concurrent changes are never overwritten wholesale.
export async function integrateRoofs(root){
 const edit=async(file,changes)=>{let text=await fs.readFile(path.join(root,file),'utf8');for(const [before,after] of changes){if(text.includes(after))continue;if(!text.includes(before)||text.indexOf(before)!==text.lastIndexOf(before))throw Error('Roof integration needs review: '+file+' / '+before.slice(0,70));text=text.replace(before,after);}await fs.writeFile(path.join(root,file),text);};
 await edit('app.js',[
  ["import {RoofTextures} from './roof-textures.js';","import {RoofTextures} from './roof-textures.js';\nimport {getRoofMode,setRoofMode} from './roof-mode.js';"],
  ["'Sol et toitures · photographies IGN'","(getRoofMode()==='aerial'?'Sol et toitures · photographies aériennes':'Sol photographique · 32 textures de toiture')"],
  ["function wireControls(){","function wireControls(){\n  $('roof-mode').value=getRoofMode();\n  $('roof-mode').onchange=e=>setRoofMode(e.target.value);"]
 ]);
 await edit('walk-renderer.js',[
  ["import {loadImagery} from './imagery.js';","import {loadImagery} from './imagery.js';\nimport {getRoofMode} from './roof-mode.js';\nimport {applyRoofMode} from './roof-walk-mode.js';"],
  ['this.canvas=canvas;this.nodes=new Map();','this.roofMode=getRoofMode();this.canvas=canvas;this.nodes=new Map();'],
  ['node.ranges=header.ranges;','node.ranges=applyRoofMode(header,vertices,this.index,this.roofMode);'],
  ['getState(){return {radius:LOAD_RADIUS,','getState(){return {roofs:this.roofMode,radius:LOAD_RADIUS,']
 ]);
 await edit('index.html',[
  ['bâtiments OpenStreetMap, sol et toitures habillés par les photographies aériennes IGN.','bâtiments en 3D, sol photographique et catalogue de textures pour les toitures.'],
  ['    <p class="field-label">Afficher</p>','    <label class="field-label" for="roof-mode">Textures des toits</label>\n    <select id="roof-mode" aria-describedby="roof-mode-note"><option value="catalogue">Catalogue · 32 textures</option><option value="aerial">Photos aériennes · ancien rendu</option></select>\n    <p id="roof-mode-note" class="height-note">Choix mémorisé après rechargement. Rue Gérard-de-Nerval préservée. <a href="./roof-catalogue.html">Voir les textures ↗</a></p>\n    <div class="divider"></div>\n    <p class="field-label">Afficher</p>'],
  ['Les photographies aériennes IGN habillent le sol et sont projetées à la bonne position sur les toitures. Leur détail augmente avec le zoom. Les trous et cours intérieures des emprises OSM sont préservés.','Les photographies aériennes habillent le sol. Hors de Gérard-de-Nerval, 32 textures de tuiles, ardoises, métal et toits plats habillent les toitures. Elles sont choisies approximativement selon les couleurs des vues aériennes et le type de bâtiment. Les cours intérieures sont préservées. Le réglage « Textures des toits » permet de retrouver les anciennes photos projetées, sur la carte comme en promenade. <a href="./roof-catalogue.html">Consulter le catalogue des toits ↗</a>.']
 ]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await integrateRoofs(path.resolve(process.argv[2]||'dist'));
