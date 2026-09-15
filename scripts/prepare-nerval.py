import json, math, hashlib, importlib.util
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT=Path(__file__).resolve().parent.parent
SOURCE=Path(r'C:\Users\cid77\Documents\ChatGPT\map2\captures-rue-gerard-de-nerval')
OUT=ROOT/'dist/data/nerval';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('survey',ROOT/'scripts/nerval-survey.py');survey=importlib.util.module_from_spec(spec);spec.loader.exec_module(survey)
inventory=json.loads((ROOT/'artifacts/nerval/footprints.json').read_text(encoding='utf8'))
features={f['id']:f for f in inventory['buildings']}
origin=inventory['origin'];scale=inventory['scale']
def xy(p):return np.array([(p[0]-origin[0])*scale[0],(p[1]-origin[1])*scale[1]])
segments=[]
for f in inventory['streets']:
    ring=f['geometry']['coordinates'];segments.extend((xy(a),xy(b)) for a,b in zip(ring,ring[1:]))
def nearest(p):
    candidates=[]
    for a,b in segments:
        d=b-a;t=np.clip(np.dot(p-a,d)/np.dot(d,d),0,1);q=a+t*d;candidates.append(q)
    return min(candidates,key=lambda q:np.linalg.norm(q-p))
def frame(ids):
    ring=np.array([p for i in ids for p in features[i]['ring']]);c=ring.mean(axis=0);towards=nearest(c)-c;towards/=np.linalg.norm(towards)
    choices=[]
    for i in ids:
        rr=np.array(features[i]['ring'])
        for a,b in zip(rr,np.roll(rr,-1,axis=0)):
            edge=b-a;ln=np.linalg.norm(edge)
            if ln<2:continue
            normal=np.array([edge[1],-edge[0]])/ln
            if np.dot(normal,towards)<0:normal=-normal
            choices.append((float(np.dot(normal,towards))*ln**0.05,normal))
    outward=max(choices,key=lambda p:p[0])[1];tangent=np.array([-outward[1],outward[0]])
    return c,tangent,-outward

groups=[];parts=[];partmap={}
for group_idx,(ids,eave,rise,roof,refs,note) in enumerate(survey.BUILDINGS):
    c,u,v=frame(ids)
    group=dict(id=f'nerval-{group_idx+1:02}',parts=ids,center=c.tolist(),u=u.tolist(),v=v.tolist(),photos=[str(x).zfill(2) for x in refs],description=note,roof=roof)
    groups.append(group)
    for fid in ids:
        f=features[fid];e,r=survey.OVERRIDES.get(fid,(eave,rise));ring=np.array(f['ring']);local=np.stack(((ring-c)@u,(ring-c)@v),axis=1)
        a,b=local.min(axis=0),local.max(axis=0)
        part=dict(id=fid,osm_id=f['osm_id'],ring=f['ring'],group=group['id'],eaves=e,rise=r,roof=roof if fid not in survey.OVERRIDES else ('flat' if r==0 else 'gable'),u=u.tolist(),v=v.tolist(),center=c.tolist(),bounds=[a.tolist(),b.tolist()],photos=group['photos'],description=note,patches=[])
        part.update(survey.ROOF_PROFILES.get(fid,{}));part['focus']=fid in survey.FOCUS_PARTS
        if part['focus']:
            part['surfaceBounds']={}
            for side,dim,edge in [('front',1,a[1]),('left',0,a[0]),('right',0,b[0])]:
                values=local[np.abs(local[:,dim]-edge)<.65,1-dim]
                if len(values)>=2:part['surfaceBounds'][side]=[float(values.min()),float(values.max())]
        parts.append(part);partmap[fid]=part

