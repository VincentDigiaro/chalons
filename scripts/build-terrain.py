"""Build the bundled IGN terrain (requires Pillow and NumPy).

python scripts/build-terrain.py [path/to/terrain-ign.tif]
Without an argument, download the public RGE ALTI raster first.
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
URL = ('https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
       '&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES=normal'
       '&FORMAT=image/geotiff&CRS=EPSG:4326&BBOX=48.80,4.15,49.125,4.57'
       '&WIDTH=1229&HEIGHT=1448')
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.cache/terrain-ign.tif'
if len(sys.argv) == 1:
    source.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(URL, timeout=120) as response:
        source.write_bytes(response.read())
with Image.open(source) as image:
    data = np.asarray(image, dtype=np.float32)
    dx, dy, _ = image.tag_v2[33550]
    west, north = image.tag_v2[33922][3:5]
if data.shape != (1448, 1229) or not np.isfinite(data).all() or data.min() < 0 or data.max() > 320:
    raise ValueError('Raster IGN incomplet ou altitudes invalides pour Châlons')
height, width = data.shape
# GeoTIFF values are at pixel centres, north to south. Keep centimetres.
bounds = [west + dx / 2, north - dy * (height - .5), west + dx * (width - .5), north - dy / 2]
x, y = (4.379995 - bounds[0]) / dx, (bounds[3] - 48.946464) / dy
ix, iy = int(x), int(y)
reference = float((1-y+iy)*((1-x+ix)*data[iy,ix]+(x-ix)*data[iy,ix+1]) + (y-iy)*((1-x+ix)*data[iy+1,ix]+(x-ix)*data[iy+1,ix+1]))
output = ROOT / 'dist/data/terrain'
output.mkdir(parents=True, exist_ok=True)
(output / 'elevations.bin').write_bytes(np.round(data * 100).astype('<i2').tobytes())
metadata = dict(version=1, width=width, height=height, bounds=bounds,
                encoding='int16-le-centimetres', file='elevations.bin',
                referenceAltitude=round(reference, 2), resolutionMetres=25,
                minAltitude=round(float(data.min()), 2), maxAltitude=round(float(data.max()), 2),
                source='IGN RGE ALTI', license='Licence Ouverte 2.0', sourceURL=URL,
                acquiredAt=datetime.now(timezone.utc).isoformat())
(output / 'index.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Relief IGN : {width} × {height}, {data.min():.2f}–{data.max():.2f} m ; référence {reference:.2f} m')
