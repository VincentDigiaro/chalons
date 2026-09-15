// Hand-annotated architectural observations. Dimensions are estimates in metres.
// IDs refer to inspect-attila.py's footprint inventory, never to street numbers.
export const observations=[
 {id:21,label:'70 / 70B · pavillon sur sous-sol',address:'70B',front:1,eaves:4.3,rise:1.8,roof:'hip',color:'#dbd5bd',refs:['08'],type:'raised',confidence:'Façade observée ; numéro 70B dans OSM'},
 ...[[16,'72','#e3ddc9'],[7,'74','#c2cbd0'],[9,'76','#e7e4d8'],[3,'78','#d8d0ba']].map(([id,address,color])=>({id,label:address+' · maison mitoyenne',address,front:1,eaves:6.6,rise:2.1,roof:'gable',color,refs:['02','04','08','14','user-aerial','user-rear'],type:'terrace',confidence:id===9?'Façade partiellement masquée par un arbre ; motif de certaines baies interprété':'Façades avant et arrière observées'})),
 {id:22,label:'75 · maison à volets blancs',address:'75',front:-1,eaves:5.45,rise:1.45,roof:'gable',color:'#c8c2ad',refs:['07'],type:'white-shutters',confidence:'Façade observée ; correspondance d’adresse interprétée'},
 {id:18,label:'77 · façade à encadrements moulurés',address:'77',front:-1,eaves:7.5,rise:1.65,roof:'gable',color:'#e2d9b8',refs:['07','09'],type:'ornate',confidence:'Numéro 77 et façade observés'},
 {id:26,label:'77 · garage à étage',address:'77',front:-1,eaves:6.65,rise:1.5,roof:'gable',color:'#ded6b8',refs:['07','09'],type:'garage-upper',confidence:'Garage et fenêtre haute observés'},
 {id:6,label:'77 · annexe arrière',front:-1,eaves:2.6,rise:.4,roof:'lean',color:'#cfc6b0',refs:['ign'],type:'simple'},
 {id:12,label:'Pavillon sur sous-sol · aile latérale',front:-1,eaves:3.65,rise:1.5,roof:'lean',color:'#d4cdb8',refs:['06','09','ign'],type:'simple'},
 {id:28,label:'Pavillon sur sous-sol · entrée à escalier',front:-1,eaves:3.75,rise:2.5,roof:'hip',color:'#d9d2be',refs:['06','09'],type:'steps-house',confidence:'Entrée, escalier et menuiseries bois observés ; numéro illisible'},
 {id:31,label:'83 · maison à volets rouges',address:'83',front:-1,eaves:6.45,rise:2.15,roof:'front-gable',gableFrom:.32,gableTo:1,color:'#e4ddc9',refs:['06'],type:'red-gable',confidence:'Numéro 83 et façade observés'},
 {id:19,label:'85 · annexe arrière',address:'85',front:-1,eaves:2.7,rise:.5,roof:'lean',color:'#c8c0aa',refs:['ign'],type:'simple'},
 {id:34,label:'85 · soubassement en pierre',address:'85',front:-1,eaves:5.8,rise:1.8,roof:'front-gable',gableFrom:.48,gableTo:1,color:'#dccbb4',refs:['06','12','14'],type:'stone-gable',confidence:'Façade à soubassement pierre et pignon observée ; numéro interprété'},
 {id:20,label:'87 · façade blanche et volets verts',address:'87',front:-1,eaves:6.6,rise:1.6,roof:'gable',color:'#e2e0d4',refs:['12'],type:'green',confidence:'Numéro 87 et façade observés'},
 {id:15,label:'89 · garage',address:'89',front:-1,eaves:2.9,rise:.08,roof:'flat',color:'#ded6c4',refs:['12'],type:'garage'},
 {id:24,label:'89 · dépendance arrière',address:'89',front:-1,eaves:2.5,rise:.3,roof:'lean',color:'#c6bca4',refs:['ign'],type:'simple'},
 {id:30,label:'89 · corps principal',address:'89',front:-1,eaves:6.7,rise:1.7,roof:'gable',color:'#ded5be',refs:['12'],type:'burgundy',confidence:'Numéro 89, entrée et fenêtres observés'},
 {id:29,label:'89 · aile à pignon',address:'89',front:-1,eaves:6.7,rise:1.8,roof:'front-gable',gableFrom:0,gableTo:.57,color:'#dfd7c5',refs:['12'],type:'timber-gable',confidence:'Pignon, bandeaux blancs et fenêtres observés'},
 {id:4,label:'89 · annexe arrière',address:'89',front:-1,eaves:3,rise:.6,roof:'lean',color:'#cfc4af',refs:['ign'],type:'simple'},
 // These two adjacent houses locate the imprecise Maps pin for “90”.
 // Their observed numbers remain 92 and 94; they are boundary context.
 ...[[23,'92'],[25,'94']].map(([id,address])=>({id,label:address+' · contexte de limite',address,front:1,eaves:5.75,rise:2.45,roof:'paired',color:'#dfd8c2',refs:['10','11','13'],type:'paired',context:true,confidence:'Numéro visible ; contexte au-delà de 90'}))
];
