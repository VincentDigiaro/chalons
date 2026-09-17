"""Convert visually checked orthophoto observations to geographic placements."""
import json, math, hashlib, runpy
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'artifacts/nice-airliners'
obs=json.loads((ROOT/'scripts/nice-airliner-observations.json').read_text())
crops=json.loads((OUT/'crops.json').read_text());crops['far-south']=['south-apron-view',[0,0,1350,1400]]
geo=runpy.run_path(str(ROOT/'scripts/survey-nice-airliners.py'))['geo']
placements=[]
for crop,rows in obs['crops'].items():
    source,box=crops[crop];is_view=source.endswith('-view');name=source.removesuffix('-view')
    metadata=json.loads((OUT/(name+'.json')).read_text())
    scale=[metadata['size'][i]/metadata['viewSize'][i] if is_view else 1 for i in range(2)]
    def project(p):return [(p[i]+box[i])*scale[i]+metadata['pixelOrigin'][i] for i in range(2)]
    image=Image.open(OUT/(source+'.jpg')).crop(box);draw=ImageDraw.Draw(image)
    for j,row in enumerate(rows):
        nose,tail=project(row[:2]),project(row[2:]);ng,tg=geo(*nose,18),geo(*tail,18)
        center=geo(*[(a+b)/2 for a,b in zip(nose,tail)],18)
        dx=(ng[0]-tg[0])*111320*math.cos(math.radians(center[1]));dy=(ng[1]-tg[1])*111320
        length=math.hypot(dx,dy);heading=math.degrees(math.atan2(dx,dy))%360
        assert 7<length<85,(crop,j,length)
        identifier=f'AZ-{len(placements)+1:03}'
        group='terminal2' if crop.startswith('t2') or crop=='far-south' else 'terminal1' if crop.startswith('t1') else 'affaires-nord' if crop=='easta' else 'affaires-sud'
        placements.append(dict(id=identifier,group=group,coordinates=center,headingDegrees=round(heading,3),lengthMetres=round(length,3),evidence=dict(crop=crop,nosePixels=nose,tailPixels=tail,zoom=18,noseCoordinates=ng,tailCoordinates=tg)))
        draw.line(row,fill='#00ff9d',width=2);x,y=row[:2];draw.ellipse((x-3,y-3,x+3,y+3),fill='#00ff9d');draw.text((x+4,y-15),identifier,fill='#00ff9d',stroke_width=1,stroke_fill='black')
    image.save(OUT/(crop+'-survey.jpg'),quality=96)
for i,p in enumerate(placements):
    for q in placements[:i]:
        a,b=p['coordinates'],q['coordinates'];distance=math.hypot((a[0]-b[0])*80500,(a[1]-b[1])*111320)
        assert distance>6,('Duplicate',p['id'],q['id'],distance)
result=dict(version=1,source='IGN ORTHOIMAGERY.ORTHOPHOTOS — local saved airport texture',zoom=18,observationFile='scripts/nice-airliner-observations.json',observationSha256=hashlib.sha256((ROOT/'scripts/nice-airliner-observations.json').read_bytes()).hexdigest(),notes='Positions, axes et longueurs relevés visuellement sur la texture. Un même modèle original est redimensionné ; les types et livrées photographiés ne sont pas reproduits.',placements=placements)
(OUT/'placements.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(placements=len(placements),minLength=min(p['lengthMetres'] for p in placements),maxLength=max(p['lengthMetres'] for p in placements))))
