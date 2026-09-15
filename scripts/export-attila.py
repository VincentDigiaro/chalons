"""Blender background export and reproducible visual review (no UI automation)."""
import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]; data=root/'dist/data/attila'; art=root/'artifacts/attila'
j=json.loads((data/'index.json').read_text(encoding='utf8')); a=np.fromfile(data/'mesh.bin',dtype='<f4').reshape(-1,11)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
mats=[]
for m in j['materials']:
 mat=bpy.data.materials.new(m['name']);mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.8
 attr=nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
 if 'texture' in m:
  tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(data/j['textures'][m['texture']]));tex.extension='REPEAT';tex.image.pack()
  mult=nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;links.new(attr.outputs['Color'],mult.inputs[1]);links.new(tex.outputs['Color'],mult.inputs[2]);links.new(mult.outputs[0],bs.inputs['Base Color'])
 else:links.new(attr.outputs['Color'],bs.inputs['Base Color'])
 if m['kind']==12:bs.inputs['Roughness'].default_value=.23;bs.inputs['Metallic'].default_value=.25
 mats.append(mat)
for part in [None]+[p['id'] for p in j['parts']]:
 ranges=[r for r in j['objectRanges'] if r['part']==part];chunks=[a[r['first']:r['first']+r['count']] for r in ranges];ar=np.concatenate(chunks);name=next((p['label'] for p in j['parts'] if p['id']==part),'Rue, clôtures et jardins')
 me=bpy.data.meshes.new(name);me.from_pydata(ar[:,:3].tolist(),[],np.arange(len(ar)).reshape(-1,3).tolist());me.update();obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj)
 uv=me.uv_layers.new(name='UVMap');uv.data.foreach_set('uv',ar[:,6:8].ravel());col=me.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER');rgba=np.ones((len(ar),4));rgba[:,:3]=np.maximum(ar[:,8:11],0)**2.2;col.data.foreach_set('color',rgba.ravel())
 for mat in mats:me.materials.append(mat)
 mi=[]
 for r in ranges:mi.extend([r['material']]*(r['count']//3))
 me.polygons.foreach_set('material_index',mi)
 obj['survey_id']=part or 0;obj['origin_WGS84']=j['origin'];obj['axes']='X east, Y north, Z up; metres';obj['height_accuracy']='visual estimate, not measured'
 if part:
  p=next(p for p in j['parts'] if p['id']==part);obj['osm_id']=p['osmId'];obj['references']=','.join(p['refs']);obj['confidence']=p.get('confidence','Inferred rear volume')
 # Consistent normals for physical lighting and interchange.
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)
# Portable GLB is exported by export-attila-glb.mjs, preserving all vertex colors.
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.world.color=(.6,.65,.7);scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.65,.72,.85,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN',location=(-60,-40,80));sun=bpy.context.object;sun.rotation_euler=(.45,-.4,-.8);sun.data.energy=2;sun.data.angle=.15
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=125
scene.render.resolution_x=1800;scene.render.resolution_y=1150;scene.render.resolution_percentage=100;scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
def render(name,eye,target,scale):
 cam.location=eye;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;scene.render.filepath=str(art/name);bpy.ops.render.render(write_still=True)
render('modele-vue-ensemble.png',(65,-105,85),(-6,5,0),125)
render('modele-facades-nord.png',(64,-105,48),(-12,15,4),73)
render('modele-arriere-72-78.png',(10,-55,29),(-8,-15,4),53)
bpy.ops.wm.save_as_mainfile(filepath=str(art/'camp-attila.blend'))
print('EXPORT_ATTILA_OK')
