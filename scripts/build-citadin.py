"""Build a textured, articulated contemporary citizen in Blender.

Run with Blender --background --factory-startup --python scripts/build-citadin.py.
Source dependencies are cached under .cache/character-build (MPFB and CC0 system assets).
"""
from pathlib import Path
import bpy, sys, math, json
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'character-build'
OUT = ROOT / 'assets' / 'characters' / 'citadin_homme'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(CACHE / 'mpfb2-master' / 'src'))

# Keep the temporary generator's configuration within this project.
original_extension_path_user = bpy.utils.extension_path_user
def local_extension_path(package, *, path='', create=False):
    if package == 'mpfb':
        result = CACHE / 'mpfb-user' / path
        result.mkdir(parents=True, exist_ok=True)
        return str(result)
    return original_extension_path_user(package, path=path, create=create)
bpy.utils.extension_path_user = local_extension_path
original_resource_path = bpy.utils.resource_path
bpy.utils.resource_path = lambda kind, **kw: str(CACHE/'blender-user') if kind == 'USER' else original_resource_path(kind, **kw)
import addon_utils
addon_utils.enable('mpfb', default_set=True, persistent=False)
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.locationservice import LocationService
from mpfb.services.exportservice import ExportService
from mpfb.services.objectservice import ObjectService

ASSETS = CACHE / 'system-assets'
LocationService._user_data = str(ASSETS)
print('CITADIN: generator initialized', flush=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
phenotype = TargetService.get_default_macro_info_dict()
phenotype.update(gender=1.0, age=0.39, muscle=0.52, weight=0.47, height=0.54, proportions=0.57)
phenotype['race'] = {'caucasian': 0.8, 'african': 0.12, 'asian': 0.08}
body = HumanService.create_human(macro_detail_dict=phenotype)
body.name = 'Adrien_Body'
HumanService.set_character_skin(str(ASSETS/'skins/young_caucasian_male/young_caucasian_male.mhmat'), body, skin_type='GAMEENGINE')
rig = HumanService.add_builtin_rig(body, 'mixamo')
rig.name = 'Adrien_Rig'
print('CITADIN: body and skeleton', flush=True)
specs = [
    ('eyes', 'low-poly', 'Eyes', 'Adrien_Eyes'),
    ('eyebrows', 'eyebrow007', 'Eyebrows', 'Adrien_Brows'),
    ('eyelashes', 'eyelashes01', 'Eyelashes', 'Adrien_Lashes'),
    ('teeth', 'teeth_base', 'Teeth', 'Adrien_Teeth'),
    ('tongue', 'tongue01', 'Tongue', 'Adrien_Tongue'),
    ('hair', 'short02', 'Hair', 'Adrien_Hair'),
    ('clothes', 'male_casualsuit01', 'Clothes', 'Adrien_Shirt_Jeans'),
    ('clothes', 'shoes05', 'Clothes', 'Adrien_Sneakers'),
]
for folder, asset, kind, name in specs:
    obj = HumanService.add_mhclo_asset(str(ASSETS/folder/asset/(asset+'.mhclo')), body,
        asset_type=kind, subdiv_levels=0, material_type='GAMEENGINE')
    obj.name = name
    print('CITADIN: fitted ' + name, flush=True)

bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/'citadin_working.blend'))
print('CITADIN: raw saved', flush=True)
print('BONES', [(b.name, tuple(b.head_local), tuple(b.tail_local)) for b in rig.data.bones], flush=True)
print('MESHES', [(o.name, len(o.data.vertices)) for o in bpy.data.objects if o.type=='MESH'], flush=True)
