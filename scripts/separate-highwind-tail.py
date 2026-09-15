"""Separate all three aft propellers into PropTail, sharing the shaft's X axis.

Run inside the open Highwind Blender file. Background execution is a rehearsal
and writes only .cache/highwind-tail-preview.blend and its verification report.
"""
import bpy
import json
import math
from pathlib import Path
from collections import Counter, defaultdict
from datetime import datetime
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / 'assets' / 'Highwind'
assert Path(bpy.data.filepath).resolve() == (FOLDER / 'Highwind.blend').resolve()
existing_rotor = bpy.data.objects.get('PropTail')
if existing_rotor:
    assert existing_rotor.type == 'MESH' and len(existing_rotor.data.polygons) == 120, 'Expected the previous two-propeller split'
    assert not existing_rotor.modifiers and not existing_rotor.data.shape_keys
source = bpy.data.objects['Turbine']
assert source.type == 'MESH' and source.data.users == 1
assert not source.modifiers and not source.data.shape_keys
if bpy.context.object and bpy.context.object.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
mesh = source.data
parents, seen = list(range(len(mesh.polygons))), {}
def find(n):
    while parents[n] != n:
        parents[n] = parents[parents[n]]
        n = parents[n]
    return n
for face in mesh.polygons:
    for v in face.vertices:
        key = tuple(round(c, 4) for c in mesh.vertices[v].co)
        if key in seen:
            parents[find(face.index)] = find(seen[key])
        else:
            seen[key] = face.index
components = defaultdict(list)
for face in mesh.polygons:
    components[find(face.index)].append(face.index)
