"""Build a tiled road mesh from the existing OSM extraction (no visitor API).

Requirements: scripts/roads-requirements.txt. Local optional wheel cache is used
by build-city-roads.mjs. GEOS unions carriageways BEFORE deriving pavement edges,
so junctions have neither internal kerbs nor overlapping coplanar road strips.
"""
import sys, json, math, hashlib, struct, heapq, collections
from pathlib import Path
sys.path.insert(0, str(Path('.cache/python-roads').resolve()))
import numpy as np
from shapely import (Point, LineString, Polygon, GeometryCollection, box,
                     union_all, make_valid, constrained_delaunay_triangles, STRtree)
from shapely.ops import transform
from shapely.geometry import shape
from shapely.geometry import mapping

ROOT = Path('dist/data/city-roads')
ROOT.mkdir(parents=True, exist_ok=True)
(ROOT/'chunks').mkdir(exist_ok=True)
ORIGIN = [4.3815, 48.9475]
SCALE = [73109.44253336328, 111320]
CELL = 128
HASHES = {}
def read(file, binary=False):
    b = Path(file).read_bytes()
    HASHES[file] = hashlib.sha256(b).hexdigest()
    return b if binary else json.loads(b)
def local(p): return ((p[0]-ORIGIN[0])*SCALE[0], (p[1]-ORIGIN[1])*SCALE[1])
def projected(g): return transform(lambda x,y,z=None: ((np.asarray(x)-ORIGIN[0])*SCALE[0], (np.asarray(y)-ORIGIN[1])*SCALE[1]), shape(g))
def parts(g, kind='Polygon'):
    if g.is_empty: return []
    if g.geom_type == kind: return [g]
    return [p for c in getattr(g, 'geoms', []) for p in parts(c, kind)]
def number(value):
    try: return float(str(value).replace(',', '.').split()[0])
    except (ValueError, TypeError, IndexError): return None
def merged(polys): return make_valid(union_all(polys)) if polys else GeometryCollection()
def buffer(g, w): return g.buffer(w, quad_segs=4, join_style='round')

raw = read('.cache/osm.json')
manifest = read('dist/data/manifest.json')
b = manifest['bbox']; sw=local([b['west'],b['south']]); ne=local([b['east'],b['north']]); extent=box(*sw,*ne)
nodes = {e['id']: local([e['lon'],e['lat']]) for e in raw['elements'] if e['type']=='node' and 'lon' in e}
ways = [e for e in raw['elements'] if e['type']=='way' and e.get('tags',{}).get('highway')]

# Protect ALL existing modeled ground, including gardens and the corrected ends.
protected = []
for name in ['nerval','attila']:
    idx=read(f'dist/data/{name}/index.json'); data=np.frombuffer(read(f'dist/data/{name}/mesh.bin',True),dtype='<f4').reshape(-1,11)
    scale=idx.get('scale',SCALE); origin=idx['origin']
    for r in idx['ranges']:
        if idx['materials'][r['material']]['kind'] not in (6,7,8,9,14,15,16): continue
        for tri in data[r['first']:r['first']+r['count']].reshape(-1,3,11):
            if np.max(tri[:,2])>.5 or np.min(tri[:,5])<.8: continue
            points=[local([origin[0]+float(p[0])/scale[0],origin[1]+float(p[1])/scale[1]]) for p in tri]
            poly=Polygon(points)
            if poly.area>.00001: protected.append(poly)
protection=merged(protected).buffer(.025).simplify(.005,preserve_topology=True)
buildings=read('dist/data/buildings.geojson')
obstacles=merged([make_valid(projected(f['geometry'])) for f in buildings['features'] if f['properties'].get('min_height',0)<.3])
obstacle_parts=parts(obstacles); obstacle_tree=STRtree(obstacle_parts)
land=read('dist/data/land.geojson')
urban=merged([make_valid(projected(f['geometry'])) for f in land['features'] if f['properties']['kind'] in ('residential','commercial','retail','industrial')])
water=merged([make_valid(projected(f['geometry'])) for f in land['features'] if f['properties']['kind']=='water'])

