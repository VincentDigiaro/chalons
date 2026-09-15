"""Manual observations in the supplied captures, not a surveyed building model.
Image points use the inspected 2048px-wide version (no browser chrome removed).
Quads: top-left, top-right, bottom-right, bottom-left. Hidden pixels are masked.
Footprint IDs refer to the stable inventory produced by inspect-nerval.py.
"""
# Parts, eaves, ridge rise, roof, reference photos, observed description.
BUILDINGS=[
([8,9],3.0,1.8,'gable',[16],'Maison basse et garage, volets gris'),
([12],3.0,1.9,'gable',[16,17],'Maison basse derrière la haie'),
([17],5.6,1.5,'gable',[13,17],'Maison à étage, volets bruns, haie pourpre'),
([23,25,26],3.0,1.9,'gable',[17,18],'Façades partiellement masquées par la végétation'),
([32,35,37],3.0,3.8,'gable',[12,18],'Maison et garage, végétation en premier plan'),
([41,43,44],3.0,3.6,'gable',[11,18],'Maison et extension basse'),
([49,50],3.1,4.0,'gable',[11,18],'Maison à pignon, partiellement floutée'),
([53,57],3.0,1.8,'gable',[18,20],'Maison en grande partie floutée'),
([64,60,61,67,68],3.0,4.1,'cross',[20,21],'Pignon blanc sur rue, deux ouvertures visibles'),
([10,11],3.0,4.3,'gable',[14,15,16],'Maison d’angle, grande lucarne, portail vert'),
([13,14,15,16,18],3.0,3.8,'gable',[13,15,17],'Maisons accolées, niveaux de façade distincts'),
([20,21,24],3.0,4.0,'gable',[12,13,17],'Maison à lucarne et garage'),
([30,31,34],3.0,4.1,'hip',[11,12],'Toiture à quatre pans, portail bordeaux'),
([39,40,42,45,46],3.0,4.0,'cross',[11,18],'Pignon blanc, garage et jardin'),
([47,48],3.0,4.1,'gable',[10,11,18],'Toiture à deux pans et abri latéral'),
([51,54,56],3.0,4.1,'gable',[9,10,18],'Secteur 17, lucarne et volets rouges'),
([58,59],3.0,4.1,'gable',[9,10],'Secteur 19, garage et volets bruns'),
([62,66],3.0,4.1,'gable',[9,19],'Secteur 21, garage en contrebas'),
([69,70],3.0,4.1,'gable',[8,9,19],'Secteur 23, façade crème, volets bruns'),
([72,74,75],3.0,1.8,'gable',[7,8,19],'Maison basse, portes-fenêtres et garage latéral'),
([82],3.0,4.1,'gable',[6,7,19,22],'Maison à quatre fenêtres de toit'),
([85,88,89,90],3.0,4.2,'gable',[6,22],'Maison au carrefour, volets bois'),
([91,93,95],3.0,4.2,'gable',[6,22,23],'Maison à pignon, cheminée et conifère'),
([96],3.0,2.3,'gable',[5,6,23,24],'Numéro 33 visible, maison en L et bouleau'),
([100,102,103,104,107],3.0,3.9,'gable',[4,5,23,24],'Maisons jumelées, garages bas et lisses blanches'),
([109,110,111],3.0,3.9,'gable',[4,26],'Maisons jumelées, clôtures claires'),
([113,114],3.0,4.0,'gable',[1,4,27],'Secteur 45, façade à deux niveaux'),
([116,117,118],3.0,4.3,'cross',[1,4,27],'Maison de fond d’impasse, pignon et auvent'),
([112,115],3.0,1.7,'gable',[1,2,3,27],'Secteur 42, façade basse et volume arrière à étage'),
([106,108],3.0,4.1,'gable',[3,26,27],'Secteur 40, toiture pentue et volets bois'),
([101,105],5.5,1.5,'gable',[3,26],'Façade surélevée aux volets bleus'),
([92,94,99],3.0,4.2,'cross',[3,25,26],'Maison d’angle de la boucle, pignon sur rue'),
([80,83,84,87],3.0,4.0,'cross',[5,24,25],'Pignon blanc et extension à toit plat'),
([79],3.0,2.0,'hip',[5,6,21,22,24],'Maison à croupe, haie entourant le carrefour'),
]
# Changes observed in photographs. OSM parts are retained; adjoining parts can
# have different eaves. Roof height estimates are deliberately not called OSM heights.
OVERRIDES={14:(5.8,1.4),15:(2.7,1.2),16:(5.5,1.8),20:(2.7,0.7),21:(5.4,1.9),
30:(2.7,1.0),31:(2.7,1.0),39:(2.7,1.1),42:(2.7,1.0),45:(2.7,1.1),46:(2.7,0.5),47:(2.7,1.2),
51:(2.6,1.0),56:(5.5,1.6),58:(5.5,1.6),66:(5.5,1.6),69:(5.5,1.6),72:(2.7,1.0),74:(2.7,1.0),
85:(2.4,0.5),89:(2.5,0.7),90:(2.5,0.7),91:(2.4,0.5),95:(2.5,0.7),
102:(5.5,1.4),103:(5.5,1.4),107:(2.5,0.7),109:(5.5,1.4),110:(5.5,1.4),113:(5.5,1.4),
116:(2.5,0.7),118:(2.5,0.9),115:(5.6,1.3),106:(2.6,1.0),92:(2.8,1.2),94:(5.4,1.6),84:(2.6,0.0),87:(2.8,0.0)}

