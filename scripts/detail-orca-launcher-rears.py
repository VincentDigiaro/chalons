"""Edit the current native Orca without rebuilding or replacing other parts."""
import bpy
import hashlib
import json
import runpy
import shutil
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts/orca-rear-tubes'
SOURCE = ROOT / 'artifacts/orca-gdi/Orca-GDI.blend'
assert Path(bpy.data.filepath).resolve() == SOURCE
OUT.mkdir(parents=True, exist_ok=True)
backup = OUT / 'before'
assert not backup.exists(), 'Existing backup must not be replaced'
backup.mkdir()
shutil.copy2(SOURCE, backup / SOURCE.name)
shutil.copytree(ROOT / 'dist/data/orca/v1', backup / 'game')
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
scene = bpy.context.scene
scene.frame_set(1)
bpy.context.view_layer.update()
root = bpy.data.objects['ORCA GDI | ensemble']

def fingerprint(obj):
    data = {'matrix': [list(row) for row in obj.matrix_world], 'parent': obj.parent.name if obj.parent else None}
    if obj.type == 'MESH':
        data.update(vertices=[list(v.co) for v in obj.data.vertices], faces=[list(f.vertices) for f in obj.data.polygons], materials=[m.name for m in obj.data.materials])
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

untouched = {obj.name: fingerprint(obj) for obj in root.children_recursive if not obj.name.startswith('Roquettes | bague arriere ')}
added = runpy.run_path(str(ROOT / 'scripts/orca-launcher-rears.py'))['add_launcher_rears']()
assert all(fingerprint(bpy.data.objects[name]) == value for name, value in untouched.items())
assert len(added) == 16
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash, 'Source modified during edit'
root['rear_launcher_tubes'] = 14
root['rear_tube_depth_m'] = .169
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
(OUT / 'edit.json').write_text(json.dumps({'rearTubes': 14, 'perforatedPlates': 2, 'depthMetres': .169, 'preservedObjects': len(untouched), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest()}, indent=2), encoding='utf-8')
print('REAR_TUBES_SAVED', json.dumps({'tubes': 14, 'preserved': len(untouched)}), flush=True)

# Dedicated rear close-up, using the current model and a temporary studio light.
studio = bpy.data.collections['90 | Studio et cameras']
camera_data = bpy.data.cameras.new('Controle tubes arriere')
camera = bpy.data.objects.new('Controle tubes arriere', camera_data)
studio.objects.link(camera)
camera.location = (2.6, 2.6, 1.3)
target = Vector((1.34, -1.18, .88))
camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 1.55
light_data = bpy.data.lights.new('Controle eclairage arriere', 'AREA')
light_data.energy = 110
light_data.size = 2
light = bpy.data.objects.new('Controle eclairage arriere', light_data)
studio.objects.link(light)
light.location = (2.4, 1.5, 2.8)
light.rotation_euler = (target-light.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type != 'CPU'
    scene.cycles.device = 'GPU'
except Exception:
    pass
scene.render.resolution_x = 1200
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.filepath = str(OUT / 'orca-tubes-arriere.png')
bpy.ops.render.render(write_still=True)
print('REAR_PREVIEW_COMPLETE', flush=True)