defaults={'motorway':7.2,'trunk':7,'primary':6.6,'secondary':6.2,'tertiary':5.8,'residential':5.4,'unclassified':5.2,'living_street':4.5,'service':3.3,'busway':6,'pedestrian':3.8,'footway':1.7,'cycleway':2.5,'track':3,'path':1.5,'steps':1.5}
pedestrian={'footway','cycleway','path','steps','pedestrian'}
records=[]; skipped=[]; graph=collections.defaultdict(list); seeds={}
for w in ways:
    tags=w['tags']; kind=tags['highway']; base=kind.removesuffix('_link')
    if base not in defaults or len(w['nodes'])<2:
        skipped.append({'id':w['id'],'reason':'non-linear highway facility'}); continue
    if any(n not in nodes for n in w['nodes']):
        skipped.append({'id':w['id'],'reason':'missing coordinates'}); continue
    points=[nodes[n] for n in w['nodes']]; line=LineString(points)
    if not line.intersects(extent): continue
    buried=tags.get('tunnel')=='yes' or (number(tags.get('layer')) or 0)<0
    if buried:
        skipped.append({'id':w['id'],'reason':'underground (surface not inferred)'}); continue
    measured=number(tags.get('width')); lanes=number(tags.get('lanes'))
    width=measured or (max(1,lanes)*3.05 if lanes and base not in pedestrian else None) or defaults[base]
    if not measured and not lanes and tags.get('oneway') in ('yes','-1') and base in ('primary','secondary','tertiary','residential','unclassified'): width=3.6
    if kind.endswith('_link'): width=min(width,4)
    width=max(.7,min(18,width))
    urban_here=urban.intersects(line)
    sidewalk=tags.get('sidewalk')
    sides=[]
    if sidewalk in ('both','yes'): sides=['left','right']
    elif sidewalk in ('left','right'): sides=[sidewalk]
    elif sidewalk not in ('no','none','separate') and urban_here and base in ('primary','secondary','tertiary','residential','unclassified'): sides=['left','right']
    sides=[s for s in sides if tags.get('sidewalk:'+s) not in ('no','separate')]
    swidth=number(tags.get('sidewalk:width')) or 1.35
    bridge=tags.get('bridge') not in (None,'no')
    r={'id':w['id'],'name':tags.get('name',''),'kind':kind,'base':base,'nodes':w['nodes'],'points':points,'line':line,'width':width,'widthSource':'width' if measured else 'lanes' if lanes else 'estimated','sides':sides,'sidewalkWidth':swidth,'tags':tags,'bridge':bridge}
    records.append(r)
    # Propagate bridge deck levels along CONNECTED road nodes, never to an
    # unrelated road underneath. Heights are indicative because OSM has no DEM.
    if tags.get('area')!='yes':
        for a,c in zip(w['nodes'],w['nodes'][1:]):
            d=math.dist(nodes[a],nodes[c]); graph[a].append((c,d)); graph[c].append((a,d))
        if bridge:
            h=4.5*max(1,number(tags.get('layer')) or 1)
            for n in w['nodes']: seeds[n]=max(seeds.get(n,0),h)
heights=dict(seeds); queue=[(-h,n) for n,h in seeds.items()]; heapq.heapify(queue)
while queue:
    nh,n=heapq.heappop(queue); h=-nh
    if h<heights[n]-1e-6: continue
    for other,d in graph[n]:
        value=h-d/16
        if value>.015 and value>heights.get(other,0):
            heights[other]=value; heapq.heappush(queue,(-value,other))

surfaces=collections.defaultdict(list); surrounds=collections.defaultdict(list); allroad=collections.defaultdict(list)
heightlines=[]; heightpairs=[]; crossings=[]; coverage=[]
for r in records:
    tags=r['tags']; w=r['width']; base=r['base']; line=r['line']; raised=any(heights.get(n,0)>.015 for n in r['nodes'])
    surface=tags.get('surface','')
    material=2 if surface in ('paving_stones','sett','pebblestone') else 3 if surface in ('gravel','fine_gravel','compacted','dirt','ground','grass','unpaved','sand') or (not surface and base in ('path','track')) else 1 if base in pedestrian else 0
    group=1 if raised else 0
    if tags.get('area')=='yes' and line.is_ring:
        road=make_valid(Polygon(r['points'])); group=0
    else: road=buffer(line,w/2)
    # Building passages retain their covered pavement; normal roads are clipped
    # at building footprints and shorelines rather than painting through them.
    nearby=buffer(line,w/2+r['sidewalkWidth']+.2)
    mask=protection
    if tags.get('tunnel')!='building_passage': mask=merged([protection,*[obstacle_parts[int(i)] for i in obstacle_tree.query(nearby)]])
    road=road.intersection(extent).difference(mask)
    if not raised and tags.get('ford') not in ('yes','stepping_stones'): road=road.difference(water)
    surfaces[group,material].append(road); allroad[group].append(road)
    pavement=[]
    for side in r['sides']:
        strip=line.buffer((w/2+r['sidewalkWidth'])*(1 if side=='left' else -1),single_sided=True,join_style='round')
        pavement.append(strip)
    if pavement: surrounds[group].append(merged(pavement).difference(mask).intersection(extent))
    if raised:
        for i in range(len(r['points'])-1):
            a,c=r['points'][i:i+2]
            if math.dist(a,c)<.001: continue
            heightlines.append(LineString([a,c])); heightpairs.append((heights.get(r['nodes'][i],0),heights.get(r['nodes'][i+1],0)))
    if tags.get('footway')=='crossing' and tags.get('crossing') not in ('unmarked','no'):
        crossings.append(r)
    coverage.append({'id':r['id'],'name':r['name'],'kind':r['kind'],'width':w,'widthSource':r['widthSource'],'sidewalks':r['sides'],'bridge':r['bridge'],'length':round(line.intersection(extent).length,2),'coveredArea':round(road.area,2),'protectedArea':round(buffer(line,w/2).intersection(protection).area,2)})
