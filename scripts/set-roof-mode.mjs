// Reversible site default; no mesh rebuild and no Git required.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
const mode=process.argv[2];
if(!['aerial','catalogue'].includes(mode))throw Error('Usage: npm run roofs:mode -- aerial|catalogue [--public]');
const root=path.resolve(process.argv.includes('--public')?'C:/nginx/html/chalons':'dist');
if((await fs.realpath(root)).toLowerCase()!==root.toLowerCase())throw Error('Unexpected target directory');
const file=path.join(root,'roof-config.js'),old=await fs.readFile(file,'utf8');
if(!/export const DEFAULT_ROOF_MODE='(?:aerial|catalogue)';/.test(old))throw Error('Unknown roof configuration; no changes made');
const updated=old.replace(/export const DEFAULT_ROOF_MODE='(?:aerial|catalogue)';/,`export const DEFAULT_ROOF_MODE='${mode}';`);
await fs.writeFile(file,updated);await fs.writeFile(file+'.gz',gzipSync(updated));
console.log(`Default roofs: ${mode} — ${root}. Reload the page. Explicit URLs and choices saved under this default still take priority.`);
