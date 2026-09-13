"""Resize/encode the generated originals for WebGL; no photographic reconstruction.
Usage: python scripts/prepare-facade-textures.py PATH_TO_GENERATED_ASSETS
"""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]).resolve()
target = root / 'dist/data/facades'
catalog = json.loads((root / 'scripts/facade-catalogue.json').read_text(encoding='utf-8'))
(target / 'textures/low').mkdir(parents=True, exist_ok=True)
preview = Image.new('RGB', (1280, 880), '#eef0ed')
draw = ImageDraw.Draw(preview)
stats = []
for i, material in enumerate(catalog['materials']):
    image = Image.open(source / (material['id'] + '.png')).convert('RGB')
    for width, height, directory, quality in [(512, 256, 'textures', 86), (128, 64, 'textures/low', 78)]:
        out = target / directory / (material['id'] + '.webp')
        image.resize((width, height), Image.Resampling.LANCZOS).save(out, 'WEBP', quality=quality, method=6)
    x, y = (i % 4) * 320, (i // 4) * 220
    preview.paste(image.resize((312, 184), Image.Resampling.LANCZOS), (x + 4, y + 4))
    draw.text((x + 8, y + 194), material['id'], fill='#253f3d')
    stats.append({'id':material['id'], 'original':[image.width,image.height], 'detail':[512,256], 'overview':[128,64]})
preview.save(target / 'catalogue.webp', 'WEBP', quality=90)
prompts = json.loads((source / 'prompts.json').read_text(encoding='utf-8'))
(root / 'artifacts/facades').mkdir(parents=True, exist_ok=True)
(root / 'artifacts/facades/generation-prompts.json').write_text(json.dumps(prompts, ensure_ascii=False, indent=2), encoding='utf-8')
(target / 'texture-provenance.json').write_text(json.dumps({'method':'OpenAI built-in image_gen; original facade modules inspired by the provided sector views. Technical Lanczos resizing and WebP encoding only.','textures':stats},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'textures':len(stats),'detailBytes':sum(p.stat().st_size for p in (target/'textures').glob('*.webp')),'overviewBytes':sum(p.stat().st_size for p in (target/'textures/low').glob('*.webp'))}))
