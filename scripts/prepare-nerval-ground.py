"""Encode generated ground and hedge albedo assets for the local 3D scene."""
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent.parent
source=Path(r'C:\Users\cid77\.codex\generated_images\01a09c22-3922-78d0-8465-12142e7a580c')
assets=[('asphalt','exec-1bb2c4bb-15a4-4879-9363-dd4fb257454e.png'),('grass','exec-e5bad7e4-39a4-4a73-ad0f-a30d091b02d6.png'),('pavers','exec-206e524a-5097-4add-909e-a1794222264f.png')]
for name,file in assets:
    image=Image.open(source/file).convert('RGB')
    image.save(root/f'dist/data/nerval/ground-{name}-v1.webp',quality=90,method=6)
    print(name,image.size)

hedge=Image.open(source/'exec-4270dab5-7e81-4a65-9b2b-a13b4a9a911d.png').convert('RGB')
hedge.save(root/'dist/data/nerval/hedge-albedo-v2.webp',quality=90,method=6)
print('hedge',hedge.size)