# Rectify observed planes. Missing and occluded areas have alpha=0.
ATLAS=2048
atlases=[Image.new('RGBA',(ATLAS,ATLAS),(0,0,0,0))];cursor=[4,4,0];patch_records=[]
images={}
for idx,p in enumerate(survey.PATCHES):
    part=partmap[p['part']];photo=next(f for f in inventory['photos'] if int(f['id'])==p['photo'])
    if p['photo'] not in images:images[p['photo']]=Image.open(SOURCE/photo['file']).convert('RGBA')
    source=images[p['photo']].copy();quad=np.array(p['quad'],dtype=float)*source.width/2048
    if p['mask']:
        alpha=Image.new('L',source.size,255);draw=ImageDraw.Draw(alpha)
        for mask in p['mask']:draw.polygon([tuple(np.array(q)*source.width/2048) for q in mask],fill=0)
        source.putalpha(alpha)
    lo,hi=np.array(part['bounds']);side=p['side'];span=p['span'] or [0,1]
    face_width=(hi[0]-lo[0] if side in ['front','roof'] else hi[1]-lo[1])*(span[1]-span[0]);height=(p['height'] or part['eaves'])-p['bottom']
    if part['focus'] and side in part.get('surfaceBounds',{}):
        ends=part['surfaceBounds'][side];face_width=(ends[1]-ends[0])*(span[1]-span[0])
    if side=='roof':height=math.hypot((hi[1]-lo[1])/2,part['rise'])
    if side=='dormer':face_width=1.45 if p['part']==54 else 4
    available=max(np.linalg.norm(quad[1]-quad[0]),np.linalg.norm(quad[2]-quad[3]))
    width=max(48,min(768,round(face_width*52),round(available)))
    pixelheight=max(32,min(768,round(width*height/face_width)))
    # Pillow perspective uses an inverse homography (output pixel -> input pixel).
    target=[(0,0),(width,0),(width,pixelheight),(0,pixelheight)];A=[];B=[]
    for (x,y),(sx,sy) in zip(target,quad):
        A.extend([[x,y,1,0,0,0,-sx*x,-sx*y],[0,0,0,x,y,1,-sy*x,-sy*y]]);B.extend([sx,sy])
    H=np.linalg.solve(np.array(A),np.array(B))
    patch=source.transform((width,pixelheight),Image.Transform.PERSPECTIVE,H,Image.Resampling.BICUBIC)
    if (side=='front' or (part['focus'] and side in ['left','right'])) and 'color' not in part:
        pixels=np.asarray(patch).reshape(-1,4);rgb=pixels[:,:3].astype(float)
        candidates=rgb[(pixels[:,3]>240)&(rgb.min(axis=1)>110)&((rgb.max(axis=1)-rgb.min(axis=1))<65)]
        if len(candidates)>40:
            lum=candidates.mean(axis=1);selected=candidates[(lum>=np.quantile(lum,.45))&(lum<=np.quantile(lum,.85))]
            part['color']=(np.median(selected,axis=0)/255).tolist()
    if part['focus'] and side not in ['roof','dormer']:
        # Remove photographed foreground foliage from the lower wall band.
        # The garden vegetation is separate geometry in front of this wall.
        pixels=np.array(patch);colors=pixels[:,:,:3].astype(float)
        green=(colors[:,:,1]>colors[:,:,0]*.97)&(colors[:,:,1]>colors[:,:,2]*1.12)
        green[:int(pixelheight*.45),:]=False
        pixels[:,:,3][green]=0
        # Extract openings and surface details from the surrounding plaster.
        # Matching plaster becomes the continuous wall material, avoiding a
        # sharp rectangular photo border or a dark untextured strip below it.
        flat=colors.reshape(-1,3);valid=pixels[:,:,3].reshape(-1)>240
        candidates=flat[valid&(flat.min(axis=1)>115)&(np.ptp(flat,axis=1)<60)]
        if len(candidates)>20:
            lum=candidates.mean(axis=1);bg=np.median(candidates[lum>=np.quantile(lum,.65)],axis=0)
            distance=np.linalg.norm((colors-bg)/255,axis=2)
            detail=np.clip((distance-.09)/.12,0,1)
            pixels[:,:,3]=(pixels[:,:,3]*detail).astype('uint8')
        alpha=Image.fromarray(pixels[:,:,3]).filter(ImageFilter.GaussianBlur(.65))
        # Feather the observed image into its sampled plaster colour.
        yy,xx=np.mgrid[:pixelheight,:width];edge=np.minimum.reduce([xx,width-1-xx,yy,pixelheight-1-yy])
        pixels[:,:,3]=(np.array(alpha)*np.clip(edge/4,0,1)).astype('uint8')
        if p['bottom']>=1 and (p['height'] or part['eaves'])<=part['eaves']:
            pixels[:,:,3]=(pixels[:,:,3]*np.clip((pixelheight-1-yy)/(pixelheight*.14),0,1)).astype('uint8')
        patch=Image.fromarray(pixels)
    x,y,row=cursor
    if x+width+4>ATLAS:x=4;y+=row+8;row=0
    if y+pixelheight+4>ATLAS:atlases.append(Image.new('RGBA',(ATLAS,ATLAS),(0,0,0,0)));x=y=4;row=0
    atlases[-1].paste(patch,(x,y));row=max(row,pixelheight);cursor=[x+width+8,y,row]
    record={**p,'id':idx+1,'atlas':len(atlases)-1,'uv':[x/ATLAS,y/ATLAS,width/ATLAS,pixelheight/ATLAS],'pixelSize':[width,pixelheight]}
    part['patches'].append(record);patch_records.append(record)