PATCHES=[]
def face(part,photo,quad,*,height=None,bottom=0.15,side='front',span=None,depth=0,mask=None,note='Façade visible, redressée par homographie'):
    PATCHES.append(dict(part=part,photo=photo,quad=quad,height=height,bottom=bottom,side=side,span=span,depth=depth,mask=mask or [],note=note))

# Entry: retain the clear openings, excluding foreground cars/vegetation.
face(10,15,[[1038,252],[1392,262],[1369,362],[1041,370]],mask=[[[1040,321],[1135,318],[1155,370],[1040,375]]])
face(14,13,[[1138,162],[1326,121],[1301,371],[1152,346]])
face(16,13,[[1417,166],[1654,138],[1602,440],[1367,397]])
face(18,13,[[1640,279],[2000,285],[1980,506],[1606,442]],mask=[[[1960,285],[2000,285],[1980,506],[1920,485]]])
face(21,12,[[961,230],[1003,223],[1000,290],[960,286]])
face(24,12,[[1017,270],[1091,274],[1092,303],[1014,293]])
face(8,16,[[1114,269],[1418,269],[1414,368],[1123,374]],mask=[[[1110,308],[1160,308],[1157,380],[1110,380]]])
face(12,16,[[790,259],[918,257],[918,302],[799,285]],bottom=1.2)
face(17,17,[[1210,53],[1466,0],[1454,316],[1200,328]],bottom=1.5,mask=[[[1400,0],[1470,0],[1470,330],[1427,330]]])
# Curved middle section.
face(40,11,[[1565,231],[1755,209],[1741,349],[1585,306]],side='right',height=3.0,bottom=1.2)
face(48,18,[[425,256],[636,295],[635,318],[444,293]],bottom=1.7)
face(54,10,[[875,273],[1221,273],[1180,405],[883,382]])
face(56,10,[[1230,130],[1459,99],[1419,449],[1196,421]],mask=[[[1190,365],[1305,361],[1404,431],[1419,449],[1196,421]]])
face(58,10,[[1459,99],[1853,63],[1740,520],[1419,449]],mask=[[[1419,423],[1550,471],[1510,520],[1380,485]]])
face(62,9,[[941,277],[1160,277],[1152,423],[972,402]],span=[0.22,1],mask=[[[940,277],[1004,277],[990,403],[941,402]]])
face(66,9,[[1174,118],[1452,76],[1420,470],[1163,441]],mask=[[[1219,397],[1345,375],[1420,392],[1420,470],[1190,456]]])
face(69,9,[[1452,76],[1872,16],[1695,559],[1420,470]],mask=[[[1420,392],[1482,414],[1470,504],[1390,476]]])
face(70,8,[[794,270],[914,270],[912,372],[810,370]],mask=[[[794,270],[845,268],[856,376],[808,379]]])
face(75,19,[[722,260],[1064,264],[1060,385],[738,443]])
face(75,19,[[446,180],[711,254],[730,444],[538,393]],side='left')
face(82,7,[[1129,275],[1460,282],[1435,345],[1131,326]],bottom=1.1,mask=[[[1200,310],[1350,305],[1360,349],[1180,349]]])
face(88,22,[[3,283],[484,280],[493,344],[3,351]],bottom=1.1)
face(93,22,[[665,277],[886,282],[882,310],[670,316]],bottom=1.1)
# The opposite gable: two source patches avoid the hedge and the Google blur.
face(64,20,[[977,221],[1406,213],[1410,400],[980,387]],height=3.0,bottom=0.7,mask=[[[977,277],[1210,285],[1266,400],[977,400]]])
face(64,20,[[1155,68],[1316,69],[1314,218],[1155,220]],height=5.7,bottom=3.4,span=[0.44,0.78])
# No. 33 is split around the birch. Masked surfaces remain plain, not invented.
face(96,23,[[410,253],[785,258],[800,401],[449,405]],span=[0,0.48],depth=5.6,mask=[[[515,350],[705,348],[716,412],[502,412]]])
face(96,5,[[1199,260],[1396,263],[1389,384],[1202,380]],side='left',mask=[[[1300,295],[1400,275],[1400,390],[1260,390]]])
face(100,4,[[836,257],[935,248],[929,371],[854,377]])
face(102,4,[[935,228],[995,213],[980,375],[929,371]],mask=[[[960,212],[976,212],[968,380],[952,380]]])
face(103,4,[[995,213],[1053,198],[1044,387],[980,375]],mask=[[[1006,210],[1025,210],[1021,392],[1000,392]]])
face(104,4,[[1058,282],[1098,283],[1098,391],[1050,382]])
face(113,4,[[1280,111],[1572,66],[1531,434],[1262,429]],bottom=1.0)
face(114,4,[[1570,245],[2014,240],[2014,540],[1524,491]],mask=[[[1560,423],[1670,420],[1708,538],[1510,500]]])
# Northern side near the cul-de-sac: cream low façade, blue shutters, corner house.
face(112,3,[[8,311],[543,316],[552,507],[8,552]],span=[0.18,1],mask=[[[8,502],[209,486],[227,552],[8,562]]])
face(115,2,[[1136,182],[1331,138],[1297,428],[1138,428]],height=5.6)
face(108,27,[[1753,283],[2037,279],[2037,473],[1718,501]],bottom=0.4)
face(105,26,[[891,237],[1003,236],[1007,319],[891,313]],bottom=1.8)
face(101,26,[[840,229],[891,237],[891,313],[839,313]],bottom=1.8)
face(99,26,[[1318,268],[1927,259],[1927,367],[1310,331]],bottom=1.6,height=3.0)
face(99,26,[[1369,7],[1728,7],[1695,245],[1368,245]],height=5.9,bottom=3.6,span=[0.20,0.77])
face(94,25,[[1016,196],[1261,207],[1255,358],[1025,351]],mask=[[[1016,277],[1161,273],[1169,354],[1016,354]]])
face(92,25,[[1268,253],[1324,263],[1320,321],[1268,315]])
face(83,24,[[961,217],[1175,190],[1181,316],[962,326]],bottom=0.6,height=3.1)
face(79,21,[[851,249],[976,244],[976,283],[851,283]],bottom=1.4)
# Closer roof photographs retain the actual tiles and skylights of that roof.
# 'roof' means the street-facing slope, from ridge (top) to gutter (bottom).
face(10,15,[[923,1],[1269,58],[1400,248],[1040,243]],side='roof',mask=[[[1122,69],[1378,124],[1366,229],[1197,220]]])
face(8,16,[[1250,161],[2017,37],[1772,269],[1105,252]],side='roof')
face(12,16,[[910,198],[1057,166],[919,249],[794,254]],side='roof')
face(54,10,[[1053,87],[1270,104],[1221,263],[865,263]],side='roof',mask=[[[1030,91],[1150,121],[1125,226],[1014,211]]])
face(59,9,[[832,109],[1042,75],[943,263],[723,263]],side='roof',mask=[[[738,164],[830,175],[940,235],[940,263],[715,264]]])
face(62,9,[[1042,75],[1210,54],[1160,263],[943,263]],side='roof')
face(75,19,[[476,90],[946,152],[1072,252],[713,247]],side='roof')
face(82,19,[[942,132],[1164,176],[1260,267],[1067,269]],side='roof')
face(93,6,[[1305,84],[1605,31],[1422,255],[1175,250]],side='roof',mask=[[[1168,19],[1340,10],[1310,281],[1160,280]]])
face(112,3,[[7,146],[487,153],[543,297],[7,297]],side='roof',span=[.18,1])
face(108,3,[[831,90],[1097,137],[1240,303],[902,296]],side='roof',mask=[[[883,217],[1026,199],[1090,300],[907,299]]])
face(54,10,[[1035,127],[1103,128],[1100,211],[1040,207]],side='dormer',height=1.25,bottom=0)
face(10,15,[[1190,117],[1356,144],[1350,207],[1203,199]],side='dormer',height=1.25,bottom=0)
# Clear fence/hedge samples are used only on their actual local frontage.
FENCES=[
([10],15,'bars',1.45,'#263f35',6.5),([8,12],16,'white',1.2,'#e6e0cd',5.4),
([17],17,'hedge',1.35,'#663f48',5.0),([23,25,26],18,'hedge',1.5,'#657044',5.3),
([32,35,37],18,'hedge',1.6,'#818444',5.0),([41,43,44],11,'hedge',1.6,'#90954d',5.3),
([49,50],18,'hedge',1.5,'#818d4b',5.1),([53,57],20,'hedge',1.35,'#5d7341',5.0),
([64,60,61,67,68],20,'hedge',0.95,'#718844',5.0),
([13,14,15,16,18],13,'white',1.15,'#ece4ce',5.3),([20,21,24],12,'bars',1.3,'#2d5345',6.0),
([30,31,34],12,'hedge',1.65,'#40593a',6.0),([39,40,42,45,46],11,'hedge',1.45,'#496a3d',6.1),
([47,48],11,'hedge',1.65,'#4f6640',5.4),([51,54,56],10,'bars',1.2,'#333b31',5.0),
([58,59],10,'wood',1.2,'#4b3d31',5.0),([62,66],9,'hedge',0.8,'#3c573b',5.0),
([69,70],8,'bars',1.1,'#304838',5.0),([72,74,75],19,'bars',1.2,'#354b3b',5.0),
([82],7,'screen',1.3,'#787f79',5.0),([85,88,89,90],6,'bars',1.4,'#394433',5.2),
([91,93,95],6,'hedge',1.5,'#58634d',5.4),([96],23,'wood',1.2,'#554531',5.5),
([100,102,103,104,107],5,'rails',1.1,'#e2ded0',5.0),([109,110,111],4,'rails',1.05,'#e4e0ca',5.0),
([113,114],4,'wood',1.0,'#67452d',5.0),([116,117,118],1,'hedge',1.7,'#56683b',5.0),
([112,115],2,'bars',1.3,'#2c5946',5.0),([106,108],3,'hedge',1.4,'#526b3d',5.1),
([101,105],26,'hedge',1.4,'#596b3c',5.0),([92,94,99],25,'hedge',1.65,'#627842',5.2),
([80,83,84,87],24,'hedge',1.65,'#68854a',5.0),([79],21,'hedge',1.6,'#6c823d',5.3)]