blades = []
for faces in components.values():
    points = [mesh.vertices[v].co for f in faces for v in mesh.polygons[f].vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    # Include the edge-on propeller at X=77.5 as well as X=161 and X=238.5.
    if len(faces) == 30 and lo.x > 70 and hi.x < 245:
        blades.append((faces, lo, hi))
expected_bounds = [(74,81),(74,81)] + ([] if existing_rotor else [(157,165),(157,165),(235,242),(235,242)])
assert sorted((round(lo.x),round(hi.x)) for _,lo,hi in blades) == expected_bounds
selected = {f for faces,_,_ in blades for f in faces}
assert len(selected) == (60 if existing_rotor else 180)
selected_vertices = {v for f in selected for v in mesh.polygons[f].vertices}
other_vertices = {v for f in mesh.polygons if f.index not in selected for v in f.vertices}
assert not selected_vertices.intersection(other_vertices), 'Unexpected shared blade topology'

def face_data(obj):
    data = obj.data
    uv = data.uv_layers.active
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    for face in data.polygons:
        corners, normals = [], []
        for loop_id in face.loop_indices:
            p = obj.matrix_world @ data.vertices[data.loops[loop_id].vertex_index].co
            n = (normal_matrix @ data.corner_normals[loop_id].vector).normalized()
            corners.append(tuple(round(x,3) for x in p) + tuple(round(x,6) for x in uv.data[loop_id].uv))
            normals.append(tuple(n))
        yield (data.materials[face.material_index].name, tuple(corners)), tuple(normals)

def signature(objects):
    records = Counter()
    for obj in objects:
        for key, _ in face_data(obj):
            records[key] += 1
    return records

def normal_snapshot(objects):
    records = defaultdict(list)
    for obj in objects:
        for key, normals in face_data(obj):
            records[key].append(normals)
    return records

bpy.context.view_layer.update()
affected = [source] + ([existing_rotor] if existing_rotor else [])
before = signature(affected)
normals_before = normal_snapshot(affected)
untouched = {obj.name: signature([obj]) for obj in bpy.context.scene.objects if obj.type=='MESH' and obj not in affected}
before_objects = set(bpy.data.objects)
original_source_matrix = source.matrix_world.copy()
triangle_count = sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH')
if not bpy.app.background:
    backup = FOLDER / ('Highwind-before-tail-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(backup), copy=True)

bpy.ops.object.select_all(action='DESELECT')
source.select_set(True)
bpy.context.view_layer.objects.active = source
bpy.context.scene.tool_settings.mesh_select_mode = (False, False, True)
for v in mesh.vertices:
    v.select = v.index in selected_vertices
for edge in mesh.edges:
    edge.select = all(v in selected_vertices for v in edge.vertices)
for face in mesh.polygons:
    face.select = face.index in selected
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.separate(type='SELECTED')
bpy.ops.object.mode_set(mode='OBJECT')
new_objects = set(bpy.data.objects) - before_objects
assert len(new_objects) == 1
rotor = new_objects.pop()
pivot_local = Vector((199.5,0,0))
if existing_rotor:
    original_pivot_matrix = existing_rotor.matrix_world.copy()
    bpy.ops.object.select_all(action='DESELECT')
    rotor.select_set(True)
    existing_rotor.select_set(True)
    bpy.context.view_layer.objects.active = existing_rotor
    bpy.ops.object.join()
    rotor = existing_rotor
    assert rotor.matrix_world == original_pivot_matrix, 'Keep the existing common pivot'
else:
    rotor.name = 'PropTail'
    rotor.data.name = 'PropTail'
    rotor.data.transform(Matrix.Translation(-pivot_local))
    rotor.matrix_basis = rotor.matrix_basis @ Matrix.Translation(pivot_local)
assert len(rotor.data.polygons) == 180
rotor.rotation_mode = 'XYZ'
rotor.lock_rotation = (False, True, True)
rotor['description'] = 'Trois helices de queue, pivot commun sur leur axe longitudinal'
rotor['rotation_axis'] = 'LOCAL_X'
rotor['propeller_count'] = 3
bpy.context.view_layer.update()
assert signature([source,rotor]) == before, 'Position, material or UV changed during separation'
normals_after = normal_snapshot([source,rotor])
normal_error = max((Vector(a)-Vector(b)).length for key in normals_before
                   for tri_a,tri_b in zip(sorted(normals_before[key]), sorted(normals_after[key]))
                   for a,b in zip(tri_a,tri_b))
# Blender re-encodes custom split normals when separating meshes.
assert normal_error < 0.002, f'Unexpected shading change: {normal_error}'
assert all(signature([bpy.data.objects[name]]) == sig for name,sig in untouched.items())
assert sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH') == triangle_count
assert (rotor.matrix_world.translation - original_source_matrix @ pivot_local).length < 0.0001

# Verify a quarter turn: all disks retain their axial positions and radii,
# while the fixed assembly and other objects remain unchanged.
rest_matrix = rotor.matrix_world.copy()
rest_rotation = rotor.rotation_euler.copy()
world_pivot = rest_matrix.translation
world_axis = (rest_matrix.to_3x3() @ Vector((1,0,0))).normalized()
points_before = [rest_matrix @ v.co for v in rotor.data.vertices]
rotor.rotation_euler.x += math.pi / 2
bpy.context.view_layer.update()
points_after = [rotor.matrix_world @ v.co for v in rotor.data.vertices]
errors = []
for a,b in zip(points_before,points_after):
    da,db = a-world_pivot,b-world_pivot
    axial_a,axial_b = da.dot(world_axis),db.dot(world_axis)
    errors.extend([abs(axial_a-axial_b),abs((da-world_axis*axial_a).length-(db-world_axis*axial_b).length)])
assert max(errors) < 0.0001
assert max((a-b).length for a,b in zip(points_before,points_after)) > 80
rotor.rotation_euler = rest_rotation
bpy.context.view_layer.update()
assert signature([source,rotor]) == before
bpy.ops.object.select_all(action='DESELECT')
rotor.select_set(True)
bpy.context.view_layer.objects.active = rotor
output = ROOT / '.cache' / 'highwind-tail-preview.blend' if bpy.app.background else FOLDER / 'Highwind.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(output))
report = {'output':str(output),'object':rotor.name,'parent':rotor.parent.name if rotor.parent else None,
          'propellers':3,'triangles_in_rotor':len(rotor.data.polygons),'triangles_total':triangle_count,
          'rotation_axis':'LOCAL_X','pivot_world':list(world_pivot),'quarter_turn_max_error':max(errors),
          'geometry_uv_materials_preserved':True,'max_normal_vector_error':normal_error}
report_path = ROOT / '.cache' / ('highwind-tail-rehearsal.json' if bpy.app.background else 'highwind-tail-result.json')
report_path.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
