"""Export a versioned Highwind Blender file to the game without modifying the source.

blender --background --disable-autoexec assets/Highwind/Highwind-v5.blend --python scripts/export-highwind-blend.py
"""
import bpy
import gzip
import hashlib
import json
import math
import re
import sys
import struct
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(bpy.data.filepath).resolve()
match = re.fullmatch(r'Highwind-(v[1-9]\d*)\.blend', SOURCE.name)
assert match and SOURCE.parent == (ROOT / 'assets/Highwind').resolve(), 'Open a supported Highwind source file'
VERSION = match[1]
OUTPUT = ROOT / 'dist/data/highwind' / VERSION
if '--' in sys.argv:
    args=sys.argv[sys.argv.index('--')+1:]
    assert len(args)==2 and args[0]=='--output'
    OUTPUT=Path(args[1]).resolve()
    assert OUTPUT.is_relative_to(ROOT/'artifacts'), 'Staging output must stay in project artifacts'
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
materials, material_ids, images, groups, objects = [], {}, {}, defaultdict(list), []
canonical = lambda p: [p[1], -p[0], p[2]]
rotor_names = ('PropL', 'PropR', 'PropTail')
rear_points = []
deck_points = []

def material_id(material):
    if material.name in material_ids:
        return material_ids[material.name]
    shaders = [n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']
    assert len(shaders) == 1, 'Review material graph: ' + material.name
    links = list(shaders[0].inputs['Base Color'].links)
    assert len(links) == 1 and links[0].from_node.type == 'TEX_IMAGE', 'Expected baked color image: ' + material.name
    image = links[0].from_node.image
    assert image and image.packed_file, 'Expected packed texture: ' + material.name
    if image.name not in images:
        data = bytes(image.packed_file.data)
        extension = '.webp' if data[:4] == b'RIFF' else '.png' if data[:8] == b'\x89PNG\r\n\x1a\n' else None
        assert extension, 'Unsupported texture: ' + image.name
        name = 'wood-deck' if image.name == 'V4 | Baked walnut grain' else Path(image.name).stem
        name = re.sub(r'[^A-Za-z0-9._-]+', '-', name).strip('-')
        filename = name + extension
        assert Path(filename).name == filename
        (OUTPUT / filename).write_bytes(data)
        images[image.name] = {'file': filename, 'size': list(image.size), 'sha256': hashlib.sha256(data).hexdigest()}
    idx = len(materials)
    material_ids[material.name] = idx
    materials.append({'name': material.name, 'kind': 17, 'texture': images[image.name]['file']})
    return idx

def rear_blades(mesh):
    # The saved Turbine contains twelve disconnected blades plus its fixed shaft.
    parents, seen = list(range(len(mesh.polygons))), {}
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    for face in mesh.polygons:
        for i in face.vertices:
            key = tuple(round(n, 4) for n in mesh.vertices[i].co)
            if key in seen:
                parents[find(face.index)] = find(seen[key])
            else:
                seen[key] = face.index
    components = defaultdict(list)
    for face in mesh.polygons:
        components[find(face.index)].append(face.index)
    blades = [faces for faces in components.values() if len(faces) == 36]
    assert len(blades) == 12, 'Review central rotor topology before exporting'
    return {i for faces in blades for i in faces}

for obj in bpy.context.scene.objects:
    if obj.type != 'MESH' or obj.hide_render:
        continue
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        mesh.calc_loop_triangles()
        assert mesh.uv_layers.active, 'Missing UVs: ' + obj.name
        uv = mesh.uv_layers.active.data
        normal_matrix = evaluated.matrix_world.to_3x3().inverted().transposed()
        ancestor, part = obj, obj.name
        while ancestor:
            if ancestor.name in rotor_names:
                part = ancestor.name
                break
            ancestor = ancestor.parent
        blades = rear_blades(mesh) if obj.name == 'Turbine' else set()
        objects.append({'name': obj.name, 'part': part, 'triangles': len(mesh.loop_triangles)})
        for tri in mesh.loop_triangles:
            animated = 'PropRear' if tri.polygon_index in blades else part
            material = material_id(mesh.materials[tri.material_index])
            for loop_id in tri.loops:
                loop = mesh.loops[loop_id]
                p = canonical(evaluated.matrix_world @ mesh.vertices[loop.vertex_index].co)
                n = canonical((normal_matrix @ mesh.corner_normals[loop_id].vector).normalized())
                tex = uv[loop_id].uv
                vertex = [*p, *n, tex[0], 1-tex[1], 1, 1, 1]
                assert all(math.isfinite(v) for v in vertex)
                groups[(animated, material)].append(vertex)
                if animated == 'PropRear':
                    rear_points.append(p)
                if obj.name.startswith('Pont |'):
                    deck_points.append(p)
    finally:
        evaluated.to_mesh_clear()

vertices = [v for group in groups.values() for v in group]
lower = [min(v[a] for v in vertices) for a in range(3)]
upper = [max(v[a] for v in vertices) for a in range(3)]
center = [(lower[a]+upper[a])/2 for a in range(3)]
length = upper[1]-lower[1]
assert length > max(upper[a]-lower[a] for a in [0, 2])
normalize = lambda p: [(p[a]-center[a])/length for a in range(3)]
rotors = {name: {'pivot': normalize(canonical(bpy.data.objects[name].matrix_world.translation)),
                 'axis': [0, 0, 1] if name in {'PropL', 'PropR'} else [0, 1, 0],
                 'direction': -1 if name == 'PropR' else 1} for name in rotor_names}
assert rear_points
rotors['PropRear'] = {'pivot': normalize([(min(p[a] for p in rear_points)+max(p[a] for p in rear_points))/2 for a in range(3)]), 'axis': [0, 1, 0], 'direction': 1}
# Exit on the upper surface of the new wooden deck; keep a point near the bow,
# away from the central supports, with the lateral alternatives used by the game.
deck = [center[0], center[1]+length*.045, max(p[2] for p in deck_points)] if deck_points else None
ranges, first = [], 0
for (part, material), group in groups.items():
    span = {'part': part, 'material': material, 'first': first, 'count': len(group)}
    # These thin, individual planks retain their top/bottom collision surfaces.
    # Their decorative seams must not become tall walls when the ship pitches.
    if part.startswith('Pont |'):
        span['collisionSurfaceOnly'] = True
    ranges.append(span)
    first += len(group)
for vertex in vertices:
    vertex[:3] = normalize(vertex[:3])
data = struct.pack('<%sf' % (len(vertices)*11), *(n for v in vertices for n in v))
index = {'version': 1, 'name': 'Highwind '+VERSION, 'mesh': 'mesh.bin', 'stride': 44, 'vertexCount': len(vertices),
         'normalisedLength': 1, 'forwardAxis': '+Y', 'upAxis': '+Z', 'positionAnchor': 'bounding-box centre',
         'bounds': [normalize(lower), normalize(upper)], 'rotors': rotors,
         'materials': materials, 'ranges': ranges, 'objects': objects,
         'source': SOURCE.relative_to(ROOT).as_posix(), 'sourceSha256': source_hash,
         'meshSha256': hashlib.sha256(data).hexdigest(), 'textures': list(images.values())}
if deck:index['deckExit']=normalize(deck)
index_bytes = (json.dumps(index, indent=2, ensure_ascii=False)+'\n').encode('utf-8')
for name, content in [('mesh.bin', data), ('index.json', index_bytes)]:
    (OUTPUT / name).write_bytes(content)
    (OUTPUT / (name+'.gz')).write_bytes(gzip.compress(content, mtime=0))
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash, 'Source changed during export'
print(json.dumps({'source': str(SOURCE), 'vertices': len(vertices), 'triangles': len(vertices)//3,
                  'draws': len(ranges), 'objects': len(objects), 'textures': len(images), 'deckExit': index.get('deckExit'),
                  'rotors': list(rotors), 'sourcePreserved': True}))
