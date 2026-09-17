"""Verify all fourteen recessed rear tubes in native and game-LOD geometry."""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
root = bpy.data.objects['ORCA GDI | ensemble']
assert not any(obj.name.startswith(('Train |', 'Canon |')) for obj in root.children_recursive)
rear_tubes = [o for o in root.children_recursive if o.name.startswith('Roquettes | sortie tube arriere ')]
assert len(rear_tubes) == 14
holes = [(0, 0)] + [(.20 * math.cos(i * math.tau / 6), .20 * math.sin(i * math.tau / 6)) for i in range(6)]

def tree(obj, deps):
    evaluated = obj.evaluated_get(deps)
    data = evaluated.to_mesh()
    result = BVHTree.FromPolygons([evaluated.matrix_world @ v.co for v in data.vertices], [list(f.vertices) for f in data.polygons])
    evaluated.to_mesh_clear()
    return result

samples, bevels, decimators = 0, [], []
for mode in ['native', 'game-lod']:
    if mode == 'game-lod':
        for obj in root.children_recursive:
            if not obj.name.startswith('Roquettes |'):
                continue
            for modifier in obj.modifiers:
                if modifier.type == 'BEVEL':
                    bevels.append((modifier, modifier.segments))
                    modifier.segments = 1
            modifier = obj.modifiers.new('Game LOD check', 'DECIMATE')
            modifier.ratio = float(obj.get('game_lod_ratio', .48))
            modifier.use_collapse_triangulate = True
            decimators.append((obj, modifier))
        bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    for side, x in [('babord', -1.34), ('tribord', 1.34)]:
        body = tree(bpy.data.objects['Roquettes | corps ' + side], deps)
        collar = tree(bpy.data.objects['Roquettes | bague arriere ' + side], deps)
        plate = tree(bpy.data.objects['Roquettes | plaque arriere percee ' + side], deps)
        direction = Vector((0, -1, 0))
        for j, (dx, dz) in enumerate(holes):
            origin = Vector((x + dx, -.8, .85 + dz))
            assert collar.ray_cast(origin, direction)[0] is None, (mode, side, j, 'Collar covers tube')
            assert plate.ray_cast(origin, direction)[0] is None, (mode, side, j, 'Plate covers tube')
            shell = body.ray_cast(origin, direction)[0]
            assert shell is None or shell.y < -1.7, (mode, side, j, 'Old body cap remains')
            tube = tree(bpy.data.objects['Roquettes | sortie tube arriere %s %02d' % (side, j)], deps)
            inside = tube.ray_cast(origin, direction)[0]
            assert inside is not None and abs(inside.y + 1.277) < .0001, (mode, side, j, 'Missing inset bottom')
            rim = tube.ray_cast(origin + Vector((.065, 0, 0)), direction)[0]
            assert rim is not None and abs(rim.y + 1.108) < .0001, (mode, side, j, 'Missing lip')
            assert rim.y - inside.y > .16, (mode, side, j, 'Tube is flat')
            samples += 5
        panel = plate.ray_cast(Vector((x + .1, -.8, .94)), direction)[0]
        assert panel is not None and abs(panel.y + 1.162) < .0001, (mode, side, 'Missing backing plate between tubes')
        samples += 1

for obj, modifier in decimators:
    obj.modifiers.remove(modifier)
for modifier, segments in bevels:
    modifier.segments = segments
bpy.context.view_layer.update()
result = {'raySamples': samples, 'rearTubes': 14, 'perforatedRearPlates': 2, 'insetDepthMetres': .169, 'nativeAndGameLod': True, 'duplicateRearSurfaces': False}
out = ROOT / 'artifacts/orca-rear-tubes'
out.mkdir(parents=True, exist_ok=True)
(out / 'geometry-validation.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
info_path = ROOT / 'artifacts/orca-gdi/asset-info.json'
info = json.loads(info_path.read_text(encoding='utf-8'))
meshes = [o for o in root.children_recursive if o.type == 'MESH']
info.update(objects=len(meshes), base_vertices=sum(len(o.data.vertices) for o in meshes), base_polygons=sum(len(o.data.polygons) for o in meshes), rear_launcher_tubes=14)
info_path.write_text(json.dumps(info, indent=2), encoding='utf-8')
print('ORCA_POD_GEOMETRY_OK', json.dumps(result), flush=True)
