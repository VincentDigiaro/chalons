import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {roofSpecs,materialId} from './nice-texture-catalogue.mjs';
const root='artifacts/nice-textures';
const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const manifest=JSON.parse(fs.readFileSync(root+'/generation-manifest.json'));
for(const m of manifest.materials){
 const correction=root+'/results/'+m.id+'-corrected.json';
 if(fs.existsSync(correction)){const c=JSON.parse(fs.readFileSync(correction));m.correctionPrompt=c.correctionPrompt;m.draft='facades/drafts/'+m.id+'.png';}
 m.sha256=digest(m.original);
}
fs.writeFileSync(root+'/generation-manifest.json',JSON.stringify(manifest,null,2));
const refs={tile:[1,2,3,4,9,16,23],flat:[7,8,11,13,14,17,18,19,20],metal:[1,19,20],slate:[16]};
const materials=roofSpecs.map((s,i)=>{const id=materialId('roofs',i);return {id,index:i,name:s[1],family:s[2],texture:'textures/'+id+'.webp',overview:'textures/low/'+id+'.webp',textureSha256:digest(root+'/roofs/staged/textures/'+id+'.webp'),overviewSha256:digest(root+'/roofs/staged/textures/low/'+id+'.webp'),referencePhotos:refs[s[2]].map(n=>'references/'+String(n).padStart(2,'0')+'.png')};});
fs.writeFileSync(root+'/roofs/staged/catalogue.json',JSON.stringify({city:'nice',active:false,status:'Reserved for later use; not referenced or published',textureSize:[512,512],overviewSize:[128,128],generationManifest:'../../generation-manifest.json',survey:'../../survey.json',materials},null,2));
console.log('Evidence recorded: 80 originals, 32 inactive roof materials.');
