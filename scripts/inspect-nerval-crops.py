from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent.parent
for ident,box in [('03r',(690,80,960,230)),('03',(0,200,460,460)),('03g',(1260,140,1385,290)),('27',(1320,205,1600,450)),('26',(1030,0,1410,240)),('24',(735,40,1100,280))]:
 im=Image.open(root/f'dist/data/nerval/references/{ident[:2]}.webp').convert('RGB');d=ImageDraw.Draw(im)
 for x in range((box[0]//25)*25,box[2],25):
  d.line((x,box[1],x,box[3]),fill='#ff7070',width=1);d.text((x+2,box[1]+2),str(x),fill='red')
 for y in range((box[1]//25)*25,box[3],25):
  d.line((box[0],y,box[2],y),fill='#ff7070',width=1);d.text((box[0]+1,y+1),str(y),fill='red')
 im=im.crop(box);im.resize((im.width*3,im.height*3)).save(root/f'artifacts/nerval/crop-{ident}.png')
