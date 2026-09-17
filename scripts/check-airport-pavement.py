"""Check exported airport triangles for overlaps, holes and runway priority."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.cache/python-roads'))
import numpy as np
from shapely import polygons, union_all, area
from shapely.geometry import shape

folder = ROOT / 'artifacts/nice-runway-priority'
model = ROOT / 'dist/data/cities/nice/nice-pistes'
vertices = np.fromfile(model / 'mesh.bin', dtype='<f4').reshape(-1, 3, 11)
assert np.isfinite(vertices).all()
assert np.abs(vertices[:, :, 2] - .185).max() < 1e-6
assert np.abs(vertices[:, :, 5] - 1).max() < 1e-6
colors = np.rint(vertices[:, 0, 8:11] * 255).astype(int)
groups = {}
report = {}
for name, color in [('runway', [80,89,91]), ('white', [229,228,220]), ('taxiway', [116,121,117]), ('yellow', [213,182,94])]:
    selected = vertices[(colors == color).all(axis=1)]
    triangles = polygons(selected[:, :, :2].astype('f8'))
    geometry = union_all(triangles)
    overlap = float(area(triangles).sum() - geometry.area)
    # Float32 conversion can move a boundary by a fraction of a millimetre.
    assert overlap < .1, (name, overlap)
    groups[name] = geometry
    report[name] = dict(triangles=len(selected), selfOverlapSquareMetres=overlap)
    print(name, report[name], flush=True)
assert sum(v['triangles'] for v in report.values()) == len(vertices)
footprints = {f['properties']['role']:shape(f['geometry']) for f in json.loads((folder / 'footprints.geojson').read_text())['features']}
expected = union_all(list(footprints.values()))
actual = union_all(list(groups.values()))
assert expected.buffer(-.002).difference(actual.buffer(.002)).area < .001, 'Holes in pavement'
assert actual.difference(expected.buffer(.002)).area < .001, 'Export changed road outlines'
secondary = groups['taxiway'].union(groups['yellow'])
inside_runway = secondary.intersection(footprints['runway'].buffer(-.002)).area
assert inside_runway < .001, 'Taxiway or yellow paint drawn over runway'
cross_overlap = max(a.intersection(b).area for i,a in enumerate(groups.values()) for b in list(groups.values())[:i])
assert cross_overlap < .1, cross_overlap

def unrelated(registry):
    registry['models'] = [m for m in registry['models'] if m['id'] != 'nice-pistes']
    registry['walk']['nodes'] = [n for n in registry['walk']['nodes'] if not n[0].startswith('../nice-pistes/')]
    return registry
assert unrelated(json.loads((folder / 'before/custom-models.json').read_text())) == unrelated(json.loads((model.parent / 'custom-models.json').read_text())), 'Unrelated models changed'
result = dict(passed=True, groups=report, crossOverlapSquareMetres=cross_overlap, secondaryInsideRunwaySquareMetres=inside_runway, unrelatedModelsPreserved=True)
(folder / 'verification.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result), flush=True)
