// Generate one visible pavement surface at each airport coordinate.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
export async function finishAirportPavement(model){
 const folder='artifacts/nice-runway-priority';await fs.mkdir(folder,{recursive:true});
 await fs.writeFile(folder+'/input.json',JSON.stringify({axes:model.groundAxes,shapes:model.groundCapture}));
 const python=process.env.ROADS_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
 const result=spawnSync(python,['scripts/airport-pavement.py',folder],{stdio:'inherit'});
 if(result.status!==0)throw result.error||Error('Airport pavement generation failed');
 const output=JSON.parse(await fs.readFile(folder+'/pavement.json'));model.groundCapture=null;
 for(const group of output.groups)for(const triangle of group.triangles){
  const [a,b,c]=triangle;
  const upward=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0;
  model.face((upward?triangle:[a,c,b]).map(p=>[...p,.045]),group.color,2);
 }
 model.detail('pavement-priority',[0,0,0],{policy:'runway-over-taxiway',paint:'inlaid',...output.stats});
}
