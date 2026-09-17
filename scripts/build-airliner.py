"""Original, game-ready passenger jet; +Y nose, Z up, wheels at Z=0."""
import bpy, math, json, struct, hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'artifacts/nice-airliners'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
def material(name,hex,metal=0):
    c=tuple(int(hex[i:i+2],16)/255 for i in (0,2,4))
    m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c),1)
    p.inputs['Roughness'].default_value=.32;p.inputs['Metallic'].default_value=metal
    return m
white=material('Fuselage | blanc perle','e6edf1'); gray=material('Ailes | gris clair','b6c5ce')
blue=material('Livrée | bleu Azur','155281'); navy=material('Livrée | bleu nuit','153349')
glass=material('Hublots et cockpit','152936',.25);rubber=material('Pneus et cavités','151b21')
steel=material('Métal satiné','8cabb8',.65);fan=material('Aubes turbines','566b79',.6)
objects=[]
def mesh(name,verts,faces,mat,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);data.materials.append(mat)
    for p in data.polygons:p.use_smooth=smooth
    objects.append(obj);return obj
def cube(name,p,scale,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(mat);objects.append(o);return o
def cylinder(name,a,b,r,mat,n=12):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    objects.append(o);return o
def tube(name,x,z,profile,mat,n=24):
    verts=[(x+r*math.cos(i*2*math.pi/n),y,z+r*math.sin(i*2*math.pi/n)) for y,r in profile for i in range(n)]
    faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(profile)-1) for i in range(n)]
    return mesh(name,verts,faces,mat,True)

profile=[(-18.8,.035,4.2),(-18,.32,4.05),(-16.5,.74,3.88),(-14.5,1.26,3.73),(-12,1.7,3.7),(-10,1.88,3.7),(-7,1.9,3.7),(0,1.9,3.7),(8,1.9,3.7),(12,1.88,3.7),(14,1.80,3.7),(15.5,1.57,3.65),(16.7,1.25,3.58),(17.6,.91,3.50),(18.25,.56,3.46),(18.65,.25,3.45),(18.8,.025,3.45)]
n=32
verts=[(r*math.cos(i*2*math.pi/n),y,z+r*math.sin(i*2*math.pi/n)) for y,r,z in profile for i in range(n)]
faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(profile)-1) for i in range(n)]
fuselage=mesh('Fuselage | nez arrondi et cône de queue',verts,faces,white,True)
fuselage.data.materials.append(gray)
for poly in fuselage.data.polygons:
    if sum(fuselage.data.vertices[i].co.z for i in poly.vertices)/4<2.25:poly.material_index=1
def surface(y,angle,offset=.04):
    for (ya,ra,za),(yb,rb,zb) in zip(profile,profile[1:]):
        if ya<=y<=yb:
            t=(y-ya)/(yb-ya);r=ra+(rb-ra)*t+offset;z=za+(zb-za)*t
            return (r*math.cos(angle),y,z+r*math.sin(angle))
    raise ValueError(y)
def skin(name,points,mat):
    if len(points)!=4:return mesh(name,[surface(y,a) for y,a in points],[tuple(range(len(points)))],mat)
    # Follow the real rounded hull, instead of sinking a flat pane into it.
    verts=[];faces=[];steps=4
    for j in range(steps+1):
        v=j/steps
        for i in range(steps+1):
            u=i/steps;p=[(1-v)*((1-u)*points[0][k]+u*points[1][k])+v*((1-u)*points[3][k]+u*points[2][k]) for k in range(2)]
            verts.append(surface(*p))
    for j in range(steps):
        for i in range(steps):
            a=j*(steps+1)+i;faces.append((a,a+1,a+steps+2,a+steps+1))
    return mesh(name,verts,faces,mat)
for side in [1,-1]:
    angle=lambda a:a if side==1 else math.pi-a
    for j in range(31):
        y=-10.7+j*.75;yc=y+.015
        points=[(yc+dy,angle(.30+da)) for dy,da in [(-.11,-.12),(.11,-.12),(.16,-.07),(.16,.07),(.11,.12),(-.11,.12),(-.16,.07),(-.16,-.07)]]
        skin(f'Hublot {side} {j:02}',points,glass)
    for y in [-12.0,13.3]:
        for dy0,dy1,a0,a1 in [(-.45,.45,-.65,-.625),(-.45,.45,.61,.635),(-.45,-.425,-.65,.635),(.425,.45,-.65,.635)]:
            skin(f'Contour porte {side} {y}',[(y+dy0,angle(a0)),(y+dy1,angle(a0)),(y+dy1,angle(a1)),(y+dy0,angle(a1))],steel)
        skin(f'Poignée porte {side} {y}',[(y-.14,angle(-.04)),(y+.14,angle(-.04)),(y+.14,angle(.005)),(y-.14,angle(.005))],navy)
    for y0,y1 in zip([-14,-11,-7,0,6,12],[-11,-7,0,6,12,14]):
        skin(f'Bande bleue {side} {y0}',[(y0,angle(-.34)),(y1,angle(-.34)),(y1,angle(-.27)),(y0,angle(-.27))],blue)
    # Swept cockpit windows follow the tapered forward fuselage.
    skin(f'Pare-brise {side}',[(17.0,angle(.45)),(17.55,angle(.65)),(16.7,angle(.92)),(16.4,angle(.72))],glass)
    skin(f'Vitre latérale cockpit {side}',[(16.35,angle(.70)),(16.65,angle(.91)),(15.35,angle(.78)),(15.25,angle(.48))],glass)