for i,atlas in enumerate(atlases):atlas.save(OUT/f'facades-{i}.webp',quality=90,method=6)

# Compact repeating materials sampled from the selected zone's real photographs.
def sample_material(photo_id,quad,size):
    photo=next(f for f in inventory['photos'] if int(f['id'])==photo_id)
    im=Image.open(SOURCE/photo['file']).convert('RGB');q=np.array(quad)*im.width/1600
    w,h=size;A=[];B=[]
    for (x,y),(sx,sy) in zip([(0,0),(w,0),(w,h),(0,h)],q):
        A.extend([[x,y,1,0,0,0,-sx*x,-sx*y],[0,0,0,x,y,1,-sy*x,-sy*y]]);B.extend([sx,sy])
    H=np.linalg.solve(np.array(A),np.array(B))
    return im.transform(size,Image.Transform.PERSPECTIVE,H,Image.Resampling.BICUBIC)
tile=sample_material(3,[[790,107],[840,113],[869,162],[812,157]],(256,256))
# Matched opposite edges suppress seams while retaining the photographed tile relief.
a=np.array(tile,dtype=float)
# Estimate and remove residual row shear from the local photo perspective.
gray=a.mean(axis=2);best=None
for slope in np.linspace(-.30,.30,81):
    aligned=np.stack([np.roll(gray[:,x],-round(slope*x)) for x in range(256)],axis=1)
    score=np.var(aligned[65:190].mean(axis=1))
    if best is None or score>best[0]:best=(score,slope)
a=np.stack([np.roll(a[:,x],-round(best[1]*x),axis=0) for x in range(256)],axis=1)
for axis in [0,1]:
    for j in range(12):
        first=[slice(None),slice(None)];last=first.copy();first[axis]=j;last[axis]=-1-j
        q=(a[tuple(first)]+a[tuple(last)])/2;t=(12-j)/12
        a[tuple(first)]=a[tuple(first)]*(1-t)+q*t;a[tuple(last)]=a[tuple(last)]*(1-t)+q*t
Image.fromarray(a.astype('uint8')).save(OUT/'tiles-detail.webp',quality=94,method=6)
hedge=sample_material(25,[[505,285],[571,277],[578,338],[514,352]],(256,256))
seamless=Image.new('RGB',(512,512));seamless.paste(hedge,(0,0));seamless.paste(ImageOps.mirror(hedge),(256,0));seamless.paste(ImageOps.flip(hedge),(0,256));seamless.paste(ImageOps.flip(ImageOps.mirror(hedge)),(256,256));seamless.save(OUT/'hedge-detail.webp',quality=90,method=6)
for group in groups:
    selected=[partmap[i] for i in group['parts'] if partmap[i]['focus']]
    colors=[p['color'] for p in selected if p.get('color')]
    for p in selected:
        if not p.get('color'):p['color']=np.median(colors,axis=0).tolist() if colors else [.80,.78,.72]
        # Roof colour families observed in the photographs, shared by adjoining parts.
        p['roofTint']=([.96,.97,1.00] if p['id'] in [112,115,108,106,101,105] else [1.00,.96,.89])
