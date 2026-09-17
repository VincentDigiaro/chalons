"""Union airport lanes and cut secondary pavement out of runway footprints."""
import sys,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'.cache/python-roads'))
from shapely import LineString,Polygon,GeometryCollection,box,union_all,constrained_delaunay_triangles
from shapely.prepared import prep

folder=Path(sys.argv[1]);source=json.loads((folder/'input.json').read_text())
def merge(items):return union_all(items) if items else GeometryCollection()
def pavement(role):
    return merge([LineString(a['points']).buffer(a['width']/2,cap_style='flat',join_style='round',quad_segs=4) for a in source['axes'] if a['role']==role])
def paint(role):
    return merge([Polygon([p[:2] for p in s['points']]) for s in source['shapes'] if s['role']==role and s['points'][0][2]>.05])
runways=pavement('runway');taxiways=pavement('taxiway')
white=paint('runway').intersection(runways)
visible_taxiways=taxiways.difference(runways)
yellow=paint('taxiway').intersection(visible_taxiways)
parts=[('runway',[80/255,89/255,91/255],runways.difference(white)),('runway-paint',[229/255,228/255,220/255],white),('taxiway',[116/255,121/255,117/255],visible_taxiways.difference(yellow)),('taxiway-paint',[213/255,182/255,94/255],yellow)]
overlap=max(a.intersection(b).area for i,(_,_,a) in enumerate(parts) for _,_,b in parts[:i])
assert overlap<1e-6,overlap
assert abs(sum(p.area for _,_,p in parts)-runways.union(taxiways).area)<1e-5
groups=[];cell_size=8
for role,color,geometry in parts:
    prepared=prep(geometry);triangles=[];w,s,e,n=geometry.bounds
    for x in range(math.floor(w/cell_size),math.ceil(e/cell_size)):
        for y in range(math.floor(s/cell_size),math.ceil(n/cell_size)):
            cell=box(x*cell_size,y*cell_size,(x+1)*cell_size,(y+1)*cell_size)
            if not prepared.intersects(cell):continue
            clipped=geometry.intersection(cell)
            for triangle in constrained_delaunay_triangles(clipped).geoms:
                if triangle.area<1e-8:continue
                triangles.append([list(p) for p in list(triangle.exterior.coords)[:3]])
    groups.append(dict(role=role,color=color,triangles=triangles,area=geometry.area))
    print(role,len(triangles),'triangles',flush=True)
stats=dict(runwayAreaSquareMetres=runways.area,taxiwayAreaSquareMetres=taxiways.area,hiddenTaxiwayAreaSquareMetres=taxiways.intersection(runways).area,maximumSurfaceOverlapSquareMetres=overlap,meshCellMetres=cell_size)
(folder/'pavement.json').write_text(json.dumps(dict(groups=groups,stats=stats)))
# These polygons preserve exact footprint evidence for independent export checks.
from shapely.geometry import mapping
(folder/'footprints.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=[dict(type='Feature',properties=dict(role=role),geometry=mapping(geom)) for role,geom in [('runway',runways),('taxiway',taxiways)]])))
print(json.dumps(stats),flush=True)
