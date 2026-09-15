const $=id=>document.getElementById(id),number=new Intl.NumberFormat('fr-FR');
const families={tile:'Tuiles',slate:'Ardoises',metal:'Métal',flat:'Toits plats'};
try{
 const [catalog,index]=await Promise.all(['catalogue.json','catalogue-index.json'].map(async file=>{const r=await fetch(`./data/roofs/${file}`);if(!r.ok)throw Error('Catalogue indisponible');return r.json();}));
 $('coverage').textContent=`${number.format(index.stats.buildings)} bâtiments · 32 textures · Gérard-de-Nerval préservé`;
 catalog.materials.forEach((m,i)=>{const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),label=document.createElement('span'),count=document.createElement('span');img.src=`./data/roofs/${index.textures[i]}`;img.alt=m.label;img.width=512;img.height=512;img.loading='lazy';label.textContent=`${String(i+1).padStart(2,'0')} · ${m.label}`;count.className='family';count.textContent=`${families[m.family]} · ${number.format(index.stats.materialCounts[i])} bâtiments`;caption.append(label,count);figure.append(img,caption);$('catalogue').append(figure);});
}catch(error){$('coverage').textContent='Le catalogue n’a pas pu charger. Rechargez la page.';console.error(error);}