# Revision after comparison of the model with the original panoramas.
# Keep photo roof observations as provenance/material evidence, never as a
# partially stretched aerial picture on a whole roof.
FOCUS_PARTS=[80,83,84,87,92,94,99,101,105,106,108,112,115,
 100,102,103,104,107,109,110,111,113,114,116,117,118]
# Complete the volumes around the selected turning court. Unseen elevations
# remain simple plaster; only the bungalow clearly visible in 25 has openings.
BUILDINGS += [
 ([77],2.9,2.1,'hip',[28],'Maison au nord de la boucle, volume interprété sur la vue aérienne'),
 ([78],3.0,2.5,'gable',[28],'Maison derrière la boucle, façades non documentées'),
 ([81],3.0,2.0,'hip',[28],'Maison en retrait, façades non documentées'),
 ([86],2.9,2.1,'gable',[25,28],'Maison basse sur la cour, enduit clair et volets bois'),
 ([97,98],2.9,3.5,'gable',[25,28],'Maison en retrait de la boucle, toiture et fenêtres de toit visibles')]
OVERRIDES[98]=(2.6,.5)
FOCUS_PARTS += [77,78,81,86,97,98]
FENCES += [([86],25,'hedge',.85,'#647548',5.0),([97,98],25,'hedge',1.5,'#647548',4.5)]
ROOF_OBSERVATIONS=[p for p in PATCHES if p['side']=='roof' and p['part'] in FOCUS_PARTS]
PATCHES[:]=[p for p in PATCHES if not (p['side']=='roof' and p['part'] in FOCUS_PARTS)]
ROOF_PROFILES={99:{'roof':'gable'},83:{'frontFlat':3.0},106:{'eaves':2.7,'rise':.8},112:{'roofEnd':2.6}}

