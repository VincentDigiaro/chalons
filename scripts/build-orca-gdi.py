import bpy
import bmesh
import math
import random
import json
from pathlib import Path
from mathutils import Vector, Matrix

OUT = Path(r'C:\Users\cid77\Documents\ChatGPT\map\artifacts\orca-gdi')
OUT.mkdir(parents=True, exist_ok=True)
random.seed(17)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ['OPTIX', 'CUDA', 'HIP', 'ONEAPI']:
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpu = [d for d in prefs.devices if d.type != 'CPU']
            if gpu:
                for d in prefs.devices:
                    d.use = d.type != 'CPU'
                scene.cycles.device = 'GPU'
                print('RENDER_GPU', backend, [d.name for d in gpu], flush=True)
                break
        except Exception:
            pass
except Exception:
    pass

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

COLS = {k: collection(n) for k, n in [
    ('hull', '01 | Fuselage et blindage'), ('cockpit', '02 | Verriere et pilote'),
    ('fans', '03 | Turbines VTOL'), ('tail', '04 | Empennage'),
    ('weapons', '05 | Armement'), ('detail', '06 | Marquages et details'),
    ('studio', '90 | Studio et cameras'), ('ref', '99 | Reference')
]}
root = bpy.data.objects.new('ORCA GDI | ensemble', None)
COLS['hull'].objects.link(root)
root['description'] = 'Interpretation 3D de la reference fournie. Nez vers -Y, altitude +Z. Turbines animees.'
root['length_m'] = 9.6

def own(obj, name, col='hull', mat=None, parent=True):
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    COLS[col].objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if parent and col not in {'studio', 'ref'}:
        obj.parent = root
    return obj

