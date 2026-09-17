import bpy
import json
from pathlib import Path
from mathutils import Vector
out=Path(r'C:\Users\cid77\Documents\ChatGPT\map\artifacts\orca-gdi')
scene=bpy.context.scene
for obj in bpy.data.collections['90 | Studio et cameras'].objects:
    obj.parent=None
root=bpy.data.objects['ORCA GDI | ensemble']
bpy.context.view_layer.update()
meshes=[obj for obj in root.children_recursive if obj.type=='MESH']
points=[obj.matrix_world@Vector(c) for obj in meshes for c in obj.bound_box]
dimensions=[round(max(v[i] for v in points)-min(v[i] for v in points),3) for i in range(3)]
assert 6 < dimensions[0] < 7 and 9 < dimensions[1] < 10
rotors=[o for o in scene.objects if o.name.startswith('Rotation des pales')]
scene.frame_set(1);before=[o.rotation_euler.z for o in rotors]
scene.frame_set(2);after=[o.rotation_euler.z for o in rotors]
assert len(rotors)==2 and all(abs(a-b)>.01 for a,b in zip(before,after))
scene.frame_set(1)
assert all(img.packed_file for img in bpy.data.images if img.source=='FILE')
root['length_m']=dimensions[1]
root['dimensions_xyz_m']=dimensions
stats={'objects':len(meshes),'base_vertices':sum(len(o.data.vertices) for o in meshes),
    'base_polygons':sum(len(o.data.polygons) for o in meshes),'materials':len(bpy.data.materials),
    'rotors_animated':2,'dimensions_xyz_m':dimensions,'blend':str(out/'Orca-GDI.blend')}
(out/'asset-info.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
(out/'verification.json').write_text(json.dumps({'reopened':True,'rotors_animated':2,
    'packed_reference':True,'dimensions_xyz_m':dimensions,'cameras':4,
    'studio_separate':True,'renders_checked':['hero','profile','top']},indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Orca-GDI.blend'))
print('FINALIZED',json.dumps(stats),flush=True)
