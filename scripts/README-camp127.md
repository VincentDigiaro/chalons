# 127, rue du Camp d’Attila et voisinage

Reconstruction de cinq bâtiments d’après les quatre photographies fournies le 15 septembre 2026 : la maison blanche, sa voisine aux volets vert sauge, sa voisine en pierre et les deux longs bâtiments de l’autre côté de la rue. Le second bâtiment reprend le style du premier à la demande de l’utilisateur. Le repère de départ du jeu est `-412, 2110`.

## Placement

Les volumes suivent les emprises du fichier OSM existant. La séquence des façades, leurs retraits et les toitures visibles sur six tuiles IGN BD ORTHO permettent de faire correspondre les bâtiments. Le point d’adresse du géocodage IGN/BAN tombe sur la voisine de gauche : il sert à repérer le secteur, sans déplacer la maison blanche au mauvais emplacement. Le plan de contrôle est dans `artifacts/camp127/location.png`.

| Emprise | Modèle |
| --- | --- |
| way/156703677 | Voisine de gauche, volets sauge et briques |
| way/156703371 | Petite annexe arrière de cette voisine |
| way/156676458 | Maison blanche, étage en retrait et garage avancé |
| way/156704157 | Voisine en pierre et pignon |
| way/156684633 | Bâtiment en face, long toit rouge et pignon |
| way/156681188 | Long bâtiment adjacent, même style demandé |

Les identifiants internes 125 et 129 ne constituent pas une confirmation des adresses voisines. Seul le numéro 127 fourni par l’utilisateur est attribué à la maison blanche.

## Géométrie et limites

Fenêtres en retrait, découpes de murs, volets battants, volets roulants, portes, garages, arcs de briques, pierres, escaliers, garde-corps, clôtures et cheminées sont modélisés. Les images de référence ne sont pas plaquées sur les façades. Les matériaux de toiture, végétation et sol réutilisent ceux du projet.

Les hauteurs, proportions, ornements et plantations restent estimés sur les photos. La quatrième photo ne montre qu’une partie de la façade du bâtiment opposé : les ouvertures masquées sont simplifiées, et les faces latérales et arrière restent sans détail ajouté. La longue emprise du bâtiment vient d’OSM et de la vue aérienne. La clôture surélevée et la bande d’herbe suivent une implantation visuelle approximative.

## Reproduire et vérifier

```powershell
npm run camp127:build
npm run check:camp127
```

Le script d’installation remplace uniquement les anciens volumes des six emprises dans les façades, les toitures et le mode promenade. Les autres modèles et leurs paquets restent inchangés. `build-walk.mjs` et `detailed-buildings.mjs` connaissent aussi ce modèle pour les régénérations futures.

Prévisualisation : `http://localhost:5173/camp127-preview.html`. Carte : `http://localhost:5173/#camp127`. Promenade : `http://localhost:5173/?fps=1&x=-407.54&y=2110.39&angle=328.4&pitch=13`.

Les contrôles portent sur les emprises, les normales, l’intégrité des références, la suppression des doublons, l’égalité des triangles carte/promenade, la conservation des autres modèles et la circulation sur l’axe OSM de la rue. Ils ne constituent pas un relevé métrique du site réel.

Crédits : Google Maps / Street View pour les captures fournies ; © contributeurs OpenStreetMap, ODbL ; IGN BD ORTHO, Licence Ouverte 2.0.

Le contrôle historique `check-walk-replacements.mjs` conserve une empreinte Nerval antérieure à cette intervention et échoue déjà pour ce fichier dans le point de départ sauvegardé. Le contrôle Camp127 vérifie la conservation exacte des quatre modèles tels qu’ils existaient au début de cette demande. Détails dans `artifacts/camp127/verification-notes.json`.

## Corrections des gros plans

- Les deux escaliers rejoignent le bord de leur palier à la même hauteur. Le palier de la maison blanche forme un retour vers la porte ; les garde-corps laissent libre la largeur de la dernière marche.
- Les bandeaux rouges et les remplissages jaunes suivent le même plan oblique que le mur en pierre. La bande supérieure s’interrompt au droit des arcs. Le contrôle vérifie la séparation effective des sommets des briques et de la pierre.
- La grille de séparation du garage part du pilier **droit** du portillon et rejoint le jambage gauche du garage. Le portillon donne dans le jardin, avec un accès distinct de l’allée du garage.
- L’emprise `way/156681188` reçoit le même toit à deux pentes, enduit clair, encadrements de briques et oculus que sa voisine. Ce choix est une reprise de style demandée, pas une observation de sa façade sur les photos.

`check:camp127` contrôle également la continuité réelle des triangles de sol aux paliers, les ouvertures de garde-corps, la distance des briques au mur et les cheminements derrière le portillon et vers le garage.