def replace(part,photo=None,side=None):
    PATCHES[:]=[p for p in PATCHES if not (p['part']==part and (photo is None or p['photo']==photo) and (side is None or p['side']==side))]

def observed(part,photo,quad,**kwargs):
    # Coordinates on the unwarped 1600px reference, easier to audit.
    masks=kwargs.pop('mask',[])
    face(part,photo,[[x*1.28,y*1.28] for x,y in quad],mask=[[[x*1.28,y*1.28] for x,y in m] for m in masks],**kwargs)

# The large gable seen in 26 faces the main street, whereas the two-storey
# adjoining volume in 25 faces the loop. They are different planes.
replace(99)
observed(99,25,[[578,207],[784,211],[784,249],[579,246]],bottom=1.35,height=3.0)
observed(99,3,[[1307,176],[1345,176],[1323,228],[1282,229]],side='left',span=[.32,.69],height=5.85,bottom=3.8,
 note='Ouverture du pignon côté rue principale ; plan distinct de la façade sur la boucle')
observed(99,26,[[1077,207],[1145,207],[1138,250],[1065,250]],side='left',span=[.62,.88],height=2.55,bottom=1.2,
 mask=[[[1060,239],[1149,239],[1149,255],[1060,255]]])

# Full low facade comes from 27. The sharper window in 03 is calibrated with
# its shutter edges, rather than mapping a skewed crop over the entire wall.
replace(112)
observed(112,27,[[737,218],[940,217],[936,284],[736,287]],bottom=.25,height=3.0,
 mask=[[[816,259],[945,245],[945,288],[816,288]]])
