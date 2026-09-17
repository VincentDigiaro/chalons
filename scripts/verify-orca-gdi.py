import bpy
import json
from pathlib import Path
from mathutils import Vector

out=Path(r'C:\Users\cid77\Documents\ChatGPT\map\artifacts\orca-gdi')
scene=bpy.context.scene
rotors=[o for o in scene.objects if o.name.startswith('Rotation des pales')]
assert len(rotors)==2
scene.frame_set(1)
before=[o.rotation_euler.z for o in rotors]
scene.frame_set(2)
after=[o.rotation_euler.z for o in rotors]
assert all(abs(a-b)>.01 for a,b in zip(before,after)), 'Rotor animation missing'
scene.frame_set(1)
assert all(img.packed_file for img in bpy.data.images if img.source=='FILE'), 'Unpacked image'
root=bpy.data.objects['ORCA GDI | ensemble']
points=[]
for obj in root.children_recursive:
    if obj.type=='MESH':
        points.extend(obj.matrix_world@Vector(v) for v in obj.bound_box)
extent=[max(v[i] for v in points)-min(v[i] for v in points) for i in range(3)]
result={'reopened':True,'rotors_animated':2,'packed_reference':True,
    'dimensions_xyz_m':[round(x,3) for x in extent],
    'cameras':len([o for o in scene.objects if o.type=='CAMERA'])}
(out/'verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('VERIFIED',json.dumps(result),flush=True)
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX';prefs.get_devices()
for d in prefs.devices:d.use=d.type!='CPU'
scene.cycles.device='GPU';scene.cycles.samples=48
scene.render.resolution_x=1400;scene.render.resolution_y=900
scene.camera=bpy.data.objects['CAM 02 | profil tribord']
scene.render.filepath=str(out/'orca-gdi-profile.png')
bpy.ops.render.render(write_still=True)
scene.camera=bpy.data.objects['CAM 03 | dessus']
scene.render.resolution_x=1000;scene.render.resolution_y=1250
scene.render.filepath=str(out/'orca-gdi-top.png')
bpy.ops.render.render(write_still=True)
print('QA_RENDERS_COMPLETE',flush=True)
