import json, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
SOURCE=Path(r'C:\Users\cid77\Documents\ChatGPT\map2\captures-rue-gerard-de-nerval')
OUT=ROOT/'artifacts'/'nerval'
OUT.mkdir(parents=True,exist_ok=True)
origin=[4.3815,48.9475]
scale=[111320*math.cos(math.radians(origin[1])),111320]
def xy(p): return [(p[0]-origin[0])*scale[0],(p[1]-origin[1])*scale[1]]
photos=json.loads((SOURCE/'index.json').read_text(encoding='utf-8-sig'))
lines=json.loads((ROOT/'dist/data/lines.geojson').read_text())['features']
streets=[f for f in lines if 'nerval' in f['properties'].get('name','').lower()]
def dist(p,a,b):
    p,a,b=map(np.array,[p,a,b]); d=b-a;t=np.clip(np.dot(p-a,d)/np.dot(d,d),0,1);return np.linalg.norm(p-a-t*d)
path=[]
for f in streets:
    cs=f['geometry']['coordinates'];path.extend([(xy(a),xy(b)) for a,b in zip(cs,cs[1:])])
features=[]
for f in json.loads((ROOT/'dist/data/buildings.geojson').read_text())['features']:
    if f['geometry']['type']!='Polygon': continue
    ring=[xy(p) for p in f['geometry']['coordinates'][0][:-1]];c=np.mean(ring,axis=0)
    if not (-130<c[0]<100 and -155<c[1]<155):continue
    distance=min(dist(c,a,b) for a,b in path)
    if distance<48:
        features.append(dict(osm_id=f['properties']['osm_id'],properties=f['properties'],ring=ring,center=c.tolist(),distance=round(distance,1)))
features.sort(key=lambda f:f['center'][1],reverse=True)
for i,f in enumerate(features):f['id']=i+1
(OUT/'footprints.json').write_text(json.dumps(dict(origin=origin,scale=scale,buildings=features,photos=photos,streets=streets),ensure_ascii=False,indent=2),encoding='utf8')
im=Image.new('RGB',(1450,1750),'#f6f5ee');d=ImageDraw.Draw(im)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20);small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16)
def pix(p):return (int((p[0]+145)*4.8),int((163-p[1])*4.8))
for a,b in path:d.line([pix(a),pix(b)],fill='#ccd2d4',width=28)
for f in features:
    d.polygon([pix(p) for p in f['ring']],fill='#dad1bf',outline='#6d6656',width=2)
    p=pix(f['center']);d.text(p,str(f['id']),font=font,fill='#172839',anchor='mm')
for f in photos[:-1]:
    p=pix(xy([f['longitude'],f['latitude']]));d.ellipse((p[0]-4,p[1]-4,p[0]+4,p[1]+4),fill='#107db6')
    # group coincident captures into one label
for coord in set((f['longitude'],f['latitude']) for f in photos[:-1]):
    group=[f['id'] for f in photos[:-1] if (f['longitude'],f['latitude'])==coord]
    p=pix(xy(coord));d.text((p[0]+7,p[1]+5),'/'.join(group),font=small,fill='#00669b',stroke_width=1,stroke_fill='white')
d.text((40,35),'Emprises OSM + positions des 27 clichés · N ↑',font=font,fill='#172839')
im.save(OUT/'footprints.png')
cache=ROOT/'.cache/nerval-ign'
if (cache/'index.json').exists():
    info=json.loads((cache/'index.json').read_text());nw=info['nw'];se=info['se'];n=2**info['z']
    ortho=Image.new('RGB',((se[0]-nw[0]+1)*256,(se[1]-nw[1]+1)*256))
    for y in range(nw[1],se[1]+1):
        for x in range(nw[0],se[0]+1):ortho.paste(Image.open(cache/f'{x}-{y}.jpg'),((x-nw[0])*256,(y-nw[1])*256))
    ortho.save(OUT/'ortho.jpg',quality=94)
    def tilepix(p):
        lng=p[0]/scale[0]+origin[0];lat=p[1]/scale[1]+origin[1]
        return (((lng+180)/360*n-nw[0])*256,((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n-nw[1])*256)
    d=ImageDraw.Draw(ortho)
    for f in features:
        d.line([tilepix(p) for p in f['ring']+[f['ring'][0]]],fill='#ffd66b',width=2)
        d.text(tilepix(f['center']),str(f['id']),font=font,fill='white',stroke_width=2,stroke_fill='black',anchor='mm')
    for coord in set((f['longitude'],f['latitude']) for f in photos[:-1]):
        group=[f['id'] for f in photos[:-1] if (f['longitude'],f['latitude'])==coord]
        p=tilepix(xy(coord));d.text(p,'/'.join(group),font=small,fill='#8beaff',stroke_width=2,stroke_fill='black')
    ortho.save(OUT/'ortho-labels.jpg',quality=93)
print(json.dumps([dict(id=f['id'],osm=f['osm_id'],center=[round(x,1) for x in f['center']],distance=f['distance'],address=f['properties'].get('address')) for f in features],ensure_ascii=False))
