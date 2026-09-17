"""Prepare the CC0 citizen for animation, render previews and export the game asset."""
from pathlib import Path
import bpy, math, json
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'assets/characters/citadin_homme'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'.cache/character-build/citadin_working.blend'))
rig = bpy.data.objects['Adrien_Rig']
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
scene = bpy.context.scene

def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

# Freeze the phenotype, remove construction helpers and surfaces hidden by clothes.
for obj in meshes:
    active(obj)
    if obj.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for modifier in list(obj.modifiers):
        if modifier.type == 'MASK':
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    for group in list(obj.vertex_groups):
        if group.name not in rig.data.bones:
            obj.vertex_groups.remove(group)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    for face in obj.data.polygons:
        face.use_smooth = True
    if obj.name == 'Adrien_Shirt_Jeans':
        for v in obj.data.vertices:
            v.co += v.normal * .0015

# Set the character to 1.80 m, with soles on the ground, without object-level scale.
bpy.context.view_layer.update()
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
zmin, zmax = min(v.z for v in points), max(v.z for v in points)
scale = 1.8/(zmax-zmin)
for obj in meshes:
    for v in obj.data.vertices:
        v.co *= scale
        v.co.z -= zmin*scale
active(rig)
bpy.ops.object.mode_set(mode='EDIT')
for bone in rig.data.edit_bones:
    bone.head *= scale
    bone.tail *= scale
    bone.head.z -= zmin*scale
    bone.tail.z -= zmin*scale
root = rig.data.edit_bones.new('Root')
root.head = (0,0,0)
root.tail = (0,0,0.16)
root.use_deform = False
rig.data.edit_bones['mixamorig:Hips'].parent = root
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front = True
rig.data.display_type = 'OCTAHEDRAL'
rig['character'] = 'Adrien — citadin contemporain'
rig['height_m'] = 1.80
rig['license'] = 'CC0 — MakeHuman Community base and system assets; custom assembly and animation'
rig['usage'] = 'Pose Mode: select body bones to pose. Actions: Idle, Walk, Wave. Root moves the whole character.'

# Surface response: keep a single portable Principled shader per material.
for obj in meshes:
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        bs = next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        bs.inputs['Metallic'].default_value = 0
        bs.inputs['Roughness'].default_value = 0.66
        bs.inputs['Specular IOR Level'].default_value = 0.28
        if obj.name == 'Adrien_Body':
            bs.inputs['Roughness'].default_value = .49
            bs.inputs['Subsurface Weight'].default_value = .055
            bs.inputs['Subsurface Radius'].default_value = (1,.45,.2)
            bs.inputs['Subsurface Scale'].default_value = .07
        if obj.name == 'Adrien_Eyes':
            bs.inputs['Roughness'].default_value = .22
        if obj.name in ['Adrien_Hair','Adrien_Brows','Adrien_Lashes']:
            mat.surface_render_method = 'DITHERED'
            mat.use_backface_culling = False
            bs.inputs['Roughness'].default_value = .75
        else:
            for link in list(bs.inputs['Alpha'].links):
                mat.node_tree.links.remove(link)
            bs.inputs['Alpha'].default_value = 1
        for node in nodes:
            if node.type == 'TEX_IMAGE' and node.image and 'Normal' in node.name:
                node.image.colorspace_settings.name='Non-Color'

# Embed all textures; assets are self-contained after this stage.
texdir = OUT/'textures'
texdir.mkdir(exist_ok=True)
for img in bpy.data.images:
    if img.source == 'FILE':
        _ = img.pixels[0] # Load lazily referenced textures before packing.
        # 2K is sufficient for a city NPC, and keeps the game package manageable.
        if max(img.size)>2048:
            factor=2048/max(img.size)
            img.scale(round(img.size[0]*factor),round(img.size[1]*factor))
        img.filepath_raw=str(texdir/(Path(img.filepath).stem+'.png'))
        img.file_format='PNG'
        img.save()
        img.pack()

character = bpy.data.collections.new('CHARACTER • Adrien')
scene.collection.children.link(character)
for obj in [rig]+meshes:
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    character.objects.link(obj)

# Lightweight FK animation with explicit keys on the humanoid skeleton.
for pb in rig.pose.bones:
    pb.rotation_mode='QUATERNION'

def reset_pose():
    for pb in rig.pose.bones:
        pb.location=(0,0,0)
        pb.rotation_quaternion=(1,0,0,0)
        pb.scale=(1,1,1)
    bpy.context.view_layer.update()

def aim(name,direction):
    pb=rig.pose.bones['mixamorig:'+name]
    bpy.context.view_layer.update()
    parent_matrix = pb.parent.matrix @ pb.parent.bone.matrix_local.inverted() if pb.parent else rig.matrix_world.copy()
    base=parent_matrix @ pb.bone.matrix_local
    q=base.to_quaternion()
    original=q @ Vector((0,1,0))
    correction=original.rotation_difference(Vector(direction).normalized())
    pb.rotation_quaternion=q.inverted() @ correction @ q
    bpy.context.view_layer.update()

def rotate(name,axis,angle):
    pb=rig.pose.bones['mixamorig:'+name]
    pb.rotation_quaternion=pb.rotation_quaternion @ Quaternion(Vector(axis),angle)

