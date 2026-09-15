import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {integrateCityRoads} from './city-roads-walk.mjs';
const bundled=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.ROADS_PYTHON||(fs.existsSync(bundled)?bundled:'python');
const result=spawnSync(python,['scripts/build-city-roads.py'],{stdio:'inherit'});
if(result.status!==0)throw result.error||Error('Road generation failed: '+result.status);
const file='dist/data/walk/index.json';
if(fs.existsSync(file)){
 const index=JSON.parse(fs.readFileSync(file));await integrateCityRoads(index);
 fs.writeFileSync(file,JSON.stringify(index));
}
