"""Convert the supplied Collada archive to the FPS vertex layout, without Blender."""
from pathlib import Path
import hashlib, json, math, struct, zipfile, gzip
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / 'assets/PlayStation - Final Fantasy 7 International_ PERFECT GUIDE - Vehicles - Highwind.zip'
OUTPUT = ROOT / 'dist/data/highwind'
NS = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

def mul(a, b):
    return [sum(a[r*4+k]*b[k*4+c] for k in range(4)) for r in range(4) for c in range(4)]

def point(m, p):
    return [sum(m[r*4+k]*p[k] for k in range(3))+m[r*4+3] for r in range(3)]

def normal(m, n):
    # The archive uses rigid transforms; fail rather than silently distort normals.
    for a in range(3):
        for b in range(3):
            assert abs(sum(m[a*4+k]*m[b*4+k] for k in range(3))-(a == b)) < 1e-5
    q = [sum(m[r*4+k]*n[k] for k in range(3)) for r in range(3)]
    length = math.sqrt(sum(v*v for v in q))
    return [v/length for v in q] if length else [0, 0, 1]

with zipfile.ZipFile(ARCHIVE) as archive:
    document = ET.fromstring(archive.read('Highwind/Highwind.dae'))
    assert document.find('c:asset/c:up_axis', NS).text == 'Z_UP'
    images = {i.attrib['id']: i.find('c:init_from', NS).text for i in document.findall('c:library_images/c:image', NS)}
    effects = {}
    for effect in document.findall('c:library_effects/c:effect', NS):
        params = {p.attrib['sid']: p for p in effect.findall('c:profile_COMMON/c:newparam', NS)}
        texture = effect.find('.//c:diffuse/c:texture', NS).attrib['texture']
        surface = params[texture].find('c:sampler2D/c:source', NS).text
        effects[effect.attrib['id']] = images[params[surface].find('c:surface/c:init_from', NS).text]
    materials = []
    ids = {}
    for material in document.findall('c:library_materials/c:material', NS):
        ids[material.attrib['id']] = len(materials)
        materials.append({'name': material.attrib['name'], 'kind': 17, 'texture': effects[material.find('c:instance_effect', NS).attrib['url'][1:]]})
    geometries = {g.attrib['id']: g.find('c:mesh', NS) for g in document.findall('c:library_geometries/c:geometry', NS)}
    groups = []
    pivots = {}
    turbine_origins = []

    def visit(node, parent):
        transform = parent
        for element in node:
            tag = element.tag.split('}')[-1]
            if tag == 'matrix':
                transform = mul(transform, list(map(float, element.text.split())))
            assert tag not in ['translate', 'rotate', 'scale', 'skew', 'lookat'], 'Unsupported transform'
        for instance in node.findall('c:instance_geometry', NS):
            if node.attrib['name'] == 'Turbine':
                p = point(transform, [0, 0, 0])
                turbine_origins.append([p[1], -p[0], p[2]])
            if node.attrib['name'] in ['PropL', 'PropR']:
                p = point(transform, [0, 0, 0])
                pivots[node.attrib['name']] = [p[1], -p[0], p[2]]
            mesh = geometries[instance.attrib['url'][1:]]
            bindings = {m.attrib['symbol']: ids[m.attrib['target'][1:]] for m in instance.findall('.//c:instance_material', NS)}
            sources = {}
            for source in mesh.findall('c:source', NS):
                values = list(map(float, source.find('c:float_array', NS).text.split()))
                accessor = source.find('c:technique_common/c:accessor', NS)
                stride, offset = int(accessor.attrib['stride']), int(accessor.attrib.get('offset', 0))
                sources[source.attrib['id']] = [values[offset+i*stride:offset+(i+1)*stride] for i in range(int(accessor.attrib['count']))]
            positions = {v.attrib['id']: v.find("c:input[@semantic='POSITION']", NS).attrib['source'][1:] for v in mesh.findall('c:vertices', NS)}
            assert not mesh.findall('c:polylist', NS), 'Expected triangulated mesh'
            for triangles in mesh.findall('c:triangles', NS):
                inputs = {i.attrib['semantic']: (i.attrib['source'][1:], int(i.attrib['offset'])) for i in triangles.findall('c:input', NS)}
                stride = max(offset for _, offset in inputs.values())+1
                indices = list(map(int, triangles.find('c:p', NS).text.split()))
                assert len(indices) == int(triangles.attrib['count'])*3*stride
                vertices = []
                for at in range(0, len(indices), stride):
                    values = {}
                    for semantic, (source, offset) in inputs.items():
                        source = positions[source] if semantic == 'VERTEX' else source
                        values[semantic] = sources[source][indices[at+offset]]
                    p, n, uv = point(transform, values['VERTEX']), normal(transform, values['NORMAL']), values['TEXCOORD']
                    # The bow points towards source -X. Canonical +Y is forward,
                    # +X is starboard and +Z is up; UVs match unflipped PNG uploads.
                    vertices.append([p[1], -p[0], p[2], n[1], -n[0], n[2], uv[0], 1-uv[1], 1, 1, 1])
                groups.append((node.attrib['name'], bindings[triangles.attrib['material']], vertices))
        for child in node.findall('c:node', NS):
            visit(child, transform)

    scene_id = document.find('c:scene/c:instance_visual_scene', NS).attrib['url'][1:]
    scene = document.find("c:library_visual_scenes/c:visual_scene[@id='%s']" % scene_id, NS)
    for node in scene.findall('c:node', NS):
        visit(node, IDENTITY)
    all_vertices = [v for _, _, group in groups for v in group]
    lower = [min(v[a] for v in all_vertices) for a in range(3)]
    upper = [max(v[a] for v in all_vertices) for a in range(3)]
    centre = [(lower[a]+upper[a])/2 for a in range(3)]
    length = upper[1]-lower[1]
    assert length > max(upper[a]-lower[a] for a in [0, 2]), 'Unexpected longitudinal axis'
    for v in all_vertices:
        v[:3] = [(v[a]-centre[a])/length for a in range(3)]
        assert all(math.isfinite(n) for n in v)
    # Separate the central rotor and all three aft propellers from the shaft.
    # PropTail matches the shared pivot created in Highwind.blend.
    split_groups = []
    rear_pivot = None
    tail_pivot = None
    assert len(turbine_origins) == 1
    turbine_origin = [(turbine_origins[0][a]-centre[a])/length for a in range(3)]
    for part, material, group in groups:
        if part != 'Turbine':
            split_groups.append((part, material, group))
            continue
        parent, seen = list(range(len(group)//3)), {}
        def find(n):
            while parent[n] != n:
                parent[n] = parent[parent[n]]
                n = parent[n]
            return n
        for t in range(len(parent)):
            for vertex in group[t*3:t*3+3]:
                key = tuple(round(n, 6) for n in vertex[:3])
                if key in seen:
                    parent[find(t)] = find(seen[key])
                else:
                    seen[key] = t
        components = {}
        for t in range(len(parent)):
            components.setdefault(find(t), []).append(t)
        blades = [triangles for triangles in components.values() if len(triangles) == 36]
        assert len(blades) == 12, 'Review the rear rotor in a changed archive'
        blade_ids = set(t for blade in blades for t in blade)
        tail_blades = [triangles for triangles in components.values() if len(triangles) == 30
                       and all(70 < (turbine_origin[1]-v[1])*length < 245
                               for t in triangles for v in group[t*3:t*3+3])]
        assert len(tail_blades) == 6, 'Expected six blades in the three aft propellers'
        stations = sorted((round(min((turbine_origin[1]-v[1])*length for t in blade for v in group[t*3:t*3+3])),
                           round(max((turbine_origin[1]-v[1])*length for t in blade for v in group[t*3:t*3+3])))
                          for blade in tail_blades)
        assert stations == [(74,81),(74,81),(157,165),(157,165),(235,242),(235,242)], 'Review the tail blade locations'
        tail_ids = set(t for blade in tail_blades for t in blade)
        assert len(tail_ids) == 180 and not tail_ids.intersection(blade_ids)
        rotating = [v for t in range(len(parent)) if t in blade_ids for v in group[t*3:t*3+3]]
        tail = [v for t in range(len(parent)) if t in tail_ids for v in group[t*3:t*3+3]]
        fixed = [v for t in range(len(parent)) if t not in blade_ids and t not in tail_ids for v in group[t*3:t*3+3]]
        rear_pivot = [(min(v[a] for v in rotating)+max(v[a] for v in rotating))/2 for a in range(3)]
        tail_pivot = [turbine_origin[0],turbine_origin[1]-199.5/length,turbine_origin[2]]
        split_groups.extend([('Turbine', material, fixed), ('PropRear', material, rotating), ('PropTail', material, tail)])
    groups = split_groups
    all_vertices = [v for _, _, group in groups for v in group]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ranges, first = [], 0
    for part, material, group in groups:
        ranges.append({'part': part, 'material': material, 'first': first, 'count': len(group)})
        first += len(group)
    data = struct.pack('<%sf' % (len(all_vertices)*11), *(n for v in all_vertices for n in v))
    (OUTPUT/'mesh.bin').write_bytes(data)
    for material in materials:
        name = material['texture']
        assert Path(name).name == name
        (OUTPUT/name).write_bytes(archive.read('Highwind/'+name))
    index = {'version': 1, 'name': 'Highwind', 'mesh': 'mesh.bin', 'stride': 44, 'vertexCount': len(all_vertices),
             'normalisedLength': 1, 'forwardAxis': '+Y', 'upAxis': '+Z', 'positionAnchor': 'bounding-box centre',
             'bounds': [[(lower[a]-centre[a])/length for a in range(3)], [(upper[a]-centre[a])/length for a in range(3)]],
             'rotors': {**{name: {'pivot': [(p[a]-centre[a])/length for a in range(3)], 'axis': [0, 0, 1], 'direction': 1 if name == 'PropL' else -1} for name, p in pivots.items()},
                        'PropRear': {'pivot': rear_pivot, 'axis': [0, 1, 0], 'direction': 1},
                        'PropTail': {'pivot': tail_pivot, 'axis': [0, 1, 0], 'direction': 1}},
             'materials': materials, 'ranges': ranges, 'source': ARCHIVE.name,
             'sourceSha256': hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), 'meshSha256': hashlib.sha256(data).hexdigest()}
    index_bytes = (json.dumps(index, indent=2)+'\n').encode('utf-8')
    (OUTPUT/'index.json').write_bytes(index_bytes)
    # Nginx serves precompressed files; keep them in sync after a reimport.
    (OUTPUT/'index.json.gz').write_bytes(gzip.compress(index_bytes, mtime=0))
    (OUTPUT/'mesh.bin.gz').write_bytes(gzip.compress(data, mtime=0))
    print(json.dumps({'vertices': len(all_vertices), 'triangles': len(all_vertices)//3, 'parts': sorted(set(g[0] for g in groups)),
                      'textures': len(materials), 'sizeAt237m': [(upper[a]-lower[a])/length*237 for a in range(3)]}))