observed(112,3,[[120,247],[379,244],[405,355],[163,385]],span=[.53,.92],height=2.52,bottom=.87,
 note='Fenêtre redressée sur les quatre coins des volets, position estimée sur la façade')
replace(115)
observed(115,2,[[929,131],[973,121],[978,165],[935,176]],span=[.14,.34],height=5.10,bottom=4.0)
observed(115,2,[[1063,107],[1111,92],[1104,152],[1057,156]],span=[.62,.84],height=5.10,bottom=4.0)
observed(115,2,[[915,249],[972,244],[969,342],[912,334]],span=[.16,.44],height=2.55,bottom=.15)

# A cropped opening previously stretched across the whole front is replaced
# by the actual visible front band plus the visible gable opening.
replace(108)
observed(108,3,[[837,241],[974,239],[972,292],[839,294]],bottom=1.1,height=3.0,
 mask=[[[836,240],[921,240],[925,298],[836,298]],[[946,271],[978,257],[978,299],[946,299]]])
observed(108,3,[[638,149],[670,140],[669,221],[645,231]],side='left',span=[.35,.57],height=5.6,bottom=3.6)

# Correct the garage-facing narrow strips inside the selected zone.
replace(113)
observed(113,4,[[1000,87],[1228,51],[1168,340],[966,336]],bottom=1.0,height=5.5)
replace(114)
observed(114,4,[[1218,198],[1572,193],[1460,426],[1158,379]],bottom=.2,height=3.0,
 mask=[[[1200,330],[1300,328],[1380,428],[1150,390]]])

