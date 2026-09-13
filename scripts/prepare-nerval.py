import json, math, hashlib, importlib.util
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

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
    if side=='front' and 'color' not in part:
        pixels=np.asarray(patch).reshape(-1,4);rgb=pixels[:,:3].astype(float)
        candidates=rgb[(pixels[:,3]>240)&(rgb.min(axis=1)>110)&((rgb.max(axis=1)-rgb.min(axis=1))<65)]
        if len(candidates)>40:
            lum=candidates.mean(axis=1);selected=candidates[(lum>=np.quantile(lum,.45))&(lum<=np.quantile(lum,.85))]
            part['color']=(np.median(selected,axis=0)/255).tolist()
    x,y,row=cursor
    if x+width+4>ATLAS:x=4;y+=row+8;row=0
    if y+pixelheight+4>ATLAS:atlases.append(Image.new('RGBA',(ATLAS,ATLAS),(0,0,0,0)));x=y=4;row=0
    atlases[-1].paste(patch,(x,y));row=max(row,pixelheight);cursor=[x+width+8,y,row]
    record={**p,'id':idx+1,'atlas':len(atlases)-1,'uv':[x/ATLAS,y/ATLAS,width/ATLAS,pixelheight/ATLAS],'pixelSize':[width,pixelheight]}
    part['patches'].append(record);patch_records.append(record)
for i,atlas in enumerate(atlases):atlas.save(OUT/f'facades-{i}.webp',quality=90,method=6)

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

data=dict(origin=origin,scale=scale,parts=parts,groups=groups,photos=photos,fences=fences,roofImagery={**info,'size':list(ortho.size)},facadeAtlases=len(atlases),photoPatches=len(patch_records),
    method='Emprises OSM, interprétation manuelle des clichés, redressement projectif des façades visibles. Aucune photogrammétrie métrique.',
    accuracy='Implantations issues d’OSM ; hauteurs, pentes et détails estimés visuellement. Pas de précision centimétrique vérifiable. Arrières et zones cachées simplifiés. Époques 2014 et 2022 mélangées.',
    attribution='Captures fournies par l’utilisateur : Google Street View / Google Maps, mai 2014 et juillet 2022. Photographies aériennes © IGN, Licence Ouverte 2.0. Emprises © contributeurs OpenStreetMap, ODbL.')
(OUT/'survey.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(ROOT/'scripts/nerval-footprints.json').write_text(json.dumps(dict(origin=origin,scale=scale,buildings=[features[i] for i in partmap],streets=inventory['streets']),ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(dict(groups=len(groups),parts=len(parts),photoPatches=len(patch_records),atlasCount=len(atlases),referenceImages=len(photos))))
