"""Native rear tube geometry, shared by the generator and targeted model edit."""
import bpy
import bmesh
import math
from mathutils import Vector

SIDES = [('babord', -1.34), ('tribord', 1.34)]
HOLES = [(0, 0)] + [(.20 * math.cos(i * math.tau / 6), .20 * math.sin(i * math.tau / 6)) for i in range(6)]


def recalc(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def add_launcher_rears():
    bpy.context.view_layer.update()
    root = bpy.data.objects['ORCA GDI | ensemble']
    collection = bpy.data.collections['05 | Armement']
    metal = bpy.data.materials['Titane sombre | mecanique']
    steel = bpy.data.materials['Aretes | metal satine']
    black = bpy.data.materials['Cavite | noir']
    added = []

    def own(obj, name, materials):
        obj.name = name
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        collection.objects.link(obj)
        obj.parent = root
        obj.data.materials.clear()
        for material in materials:
            obj.data.materials.append(material)
        # Keep the circular holes and inset walls in the game mesh too.
        obj['game_lod_ratio'] = 1.0
        added.append(name)
        return obj

    for side, x in SIDES:
        assert not bpy.data.objects.get('Roquettes | plaque arriere percee ' + side), 'Rear tubes already built'
        collar = bpy.data.objects['Roquettes | bague arriere ' + side]
        # Replace the solid rear cap with an annular collar. The body already
        # has an open rear end, so neither old cap can cover the new tube wells.
        inv = collar.matrix_world.inverted()
        profile = [(-1.14, .341), (-1.22, .341), (-1.22, .304), (-1.14, .304)]
        verts = [inv @ Vector((x + radius * math.cos(i * math.tau / 12), y, .85 + radius * math.sin(i * math.tau / 12))) for y, radius in profile for i in range(12)]
        faces = [(j * 12 + i, j * 12 + (i + 1) % 12, ((j + 1) % 4) * 12 + (i + 1) % 12, ((j + 1) % 4) * 12 + i) for j in range(4) for i in range(12)]
        data = bpy.data.meshes.new('Collier arriere ouvert | ' + side)
        data.from_pydata(verts, [], faces)
        data.materials.append(metal)
        recalc(data)
        collar.data = data
        collar['game_lod_ratio'] = 1.0
        for face in data.polygons:
            face.use_smooth = True

        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.310, depth=.035, location=(x, -1.1795, .85), rotation=(math.pi / 2, 0, 0))
        plate = own(bpy.context.object, 'Roquettes | plaque arriere percee ' + side, [metal])
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for dx, dz in HOLES:
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.0615, depth=.20, location=(x + dx, -1.18, .85 + dz), rotation=(math.pi / 2, 0, 0))
            cutter = bpy.context.object
            modifier = plate.modifiers.new('Percage du tube', 'BOOLEAN')
            modifier.operation = 'DIFFERENCE'
            modifier.solver = 'EXACT'
            modifier.object = cutter
            bpy.context.view_layer.objects.active = plate
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bpy.data.objects.remove(cutter, do_unlink=True)
        recalc(plate.data)

        for j, (dx, dz) in enumerate(HOLES):
            xx, zz = x + dx, .85 + dz
            # Outer sleeve, raised bevel, lip, inner bevel, deep dark barrel.
            rings = [(-1.284, .067), (-1.168, .079), (-1.120, .079), (-1.108, .071), (-1.108, .059), (-1.125, .054), (-1.277, .054)]
            n = 24
            points = [(xx + radius * math.cos(i * math.tau / n), y, zz + radius * math.sin(i * math.tau / n)) for y, radius in rings for i in range(n)]
            polygons, material_ids = [], []
            for k in range(len(rings) - 1):
                for i in range(n):
                    polygons.append((k*n+i, k*n+(i+1)%n, (k+1)*n+(i+1)%n, (k+1)*n+i))
                    material_ids.append(2 if k == 5 else 1 if k in [2, 3, 4] else 0)
            for ring, y in [(0, -1.284), (len(rings)-1, -1.277)]:
                center = len(points)
                points.append((xx, y, zz))
                for i in range(n):
                    polygons.append((center, ring*n+i, ring*n+(i+1)%n))
                    material_ids.append(2)
            mesh = bpy.data.meshes.new('Tube arriere creux | ' + side + ' %02d' % j)
            mesh.from_pydata(points, [], polygons)
            mesh.update()
            obj = bpy.data.objects.new('Tube', mesh)
            collection.objects.link(obj)
            own(obj, 'Roquettes | sortie tube arriere %s %02d' % (side, j), [metal, steel, black])
            recalc(mesh)
            for face, mat in zip(mesh.polygons, material_ids):
                face.material_index = mat
                face.use_smooth = len(face.vertices) == 4
            obj['inset_depth_m'] = .169
    bpy.context.view_layer.update()
    return added