def wing(name,stations,side,mat):
    section=[(0,0),(.04,.065),(.18,.11),(.4,.095),(.7,.045),(1,0),(.7,-.018),(.4,-.028),(.18,-.026),(.04,-.013)]
    verts=[(side*x,le-chord*t,z+chord*h) for x,le,chord,z in stations for t,h in section];k=len(section)
    faces=[(j*k+i,j*k+(i+1)%k,(j+1)*k+(i+1)%k,(j+1)*k+i) for j in range(len(stations)-1) for i in range(k)]
    faces.extend([tuple(range(k-1,-1,-1)),tuple((len(stations)-1)*k+i for i in range(k))])
    return mesh(name,verts,faces,mat)
for side in [-1,1]:
    wing(f'Aile en flèche {side}',[(1.15,4.0,9.0,2.70),(5,2.2,5.8,2.84),(11,-.8,3.2,3.32),(17.3,-4.1,1.5,3.90)],side,gray)
    wing(f'Winglet {side}',[(17.3,-4.1,1.5,3.90),(17.65,-4.35,1.15,4.7),(17.9,-4.65,.6,5.25)],side,blue)
    wing(f'Empennage horizontal {side}',[(.6,-10.8,5.8,4.30),(3,-12.7,3.5,4.65),(6.5,-15.0,1.25,5.05)],side,gray)
    x=side*5.05
    wing(f'Mât réacteur {side}',[(4.90,4.5,3.1,2.65),(5.20,4.5,3.1,2.65)],side,gray)
    tube(f'Nacelle réacteur {side}',x,2.0,[(1.5,.68),(2,.93),(4.8,1.07),(5.65,1.01),(5.8,.95),(5.65,.87),(4.75,.81)],white,24)
    tube(f'Lèvre admission {side}',x,2.0,[(5.50,1.015),(5.72,.99),(5.81,.945),(5.71,.89),(5.5,.865)],steel,24)
    tube(f'Conduit sombre {side}',x,2.0,[(5.49,.864),(4.71,.80)],rubber,24)
    cylinder(f'Fond turbine {side}',(x,4.71,2),(x,4.72,2),.80,rubber,24)
    for i in range(14):
        a=i*math.tau/14
        p=lambda r,theta,y:(x+r*math.cos(theta),y,2+r*math.sin(theta))
        mesh(f'Aube réacteur {side} {i}',[p(.19,a,4.76),p(.78,a+.30,4.78),p(.78,a+.49,4.80),p(.22,a+.30,4.77)],[(0,1,2,3)],fan)
    tube(f'Cône turbine {side}',x,2,[(4.74,.23),(4.98,.16),(5.13,.025)],steel,16)
    tube(f'Tuyère arrière {side}',x,2,[(1.75,.65),(1.35,.52),(1.15,.37),(1.15,.26),(1.75,.24)],steel,20)
    cylinder(f'Intérieur tuyère {side}',(x,1.76,2),(x,1.77,2),.28,rubber,16)

fin=[(-10.5,4.9),(-13.0,6.0),(-14.9,11.65),(-17.25,11.65),(-18.1,4.7)]
mark=[(-15.0,6.1),(-16.85,10.6),(-17.15,10.6),(-16.4,6.1)]
def clip_fin(polygon,a,b,inside):
    def distance(p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    result=[]
    for p,q in zip(polygon,polygon[1:]+polygon[:1]):
        dp,dq=distance(p),distance(q);ip=dp>=0 if inside else dp<=0;iq=dq>=0 if inside else dq<=0
        if ip:result.append(p)
        if ip!=iq:
            t=dp/(dp-dq);result.append(tuple(p[i]+t*(q[i]-p[i]) for i in range(2)))
    return result
# The paint occupies faces cut into the fin. No almost-coplanar decal remains,
# so a distant camera cannot alternate between the blue and white surfaces.
verts=[];faces=[];fin_materials=[]
def fin_face(points,side,material):
    if len(points)<3:return
    signed=sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(points,points[1:]+points[:1]))
    if abs(signed)<1e-8:return
    if signed*side<0:points=list(reversed(points))
    first=len(verts);verts.extend((side*.18,y,z) for y,z in points)
    faces.append(tuple(range(first,len(verts))));fin_materials.append(material)
