import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
out=ROOT/'artifacts/nerval';out.mkdir(parents=True,exist_ok=True)
s=json.loads((ROOT/'dist/data/nerval/survey.json').read_text(encoding='utf8'))
cards=[]
for p in s['parts']:
 for q in p['patches']:
  im=Image.open(ROOT/f"dist/data/nerval/facades-{q['atlas']}.webp")
  x,y,w,h=[round(v*2048) for v in q['uv']];im=im.crop((x,y,x+w,y+h));im.thumbnail((300,250))
  card=Image.new('RGB',(320,290),'#bebbb2');card.paste(im,((320-im.width)//2,35),im)
  ImageDraw.Draw(card).text((8,8),f"Part {p['id']} / photo {q['photo']} / {q['side']}",fill='black')
  cards.append(card)
for start in range(0,len(cards),12):
 sheet=Image.new('RGB',(1280,870),'white')
 for i,c in enumerate(cards[start:start+12]):sheet.paste(c,((i%4)*320,(i//4)*290))
 sheet.save(out/f'patches-{start//12+1}.jpg')
