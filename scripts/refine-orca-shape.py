"""Apply the shape update to the current native asset, preserving other parts."""
import bpy, json, hashlib, shutil, runpy
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT/'artifacts/orca-gdi/Orca-GDI.blend'
OUT = ROOT/'artifacts/orca-shape-refinement'
assert Path(bpy.data.filepath).resolve() == SOURCE
OUT.mkdir(parents=True, exist_ok=True)
backup = OUT/'before'
assert not backup.exists(), 'Do not replace the original backup'
backup.mkdir()
shutil.copy2(SOURCE, backup/SOURCE.name)
shutil.copytree(ROOT/'dist/data/orca/v1', backup/'game')
root = bpy.data.objects['ORCA GDI | ensemble']
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
def fingerprint(obj):
    data = dict(matrix=[list(row) for row in obj.matrix_world], parent=obj.parent.name if obj.parent else None)
    if obj.type == 'MESH':
        data.update(vertices=[list(v.co) for v in obj.data.vertices], faces=[list(p.vertices) for p in obj.data.polygons])
    return hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
protected = {o.name:fingerprint(o) for o in root.children_recursive
             if not any(c.name.startswith(('02 |','03 |')) for c in o.users_collection)
             and not o.name.startswith('Feu de navigation |')}
runpy.run_path(str(ROOT/'scripts/orca-shape.py'))['refine_orca_shape']()
assert all(fingerprint(bpy.data.objects[n]) == h for n,h in protected.items())
for word in ['babord','tribord']:
    for prefix in ['ROTOR | ','Turbine | carenage annulaire ']:
        axis = bpy.data.objects[prefix+word].matrix_world.to_3x3()@Vector((0,0,1))
        assert (axis-Vector((0,0,1))).length < 1e-6
assert len([o for o in root.children_recursive if o.name.startswith('Roquettes | sortie tube arriere ')]) == 14
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
(OUT/'edit.json').write_text(json.dumps(dict(preservedObjects=len(protected),fixedVerticalFans=2,facetedCanopyWidthMetres=1.22,sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest()),indent=2))
print('ORCA_SHAPE_SAVED',len(protected),'other objects preserved',flush=True)

# Render the actual native model from profile and front quarter angles.
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:device.use=device.type!='CPU'
    scene.cycles.device='GPU'
except Exception:pass
scene.render.resolution_x=1400;scene.render.resolution_y=950;scene.render.resolution_percentage=100
for camera,file in [('CAM 02 | profil tribord','profile.png'),('CAM 01 | trois quarts avant','front-quarter.png')]:
    scene.camera=bpy.data.objects[camera]
    scene.render.filepath=str(OUT/file)
    bpy.ops.render.render(write_still=True)
print('ORCA_SHAPE_PREVIEWS_READY',flush=True)
