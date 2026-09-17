"""Read-only inspection of a Highwind Blender asset, run with --disable-autoexec."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

report = {'file': bpy.data.filepath, 'objects': [], 'materials': [], 'images': []}
for obj in bpy.context.scene.objects:
    item = {'name': obj.name, 'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
            'hidden': obj.hide_render, 'origin': list(obj.matrix_world.translation),
            'matrix': [list(row) for row in obj.matrix_world], 'properties': dict(obj.items())}
    if obj.type == 'MESH':
        points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
        item.update(vertices=len(obj.data.vertices), faces=len(obj.data.polygons),
                    bounds=[[min(p[a] for p in points) for a in range(3)], [max(p[a] for p in points) for a in range(3)]],
                    materials=[m.name if m else None for m in obj.data.materials],
                    uvLayers=[u.name for u in obj.data.uv_layers], modifiers=[m.type for m in obj.modifiers])
    report['objects'].append(item)
for mat in bpy.data.materials:
    report['materials'].append({'name': mat.name, 'diffuse': list(mat.diffuse_color), 'nodes': [
        {'name': n.name, 'type': n.type, 'image': n.image.name if n.type == 'TEX_IMAGE' and n.image else None,
         'inputs': {s.name: list(s.default_value) if hasattr(s.default_value, '__len__') and not isinstance(s.default_value, str) else s.default_value
                    for s in n.inputs if hasattr(s, 'default_value') and s.name in ['Base Color', 'Roughness', 'Metallic', 'Alpha']}}
        for n in mat.node_tree.nodes] if mat.node_tree else [],
        'links': [[l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name] for l in mat.node_tree.links] if mat.node_tree else []})
for im in bpy.data.images:
    report['images'].append({'name': im.name, 'path': im.filepath, 'packed': bool(im.packed_file), 'size': list(im.size), 'source': im.source})
output = Path(__file__).resolve().parent.parent / 'artifacts/highwind-v4/inspection.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'report': str(output), 'objects': [{k:v for k,v in o.items() if k not in ['matrix','properties']} for o in report['objects']], 'materials': report['materials'], 'images': report['images']}))