def leg_to(side, ankle):
    upper=rig.pose.bones['mixamorig:'+side+'UpLeg']
    lower=rig.pose.bones['mixamorig:'+side+'Leg']
    bpy.context.view_layer.update()
    hip=upper.head.copy()
    direction=Vector(ankle)-hip
    distance=direction.length
    a=upper.bone.length
    b=lower.bone.length
    along=direction.normalized()
    distance=min(distance,a+b-.0001)
    length=(a*a-b*b+distance*distance)/(2*distance)
    bend=Vector((0,-1,0))
    bend=(bend-along*bend.dot(along)).normalized()
    knee=hip+along*length+bend*math.sqrt(max(0,a*a-length*length))
    aim(side+'UpLeg',knee-hip)
    aim(side+'Leg',Vector(ankle)-knee)
    for name in [side+'Foot',side+'ToeBase']:
        bone=rig.data.bones['mixamorig:'+name]
        aim(name,bone.tail_local-bone.head_local)

def relaxed():
    reset_pose()
    for side,sgn in [('Left',1),('Right',-1)]:
        aim(side+'Arm',(sgn*.105,.005,-.30))
        aim(side+'ForeArm',(sgn*.012,-.035,-.28))
        for digit in ['Index','Middle','Ring','Pinky']:
            for joint in [1,2,3]:
                rotate(side+'Hand'+digit+str(joint),(1,0,0),math.radians(7 if joint==1 else 10))

def key_pose(frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name)
        pb.keyframe_insert('location',frame=frame,group=pb.name)

rig.animation_data_create()
for kind,end,step in [('Idle',121,10),('Walk',33,2),('Wave',81,5)]:
    action=bpy.data.actions.new(kind)
    rig.animation_data.action=action
    for frame in range(1,end+1,step):
        phase=(frame-1)/(end-1)*2*math.pi
        relaxed()
        if kind=='Idle':
            rotate('Spine2',(1,0,0),.012*math.sin(phase))
            rotate('Head',(0,1,0),.025*math.sin(phase))
            rig.pose.bones['mixamorig:Hips'].location.z=.004*math.sin(phase)
        elif kind=='Walk':
            for side,sgn in [('Left',1),('Right',-1)]:
                u=((frame-1)/(end-1)+(0 if side=='Left' else .5))%1
                ankle=rig.data.bones['mixamorig:'+side+'Foot'].head_local.copy()
                if u<.5:
                    ankle.y += -.22+.88*u
                else:
                    t=(u-.5)*2
                    ankle.y += .22-.44*t
                    ankle.z += .11*math.sin(math.pi*t)
                leg_to(side,ankle)
                swing=math.cos(phase)*sgn
                rotate(side+'Arm',(1,0,0),-.24*swing)
                rotate(side+'ForeArm',(1,0,0),.08*max(0,swing))
            rotate('Spine2',(0,1,0),.045*math.sin(phase))
        else:
            # Raised hand demonstrates shoulder, elbow, wrist and finger articulation.
            blend=math.sin(math.pi*(frame-1)/(end-1))**.55
            aim('RightArm',(-.085-.20*blend,0,-.30+.33*blend))
            aim('RightForeArm',(-.012-.025*blend,-.035,-.28+.60*blend))
            rotate('RightHand',(0,0,1),.18*math.sin(phase*3)*blend)
            rotate('Head',(0,1,0),-.07*blend)
        key_pose(frame)
    action.use_fake_user=True
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new()
    track.name=kind
    strip=track.strips.new(kind,1,action)
    strip.extrapolation='NOTHING'
    track.mute=True

rig.animation_data.action=bpy.data.actions['Idle']
scene.frame_start=1
scene.frame_end=121
scene.render.fps=30
scene.frame_set(1)

# Studio preview collection, excluded from game exports.
studio=bpy.data.collections.new('STUDIO • preview only')
scene.collection.children.link(studio)
def studio_object(obj):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    studio.objects.link(obj)
    return obj
def material(name,color,roughness=0.7):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=roughness
    return m
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005))
floor=studio_object(bpy.context.object)
floor.name='Studio_Ground'
floor.data.materials.append(material('Studio graphite',(.095,.115,.14)))
def area(name,pos,energy,size,color):
    bpy.ops.object.light_add(type='AREA',location=pos)
    obj=studio_object(bpy.context.object)
    obj.name=name
    obj.data.energy=energy
    obj.data.shape='DISK'
    obj.data.size=size
    obj.data.color=color
    obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Key_softbox',(-3,-4,4),430,4,(1,.91,.81))
area('Fill_softbox',(3,-2,2.6),280,3,(.79,.88,1))
area('Rim_softbox',(1.7,2,3.5),650,3,(.83,.91,1))
bpy.ops.object.camera_add(location=(2.7,-5.7,2.15))
cam=studio_object(bpy.context.object)
cam.name='Camera_Portrait'
cam.rotation_euler=(Vector((0,0,.94))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO'
cam.data.ortho_scale=2.18
scene.camera=cam
scene.world.color=(.18,.18,.18)
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1000
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
active(rig)
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_distance=3.3
            ar.spaces.active.region_3d.view_location=(0,0,.94)
            ar.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
            ar.spaces.active.shading.type='MATERIAL'
            ar.spaces.active.overlay.show_floor=False
            ar.spaces.active.overlay.show_axis_x=False
            ar.spaces.active.overlay.show_axis_y=False

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Citadin_Homme.blend'))
scene.render.filepath=str(OUT/'apercu.png')
bpy.ops.render.render(write_still=True)
print('CITADIN: PREVIEW_READY',flush=True)
