from pathlib import Path
import bpy, json, math
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/citadin_homme'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Citadin_Homme.blend'))
rig=bpy.data.objects['Adrien_Rig']
scene=bpy.context.scene
meshes=[o for o in bpy.data.collections['CHARACTER • Adrien'].objects if o.type=='MESH']
stats={'height_m':1.8,'bones':len(rig.data.bones),'meshes':[], 'textures':[], 'animations':[]}
for o in meshes:
    missing=[]
    max_influences=0
    for v in o.data.vertices:
        weights=[g.weight for g in v.groups if g.weight>1e-6 and o.vertex_groups[g.group].name in rig.data.bones]
        if not weights or abs(sum(weights)-1)>1e-4: missing.append(v.index)
        max_influences=max(max_influences,len(weights))
    assert not missing,(o.name,'invalid weights',missing[:10])
    assert max_influences<=4
    o.data.calc_loop_triangles()
    stats['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'max_influences':max_influences})
    assert len(o.data.uv_layers)>0,o.name
for img in bpy.data.images:
    if img.source=='FILE':
        assert img.packed_file,img.name
        stats['textures'].append({'name':img.name,'size':list(img.size),'packed':True})
for act in bpy.data.actions:
    stats['animations'].append({'name':act.name,'frames':list(act.frame_range)})
stats['triangles']=sum(m['triangles'] for m in stats['meshes'])

scene.cycles.samples=24
for action,frame,filename in [('Walk',9,'controle_marche.png'),('Wave',41,'controle_articulations.png')]:
    rig.animation_data.action=bpy.data.actions[action]
    scene.frame_set(frame)
    scene.camera.data.ortho_scale=2.55 if action=='Wave' else 2.18
    scene.render.filepath=str(OUT/filename)
    bpy.ops.render.render(write_still=True)
rig.animation_data.action=bpy.data.actions['Idle']
scene.frame_set(1)
scene.camera.data.ortho_scale=2.18

print('GLTF PROPERTIES', [p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties],flush=True)
bpy.ops.object.select_all(action='DESELECT')
for o in [rig]+meshes: o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'Citadin_Homme.glb'),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_skins=True,
    export_morph=False,export_apply=False,export_cameras=False,export_lights=False,
    export_yup=True,export_materials='EXPORT',export_extras=True)
bpy.ops.export_scene.fbx(filepath=str(OUT/'Citadin_Homme.fbx'),use_selection=True,
    object_types={'ARMATURE','MESH'},add_leaf_bones=False,path_mode='COPY',embed_textures=True,
    bake_anim=True,bake_anim_use_nla_strips=False,bake_anim_use_all_actions=True,
    axis_forward='-Z',axis_up='Y')
scene.render.filepath=str(OUT/'apercu.png')
scene.cycles.samples=32
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Citadin_Homme.blend'))
(OUT/'validation.json').write_text(json.dumps(stats,indent=2),encoding='utf8')
print('CITADIN: EXPORTED',json.dumps(stats),flush=True)