print('Roads buffered:',len(records),flush=True)

# Make one continuous carriageway per grade, then derive kerbs solely along
# its outside perimeter. Foot/cycle paths are lower-priority at road crossings.
layers=[]; carriageways={}; sidewalks={}; kerbs={}
for grade in [0,1]:
    done=GeometryCollection(); bymat={}
    for material in [0,2,3,1]:
        g=merged(surfaces[grade,material]).difference(done).simplify(.018,preserve_topology=True)
        bymat[material]=g; done=done.union(g)
    carriageways[grade]=done
    sw=merged(surrounds[grade]).difference(done).difference(water if grade==0 else GeometryCollection())
    curb=sw.intersection(done.buffer(.15))
    sidewalks[grade]=sw.difference(curb); kerbs[grade]=curb
    for material,g in bymat.items(): layers.append((material,.035,grade,g))
    layers += [(1,.155,grade,sidewalks[grade]),(4,.155,grade,curb)]

# Zebra crossings only where the extraction explicitly identifies a crossing
# way. Their stripes run along the road, across the pedestrian travel direction.
paint=[]
for r in crossings:
    line=r['line']; length=line.length
    if length<2 or length>35: continue
    p0=line.interpolate(0); p1=line.interpolate(length); dx=(p1.x-p0.x)/length; dy=(p1.y-p0.y)/length
    for at in np.arange(.55,length-.3,.95):
        q=line.interpolate(float(at)); a=(q.x-dx*.23,q.y-dy*.23); c=(q.x+dx*.23,q.y+dy*.23)
        stripe=Polygon([(a[0]+dy*1.2,a[1]-dx*1.2),(c[0]+dy*1.2,c[1]-dx*1.2),(c[0]-dy*1.2,c[1]+dx*1.2),(a[0]-dy*1.2,a[1]+dx*1.2)])
        paint.append(stripe.intersection(carriageways[0]).difference(protection))
layers.append((5,.044,0,merged(paint)))

# A simplified overview keeps the whole network visible when zoomed out. Close
# views replace it with the streamed 3D sectors rather than loading the city.
overview=[]
for mat,z,grade,geom in layers:
    if mat in (4,5): continue
    for poly in parts(geom.simplify(.25,preserve_topology=True)):
        if poly.area<1: continue
        geographic=transform(lambda x,y,z=None: (np.round(np.asarray(x)/SCALE[0]+ORIGIN[0],6),np.round(np.asarray(y)/SCALE[1]+ORIGIN[1],6)),poly)
        overview.append({'type':'Feature','properties':{'material':mat},'geometry':mapping(geographic)})
(ROOT/'overview.geojson').write_text(json.dumps({'type':'FeatureCollection','features':overview},separators=(',',':')),encoding='utf8')

htree=STRtree(heightlines) if heightlines else None
def elevation(x,y,grade):
    if not grade: return 0
    p=Point(x,y); i=int(htree.nearest(p)); segment=heightlines[i]; a,c=heightpairs[i]
    return a+(c-a)*segment.project(p)/segment.length
colors=[[.79,.81,.83],[.67,.70,.72],[.93,.92,.90],[1.42,1.18,.85],[.61,.61,.57],[.85,.84,.77]]
materials=[{'name':n,'kind':14 if i<4 else 2,'texture':'../nerval/'+('ground-pavers-v1.webp' if i==2 else 'ground-asphalt-v1.webp') if i<4 else None,'repeat':True} for i,n in enumerate(['Chaussée','Trottoir','Pavés','Chemin','Bordure','Peinture'])]
packets=collections.defaultdict(lambda:collections.defaultdict(list)); triangle_area=0
def emit(mat, points, normal=(0,0,1)):
    center=np.mean(points,axis=0); key=(math.floor(center[0]/CELL),math.floor(center[1]/CELL)); target=packets[key][mat]
    for x,y,z in points: target.extend([x,y,z,*normal,x/2,y/2,*colors[mat]])

