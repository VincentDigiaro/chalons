import fs from 'node:fs/promises';
/** A custom model replaces both the plain wall and roof for these exact IDs. */
export async function detailedBuildingIds(){
 const ids=[];
 for(const street of ['nerval','attila','buirette','parc14','camp127'])try{ids.push(...JSON.parse(await fs.readFile(`dist/data/${street}/index.json`,'utf8')).excludeIds);}catch(error){if(error.code!=='ENOENT')throw error;}
 return [...new Set(ids)];
}
