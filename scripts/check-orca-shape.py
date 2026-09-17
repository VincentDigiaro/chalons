"""Verify stationary nacelles, animated blades and the compact canopy."""
import bpy, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parent.parent
scene = bpy.context.scene
root = bpy.data.objects['ORCA GDI | ensemble']
assert not any(o.name.startswith(('Articulation turbine |','Verin turbine |','Tige verin |')) for o in root.children_recursive)
scene.frame_set(1);bpy.context.view_layer.update()
static = {o.name:o.matrix_world.copy() for o in root.children if o.name.startswith(('Turbine |','ROTOR |','Support fixe turbine |'))}
spin = {word:bpy.data.objects['Rotation des pales | '+word].rotation_euler.z for word in ['babord','tribord']}
scene.frame_set(21);bpy.context.view_layer.update()
for name, matrix in static.items():
    assert max(abs(x-y) for a,b in zip(matrix,bpy.data.objects[name].matrix_world) for x,y in zip(a,b)) < 1e-6, name
for word in spin:
    obj = bpy.data.objects['Rotation des pales | '+word]
    assert abs(obj.rotation_euler.z-spin[word]) > .1
    assert (obj.matrix_world.to_3x3()@Vector((0,0,1))-Vector((0,0,1))).length < 1e-6
    duct = bpy.data.objects['Turbine | carenage annulaire '+word]
    assert (duct.matrix_world.to_3x3()@Vector((0,0,1))-Vector((0,0,1))).length < 1e-6
canopy = bpy.data.objects['Verriere | vitrage facette']
assert not any(m.type == 'SUBSURF' for m in canopy.modifiers)
assert not any(p.use_smooth for p in canopy.data.polygons)
points = [canopy.matrix_world@v.co for v in canopy.data.vertices]
assert max(p.x for p in points)-min(p.x for p in points) <= 1.221
assert max(p.z for p in points) <= 2.941
index = json.loads((ROOT/'dist/data/orca/v1/index.json').read_text(encoding='utf-8'))
for rotor in index['rotors'].values():
    assert (Vector(rotor['axis'])-Vector((0,0,1))).length < 1e-6
assert set(r['part'] for r in index['ranges']) == {'Hull','PropL','PropR'}
assert len([o for o in root.children_recursive if o.name.startswith('Roquettes | sortie tube arriere ')]) == 14
result = dict(passed=True,fixedVerticalNacelles=2,animatedBladeGroups=2,angularCanopy=True,canopyWidthMetres=1.22,rearMissileTubes=14)
(ROOT/'artifacts/orca-shape-refinement/verification.json').write_text(json.dumps(result,indent=2))
print('ORCA_SHAPE_VERIFIED',json.dumps(result),flush=True)
