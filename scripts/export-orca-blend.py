"""Bake the supplied Orca into the game's existing 44-byte vertex format.

Source is untouched; static meshes are batched, the two turbine axes are kept.
"""
import bpy, json, math, struct, gzip, hashlib
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parent.parent
SOURCE=Path(bpy.data.filepath).resolve()
OUT=ROOT/'dist/data/orca/v1'
OUT.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
scene=bpy.context.scene
scene.frame_set(1)
root=bpy.data.objects['ORCA GDI | ensemble']
sources=[o for o in root.children_recursive if o.type in {'MESH','CURVE','FONT'} and not o.hide_render]
# Keep the native asset detailed; reduce only this disposable game export.
for obj in sources:
    for modifier in obj.modifiers:
        if modifier.type=='BEVEL':modifier.segments=1
        elif modifier.type=='SUBSURF':modifier.levels=1;modifier.render_levels=1
    if obj.type=='MESH':
        decimate=obj.modifiers.new('Game LOD','DECIMATE');decimate.ratio=float(obj.get('game_lod_ratio', .48))
        decimate.use_collapse_triangulate=True
    elif obj.type=='CURVE':obj.data.bevel_resolution=1;obj.data.resolution_u=6
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
positions,faces,normals,face_mats,face_parts=[],[],[],[],[]
materials=[];material_ids={};objects=[]
part_objects={}

for obj in sources:
    parent=obj;part='Hull'
    while parent:
        if parent.name.startswith('Rotation des pales'):
            part='PropL' if 'babord' in parent.name else 'PropR';part_objects[part]=parent;break
        parent=parent.parent
    evaluated=obj.evaluated_get(deps)
    data=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    if not data:continue
    offset=len(positions);nm=evaluated.matrix_world.to_3x3().inverted().transposed()
    positions.extend(tuple(evaluated.matrix_world@v.co) for v in data.vertices)
    normals.extend(tuple((nm@data.corner_normals[i].vector).normalized()) for i in range(len(data.loops)))
    for poly in data.polygons:
        faces.append(tuple(offset+i for i in poly.vertices));face_parts.append(part)
        mat=data.materials[poly.material_index]
        if mat.name not in material_ids:material_ids[mat.name]=len(materials);materials.append(mat)
        face_mats.append(material_ids[mat.name])
    objects.append({'name':obj.name,'part':part,'polygons':len(data.polygons)})
    evaluated.to_mesh_clear()

data=bpy.data.meshes.new('Orca | optimized bake mesh');data.from_pydata(positions,[],faces);data.update()
for mat in materials:data.materials.append(mat)
for poly,mid in zip(data.polygons,face_mats):poly.material_index=mid;poly.use_smooth=True
data.normals_split_custom_set(normals)
model=bpy.data.objects.new('Orca | game export',data);scene.collection.objects.link(model)
for obj in list(scene.objects):
    if obj!=model:obj.hide_render=True;obj.hide_set(True)
bpy.ops.object.select_all(action='DESELECT');model.select_set(True);bpy.context.view_layer.objects.active=model
data.uv_layers.new(name='Game atlas')
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(68),island_margin=.0015,area_weight=.7)
bpy.ops.object.mode_set(mode='OBJECT')
print('UV_READY',len(data.vertices),len(data.polygons),flush=True)

image=bpy.data.images.new('Orca | baked colors',width=2048,height=2048,alpha=False)
for mat in materials:
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    p=nodes.get('Principled BSDF');output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    emission=nodes.new('ShaderNodeEmission');emission.inputs['Strength'].default_value=1
    if mat.name.startswith('Verriere'):
        # The game's opaque mesh pass uses a smoked reflective canopy finish.
        emission.inputs['Color'].default_value=(.045,.12,.16,1)
    elif p.inputs['Base Color'].is_linked:links.new(p.inputs['Base Color'].links[0].from_socket,emission.inputs['Color'])
    else:emission.inputs['Color'].default_value=p.inputs['Base Color'].default_value
    links.new(emission.outputs[0],output.inputs['Surface'])
    target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target

scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.bake.margin=5
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    scene.cycles.device='GPU'
except Exception:pass
bpy.ops.object.bake(type='EMIT')
image.filepath_raw=str(OUT/'orca-colors.png');image.file_format='PNG';image.save()
print('BAKE_READY',flush=True)

# The original nose points -Y; game forward is +Y. Rotate 180 degrees about Z.
canonical=lambda p:[-p[0],-p[1],p[2]]
world=[canonical(v.co) for v in data.vertices]
lower=[min(p[i] for p in world) for i in range(3)];upper=[max(p[i] for p in world) for i in range(3)]
center=[(lower[i]+upper[i])/2 for i in range(3)];length=upper[1]-lower[1]
normalize=lambda p:[(p[i]-center[i])/length for i in range(3)]
data.calc_loop_triangles();uv=data.uv_layers.active.data;groups=defaultdict(list)
for tri in data.loop_triangles:
    if tri.area<1e-10:continue
    part=face_parts[tri.polygon_index]
    for li in tri.loops:
        loop=data.loops[li];p=normalize(world[loop.vertex_index]);raw_normal=data.corner_normals[li].vector
        if raw_normal.length<1e-6:raw_normal=tri.normal
        n=canonical(raw_normal.normalized());t=uv[li].uv
        groups[part].extend([*p,*n,t.x,1-t.y,1,1,1])
rotors={}
for part,obj in part_objects.items():
    axis=canonical((obj.matrix_world.to_3x3()@Vector((0,0,1))).normalized())
    rotors[part]={'pivot':normalize(canonical(obj.matrix_world.translation)),'axis':axis,'direction':-1 if part=='PropR' else 1}
assert set(rotors)=={'PropL','PropR'}
ranges=[];flat=[]
for part,vertices in groups.items():
    ranges.append({'part':part,'material':0,'first':len(flat)//11,'count':len(vertices)//11});flat.extend(vertices)
assert all(math.isfinite(v) for v in flat)
binary=struct.pack('<%sf'%len(flat),*flat)
index={'version':1,'name':'Orca GDI v1','mesh':'mesh.bin','stride':44,'vertexCount':len(flat)//11,
    'normalisedLength':1,'forwardAxis':'+Y','upAxis':'+Z','positionAnchor':'bounding-box centre',
    'bounds':[normalize(lower),normalize(upper)],'rotors':rotors,'materials':[{'name':'Orca GDI | baked atlas','kind':17,'texture':'orca-colors.png'}],
    'ranges':ranges,'objects':objects,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':source_hash,
    'meshSha256':hashlib.sha256(binary).hexdigest(),'textures':[{'file':'orca-colors.png','size':[2048,2048]}]}
# Exit onto the rear engine cowling rather than looking for a Highwind deck.
index['deckExit']=normalize(canonical((0,.65,3.02)))
for name,content in [('mesh.bin',binary),('index.json',(json.dumps(index,ensure_ascii=False,indent=2)+'\n').encode())]:
    (OUT/name).write_bytes(content);(OUT/(name+'.gz')).write_bytes(gzip.compress(content,mtime=0))
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==source_hash
print('ORCA_EXPORTED',json.dumps({'triangles':len(flat)//33,'ranges':len(ranges),'bytes':len(binary),'length':length,'rotors':rotors}),flush=True)
