from pathlib import Path
import json, math, html, zipfile
from PIL import Image, ImageDraw, ImageFont, PngImagePlugin

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'references_buirette_12_20'
shots = json.loads((OUT / 'positions.json').read_text(encoding='utf-8'))
maps = json.loads((OUT / 'reperes_carte.json').read_text(encoding='utf-8'))

titles = {
    '01': 'Contexte 2017 · perspective nord',
    '02': 'Contexte 2017 · perspective sud',
    '03': 'Contexte 2017 · carrefour Lamairesse',
    '04': 'Secteur 18–20 · clôture et bâtiment bas',
    '05': '16 · vue oblique et avancée de façade',
    '06': '16 et 14 · numéros et garages',
    '07': '14 et 12 · alignement des façades',
    '08': '14 et 12 · vue élargie',
    '09': '12 · détails de brique et de pierre',
    '10': '12 · façade et partie visible de toiture',
    '11': '16 · façade, corniche et garage',
    '12': '20 · repère cartographique imprécis',
    '13': '18 · repère cartographique imprécis',
    '14': 'Secteur 18–20 · carrefour et annexe',
    '15': '14 · façade, corniche et raccords',
}
subjects = {'01': [], '02': [], '03': [], '04': [], '05': [16], '06': [16,14],
            '07': [14,12], '08': [14,12], '09': [12], '10': [12], '11': [16], '14': [], '15': [14,16]}
shots[1]['note'] = 'Vue de contexte au sud du carrefour, au-delà du tronçon étudié. Les façades visibles ne sont pas attribuées aux numéros 12 à 20.'
shots[5]['note'] = 'Numéro 16 lisible sur la façade blanche ; numéro 14 près de la porte à encadrement blanc de la maison beige. Garages et raccords visibles.'

all_rows = sorted(shots + maps, key=lambda r:r['id'])
for row in all_rows:
    row['title'] = titles[row['id'][:2]]
    row['coordinate_reference_system'] = 'WGS84 (EPSG:4326), degrés décimaux'
    if row in shots:
        row['coordinate_type'] = 'Position du panorama dans l’URL Google Street View ; précision non fournie, pas une coordonnée du bâtiment'
        row['identified_facades'] = subjects[row['id'][:2]]
        row['heading_convention'] = 'Azimut de la vue : 0° nord, 90° est, 180° sud, 270° ouest'
        row['camera_altitude_m'] = None
        row['camera_calibration'] = None
    path = OUT / row['file']
    with Image.open(path) as src:
        im = src.convert('RGB')
    if im.size == (2560,1392):
        im = im.crop((0,87,2560,1392))
    assert im.size == (2560,1305), (path, im.size)
    row['pixel_width'], row['pixel_height'] = im.size
    row['image_processing'] = 'Recadrage de la barre Chrome (87 px en haut) ; pixels de la vue conservés, aucune retouche géométrique. Source initiale JPEG, fichier livré PNG.'
    info = PngImagePlugin.PngInfo()
    info.add_itxt('Title', row['title'])
    info.add_itxt('Source', row['source'])
    info.add_itxt('SourceURL', row['url'])
    info.add_itxt('ReferenceMetadata', json.dumps(row,ensure_ascii=False))
    im.save(path, format='PNG', pnginfo=info, optimize=True)

for name, rows in [('positions.json',shots),('reperes_carte.json',maps)]:
    (OUT/name).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')

geo = {'type':'FeatureCollection','name':'Positions des panoramas Street View — Buirette 12 à 20',
       'features':[{'type':'Feature','geometry':{'type':'Point','coordinates':[r['longitude'],r['latitude']]},
                    'properties':{k:v for k,v in r.items() if k not in ('latitude','longitude')}} for r in shots]}
(OUT/'positions_cameras.geojson').write_text(json.dumps(geo,ensure_ascii=False,indent=2),encoding='utf-8')