# Small skylights are geometry on the correct roof slope; no tree, shadow or
# blurred aerial object is transferred onto those roof surfaces.
SKYLIGHTS=[(108,.39,.52,.7,.9),(83,.38,.55,.75,1.0),(99,.26,.53,.75,1.0)]
observed(117,1,[[600,191],[721,191],[720,258],[601,260]],side='right',span=[.27,.57],height=2.55,bottom=.9,
 note='Fenêtre et volets visibles depuis le passage du fond de l’impasse')
SKYLIGHTS.append((117,.42,.50,.8,1.0,1))
SKYLIGHTS += [(97,.38,.55,.8,1.0),(97,.73,.55,.95,1.0)]

# Openings with clear outlines are modelled as frames, glazing and shutters.
# This avoids baking the panorama's skew into their silhouette.
OPENINGS=[
 dict(part=99,side='left',along=.5,bottom=3.7,width=1.65,height=1.75,shutters='brown',rail=True,photo=26),
 dict(part=108,side='left',along=.47,bottom=3.65,width=.95,height=1.55,shutters='brown',photo=3),
 dict(part=112,side='front',along=.73,bottom=.95,width=1.55,height=1.40,shutters='brown',photo=3),
 dict(part=115,side='front',along=.25,bottom=4.0,width=.95,height=1.0,shutters=None,roller=True,photo=2),
 dict(part=115,side='front',along=.74,bottom=4.0,width=.95,height=1.0,shutters=None,roller=True,photo=2),
 dict(part=105,side='front',along=.27,bottom=3.8,width=.90,height=1.25,shutters='blue',photo=26),
 dict(part=105,side='front',along=.73,bottom=3.8,width=.90,height=1.25,shutters='blue',photo=26)]
OPENING_OBSERVATIONS=[]
for p in list(PATCHES):
    modeled=(p['part']==99 and p['side']=='left' and p['bottom']>3) or (p['part']==108 and p['side']=='left') or (p['part']==112 and p['photo']==3) or (p['part']==115 and p['bottom']>=4) or p['part']==105
    if modeled:OPENING_OBSERVATIONS.append(p);PATCHES.remove(p)

