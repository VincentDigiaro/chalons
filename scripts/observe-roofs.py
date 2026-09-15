"""Coarse roof colour evidence from already saved IGN photographs; no downloads."""
from pathlib import Path
from functools import lru_cache
import json, math, colorsys
import numpy as np
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/roofs'
out.mkdir(parents=True,exist_ok=True)
data=json.loads((root/'dist/data/buildings.geojson').read_text(encoding='utf-8'))
excluded=set(json.loads((root/'dist/data/nerval/index.json').read_text(encoding='utf-8'))['excludeIds'])
def xy(p,z):
    return ((p[0]+180)/360*2**z,(1-math.asinh(math.tan(math.radians(p[1])))/math.pi)/2*2**z)
@lru_cache(maxsize=256)
def tile(z,x,y):
    p=root/f'dist/data/imagery/ign/{z}/{x}/{y}.jpg'
    if not p.exists(): return None
    try: return Image.open(p).convert('RGB')
    except OSError: return None
def inside(p,ring):
    result=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]: result=not result
    return result
evidence={}
for f in data['features']:
    id=f['properties']['osm_id']
    if id in excluded: continue
    polys=[f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']
    points=[p for rings in polys for p in rings[0]]
    w,s,e,n=min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)
    samples=[]
    for i in range(5):
        for j in range(5):
            p=[w+(e-w)*(i+.5)/5,s+(n-s)*(j+.5)/5]
            if any(inside(p,rings[0]) and not any(inside(p,hole) for hole in rings[1:]) for rings in polys): samples.append(p)
    if not samples: samples=[[(w+e)/2,(s+n)/2]]
    for z in [19,17]:
        pixels={}
        for p in samples:
            x,y=xy(p,z);tx,ty=math.floor(x),math.floor(y);im=tile(z,tx,ty)
            if im is None: continue
            px,py=min(im.width-1,int((x-tx)*im.width)),min(im.height-1,int((y-ty)*im.height))
            pixels[(tx,ty,px,py)]=im.getpixel((px,py))
        if len(pixels)<3 and z==19: continue
        if not pixels: continue
        rgb=np.array(list(pixels.values()),dtype=float)
        green=(rgb[:,1]>rgb[:,0]*1.15)&(rgb[:,1]>rgb[:,2]*1.1)
        clean=rgb[~green]
        if len(clean)<2: clean=rgb
        brightness=clean.max(axis=1)
        keep=clean[(brightness>=np.percentile(brightness,30))&(brightness<=np.percentile(brightness,90))]
        if not len(keep): keep=clean
        colour=np.rint(np.median(keep,axis=0)).astype(int).tolist()
        evidence[id]={'rgb':colour,'zoom':z,'samples':len(pixels),'vegetationFraction':round(float(green.mean()),2)}
        break
sectors=json.loads((root/'scripts/facade-catalogue.json').read_text(encoding='utf-8'))['sectors']
preview=Image.new('RGB',(1500,620),'#e7e7e3');draw=ImageDraw.Draw(preview)
for i,sector in enumerate(sectors):
    x,y=xy(sector['center'],17);im=tile(17,math.floor(x),math.floor(y))
    if im is not None: preview.paste(im.resize((292,280),Image.Resampling.LANCZOS),((i%5)*300+4,(i//5)*310+4))
    draw.text(((i%5)*300+5,(i//5)*310+289),sector['name'],fill='#203030')
preview.save(out/'aerial-reference.jpg',quality=90)
result={'method':'Median interior samples of cached IGN aerial images; vegetation and extreme light/shadow partly filtered. Coarse appearance only. No photo pixels used as final textures.','source':'dist/data/imagery/ign','buildings':evidence}
(out/'observations.json').write_text(json.dumps(result,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
print(json.dumps({'buildingsWithPhotoEvidence':len(evidence),'excludedNerval':len(excluded),'zoomCounts':{z:sum(e['zoom']==z for e in evidence.values()) for z in [17,19]}}))
