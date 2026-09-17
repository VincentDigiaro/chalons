"""Fixed upright lift fans and a narrower, faceted cockpit canopy."""
import bpy
from mathutils import Matrix, Vector

CANOPY_SECTIONS = [
    (-3.15, .12, 1.86, 1.90), (-2.62, .44, 1.94, 2.28),
    (-1.68, .60, 2.02, 2.80), (-.57, .61, 2.14, 2.94),
    (.16, .43, 2.30, 2.75), (.42, .09, 2.41, 2.47),
]

def refine_orca_shape():
    root = bpy.data.objects['ORCA GDI | ensemble']
    if root.get('fixed_fans_faceted_canopy'):
        return
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    fans = bpy.data.collections['03 | Turbines VTOL']
    cockpit = bpy.data.collections['02 | Verriere et pilote']
    dark = bpy.data.materials['Joints | caoutchouc graphite']
    armor = bpy.data.materials['CARC | camouflage olive, terre et sable']
    glass = bpy.data.materials['Verriere | verre fume bleu']

    def mesh(name, vertices, faces, material, collection):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.parent = root
        obj.data.materials.append(material)
        obj['game_lod_ratio'] = 1.0
        return obj

    def rail(name, points, radius=.025):
        data = bpy.data.curves.new(name, 'CURVE')
        data.dimensions = '3D'
        data.bevel_depth = radius
        data.bevel_resolution = 2
        spline = data.splines.new('POLY')
        spline.points.add(len(points)-1)
        for point, co in zip(spline.points, points):
            point.co = (*co, 1)
        obj = bpy.data.objects.new(name, data)
        cockpit.objects.link(obj)
        obj.parent = root
        data.materials.append(dark)
        return obj

    # Only blade spin is animated. The nacelles and mounts follow the hull.
    for side, word in [(-1, 'babord'), (1, 'tribord')]:
        rotor = bpy.data.objects['ROTOR | '+word]
        center = rotor.matrix_world.translation.copy()
        inverse = rotor.matrix_world.to_quaternion().inverted().to_matrix().to_4x4()
        correction = Matrix.Translation(center) @ inverse @ Matrix.Translation(-center)
        for obj in list(root.children):
            if word in obj.name and (obj.name.startswith('Turbine |') or obj == rotor or obj.name.startswith('Feu de navigation |')):
                obj.matrix_world = correction @ obj.matrix_world
                obj.lock_rotation = (True, True, True)
        for prefix in ['Articulation turbine | ', 'Verin turbine | ', 'Tige verin | ']:
            obj = bpy.data.objects.get(prefix+word)
            if obj:
                bpy.data.objects.remove(obj, do_unlink=True)
        # Solid triangular web, no pivot or hydraulic rod.
        outline = [(side*.79,.06,1.73), (side*1.55,.06,1.96),
                   (side*1.52,.06,2.26), (side*.85,.06,2.16)]
        vertices = [(x,y+dy,z) for dy in [-.12,.12] for x,y,z in outline]
        faces = [(3,2,1,0),(4,5,6,7)] + [(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
        brace = mesh('Support fixe turbine | '+word, vertices, faces, armor, fans)
        bevel = brace.modifiers.new('Bords du renfort fixe', 'BEVEL')
        bevel.width = .025
        bevel.segments = 2
    bpy.context.view_layer.update()

    # Lower the seat and pilot with the canopy, keeping their original detail.
    fit = Matrix.Translation((0,0,1.90)) @ Matrix.Diagonal((.86,1,.76,1)) @ Matrix.Translation((0,0,-1.90))
    for obj in list(cockpit.objects):
        if obj.name.startswith('Verriere |'):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.parent == root:
            obj.matrix_world = fit @ obj.matrix_world

    # Four corners per section give two planar sides and a narrow flat roof.
    sections = [[(-w,y,z),(-.52*w,y,top),(.52*w,y,top),(w,y,z)]
                for y,w,z,top in CANOPY_SECTIONS]
    vertices = [p for section in sections for p in section]
    faces = [(j*4+i,j*4+i+1,(j+1)*4+i+1,(j+1)*4+i)
             for j in range(len(sections)-1) for i in range(3)]
    faces += [(3,2,1,0), tuple((len(sections)-1)*4+i for i in range(4))]
    canopy = mesh('Verriere | vitrage facette', vertices, faces, glass, cockpit)
    thickness = canopy.modifiers.new('Epaisseur du vitrage', 'SOLIDIFY')
    thickness.thickness = .012
    for i, label in enumerate(['base babord','arete babord','arete tribord','base tribord']):
        rail('Verriere | '+label, [s[i] for s in sections], .028 if i in [0,3] else .021)
    for j in [0,1,3,4,5]:
        rail('Verriere | montant '+str(j), sections[j], .027 if j in [1,3] else .022)
    root['fixed_fans_faceted_canopy'] = True
    root['fan_mounts'] = 'Fixed vertical +Z relative to the airframe; blades rotate only.'
    root['canopy_width_m'] = 1.22
    bpy.context.view_layer.update()
    return canopy