for mat,z,grade,geometry in layers:
    for poly in parts(geometry):
        if poly.area<.008: continue
        x0,y0,x1,y1=poly.bounds
        for tx in range(math.floor(x0/CELL),math.floor(x1/CELL)+1):
            for ty in range(math.floor(y0/CELL),math.floor(y1/CELL)+1):
                clipped=poly.intersection(box(tx*CELL,ty*CELL,(tx+1)*CELL,(ty+1)*CELL))
                if clipped.is_empty: continue
                if grade: clipped=clipped.segmentize(6)
                for tri in parts(constrained_delaunay_triangles(clipped)):
                    points=[(x,y,z+elevation(x,y,grade)) for x,y in list(tri.exterior.coords)[:3]]
                    a,c,d=np.asarray(points); normal=np.cross(c-a,d-a); length=np.linalg.norm(normal)
                    if length<1e-8: continue
                    normal=normal/length
                    if normal[2]<0: points.reverse(); normal=-normal
                    emit(mat,points,normal); triangle_area+=tri.area
    print('Triangulated',mat,'grade',grade,flush=True)

# Kerb risers are emitted from the original boundaries, NEVER from tile cuts.
for grade in [0,1]:
    for poly in parts(kerbs[grade]):
        for ring in [poly.exterior,*poly.interiors]:
            coords=list(ring.segmentize(6 if grade else 128).coords)
            for a,c in zip(coords,coords[1:]):
                length=math.dist(a,c)
                if length<.02: continue
                ha=elevation(*a,grade); hc=elevation(*c,grade); normal=((c[1]-a[1])/length,(a[0]-c[0])/length,0)
                v=[(*a,.035+ha),(*c,.035+hc),(*c,.155+hc),(*a,.155+ha)]
                emit(4,v[:3],normal); emit(4,[v[0],v[2],v[3]],normal)

catalogue=[]; totalbytes=0; vertices=0
for key,groups in sorted(packets.items()):
    arrays=[]; ranges=[]; first=0
    for mat,values in sorted(groups.items()):
        array=np.asarray(values,dtype='<f4').reshape(-1,11); arrays.append(array); ranges.append([mat,first,len(array)]); first+=len(array)
    data=np.concatenate(arrays); bounds=[math.floor(float(np.min(data[:,0]))*100)/100,math.floor(float(np.min(data[:,1]))*100)/100,math.ceil(float(np.max(data[:,0]))*100)/100,math.ceil(float(np.max(data[:,1]))*100)/100]
    header=json.dumps({'ranges':ranges,'segments':[],'cityRoads':True},separators=(',',':')).encode(); header+=b' '*((-len(header))%4)
    content=struct.pack('<I',len(header))+header+data.tobytes(); digest=hashlib.sha256(content).hexdigest()[:16]; file=f'chunks/{key[0]}_{key[1]}_{digest}.bin'
    (ROOT/file).write_bytes(content); catalogue.append([file,*bounds]); totalbytes+=len(content); vertices+=len(data)
stats={'ways':len(records),'kilometres':round(sum(r['length'] for r in coverage)/1000,2),'chunks':len(catalogue),'vertices':vertices,'bytes':totalbytes,'crossingWays':len(crossings),'bridgeWays':sum(r['bridge'] for r in records),'estimatedWidths':sum(r['widthSource']=='estimated' for r in coverage),'protectedArea':round(protection.area,2),'surfaceArea':round(sum(g.area for _,_,_,g in layers),2)}
index={'version':1,'origin':ORIGIN,'scale':SCALE,'bounds':[b['west'],b['south'],b['east'],b['north']],'cellSize':CELL,'materials':materials,'nodes':catalogue,'stats':stats,'sourceHashes':HASHES,'provenance':{'source':'© OpenStreetMap contributors','timestamp':raw.get('osm3s',{}).get('timestamp_osm_base'),'license':'ODbL-1.0','widths':'OSM width, then lanes × 3.05 m, otherwise class defaults','sidewalks':'OSM side tags; otherwise indicative 1.35 m pavements on urban streets','bridges':'Indicative 4.5 m per positive layer, connected approach ramps at most 1:16; no surveyed terrain elevations','crossings':'Only crossing ways explicitly recorded in the extraction','underground':'Buried links are not painted on the aerial ground'}}
(ROOT/'index.json').write_text(json.dumps(index,separators=(',',':')),encoding='utf8')
(ROOT/'coverage.json').write_text(json.dumps({'ways':coverage,'omitted':skipped},separators=(',',':')),encoding='utf8')
# Save compact geometry evidence for regression checks (not a rendering payload).
from shapely import to_wkb
Path('artifacts/city-roads').mkdir(parents=True,exist_ok=True)
for name,g in [('protected',protection),('ground',carriageways[0]),('raised',carriageways[1]),('sidewalks',sidewalks[0]),('kerbs',kerbs[0])]: Path(f'artifacts/city-roads/{name}.wkb').write_bytes(to_wkb(g))
print(json.dumps(stats),flush=True)