palette={112:'#bdb9ab',115:'#bdb9ab',108:'#c3c0b2',106:'#c3c0b2',101:'#d8d6c9',105:'#d8d6c9',99:'#d9d8cd',94:'#e5e5dc',92:'#dadace',83:'#ebe8df',84:'#ebe8df',87:'#ebe8df',80:'#d6d4cb',113:'#c6c6bf',114:'#c6c6bf',100:'#c5c2b6',102:'#c5c2b6',103:'#c5c2b6',104:'#c5c2b6',107:'#c5c2b6',109:'#d0ccbd',110:'#d0ccbd',111:'#d0ccbd',117:'#c9c7b9',116:'#c9c7b9',118:'#c9c7b9'}
for fid,hexcolor in palette.items():partmap[fid]['color']=[int(hexcolor[i:i+2],16)/255 for i in [1,3,5]]
for fid in [112,115]:partmap[fid]['color']=[.76,.75,.695]
for fid in [119,120,121]:partmap[fid]['color']=[.75,.715,.63]

# Exact geographic roof imagery, kept at the source tile resolution.
cache=ROOT/'.cache/nerval-ign';info=json.loads((cache/'index.json').read_text());nw=info['nw'];se=info['se']
ortho=Image.new('RGB',((se[0]-nw[0]+1)*256,(se[1]-nw[1]+1)*256))
for y in range(nw[1],se[1]+1):
    for x in range(nw[0],se[0]+1):ortho.paste(Image.open(cache/f'{x}-{y}.jpg'),((x-nw[0])*256,(y-nw[1])*256))
ortho.save(OUT/'roofs.webp',quality=94,method=6)
photos=[]
(OUT/'references').mkdir(exist_ok=True)
for p in inventory['photos']:
    file=SOURCE/p['file'];reference=OUT/'references'/f"{p['id']}.webp"
    if not reference.exists() or reference.stat().st_mtime<file.stat().st_mtime:
        im=Image.open(file);im.thumbnail((1600,1000));im.save(reference,quality=84,method=6)
    photos.append({**p,'image':f"./data/nerval/references/{p['id']}.webp",'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})

fences=[]
for ids,photo,kind,height,color,offset in survey.FENCES:
    for group in groups:
        if set(group['parts']) & set(ids):
            fences.append(dict(group=group['id'],photo=str(photo).zfill(2),kind=kind,height=height,color=color,offset=offset))

data=dict(origin=origin,scale=scale,parts=parts,groups=groups,photos=photos,fences=fences,roofImagery={**info,'size':list(ortho.size)},facadeAtlases=len(atlases),photoPatches=len(patch_records),focusParts=survey.FOCUS_PARTS,skylights=survey.SKYLIGHTS,roofObservations=survey.ROOF_OBSERVATIONS,openings=survey.OPENINGS,openingObservations=survey.OPENING_OBSERVATIONS,endSite=survey.END_SITE,
    detailMaterials=[dict(file='tiles-detail.webp',photo='03',usage='Tuiles redressées puis répétées sur les toits de la zone sélectionnée ; échelle estimée'),dict(file='hedge-detail.webp',photo='25',usage='Feuillage des haies de la zone sélectionnée, répété')],
    method='Impasse et boucle : emprises OSM, fenêtres, portes, garages, volets et encadrements modélisés en géométrie 3D à partir des observations photographiques ; aucune photo de façade plaquée dans cette zone. Tuiles et feuillages échantillonnés puis répétés. Le reste de la rue conserve son modèle antérieur. Aucune photogrammétrie métrique.',
    accuracy='Implantations issues d’OSM ; hauteurs, pentes et détails estimés visuellement. Pas de précision centimétrique vérifiable. Arrières et zones cachées simplifiés. Époques 2014 et 2022 mélangées.',
    attribution='Captures fournies par l’utilisateur : Google Street View / Google Maps, mai 2014 et juillet 2022. Photographies aériennes © IGN, Licence Ouverte 2.0. Emprises © contributeurs OpenStreetMap, ODbL.')
(OUT/'survey.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(ROOT/'scripts/nerval-footprints.json').write_text(json.dumps(dict(origin=origin,scale=scale,buildings=[features[i] for i in partmap],streets=inventory['streets']),ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(dict(groups=len(groups),parts=len(parts),photoPatches=len(patch_records),atlasCount=len(atlases),referenceImages=len(photos))))