# Revision requested by the user: photographs are references, never facade
# decals in the selected impasse/loop. Elements below are actual mesh geometry.
# Width/height/along are visual estimates, not measurements from panoramas.
OPENINGS += [
 dict(part=86,side='front',along=.20,bottom=.80,width=.9,height=1.35,shutters='brown',closed=True,photo=25),
 dict(part=86,side='front',along=.52,bottom=.12,width=.9,height=2.10,kind='door',color='#795537',glazed=True,photo=25),
 dict(part=86,side='front',along=.81,bottom=.8,width=.9,height=1.35,shutters='brown',closed=True,photo=25),
 dict(part=99,side='left',along=.73,bottom=.95,width=1.25,height=1.45,shutters='brown',photo=26),
 dict(part=99,side='front',along=.52,bottom=.15,width=2.20,height=2.35,kind='patio',frame='wood',photo=25),
 dict(part=94,side='front',along=.26,bottom=3.75,width=.95,height=1.30,shutters='brown',closed=True,photo=25),
 dict(part=94,side='front',along=.74,bottom=3.75,width=.95,height=1.30,shutters='red',photo=25),
 dict(part=94,side='front',along=.55,bottom=.15,width=2.55,height=2.20,kind='garage',color='#8c3740',photo=25),
 dict(part=92,side='front',along=.54,bottom=.80,width=1.10,height=1.40,shutters='red',photo=25),
 dict(part=101,side='front',along=.53,bottom=3.55,width=.90,height=1.30,shutters='brown',photo=3),
 dict(part=105,side='front',along=.49,bottom=.3,width=2.35,height=2.20,kind='garage',color='#9c9d91',photo=26,visibility='Partie basse masquée, restitution simplifiée'),
 dict(part=108,side='front',along=.56,bottom=.85,width=1.45,height=1.55,shutters='brown',photo=27),
 dict(part=108,side='front',along=.85,bottom=.12,width=.82,height=2.10,kind='door',color='#c4c4b8',glazed=True,photo=3),
 dict(part=112,side='front',along=.21,bottom=.95,width=1.15,height=1.40,shutters='brown',photo=3),
 dict(part=115,side='front',along=.30,bottom=.15,width=1.50,height=2.25,kind='patio',frame='wood',photo=2),
 dict(part=106,side='front',along=.5,bottom=.1,width=2.25,height=2.15,kind='garage',color='#554338',photo=3),
 dict(part=113,side='front',along=.51,bottom=3.45,width=1.10,height=1.40,shutters='brown',lintel='brown',photo=4),
 dict(part=113,side='front',along=.52,bottom=.12,width=2.40,height=2.12,kind='garage',color='#716b60',photo=4,visibility='Bas masqué par la haie'),
 dict(part=114,side='front',along=.54,bottom=.15,width=1.70,height=2.30,kind='door',color='#795332',glazed=True,lintel='brown',leaves=2,photo=4),
 dict(part=117,side='right',along=.42,bottom=.88,width=1.40,height=1.45,shutters='brown',frame='wood',grid=True,photo=1),
 dict(part=100,side='front',along=.55,bottom=.18,width=1.45,height=2.20,kind='patio',shutters='brown',photo=4),
 dict(part=102,side='front',along=.53,bottom=3.6,width=.95,height=1.35,shutters='brown',photo=4),
 dict(part=103,side='front',along=.48,bottom=3.6,width=.95,height=1.35,shutters='brown',photo=4),
 dict(part=102,side='front',along=.53,bottom=.12,width=2.30,height=2.15,kind='garage',color='#66574a',photo=4),
 dict(part=103,side='front',along=.48,bottom=.12,width=2.30,height=2.15,kind='garage',color='#706b61',photo=4),
 dict(part=104,side='front',along=.51,bottom=.18,width=1.35,height=2.15,kind='patio',shutters='brown',photo=4),
 dict(part=109,side='front',along=.48,bottom=3.6,width=.95,height=1.35,shutters='brown',photo=4,visibility='Partiellement masquée par le bouleau'),
 dict(part=110,side='front',along=.53,bottom=3.6,width=.95,height=1.35,shutters='brown',photo=4,visibility='Partiellement masquée par le bouleau'),
 dict(part=109,side='front',along=.48,bottom=.12,width=2.30,height=2.15,kind='garage',color='#776c5e',photo=4,visibility='Niveau bas interprété'),
 dict(part=110,side='front',along=.53,bottom=.12,width=2.30,height=2.15,kind='garage',color='#776c5e',photo=4,visibility='Niveau bas interprété'),
 dict(part=111,side='front',along=.51,bottom=.18,width=1.4,height=2.15,kind='patio',shutters='brown',photo=4,visibility='Partiellement masquée'),
 dict(part=83,side='front',along=.23,bottom=.1,width=.85,height=2.10,kind='door',color='#8d9992',glazed=True,photo=24),
 dict(part=83,side='front',along=.68,bottom=.7,width=1.25,height=1.65,shutters='ochre',photo=24),
]
for p in list(PATCHES):
    if p['part'] in FOCUS_PARTS:
        OPENING_OBSERVATIONS.append(p)
        PATCHES.remove(p)

