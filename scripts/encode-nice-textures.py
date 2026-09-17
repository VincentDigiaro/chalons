"""Resize/encode original ImageGen assets and assemble review sheets; no synthesis."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, hashlib, sys
root=Path('artifacts/nice-textures')
kind=sys.argv[1] if len(sys.argv)>1 else 'facades'
files=sorted((root/kind/'originals').glob('*.png'))
size=(512,256) if kind=='facades' else (512,512)
target=root/'build'/'facades'/'textures' if kind=='facades' else root/'roofs'/'staged'/'textures'
target.mkdir(parents=True,exist_ok=True); (target/'low').mkdir(exist_ok=True)
rows=[]
for file in files:
    original=Image.open(file)
    if 'A' in original.getbands(): assert original.getchannel('A').getextrema()==(255,255), 'Transparent texture: '+file.name
    im=original.convert('RGB')
    detail=im.resize(size,Image.Resampling.LANCZOS)
    low=detail.resize((size[0]//4,size[1]//4),Image.Resampling.LANCZOS)
    detail.save(target/(file.stem+'.webp'),quality=86,method=6)
    low.save(target/'low'/(file.stem+'.webp'),quality=78,method=6)
    for path,expected in [(target/(file.stem+'.webp'),size),(target/'low'/(file.stem+'.webp'),(size[0]//4,size[1]//4))]:
        with Image.open(path) as check: assert check.size==expected
    rows.append({'id':file.stem,'originalSize':im.size,'detailSize':size,'originalSha256':hashlib.sha256(file.read_bytes()).hexdigest()})
w,h=(256,128) if kind=='facades' else (192,192)
cols=4; sheet=Image.new('RGB',(cols*(w+16)+16,((len(files)+cols-1)//cols)*(h+34)+16),'#20242b'); draw=ImageDraw.Draw(sheet)
for i,file in enumerate(files):
    x=16+(i%cols)*(w+16); y=16+(i//cols)*(h+34)
    sheet.paste(Image.open(file).convert('RGB').resize((w,h),Image.Resampling.LANCZOS),(x,y))
    draw.text((x,y+h+5),file.stem,fill='white')
sheet.save(root/(kind+'-contact-sheet.jpg'),quality=92)
(root/(kind+'-encoding.json')).write_text(json.dumps(rows,indent=2))
print(json.dumps({'kind':kind,'count':len(files),'target':str(target)}))
