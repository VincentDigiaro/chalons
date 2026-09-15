import sys,json
from pathlib import Path
sys.path.insert(0,str(Path('.cache/python-roads').resolve()))
from shapely import from_wkb, Point, STRtree, LineString
root=Path('artifacts/city-roads')
g={name:from_wkb((root/(name+'.wkb')).read_bytes()) for name in ['protected','ground','raised','sidewalks','kerbs']}
assert all(x.is_valid for x in g.values()),'Invalid surface geometry'
assert g['ground'].intersection(g['protected']).area<.2,'Road overwrites a detailed garden or street'
assert g['raised'].intersection(g['protected']).area<.2,'Bridge overwrites detailed geometry'
assert g['ground'].intersection(g['sidewalks']).area<.1,'Pavement overlaps the carriageway'
assert g['ground'].intersection(g['kerbs']).area<.1,'Kerbs cross the carriageway'
raw=json.loads(Path('.cache/osm.json').read_text(encoding='utf8')); origin=[4.3815,48.9475];scale=[73109.44253336328,111320]
local=lambda p: ((p[0]-origin[0])*scale[0],(p[1]-origin[1])*scale[1])
nodes={e['id']:local([e['lon'],e['lat']]) for e in raw['elements'] if e['type']=='node' and 'lon' in e}
from collections import Counter
degree=Counter()
for w in raw['elements']:
    if w['type']!='way' or w.get('tags',{}).get('highway') not in ('residential','primary','secondary','tertiary','unclassified','service'): continue
    for a,b in zip(w['nodes'],w['nodes'][1:]):degree[a]+=1;degree[b]+=1
inside=g['ground'].buffer(-.35);tested=0
for n,d in degree.items():
    if d<3 or n not in nodes:continue
    p=Point(nodes[n])
    if not inside.contains(p):continue
    assert p.distance(g['kerbs'])>.30,'An internal kerb blocks a junction'
    tested+=1
assert tested>500
print(json.dumps({'geometry':'passed','junctions':tested,'protectedSquareMetres':round(g['protected'].area,2)}))