# Close survey of the end of the impasse, references 01, 02, 03 and 27.
# 119–121 are across the pedestrian path. The awning and timber window in 01
# belong there, not to 117, the last house on the opposite street frontage.
BUILDINGS += [([119,120,121],3.0,4.0,'gable',[1,2,27,28],
              'Maison derrière la haie du passage piéton, fenêtre bois et auvent')]
FOCUS_PARTS += [119,120,121]
ROOF_PROFILES.update({
 112:dict(roofEnd=2.6,rearRoof=True,rearRise=1.05),
 115:dict(eaves=5.25,rise=1.7),
 119:dict(eaves=2.45,rise=.8,roof='lean-to',roofAxis=0,openStructure=True),
 121:dict(eaves=2.6,rise=.65),
})
OPENINGS[:]=[o for o in OPENINGS if o['part'] not in [112,115] and not(o['part']==117 and o.get('photo')==1)]
OPENINGS += [
 dict(part=115,side='front',along=.25,bottom=3.85,width=1.12,height=1.18,
      frame='metal',awning=True,rack=True,photo=2),
 dict(part=115,side='front',along=.74,bottom=3.85,width=1.12,height=1.18,
      frame='metal',awning=True,rack=True,photo=2),
 dict(part=115,side='front',along=.25,bottom=.16,width=1.32,height=2.25,
      kind='patio',shutters='brown',photo=2),
 dict(part=115,side='front',along=.84,bottom=.12,width=1.82,height=2.70,
      kind='entrance',bayDepth=1.18,frame='wood',photo=2),
 dict(part=112,side='front',along=.26,bottom=.85,width=1.02,height=1.43,
      shutters='brown',closed=True,barred=True,rack=True,photo=2),
 dict(part=112,side='front',along=.706,bottom=.85,width=1.42,height=1.43,
      shutters='brown',rack=True,photo=2),
 dict(part=112,side='front',depth=8.55,span=[4.65,8.05],along=.50,
      bottom=.1,width=2.55,height=2.25,kind='garage',color='#514235',photo=3),
 dict(part=120,side='front',along=.72,bottom=.85,width=1.45,height=1.40,
      shutters='brown',shutterStyle='louvres',frame='wood',grid=True,photo=1),
]
SKYLIGHTS[:]=[s for s in SKYLIGHTS if s[0]!=117]
SKYLIGHTS += [(115,.25,.58,1.1,.75),(115,.74,.58,1.1,.75),(120,.72,.55,1.15,.75)]
END_SITE=dict(
 references=['01','02','03','25','27','28'],
 pathOsmId='way/119936729',
 photoToParts={'01':[119,120,121],'02':[112,115],'03':[112,115,108],'25':[83,86,92,94,99]},
 accuracy='Tracé du chemin et emprises OSM. Haies, ouvertures, bornes et jardin placés par observation, dimensions estimées.'
)