for side in [-1,1]:
    for triangle in tessellate_polygon([[Vector((y,z,0)) for y,z in fin]]):
        remainder=[fin[i] for i in triangle]
        for a,b in zip(mark,mark[1:]+mark[:1]):
            if not remainder:break
            fin_face(clip_fin(remainder,a,b,False),side,0)
            remainder=clip_fin(remainder,a,b,True)
        fin_face(remainder,side,1)
for a,b in zip(fin,fin[1:]+fin[:1]):
    first=len(verts);verts.extend([(-.18,*a),(-.18,*b),(.18,*b),(.18,*a)])
    faces.append(tuple(range(first,first+4)));fin_materials.append(0)
tail=mesh('Dérive bleue',verts,faces,blue);tail.data.materials.append(white)
for polygon,material_id in zip(tail.data.polygons,fin_materials):polygon.material_index=material_id

for x,y,r in [(-2.25,-2.5,.47),(2.25,-2.5,.47),(0,12.2,.37)]:
    cylinder(f'Jambe train {x}',(x,y,r),(x,y,2.05),.10,steel)
    cylinder(f'Contrefiche {x}',(x,y,r+.2),(x,y-1.0,1.95),.065,steel,8)
    for side in [-1,1]:
        xc=x+side*(.21 if x else .16)
        cylinder(f'Roue {x} {side}',(xc-.12,y,r),(xc+.12,y,r),r,rubber,16)
        cylinder(f'Moyeu {x} {side}',(xc+side*.125,y,r),(xc+side*.14,y,r),r*.45,steel,12)
    cube(f'Trappe train {x}',(x,y,1.85),(.7,1.3,.055),gray)

# The source contains only the aircraft; studio setup is separate and unsaved.
scene.unit_settings.system='METRIC'
scene['description']='Avion de ligne original Azur, fuselage 37,6 m ; modèle commun aux avions relevés sur la texture IGN de Nice.'
scene['nose_axis']='+Y';scene['ground_anchor']='wheels z=0'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Avion-de-ligne.blend'),compress=True)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();values=[];counts=[]
for obj in objects:
    ev=obj.evaluated_get(deps);data=ev.to_mesh();data.calc_loop_triangles();normalmat=ev.matrix_world.to_3x3().inverted().transposed();start=len(values)//11
    for tri in data.loop_triangles:
        if tri.area<1e-10:continue
        color=data.materials[tri.material_index].diffuse_color[:3]
        for li in tri.loops:
            pos=ev.matrix_world@data.vertices[data.loops[li].vertex_index].co
            normal=(normalmat@data.corner_normals[li].vector).normalized()
            values.extend([*pos,*normal,0,0,*color])
    counts.append(dict(name=obj.name,first=start,count=len(values)//11-start));ev.to_mesh_clear()
binary=struct.pack('<%sf'%len(values),*values);(OUT/'airliner.bin').write_bytes(binary)
info=dict(name='Azur — avion de ligne',length=37.6,span=35.8,height=11.65,forwardAxis='+Y',vertexCount=len(values)//11,stride=44,objects=counts,source='artifacts/nice-airliners/Avion-de-ligne.blend',sourceSha256=hashlib.sha256((OUT/'Avion-de-ligne.blend').read_bytes()).hexdigest(),meshSha256=hashlib.sha256(binary).hexdigest())
(OUT/'airliner.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf8')
print('AIRLINER_EXPORTED',json.dumps(dict(triangles=len(values)//33,objects=len(objects))),flush=True)

scene.render.engine='CYCLES';scene.cycles.samples=24
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for d in prefs.devices:d.use=d.type!='CPU'
    scene.cycles.device='GPU'
except Exception:pass
floor=material('Sol studio','283746');cube('Sol studio',(0,0,-.20),(200,200,.35),floor)
scene.world.color=(.3,.3,.3)
def area(name,location,power,size):
    bpy.ops.object.light_add(type='AREA',location=location);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key',(15,22,38),15000,22);area('Fill',(-25,8,20),11000,25);area('Rim',(5,-28,25),14000,20)
bpy.ops.object.camera_add(location=(37,45,24));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,3))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=54;scene.camera=camera
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'avion-de-ligne.png')
bpy.ops.render.render(write_still=True)
