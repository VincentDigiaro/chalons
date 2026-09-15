"""Copy generated originals, then technically resize/encode the roof catalogue."""
from pathlib import Path
import json, shutil, math
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
artifacts=root/'artifacts/roofs';originals=artifacts/'originals';target=root/'dist/data/roofs'
originals.mkdir(exist_ok=True);(target/'textures/low').mkdir(parents=True,exist_ok=True)
mapping=json.loads((artifacts/'generated-paths.json').read_text(encoding='utf-8'))
catalog=json.loads((root/'scripts/roof-catalogue.json').read_text(encoding='utf-8'))
for job in mapping:
    path=originals/(job['id']+'.png')
    if not path.exists(): shutil.copy2(job['path'],path)
preview=Image.new('RGB',(1536,math.ceil(len(catalog['materials'])/8)*220),'#eceeea');draw=ImageDraw.Draw(preview)
stats=[]
for i,m in enumerate(catalog['materials']):
    path=originals/(m['id']+'.png')
    if not path.exists(): continue
    image=Image.open(path).convert('RGB')
    for size,folder,quality in [(512,'textures',86),(128,'textures/low',78)]:
        image.resize((size,size),Image.Resampling.LANCZOS).save(target/folder/(m['id']+'.webp'),'WEBP',quality=quality,method=6)
    x,y=(i%8)*192,(i//8)*220
    preview.paste(image.resize((184,184),Image.Resampling.LANCZOS),(x+4,y+4))
    draw.text((x+4,y+194),m['id'],fill='#193232')
    stats.append({'id':m['id'],'originalSize':[image.width,image.height],'detail':[512,512],'overview':[128,128]})
preview.save(target/'catalogue.webp','WEBP',quality=90)
preview.save(artifacts/'preview.jpg',quality=90)
(target/'texture-provenance.json').write_text(json.dumps({'method':'Original material swatches generated with built-in image_gen from aerial appearance references. Technical Lanczos resizing and WebP encoding only.','prompts':'artifacts/roofs/prompts.json','textures':stats},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'textures':len(stats),'detailBytes':sum(p.stat().st_size for p in (target/'textures').glob('*.webp')),'overviewBytes':sum(p.stat().st_size for p in (target/'textures/low').glob('*.webp'))}))
