import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {listPublicationFiles,isCodePublicationFile} from './publication-files.mjs';

const base=path.resolve(os.tmpdir()),root=await fs.mkdtemp(path.join(base,'map-publication-list-'));
try{
 const names=['app.js','app.js.gz','.hidden','hidden/.file','data/walk/index.json','data/walk/0/active.bin','data/walk/0/retired.bin','data/walk/0/stale.bin','data/walk/0/active.bin.gz','data/cities/nice/walk/0/nice.bin','data/cities/nice/terrain/index.json'];
 for(const name of names){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'test');}
 const active=new Set(['data/walk/0/active.bin','data/walk/0/retired.bin']);
 assert.deepEqual((await listPublicationFiles(root,active)).sort(),['app.js','data/cities/nice/terrain/index.json','data/cities/nice/walk/0/nice.bin','data/walk/0/active.bin','data/walk/0/retired.bin','data/walk/index.json']);
 assert.deepEqual(await listPublicationFiles(root,active,{scope:'code'}),['app.js']);
 // Every local JavaScript import must travel with a code release. A missing
 // static import prevents app.js from starting, even if its feature is unused.
 const runtime=path.resolve('dist'),codeFiles=new Set(await listPublicationFiles(runtime,new Set(),{scope:'code'}));let checkedImports=0;
 assert(codeFiles.has('vendor/earcut.js'));assert(codeFiles.has('vendor/earcut.LICENSE'));
 for(const file of codeFiles){if(!file.endsWith('.js'))continue;const code=await fs.readFile(path.join(runtime,file),'utf8');
  for(const match of code.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.[^'"]+\.js)['"]/g)){
   const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));assert(codeFiles.has(target),`Code publication omits ${target}, imported by ${file}`);checkedImports++;
  }
 }
 assert(checkedImports>100,'Runtime import coverage');
 await fs.symlink(path.join(root,'data'),path.join(root,'linked-data'),'junction');
 await assert.rejects(listPublicationFiles(root,active),/Unexpected symlink/);
 await fs.unlink(path.join(root,'linked-data'));
 if(process.argv[2]){
  // Read-only regression check against a real, large release snapshot.
  const source=path.resolve(process.argv[2]),walk=JSON.parse(await fs.readFile(path.join(source,'data/walk/index.json')));
  const activeWalk=new Set([...walk.nodes.map(n=>'data/walk/'+n[0]),...(walk.retiredNodes||[]).map(f=>'data/walk/'+f)]);
  const files=await listPublicationFiles(source,activeWalk);
  assert.equal(new Set(files).size,files.length);assert(files.includes('app.js'));
  const entries=await fs.readdir(source,{withFileTypes:true,recursive:true});
  const expected=entries.filter(e=>e.isFile()).map(e=>path.relative(source,path.join(e.parentPath,e.name)).split(path.sep).join('/')).filter(f=>!f.split('/').some(p=>p.startsWith('.'))&&!f.endsWith('.gz')&&(!f.startsWith('data/walk/')||!f.endsWith('.bin')||activeWalk.has(f)));
  assert.deepEqual(files.sort(),expected.sort());
  const code=await listPublicationFiles(source,activeWalk,{scope:'code'});assert.deepEqual(code.sort(),expected.filter(isCodePublicationFile).sort());
  console.log(JSON.stringify({largeRelease:'passed',files:files.length,codeFiles:code.length,niceFiles:files.filter(f=>f.startsWith('data/cities/nice/')).length,readOnly:true}));
 }
 console.log(JSON.stringify({publicationFiles:'passed',gzipAndHiddenFilesExcluded:true,activeAndRetiredWalkPreserved:true,niceIncluded:true,symlinksRejected:true}));
}finally{
 assert(root.startsWith(base+path.sep)&&path.basename(root).startsWith('map-publication-list-'));
 await fs.rm(root,{recursive:true,force:true});
}