readme = '''# Rue Buirette de Verrières — références du secteur 12 à 20

Châlons-en-Champagne (51000). Captures réalisées le 14 septembre 2026 dans l’onglet Google Street View déjà ouvert dans Chrome.

## Contenu

13 clichés Street View depuis 6 positions de panorama, et 2 captures de carte. Images PNG de 2560 × 1305 pixels. Ouvrir **index.html** pour la galerie, les coordonnées et les liens permettant de retrouver chaque vue.

Les images 04 à 11, 14 et 15 datent de **juillet 2024**. Les images 01 à 03 datent d’**octobre 2017** et servent de contexte historique. La clôture et la végétation changent entre ces deux campagnes.

## Identification des façades

| Numéro demandé | Références utiles | Identification |
|---|---|---|
| 12 | 09, 10 ; vues voisines 07, 08 | Numéro visible ; façade en pierre et briques, porte en bois |
| 14 | 07, 08, 15 ; vue voisine 06 | Numéro visible ; façade beige, encadrement blanc, garage brun |
| 16 | 05, 06, 11 ; raccord sur 15 | Numéro visible sur 06 et 11 ; façade blanche à bandeaux, avancée et garage |
| 18 | Contexte 04, 14 ; carte 13 | Façade non identifiée avec certitude ; Google signale un repère imprécis |
| 20 | Contexte 01 à 04, 14 ; carte 12 | Façade non identifiée avec certitude ; Google signale un repère imprécis |

Les repères Google des 18 et 20 sont presque superposés au carrefour avec la rue Lamairesse. Les captures de carte conservent l’avertissement de Google. Aucun bâtiment n’est attribué arbitrairement à ces numéros.

## Positions et cadrage

**positions.json** et **positions_cameras.geojson** décrivent les caméras des 13 vues : latitude, longitude, azimut, paramètres URL `y` et `t`, identifiant du panorama, date de l’image et lien exact. Les métadonnées sont également intégrées à chaque PNG dans le champ texte `ReferenceMetadata`.

Les coordonnées sont celles des panoramas, extraites des URL, en WGS84 (latitude/longitude en degrés décimaux). Leur précision réelle n’est pas fournie. En GeoJSON, l’ordre est longitude puis latitude. L’azimut vaut 0° au nord, 90° à l’est, 180° au sud et 270° à l’ouest. Les paramètres `y` et `t` sont conservés tels qu’affichés dans l’URL ; ils ne constituent pas une calibration optique. L’altitude des caméras est inconnue.

**reperes_carte.json** contient séparément les deux repères d’adresse approximatifs. Ils ne sont pas utilisés comme positions de caméra.

Dans les noms de fichiers, `P13`, `P19`, `P20`, etc. désignent l’étiquette affichée par Street View au point de prise de vue, et non nécessairement le numéro de la façade photographiée. Utiliser les légendes pour identifier les bâtiments.

## Pour la modélisation 3D

Commencer avec 10 (12), 15 (14), 11 (16), puis 05, 06, 07 et 08 pour les raccords et les volumes. Les vues 04 et 14 décrivent l’extrémité du secteur, la clôture bleue, le bâtiment bas et le carrefour.

Ces captures sont des références visuelles pour une modélisation manuelle. Elles ne fournissent ni dimensions mesurées ni calibration de photogrammétrie. Des véhicules et la végétation masquent certaines parties basses ; les faces arrière et les pans de toit invisibles ne sont pas documentés. Les vues issues d’un même panorama ont une même origine et ne créent pas de parallaxe supplémentaire. Vérifier l’échelle avec des mesures indépendantes et conserver la distinction entre 2017 et 2024.

Les seules modifications d’image sont le retrait de la barre Chrome et l’enregistrement en PNG. Les mentions Google, les dates et les autres indications de la vue sont conservées. Source : Google Street View / Google Maps ; attributions visibles dans chaque capture.
'''
(OUT/'LIRE_MOI.md').write_text(readme,encoding='utf-8')

def esc(s): return html.escape(str(s),quote=True)
def coord(r): return f"{r['latitude']:.7f}, {r['longitude']:.7f}"
def dated(r): return {'2024-07':'Juillet 2024','2017-10':'Octobre 2017',None:'Carte consultée le 14/09/2026'}[r['image_date']]

# Schéma relatif des seules positions de caméra, dérivé des coordonnées relevées.
unique = {}
for r in shots:
    unique.setdefault(r['panorama_id'],[]).append(r)
lat0, lon0 = shots[0]['latitude'],shots[0]['longitude']
points=[]
for rows in unique.values():
    r=rows[0]
    east=(r['longitude']-lon0)*111320*math.cos(math.radians(lat0))
    north=(r['latitude']-lat0)*111320
    x,y=235+east*4.3,295-north*4.3
    ids=', '.join(t['id'][:2] for t in rows)
    points.append(f'<a href="#{r["id"]}"><circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{"#9b622f" if r["image_date"]=="2017-10" else "#167c8d"}"/><text x="{x+13:.1f}" y="{y+5:.1f}">{ids}</text><title>{esc(coord(r))} · {esc(dated(r))}</title></a>')
