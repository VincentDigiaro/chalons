import {CITY,cityDataURL} from './city-config.js';
import {installCatalogueCityUI} from './city-ui.js';
installCatalogueCityUI('façades');
const $=id=>document.getElementById(id),number=new Intl.NumberFormat('fr-FR');
try{
 const [catalog,index]=await Promise.all(['catalogue.json','index.json'].map(async file=>{const r=await fetch(cityDataURL(`facades/${file}`));if(!r.ok)throw Error('Catalogue indisponible');return r.json();}));
 $('coverage').textContent=`${number.format(index.stats.texturedBuildings)} bâtiments · ${number.format(index.stats.facades)} faces habillées · ${catalog.sectors.length} secteurs de référence`;
 if(CITY.id==='nice')document.querySelector('.intro').textContent=catalog.method;
 catalog.materials.forEach((material,i)=>{const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),label=document.createElement('span'),count=document.createElement('span');img.src=cityDataURL(`facades/${index.textures[i]}`);img.alt=material.label;img.width=512;img.height=256;img.loading='lazy';label.textContent=`${String(i+1).padStart(2,'0')} · ${material.label}`;count.className='family';count.textContent=`${number.format(index.stats.materialCounts[i])} faces`;caption.append(label,count);figure.append(img,caption);$('catalogue').append(figure);});
 catalog.sectors.forEach(sector=>{const h=document.createElement('h3'),p=document.createElement('p');h.textContent=sector.name;p.textContent=sector.observation+(sector.references.length?` Références : clichés ${sector.references.join(', ')}.`:'');$('sectors').append(h,p);});
}catch(error){$('coverage').textContent='Le catalogue n’a pas pu charger. Rechargez la page.';console.error(error);}
