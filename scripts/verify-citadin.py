from pathlib import Path
import bpy, json, struct
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/citadin_homme'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Citadin_Homme.blend'))
original=bpy.data.collections['CHARACTER • Adrien']
original.hide_render=True
original.hide_viewport=True
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(OUT/'Citadin_Homme.glb'))
imported=[o for o in bpy.data.objects if o not in before]
print('IMPORTED_OBJECTS',[(o.name,o.type) for o in imported],flush=True)
rig=next(o for o in imported if o.type=='ARMATURE')
rig.animation_data.action=next(a for a in bpy.data.actions if a.name.startswith('Idle') and a.name!='Idle')
for t in rig.animation_data.nla_tracks: t.mute=True
scene=bpy.context.scene
scene.frame_set(1)
scene.render.filepath=str(OUT/'controle_export_glb.png')
scene.cycles.samples=24
bpy.ops.render.render(write_still=True)
assert len([o for o in imported if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)])==9
assert len(rig.data.bones)==53
raw=(OUT/'Citadin_Homme.glb').read_bytes()
size=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+size])
assert {a['name'] for a in gltf['animations']}=={'Idle','Walk','Wave'}
assert len(gltf['images'])==10
assert all('bufferView' in i for i in gltf['images'])
assert all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for m in gltf['meshes'] for p in m['primitives'])
(OUT/'validation_export.json').write_text(json.dumps({'roundtrip_blender':True,'embedded_images':10,'skinned_meshes':9,'joints':53,'animations':['Idle','Walk','Wave'],'glb_bytes':len(raw)},indent=2),encoding='utf8')
print('ROUNDTRIP_OK',flush=True)
