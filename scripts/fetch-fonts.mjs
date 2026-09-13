import fs from 'node:fs/promises';
const ranges=new Set([0]);
for(const name of ['places','lines','buildings']){
  const data=JSON.parse(await fs.readFile(`dist/data/${name}.geojson`,'utf8'));
  for(const f of data.features)for(const char of f.properties.name||'')ranges.add(Math.floor(char.codePointAt(0)/256)*256);
}
const folder='dist/fonts/Noto Sans Regular';await fs.mkdir(folder,{recursive:true});
for(const start of [...ranges].sort((a,b)=>a-b)){
  const file=`${start}-${start+255}.pbf`;
  try{await fs.access(`${folder}/${file}`);continue;}catch{}
  const response=await fetch(`https://demotiles.maplibre.org/font/Noto%20Sans%20Regular/${file}`);
  if(!response.ok)throw Error(`Missing font range ${file}: ${response.status}`);
  await fs.writeFile(`${folder}/${file}`,Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${file}`);
}
const license=await fetch('https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt');
if(!license.ok)throw Error('Noto font license unavailable');
await fs.writeFile('dist/fonts/OFL.txt',await license.text());
console.log('All label ranges available locally.');