def material(name, color, metallic=0, roughness=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m

armor = material('CARC | camouflage olive, terre et sable', (.21, .23, .095), .34, .52)
nodes, links = armor.node_tree.nodes, armor.node_tree.links
p = nodes.get('Principled BSDF')
coords = nodes.new('ShaderNodeTexCoord')
coords.object = root
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 1.28
noise.inputs['Detail'].default_value = 1.4
noise.inputs['Roughness'].default_value = .63
links.new(coords.outputs['Object'], noise.inputs['Vector'])
ramp = nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.interpolation = 'CONSTANT'
ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
for i, (pos, color) in enumerate([(.0, (.045,.058,.025,1)), (.39,(.105,.132,.043,1)), (.53,(.23,.207,.080,1)), (.65,(.32,.275,.135,1))]):
    e = ramp.color_ramp.elements[0] if i == 0 else ramp.color_ramp.elements.new(pos)
    e.position = pos
    e.color = color
links.new(noise.outputs['Fac'], ramp.inputs[0])
links.new(ramp.outputs['Color'], p.inputs['Base Color'])
micro = nodes.new('ShaderNodeTexNoise')
micro.inputs['Scale'].default_value = 170
micro.inputs['Detail'].default_value = 2
links.new(coords.outputs['Object'], micro.inputs['Vector'])
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .17
bump.inputs['Distance'].default_value = .025
links.new(micro.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs[0], p.inputs['Normal'])
olive = material('Peinture olive | panneaux', (.14,.173,.060), .4, .48)
sand = material('Sable | bords et protections', (.28,.235,.111), .36, .47)
dark = material('Joints | caoutchouc graphite', (.013,.018,.020), .2, .49)
metal = material('Titane sombre | mecanique', (.060,.075,.082), .78, .41)
steel = material('Aretes | metal satine', (.22,.25,.265), .84, .34)
black = material('Cavite | noir', (.006,.010,.012), .25, .6)
gold = material('GDI | jaune signalisation', (.92,.58,.075), .33, .34)
ivory = material('Pochoirs | ivoire', (.74,.78,.61), .14, .49)
glass = material('Verriere | verre fume bleu', (.47,.63,.66), .0, .10)
pg = glass.node_tree.nodes.get('Principled BSDF')
pg.inputs['Transmission Weight'].default_value = 1.0
pg.inputs['IOR'].default_value = 1.46
pg.inputs['Coat Weight'].default_value = .20
visor = material('Visiere pilote', (.008,.029,.038), .7, .13)
fabric = material('Pilote | combinaison', (.11,.15,.11), 0, .77)

def emission(name, color, power):
    m = material(name, color, .15, .19)
    q = m.node_tree.nodes.get('Principled BSDF')
    q.inputs['Emission Color'].default_value = (*color, 1)
    q.inputs['Emission Strength'].default_value = power
    return m
lamp = emission('Optique | blanc chaud', (.87,.94,1), 8)
cyan = emission('HUD | cyan', (.03,.72,.65), 2)
red = emission('Feu | rouge', (.9,.015,.01), 3)
green = emission('Feu | vert', (.04,.8,.22), 3)

def smooth(obj):
    if obj.type == 'MESH':
        for f in obj.data.polygons:
            f.use_smooth = True
    return obj

def bevel(obj, width=.035, segments=3):
    b = obj.modifiers.new('Chanfreins de fabrication', 'BEVEL')
    b.width = width
    b.segments = segments
    return obj

def mesh(name, verts, faces, mat, col='hull', soft=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    COLS[col].objects.link(obj)
    obj.parent = root
    if mat:
        data.materials.append(mat)
    if soft:
        smooth(obj)
    return obj

def uv(name, loc, scale, mat, col='hull', seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=20, location=loc)
    obj = own(bpy.context.object, name, col, mat)
    obj.scale = scale
    return smooth(obj)

def box(name, loc, scale, mat, col='hull', edge=.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = own(bpy.context.object, name, col, mat)
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if edge:
        bevel(obj, edge)
    return obj

def cylinder(name, a, b, radius, mat, col='detail', radius2=None, n=40, open_start=False):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=radius,
        radius2=radius if radius2 is None else radius2, depth=(b-a).length, location=(a+b)/2)
    obj = own(bpy.context.object, name, col, mat)
    if open_start:
        # The collar and perforated rear panel close the pod without overlapping caps.
        data = bmesh.new()
        data.from_mesh(obj.data)
        faces = [face for face in data.faces if face.normal.z < -.99]
        assert len(faces) == 1
        bmesh.ops.delete(data, geom=faces, context='FACES_ONLY')
        data.to_mesh(obj.data)
        data.free()
        obj.data.update()
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    smooth(obj)
    bevel(obj, .009, 2)
    return obj

def curve(name, pts, radius, mat, col='detail', cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 16
    data.bevel_depth = radius
    data.bevel_resolution = 3
    s = data.splines.new('POLY')
    s.points.add(len(pts)-1)
    for p, co in zip(s.points, pts):
        p.co = (*co, 1)
    s.use_cyclic_u = cyclic
    return own(bpy.data.objects.new(name, data), name, col, mat)

def loft(name, sections, mat, col='hull', count=48):
    # Each section: y, half-width, bottom z, shoulder z, upper z.
    verts = []
    for y,w,bot,shoulder,top in sections:
        for i in range(count):
            t = 2*math.pi*i/count
            z = shoulder + (top-shoulder)*math.sin(t) if math.sin(t)>=0 else shoulder+(shoulder-bot)*math.sin(t)
            verts.append((w*math.cos(t), y, z))
    faces = [tuple(range(count-1,-1,-1))]
    for j in range(len(sections)-1):
        for i in range(count):
            k = j*count+i
            ni = j*count+(i+1)%count
            faces.append((k,ni,ni+count,k+count))
    faces.append(tuple((len(sections)-1)*count+i for i in range(count)))
    faces = [tuple(reversed(f)) for f in faces]
    obj = mesh(name, verts, faces, mat, col, True)
    sub = obj.modifiers.new('Courbes du fuselage', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    return obj

loft('Fuselage | coque inferieure profilee', [
    (-3.45,.08,1.40,1.56,1.63),(-3.3,.35,1.15,1.60,1.81),
    (-2.85,.65,.92,1.61,1.91),(-2.1,.83,.80,1.65,2.02),
    (-1.2,.90,.77,1.7,2.06),(-.25,.89,.89,1.84,2.19),
    (.50,.77,1.11,1.96,2.65),(1.1,.59,1.48,2.17,2.83),
    (1.65,.44,1.80,2.39,2.86),(1.8,.37,2.05,2.43,2.8)
], armor)

loft('Poutre de queue | monocoque', [
    (.65,.56,1.80,2.33,2.76),(1.1,.54,1.96,2.5,2.89),
    (1.8,.43,2.23,2.69,2.98),(2.8,.32,2.57,2.91,3.13),
    (4,.22,2.90,3.13,3.30),(5.3,.18,3.17,3.31,3.43),
    (5.8,.11,3.28,3.36,3.43),(5.87,.025,3.34,3.37,3.39)
], armor, 'tail')

# Cockpit furniture; the shared shape helper adds the faceted glazing.
box('Cockpit | plancher', (0,-1.08,1.91),(1.03,1.76,.13),dark,'cockpit')
seat=box('Cockpit | siege ejection',(0,-.31,2.32),(.55,.22,.82),dark,'cockpit',.10)
seat.rotation_euler.x=math.radians(-12)
box('Cockpit | appuie tete',(0,-.22,2.8),(.41,.23,.28),black,'cockpit',.08)
uv('Pilote | buste',(0,-.70,2.40),(.25,.19,.32),fabric,'cockpit')
uv('Pilote | casque',(0,-.72,2.84),(.21,.23,.245),sand,'cockpit')
uv('Pilote | visiere',(0,-.917,2.85),(.17,.063,.115),visor,'cockpit')
for side in [-1,1]:
    cylinder('Pilote | bras',(side*.21,-.71,2.57),(side*.30,-1.05,2.32),.075,fabric,'cockpit')
    cylinder('Pilote | avant bras',(side*.30,-1.05,2.32),(side*.22,-1.29,2.33),.065,fabric,'cockpit')
    cylinder('Pilote | harnais',(side*.14,-.91,2.61),(side*.08,-.91,2.21),.021,dark,'cockpit')
console=box('Cockpit | console',(0,-1.55,2.19),(.87,.44,.33),metal,'cockpit',.06)
for x in [-.25,0,.25]:
    panel=box('Cockpit | ecran',(x,-1.53,2.366),(.19,.26,.012),cyan,'cockpit',.008)
for x in [-.38,.38]:
    box('Cockpit | commandes',(x,-1.01,2.17),(.10,.55,.12),metal,'cockpit')

# Armored cheeks follow the body without flattening its taper.
for side in [-1,1]:
    cheek=[(side*x,y,z) for x,y,z in [(.53,-2.83,1.51),(.81,-2.03,1.80),(.91,-.98,1.80),(.85,-.41,1.46),(.68,-.89,1.01),(.43,-2.48,1.07)]]
    ob=mesh('Blindage | joue '+str(side),cheek,[tuple(range(6))],armor)
    so=ob.modifiers.new('Tole blindee','SOLIDIFY');so.thickness=.065
    bevel(ob,.05)
    curve('Joint | joue '+str(side),cheek,.014,dark,cyclic=True)
    for y in [-2.05,-1.74,-1.43,-1.12]:
        cylinder('Fixation | flanc',(side*.848,y,1.61),(side*.866,y,1.61),.023,steel)
    cylinder('Poignee de maintenance',(side*.74,-.4,2.02),(side*.76,-.04,2.08),.027,metal)

uv('Nez | bulbe de visee',(0,-3.05,1.29),(.37,.39,.32),metal)
cylinder('Nez | couronne du projecteur',(0,-3.30,1.27),(0,-3.43,1.27),.19,dark)
cylinder('Nez | lentille',(0,-3.438,1.27),(0,-3.45,1.27),.148,lamp)
cylinder('Nez | camera FLIR',(.20,-3.27,1.44),(.20,-3.43,1.44),.082,metal)
uv('Nez | optique FLIR',(.20,-3.435,1.44),(.059,.019,.059),cyan,'detail')
for side in [-1,1]:
    cylinder('Pitot',(side*.39,-2.66,1.51),(side*.39,-3.31,1.48),.015,steel)

# Engine deck with stepped armor, intake louvers and access hatches.
uv('Dos | capot moteur',(0,.58,2.79),(.49,.73,.22),armor)
box('Dos | prise air',(0,.87,2.987),(.58,.71,.075),dark,edge=.08)
for i in range(9):
    box('Dos | lamelle admission',(0,.565+i*.077,3.035),(.54,.032,.041),metal,edge=.012)
uv('Dos | trappe ovale',(0,.06,2.89),(.38,.25,.07),sand)
for side in [-1,1]:
    cylinder('Echappement dorsal',(side*.36,1.12,2.73),(side*.32,1.69,2.85),.14,metal)
    cylinder('Echappement | cavite',(side*.32,1.68,2.85),(side*.315,1.71,2.855),.112,black)

print('BUILT_HULL', flush=True)

def prism(name, outline, thickness, mat, col='hull'):
    verts=[(x,y,z-thickness/2) for x,y,z in outline]+[(x,y,z+thickness/2) for x,y,z in outline]
    n=len(outline)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return bevel(mesh(name,verts,faces,mat,col),min(thickness/3,.05))

rotors=[]
for side,word in [(-1,'babord'),(1,'tribord')]:
    center=Vector((side*2.12,.05,2.45))
    q=Vector((0,0,1)).to_track_quat('Z','Y')
    def w(p):
        return center+q@Vector(p)
    prism('Aile support turbine | '+word,[(side*.65,-.48,1.91),(side*2.20,-.15,2.03),(side*2.12,.72,2.06),(side*.64,.94,2.04)],.24,armor,'fans')
    profile=[(.89,-.53),(.99,-.44),(1.08,-.12),(1.12,.32),(1.11,.43),(1.075,.51),
        (1.01,.55),(.955,.53),(.898,.46),(.865,.32),(.82,-.08),(.79,-.42),(.80,-.53)]
    n=96
    verts=[(r*math.cos(2*math.pi*i/n),r*math.sin(2*math.pi*i/n),z) for r,z in profile for i in range(n)]
    faces=[]
    for j in range(len(profile)):
        for i in range(n):
            faces.append((j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i))
    duct=mesh('Turbine | carenage annulaire '+word,verts,faces,armor,'fans',True)
    duct.location=center;duct.rotation_euler=q.to_euler()
    duct.data.materials.append(dark);duct.data.materials.append(sand)
    for j in range(len(profile)):
        for i in range(n):
            duct.data.polygons[j*n+i].material_index = 1 if 9<=j<=11 else (2 if j in [5,6] else 0)
    for z,r in [(-.31,1.025),(.29,1.122)]:
        curve('Turbine | joint circulaire '+word,[w((r*math.cos(a),r*math.sin(a),z)) for a in [2*math.pi*i/96 for i in range(96)]],.009,dark,'fans',True)
    for a in [2*math.pi*i/12 for i in range(12)]:
        curve('Turbine | joint longitudinal '+word,[w((r*math.cos(a),r*math.sin(a),z)) for r,z in [(1.00,-.4),(1.087,-.1),(1.125,.28)]],.008,dark,'fans')
        cylinder('Turbine | rivet '+word,w((1.066*math.cos(a),1.066*math.sin(a),.479)),w((1.066*math.cos(a),1.066*math.sin(a),.501)),.019,steel,'fans',n=12)
    for a in [-math.pi/2-.40,-math.pi/2+.35]:
        vs=[w((r*math.cos(t),r*math.sin(t),z)) for r,z,t in [(1.11,.10,a),(1.11,.10,a+.12),(1.13,.29,a+.12),(1.13,.29,a)]]
        ob=mesh('Turbine | bande jaune '+word,vs,[(0,1,2,3)],gold,'fans')
    rotor=bpy.data.objects.new('ROTOR | '+word,None)
    COLS['fans'].objects.link(rotor);rotor.parent=root
    rotor.location=center;rotor.rotation_euler=q.to_euler()
    spin=bpy.data.objects.new('Rotation des pales | '+word,None)
    COLS['fans'].objects.link(spin);spin.parent=rotor
    for j in range(16):
        a=j*2*math.pi/16
        vv=[]
        for radius,lead,trail,z in [(.22,-.035,.10,-.06),(.40,.00,.18,-.05),(.68,.12,.31,-.01),(.828,.25,.405,.015)]:
            for angle,zz in [(a+lead,z+.045),(a+trail,z-.035)]:
                vv.append((radius*math.cos(angle),radius*math.sin(angle),zz))
        blade=mesh('Rotor '+word+' | pale %02d'%(j+1),vv,[(0,1,3,2),(2,3,5,4),(4,5,7,6)],metal,'fans',True)
        blade.parent=spin
        sol=blade.modifiers.new('Epaisseur pale','SOLIDIFY');sol.thickness=.012
        bevel(blade,.011,2)
        # Visible lighter leading edge emphasizes the fan's twist.
        tip=curve('Rotor | bord attaque',[vv[i] for i in [0,2,4,6]],.007,steel,'fans')
        tip.parent=spin
    for j in range(4):
        a=j*math.pi/2+.25
        cylinder('Turbine | stator '+word,w((.15*math.cos(a),.15*math.sin(a),-.27)),w((.82*math.cos(a+.12),.82*math.sin(a+.12),-.28)),.033,metal,'fans')
    cylinder('Turbine | axe '+word,w((0,0,-.39)),w((0,0,.14)),.20,metal,'fans')
    hub=uv('Turbine | ogive '+word,w((0,0,.15)),(.25,.25,.21),olive,'fans')
    hub.rotation_euler=q.to_euler()
    cylinder('Turbine | capuchon '+word,w((0,0,.31)),w((0,0,.34)),.09,steel,'fans')
    spin.rotation_euler.z=0
    spin.keyframe_insert(data_path='rotation_euler',frame=1,index=2)
    spin.rotation_euler.z=side*math.tau*8
    spin.keyframe_insert(data_path='rotation_euler',frame=121,index=2)
    if spin.animation_data and spin.animation_data.action:
        act=spin.animation_data.action
        try:
            for layer in act.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for fc in bag.fcurves:
                            for key in fc.keyframe_points:key.interpolation='LINEAR'
                            fc.modifiers.new('CYCLES')
        except Exception:pass
    rotors.append(spin)
    uv('Feu de navigation | '+word,w((side*1.10,0,.12)),(.068,.065,.050),red if side<0 else green,'detail')

# Shared final geometry, also used for targeted edits of existing assets.
import runpy
runpy.run_path(str(Path(__file__).resolve().parent / 'orca-shape.py'))['refine_orca_shape']()

# H-shaped tail: swept stabilizer and tall slender tip fins, as in the reference.
prism('Empennage | plan horizontal',[
    (-1.52,5.35,3.34),(-.33,4.91,3.34),(0,4.87,3.34),(.33,4.91,3.34),
    (1.52,5.35,3.34),(1.52,5.65,3.34),(.22,5.41,3.34),(-.22,5.41,3.34),(-1.52,5.65,3.34)
],.085,armor,'tail')
for side in [-1,1]:
    # Thin solid vertical rudder, with swept upper and lower tips.
    yz=[(5.23,3.40),(5.83,4.80),(5.67,3.41),(5.37,2.57),(5.39,3.30)]
    verts=[(side*1.50+dx,y,z) for dx in [-.026,.026] for y,z in yz]
    n=len(yz)
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    bevel(mesh('Derive verticale | '+str(side),verts,faces,olive,'tail'),.022)
    curve('Derive | bord attaque',[(side*1.5,5.23,3.40),(side*1.5,5.83,4.80)],.018,sand,'tail')
    curve('Empennage | gouverne',[(side*.30,5.31,3.391),(side*1.43,5.54,3.391)],.011,dark,'tail')
    cylinder('Empennage | contrepoids',(side*1.50,5.11,3.36),(side*1.5,5.63,3.36),.055,metal,'tail')
uv('Queue | carenage terminal',(0,5.18,3.42),(.36,.54,.14),olive,'tail')
cylinder('Queue | grille circulaire',(0,5.10,3.48),(0,5.10,3.535),.23,metal,'tail')
for i in range(-4,5):
    x=i*.043
    dy=math.sqrt(max(.21*.21-x*x,0))
    cylinder('Queue | grille',(x,5.1-dy,3.562),(x,5.1+dy,3.562),.009,steel,'tail',n=8)
curve('Queue | ligne panneau gauche',[(-.38,1.9,2.75),(-.29,2.8,2.96),(-.20,4.0,3.18),(-.17,4.65,3.30)],.009,dark,'tail')
curve('Queue | ligne panneau droit',[(.38,1.9,2.75),(.29,2.8,2.96),(.20,4.0,3.18),(.17,4.65,3.30)],.009,dark,'tail')
cylinder('Antenne dorsale',(0,2.21,3.07),(0,2.58,3.89),.025,dark,'tail',radius2=.005)

# Winglets and paired rocket pods mounted below the canopy shoulder.
for side,word in [(-1,'babord'),(1,'tribord')]:
    prism('Armement | moignon aile '+word,[(side*.62,-1.99,1.29),(side*1.66,-1.56,1.34),(side*1.57,-.64,1.28),(side*.71,-.83,1.13)],.20,armor,'weapons')
    box('Armement | pylone '+word,(side*1.27,-1.36,1.15),(.20,.47,.44),metal,'weapons')
    a=Vector((side*1.34,-1.14,.85));b=Vector((side*1.34,-2.18,.85))
    cylinder('Roquettes | corps '+word,a,b,.335,armor,'weapons',n=12,open_start=True)
    cylinder('Roquettes | cerclage avant '+word,(side*1.34,-2.06,.85),(side*1.34,-2.16,.85),.347,sand,'weapons',n=12)
    cylinder('Roquettes | plaque avant '+word,(side*1.34,-2.165,.85),(side*1.34,-2.197,.85),.306,metal,'weapons',n=48)
    # Seven tubes with real dark insets and bright rims.
    holes=[(0,0)]+[(.20*math.cos(i*math.tau/6),.20*math.sin(i*math.tau/6)) for i in range(6)]
    for j,(dx,dz) in enumerate(holes):
        xx,zz=side*1.34+dx,.85+dz
        cylinder('Roquettes | bouche %s %02d'%(word,j),(xx,-2.19,zz),(xx,-2.215,zz),.075,steel,'weapons',n=24)
        cylinder('Roquettes | tube %s %02d'%(word,j),(xx,-2.217,zz),(xx,-2.224,zz),.060,black,'weapons',n=24)
        cylinder('Roquettes | ogive %s %02d'%(word,j),(xx,-2.226,zz),(xx,-2.230,zz),.025,olive,'weapons',n=16)
    cylinder('Roquettes | bague arriere '+word,(side*1.34,-1.14,.85),(side*1.34,-1.22,.85),.341,metal,'weapons',n=12)
    # Missile launchers only; no fixed guns or landing gear.

import runpy
runpy.run_path(str(Path(__file__).with_name('orca-launcher-rears.py')))['add_launcher_rears']()
print('BUILT_FANS_TAIL_WEAPONS', flush=True)

def text_obj(name, body, loc, size, mat, normal=(0,0,1), horizontal=(1,0,0), col='detail'):
    data=bpy.data.curves.new(name,'FONT');data.body=body;data.size=size
    data.extrude=.0007;data.resolution_u=8;data.space_character=1.15
    obj=own(bpy.data.objects.new(name,data),name,col,mat)
    x=Vector(horizontal).normalized();z=Vector(normal).normalized();y=z.cross(x).normalized()
    obj.rotation_euler=Matrix((x,y,z)).transposed().to_euler();obj.location=loc
    return obj

for side in [-1,1]:
    text_obj('Insigne | GDI','GDI',(side*.884,-2.03 if side==1 else -1.54,1.47),.20,gold,(side,0,0),(0,side,0))
    text_obj('Identification | 07','07',(side*.797,-.57 if side==1 else -.22,1.35),.20,ivory,(side,0,0),(0,side,0))
    text_obj('Numero de serie','OC / 07',(side*.318,2.80 if side==1 else 3.46,2.955),.115,ivory,(side,0,0),(0,side,0),'tail')
    # Stylized eagle insignia, inlaid in the upper stub wing.
    cx,cy=side*1.21,-1.28
    shape=[(-.25,.03),(-.24,.17),(-.06,.07),(0,.16),(.06,.07),(.24,.17),(.25,.03),(.12,-.02),(.08,-.12),(0,-.20),(-.08,-.12),(-.12,-.02)]
    verts=[(cx+x,cy+y,1.456) for x,y in shape]
    mesh('Insigne | aigle GDI',verts,[tuple(range(len(verts)))],gold,'detail')
    text_obj('Aile | no step','NO STEP',(side*1.15,.56,2.199),.094,ivory)
    # Rescue arrow at the lower cockpit rail.
    x=side*.849
    arrow=[(x,-1.05,1.92),(x,-.74,1.92),(x,-.74,1.97),(x,-.60,1.88),(x,-.74,1.81),(x,-.74,1.85),(x,-1.05,1.85)]
    mesh('Secours | fleche',arrow,[tuple(range(7))],gold)

# Small fasteners on the dorsal access hatch and underside service panels.
for i in range(10):
    a=i*math.tau/10
    uv('Dos | vis de trappe',(.31*math.cos(a),.06+.19*math.sin(a),2.937),(.013,.013,.008),steel,'detail',16)
box('Ventre | panneau central',(0,-.44,.888),(.60,.80,.045),metal,edge=.05)
for x in [-.22,.22]:
    for y in [-.72,-.16]:
        uv('Ventre | vis',(x,y,.858),(.022,.022,.013),steel,'detail',16)

scene.frame_start=1;scene.frame_end=120;scene.render.fps=24;scene.frame_set(1)
scene.timeline_markers.new('Turbines : lecture pour rotation',frame=1)
scene['asset_title']='GDI ORCA / 07'
scene['reference']='Image fournie par utilisateur : codex-clipboard-0d42284c-5631-4a4b-a965-d35133575293.png'
scene['notes']='Modele original construit dans Blender depuis une vue unique. Details non visibles interpretes. Camouflage procedural; pieces separees; rotors animes.'

ref_path=Path(r'C:\Users\cid77\AppData\Local\Temp\codex-clipboard-0d42284c-5631-4a4b-a965-d35133575293.png')
if ref_path.exists():
    img=bpy.data.images.load(str(ref_path));img.pack()
    ref=bpy.data.objects.new('Reference utilisateur | image embarquee',None)
    COLS['ref'].objects.link(ref);ref.empty_display_type='IMAGE';ref.data=img
    ref.empty_display_size=6;ref.location=(-8,2,3);ref.hide_render=True
    COLS['ref'].hide_viewport=True

floor=material('Studio | graphite',(.034,.044,.055),.18,.52)
box('Cyclorama',(0,0,-.15),(200,200,.25),floor,'studio',edge=0)
world=bpy.data.worlds.new('Studio | ambiance froide');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.19,.25,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45

def area(name,loc,energy,color,size,target=(0,0,1.7),size_y=None):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color
    data.shape='DISK' if size_y is None else 'RECTANGLE';data.size=size
    if size_y:data.size_y=size_y
    obj=bpy.data.objects.new(name,data);COLS['studio'].objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj
area('Key | grande boite douce',(-5,-7,12),2100,(1,.86,.66),7)
area('Fill | ciel',(7,-2,8),1650,(.64,.79,1),6)
area('Rim | contrejour',(1,8,11),2800,(.89,.94,1),5)
area('Verriere | reflet vertical',(-3,-1,7),250,(.72,.86,1),1,target=(0,-1,2),size_y=6)
area('Face | debouchage',(0,-10,5),500,(1,.96,.85),5)

def camera(name,loc,target,scale):
    data=bpy.data.cameras.new(name);obj=bpy.data.objects.new(name,data);COLS['studio'].objects.link(obj)
    obj.location=loc;obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=scale;data.lens=48
    return obj
hero=camera('CAM 01 | trois quarts avant',(10,-15,11),(0,.9,2.0),12.8)
camera('CAM 02 | profil tribord',(15,0,6),(0,1,2.1),12.5)
camera('CAM 03 | dessus',(0,1,20),(0,1,0),12.5)
camera('CAM 04 | trois quarts arriere',(-10,14,9),(0,1,2),12.8)
scene.camera=hero
scene.render.resolution_x=1800;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
try:scene.view_settings.look='AgX - Medium High Contrast'
except Exception:pass

# Open the native asset in a useful, uncluttered material-preview angle.
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            sp=ar.spaces.active
            sp.region_3d.view_rotation=hero.rotation_euler.to_quaternion()
            sp.region_3d.view_distance=15
            sp.region_3d.view_location=(0,1,2)
            sp.region_3d.view_perspective='PERSP'
            sp.clip_end=500
            sp.shading.type='MATERIAL'
            sp.shading.studiolight_rotate_z=.4
            sp.overlay.show_floor=False;sp.overlay.show_axis_x=False;sp.overlay.show_axis_y=False
for obj in COLS['studio'].objects:
    obj.hide_set(True)
for obj in bpy.context.selected_objects:obj.select_set(False)
bpy.context.view_layer.objects.active=None
scene.render.filepath=str(OUT/'orca-gdi-preview.png')
readme=bpy.data.texts.new('LISEZ-MOI | ORCA GDI')
readme.write('ORCA GDI — modele construit depuis la reference fournie.\n\n'
    'Collections 01 a 06 : geometrie du vaisseau, pieces separees.\n'
    'Collection 90 : studio et quatre cameras (masques uniquement dans la vue de travail).\n'
    'Collection 99 : reference utilisateur embarquee et masquee.\n'
    'Lecture de la timeline : rotation des deux turbines.\n'
    'Nez -Y ; haut +Z. Dimensions en metres.\n'
    'Camouflage procedural commun aux pieces, sans dependance externe.\n'
    'Rendu F12 avec la camera trois quarts avant.\n'
    'Les zones non visibles sur la reference ont ete interpretees.\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Orca-GDI.blend'))
stats={'objects':len([o for o in scene.objects if o.type=='MESH']),
    'base_vertices':sum(len(o.data.vertices) for o in scene.objects if o.type=='MESH'),
    'base_polygons':sum(len(o.data.polygons) for o in scene.objects if o.type=='MESH'),
    'materials':len(bpy.data.materials),'rotors_animated':len(rotors),'blend':str(OUT/'Orca-GDI.blend')}
(OUT/'asset-info.json').write_text(json.dumps(stats,indent=2),encoding='utf-8')
print('ASSET_SAVED',json.dumps(stats),flush=True)
bpy.ops.render.render(write_still=True)
print('RENDER_COMPLETE',flush=True)