plan='<svg viewBox="0 0 400 340" role="img" aria-label="Schéma des six positions de caméra, nord en haut"><path d="M45 65V25m-6 9 6-9 6 9" stroke="#243944" fill="none"/><text x="39" y="18">N</text>'+''.join(points)+'</svg>'

cards=[]
order=['10','15','11','09','07','08','06','05','04','14','01','02','03','12','13']
for num in order:
    r=next(t for t in all_rows if t['id'][:2]==num)
    is_map=r in maps
    extra = 'Repère d’adresse approximatif' if is_map else f'Azimut {r["heading_deg"]:g}° · y {r["url_y"]:g} · t {r["url_t"]:g}'
    group='carte' if is_map else r['image_date']
    cards.append(f'''<article id="{r['id']}" data-group="{group}">
      <a href="{esc(r['file'])}" target="_blank"><img loading="lazy" src="{esc(r['file'])}" alt="{esc(r['title'])}" width="2560" height="1305"></a>
      <div class="caption"><div class="eyebrow">{num} · {dated(r)}</div><h3>{esc(r['title'])}</h3>
      <p>{esc(r['note'])}</p><p class="position">{coord(r)}<br>{extra}</p>
      <p class="small">{'Repère Google ; emplacement du bâtiment non confirmé.' if is_map else 'Coordonnées du panorama. Étiquette Street View : '+esc(r['display_address'])+'.'}</p>
      <a class="source" href="{esc(r['url'])}" target="_blank" rel="noopener">Retrouver cette vue dans Google Maps ↗</a>
      </div></article>''')

page='''<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Buirette de Verrières · références 12 à 20</title><style>
:root{font-family:Segoe UI,Arial,sans-serif;color:#233844;background:#f2f1ec;line-height:1.5}*{box-sizing:border-box}body{margin:0}main{max-width:1480px;margin:auto;padding:36px}header{border-bottom:1px solid #c8cecb;padding-bottom:28px}.eyebrow{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#507278;font-weight:700}h1{font-size:clamp(30px,4vw,54px);letter-spacing:-.04em;line-height:1.08;margin:12px 0}h2{font-size:24px;margin:0 0 10px}h3{font-size:20px;margin:5px 0}p{margin:10px 0}a{color:#06677a}a:focus-visible,button:focus-visible{outline:3px solid #de9d27;outline-offset:3px}.intro{max-width:820px;font-size:18px}.overview{display:grid;grid-template-columns:1.8fr 1fr;gap:32px;margin:28px 0}.info{background:#fff;padding:24px;border:1px solid #d4dcd9;border-radius:12px}.notice{border-left:4px solid #b67d30;padding:10px 16px;background:#fff7e9}.small{font-size:13px;color:#53666e}.position{font-family:Consolas,monospace;font-size:14px}nav{display:flex;gap:8px;flex-wrap:wrap;margin:26px 0}button{font:inherit;background:#fff;border:1px solid #b9c8c7;padding:9px 18px;border-radius:30px;color:#23434e;cursor:pointer}button.active{background:#155d6b;color:white;border-color:#155d6b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:white;border:1px solid #d2dcd9;border-radius:12px;overflow:hidden;scroll-margin-top:20px}article[hidden]{display:none}article img{width:100%;height:auto;display:block;aspect-ratio:2560/1305}.caption{padding:20px}.source{font-size:14px;font-weight:600}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:8px;border-bottom:1px solid #dae0dd}svg{width:100%;max-height:260px}svg text{font:13px Segoe UI,Arial;fill:#243944}footer{margin-top:30px;font-size:13px;color:#52656c}@media(max-width:800px){main{padding:20px}.overview,.grid{grid-template-columns:1fr}.overview{gap:16px}}@media print{nav{display:none}article{break-inside:avoid}.grid{display:block}article{margin:20px 0}}
</style><main><header><div class="eyebrow">Châlons-en-Champagne · références pour modélisation 3D</div><h1>Rue Buirette de Verrières<br>Du 12 au 20</h1><p class="intro">13 clichés Street View et 2 repères cartographiques, avec positions, orientation et liens vers les panoramas.</p><p class="small">Captures du 14 septembre 2026 · Images de juillet 2024 et octobre 2017 · 2560 × 1305 px</p></header>
<section class="overview"><div class="info"><h2>Les façades et leurs repères</h2><table><tr><th>Numéro</th><th>Vues principales</th><th>Identification</th></tr><tr><td>12</td><td>09, 10</td><td>Numéro visible · pierre et briques</td></tr><tr><td>14</td><td>07, 08, 15</td><td>Numéro visible · façade beige</td></tr><tr><td>16</td><td>05, 06, 11</td><td>Numéro visible · façade blanche</td></tr><tr><td>18–20</td><td>04, 14 + cartes 12, 13</td><td>Secteur couvert, attribution des façades incertaine</td></tr></table><p class="notice">Google indique que les repères des 18 et 20 sont imprécis. Les clichés du carrefour et de la clôture sont conservés comme contexte ; ils ne prouvent pas l’adresse des bâtiments visibles.</p><p class="small">Les coordonnées situent la caméra du panorama. L’étiquette affichée par Street View peut nommer une adresse de l’autre côté de la rue.</p><p><a href="LIRE_MOI.md">Lire les notes de relevé</a> · <a href="positions.json">Positions JSON</a> · <a href="positions_cameras.geojson">Caméras GeoJSON</a></p></div><div class="info"><h2>Positions de caméra</h2>'''+plan+'''<p class="small">Schéma relatif, nord en haut, sans fond cadastral. Chaque point indique les numéros des clichés pris au même panorama. Bleu : 2024. Brun : 2017.</p></div></section>
<p>Cliquer sur une image pour l’ouvrir en grand. Les vues de 2024 sont présentées en premier.</p><nav aria-label="Filtrer les dates"><button class="active" data-filter="all" aria-pressed="true">Tout · 15</button><button data-filter="2024-07" aria-pressed="false">Juillet 2024 · 10</button><button data-filter="2017-10" aria-pressed="false">Octobre 2017 · 3</button><button data-filter="carte" aria-pressed="false">Repères de carte · 2</button></nav><div class="grid">'''+''.join(cards)+'''</div><footer>Références visuelles pour modélisation manuelle : dimensions, altitude et calibration des caméras non disponibles. Les parties masquées et faces arrière restent à documenter. Ne pas mélanger les états de 2017 et 2024. Source : Google Street View / Google Maps ; dates et attributions conservées dans les captures.</footer></main><script>
const buttons=document.querySelectorAll('[data-filter]');buttons.forEach(b=>b.addEventListener('click',()=>{buttons.forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});document.querySelectorAll('article').forEach(a=>a.hidden=b.dataset.filter!=='all'&&a.dataset.group!==b.dataset.filter)}));
document.querySelectorAll('svg a').forEach(a=>a.addEventListener('click',()=>buttons[0].click()));
</script></html>'''
(OUT/'index.html').write_text(page,encoding='utf-8')

