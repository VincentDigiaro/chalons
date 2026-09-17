"""Assemble local IGN tiles for placement inspection; originals stay untouched."""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'artifacts/nice-airliners'
OUT.mkdir(parents=True, exist_ok=True)
def pixel(lon, lat, z):
    size = 256*2**z
    return ((lon+180)/360*size, (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*size)
def geo(x,y,z):
    size=256*2**z
    return [x/size*360-180, math.degrees(math.atan(math.sinh(math.pi*(1-2*y/size))))]
def mosaic(name,bounds,z=18,display=1800):
    w,s,e,n=bounds
    x0,y0=map(math.floor,pixel(w,n,z)); x1,y1=map(math.ceil,pixel(e,s,z))
    image=Image.new('RGB',(x1-x0,y1-y0),(50,20,50)); missing=[]
    for tx in range(x0//256,x1//256+1):
        for ty in range(y0//256,y1//256+1):
            file=ROOT/f'dist/data/cities/nice/imagery/ign/{z}/{tx}/{ty}.jpg'
            if not file.exists(): missing.append([z,tx,ty]);continue
            with Image.open(file) as tile:image.paste(tile, (tx*256-x0,ty*256-y0))
    image.save(OUT/(name+'.jpg'),quality=96)
    view=image.copy(); view.thumbnail((display,display))
    view.save(OUT/(name+'-view.jpg'),quality=96)
    metadata=dict(zoom=z,pixelOrigin=[x0,y0],size=list(image.size),viewSize=list(view.size),bounds=bounds,missing=missing)
    (OUT/(name+'.json')).write_text(json.dumps(metadata,indent=2))
    print(name,json.dumps(metadata))
    return image,metadata
if __name__=='__main__':
    mosaic('airport',[7.184,43.643,7.232,43.673],17,2000)
    mosaic('terminal2',[7.201,43.653,7.210,43.663],18,1800)
    mosaic('terminal1',[7.208,43.660,7.219,43.670],18,1800)
    mosaic('east-apron',[7.217,43.667,7.235,43.680],18,1800)
    mosaic('connector',[7.216,43.665,7.224,43.669],18,1400)
    mosaic('south-apron',[7.200,43.6475,7.208,43.6535],18,1400)
    mosaic('airport-wide',[7.182,43.638,7.235,43.678],16,1800)
    crops={
        't2a':['terminal2-view',[0,0,1172,900]],
        't2b':['terminal2-view',[0,900,1172,1800]],
        't1a':['terminal1-view',[0,550,1433,1450]],
        't1b':['terminal1-view',[0,1450,1433,1800]],
        'easta':['east-apron',[1450,1750,2350,2600]],
        'eastb':['east-apron',[650,2550,1550,3351]],
        'eastmid':['east-apron',[900,2200,1800,3050]],
        'south':['connector-view',[0,0,1400,968]],
    }
    (OUT/'crops.json').write_text(json.dumps(crops,indent=2))
