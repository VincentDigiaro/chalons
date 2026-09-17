from pathlib import Path
from PIL import Image, ImageDraw
root=Path('artifacts/nice-textures/qa')
for label,pattern in [('desktop-fps','desktop-fps-*.png'),('mobile','mobile-map-fps-*.png')]:
    files=sorted(root.glob(pattern)); w,h=(640,360) if label=='desktop-fps' else (632,450)
    sheet=Image.new('RGB',(2*w,((len(files)+1)//2)*(h+26)),'#20242b'); draw=ImageDraw.Draw(sheet)
    for i,file in enumerate(files):
        im=Image.open(file).convert('RGB'); im.thumbnail((w,h)); x=i%2*w;y=i//2*(h+26)
        sheet.paste(im,(x,y));draw.text((x+5,y+h+5),file.stem,fill='white')
    sheet.save(root/(label+'-contact-sheet.jpg'),quality=90)
    print(label,len(files))