font_path=Path('C:/Windows/Fonts/segoeui.ttf')
font=ImageFont.truetype(str(font_path),23)
small=ImageFont.truetype(str(font_path),17)
heading=ImageFont.truetype(str(font_path),35)
board=Image.new('RGB',(1800,1260),'#f2f1ec')
d=ImageDraw.Draw(board)
d.text((30,20),'Buirette de Verrières · 12 à 20',font=heading,fill='#233844')
d.text((30,67),'Sélection · Google Street View, juillet 2024 · coordonnées des panoramas',font=small,fill='#53666e')
selection=['10','15','11','05','04','14']
for i,num in enumerate(selection):
    r=next(t for t in shots if t['id'][:2]==num)
    x=30+(i%2)*885; y=110+(i//2)*380
    with Image.open(OUT/r['file']) as im:
        thumb=im.resize((855,436),Image.Resampling.LANCZOS)
        thumb.thumbnail((855,290),Image.Resampling.LANCZOS)
        board.paste(thumb,(x+(855-thumb.width)//2,y))
    d.text((x,y+294),f"{num} · {r['title']}",font=font,fill='#233844')
    d.text((x,y+327),f"{coord(r)} · azimut {r['heading_deg']:g}°",font=small,fill='#53666e')
board.save(OUT/'apercu.jpg',quality=93)

# Validation de cohérence des livrables avant archivage.
assert len(shots)==13 and len(maps)==2 and len(unique)==6
assert sum(r['image_date']=='2024-07' for r in shots)==10
for r in all_rows:
    with Image.open(OUT/r['file']) as im:
        assert im.format=='PNG' and im.size==(2560,1305)
        assert json.loads(im.info['ReferenceMetadata'])['id']==r['id']
    assert r['file'] in page and r['url'].startswith('https://www.google.com/maps/')

archive=ROOT/'references_buirette_12_20.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in sorted(OUT.iterdir()):
        if path.is_file():z.write(path,arcname=OUT.name+'/'+path.name)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print(json.dumps({'captures':len(all_rows),'panoramas':len(unique),'archive':str(archive),'zip_mb':round(archive.stat().st_size/1e6,1),'files':len(list(OUT.iterdir()))},ensure_ascii=False))
