import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
raw=json.loads((root/'.cache/osm.json').read_text(encoding='utf-8'))
tags={f"{e['type']}/{e['id']}":e.get('tags',{}) for e in raw['elements']}
data=json.loads((root/'artifacts/attila/footprints-area.geojson').read_text())
origin=[4.3728,48.9651];scale=[111320*math.cos(math.radians(origin[1])),111320]
xy=lambda p: [(p[i]-origin[i])*scale[i] for i in range(2)]
im=Image.new('RGB',(1500,1150),'#faf8ee');d=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
pix=lambda p: (750+xy(p)[0]*10,660-xy(p)[1]*10)
lines=json.loads((root/'dist/data/lines.geojson').read_text())
for f in lines['features']:
 if f['properties']['name'] in ["Rue du Camp d'Attila",'Rue des Francs']:
  q=[pix(p) for p in f['geometry']['coordinates']];d.line(q,fill='#c7c4bc',width=60)
for i,f in enumerate(data['features']):
 f['properties']['survey_id']=i+1
 f['properties']['address']=tags.get(f['properties']['osm_id'],{}).get('addr:housenumber')
 ring=f['geometry']['coordinates'][0];q=[pix(p) for p in ring]
 d.polygon(q,fill='#cedcd2',outline='#34574b',width=2)
 c=tuple(sum(p[j] for p in q[:-1])/len(q[:-1]) for j in range(2))
 label=str(i+1)+((' / '+f['properties']['address']) if f['properties']['address'] else '')
 d.text(c,label,font=font,fill='#102e26',anchor='mm')
for no,p in [('P01',[4.372708,48.9651469])]:
 x,y=pix(p);d.ellipse((x-7,y-7,x+7,y+7),fill='#e45b32');d.text((x+10,y-20),no,font=font,fill='#ad3010')
d.text((25,20),'Camp d’Attila — repères internes / numéros OSM — nord en haut',font=font,fill='#173d33')
im.save(root/'artifacts/attila/footprints-map.png')
(root/'artifacts/attila/footprints-area.geojson').write_text(json.dumps(data),encoding='utf-8')
print(json.dumps([{'id':f['properties']['survey_id'],'osm':f['properties']['osm_id'],'address':f['properties']['address'],'center':[sum(p[j] for p in f['geometry']['coordinates'][0][:-1])/(len(f['geometry']['coordinates'][0])-1) for j in range(2)]} for f in data['features']],indent=2))
