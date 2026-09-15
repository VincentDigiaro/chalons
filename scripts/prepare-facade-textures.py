"""Resize/encode the generated originals for WebGL; no photographic reconstruction.
Usage: python scripts/prepare-facade-textures.py PATH_TO_GENERATED_ASSETS
"""
from pathlib import Path
import json
import sys
import math
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]).resolve()
target = root / 'dist/data/facades'
catalog = json.loads((root / 'scripts/facade-catalogue.json').read_text(encoding='utf-8'))
(target / 'textures/low').mkdir(parents=True, exist_ok=True)
preview = Image.new('RGB', (1536, math.ceil(len(catalog['materials']) / 6) * 160), '#eef0ed')
draw = ImageDraw.Draw(preview)
stats = []
provenance_file = target / 'texture-provenance.json'
previous = {m['id']: m for m in json.loads(provenance_file.read_text(encoding='utf-8'))['textures']} if provenance_file.exists() else {}
for i, material in enumerate(catalog['materials']):
    original = source / (material['id'] + '.png')
    if original.exists():
        image = Image.open(original).convert('RGB')
        for width, height, directory, quality in [(512, 256, 'textures', 86), (128, 64, 'textures/low', 78)]:
            out = target / directory / (material['id'] + '.webp')
            image.resize((width, height), Image.Resampling.LANCZOS).save(out, 'WEBP', quality=quality, method=6)
        stats.append({'id':material['id'], 'original':[image.width,image.height], 'detail':[512,256], 'overview':[128,64]})
    else:
        # Adding a catalogue batch must not re-encode existing textures.
        image = Image.open(target / 'textures' / (material['id'] + '.webp')).convert('RGB')
        assert (target / 'textures/low' / (material['id'] + '.webp')).exists()
        stats.append(previous[material['id']])
    x, y = (i % 6) * 256, (i // 6) * 160
    preview.paste(image.resize((248, 124), Image.Resampling.LANCZOS), (x + 4, y + 4))
    draw.text((x + 6, y + 136), material['id'], fill='#253f3d')
preview.save(target / 'catalogue.webp', 'WEBP', quality=90)
provenance_file.write_text(json.dumps({'method':'OpenAI built-in image_gen; original facade modules inspired by the provided sector views. Technical Lanczos resizing and WebP encoding only.','promptFiles':['artifacts/facades/generation-prompts.json','artifacts/facades48/prompts.json'],'textures':stats},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'textures':len(stats),'detailBytes':sum(p.stat().st_size for p in (target/'textures').glob('*.webp')),'overviewBytes':sum(p.stat().st_size for p in (target/'textures/low').glob('*.webp'))}))
