# Buirette · 12–20

Six maisons identifiées (12, 14, 15, 16, 17, 19) et deux emprises basses du secteur 18–20.
Les numéros 18 et 20 ne sont pas confirmés. Les faces cachées sont simplifiées ;
hauteurs et proportions sont estimées. Référence : juillet 2024.

Les emprises proviennent de `dist/data/buildings.geojson`. Les positions des
panoramas servent à retrouver les photographies, jamais à placer les bâtiments.
`references_buirette_12_20/positions.json` conserve les positions, azimuts et liens.
Les quinze clichés de juillet et le contexte de 2017 sont consultables dans `dist/buirette-references.html`.

## Construction et contrôles

```sh
npm run buirette:build
npm run buirette:install
npm run check:buirette
npm run check:facades
npm run check:roofs
npm run check:walk
```

`build-buirette.mjs` produit le maillage, les observations par bâtiment, les
ouvertures et les références. Il réutilise les neuf matériaux d’Attila.
`install-buirette-data.mjs` retire uniquement les huit emprises remplacées des
façades/toits génériques et ajoute neuf cellules FPS de 20 m. Il conserve les
autres triangles, paquets et indices de matériaux. Une reconstruction complète
avec `walk:build` inclut également Buirette.

Le contrôle Buirette compare exactement les triangles carte/FPS, les emprises
des toits, les références, les matériaux existants et les collisions dans la rue.
Les preuves et captures sont dans `artifacts/buirette/`.

## Chargement des modèles en mode carte

`dist/data/custom-models.json` est le registre des ensembles détaillés.
La géométrie et les textures ne sont demandées qu’à **moins de 500 m** du modèle,
mesurés horizontalement entre le centre géographique de la carte et le point
le plus proche de son emprise englobante. À 500 m ou plus, requêtes annulées,
géométrie, images et ressources GPU libérées ; réentrée possible.

Cette règle commune couvre Nerval, Attila, Buirette et les futurs ensembles du
même format (`origin`, `bounds`, `vertexCount`, `ranges`, `materials`, `textures`,
`excludeIds`, `mesh.bin`). Après ajout d’un ensemble :

```sh
npm run custom-models:build
```

Le registre est aussi actualisé par les commandes de construction des trois
ensembles. Aucun changement du rayon ou de la politique de chargement FPS.

## Publication ciblée

```sh
npm run buirette:prepare-publication
npm run buirette:publish
npm run buirette:verify-publication
```

La préparation lit la version **publique** dans `C:/nginx/html/chalons`, vérifie
les empreintes des modules de départ et construit une superposition limitée.
Elle ne copie pas les données locales de Nerval, différentes de la version
publique. Les fichiers remplacés et leurs versions gzip sont sauvegardés dans
`artifacts/buirette-17-19/publication/backup`. Le manifeste contient leurs empreintes.
Le script refuse une modification publique concurrente avant publication.

Entrées : `/#buirette`, `/#buirette-17-19`, bouton « Jouer ici » dans la rue et page des clichés.
La vérification HTTPS compare les empreintes de tous les fichiers publiés.

Contrôle préexistant en échec, sans modification de Nerval :
`check-nerval-impasse-fixes.mjs`, haie sur le trottoir à
`[-106.51614250975764, -117.30551716385595]`. Les index et maillages Nerval locaux
et publics restent chacun identiques à leur état initial.

Ajout 17–19 : `buirette-odd-geometry.mjs` conserve les anciens triangles Buirette. Les portes et baies sont découpées, les plaques et persiennes sont géométriques. Les deux seuils utilisent un volume unique ; `check-buirette-17-19.mjs` vérifie la montée, la stabilité à l’arrêt, le blocage par la porte fermée et le retour au trottoir. Les deux fenêtres latérales du 19 sont estimées d’après la vue oblique de 2017, explicitement signalée dans la galerie.

## Maison 15 et correction du seuil du 17

`buirette-15-geometry.mjs` ajoute le 15 sur `way/156701424`, à gauche du 17 existant. Les références fournies sont dans `references_buirette_15/`. Le modèle comprend le pignon, cinq ouvertures découpées dont la baie octogonale, les parements de pierre et de brique, la frise de neuf céramiques, le portail et le jardin. Les dimensions et les faces cachées restent estimées. Accès direct : `#buirette-15`.

Le seuil du 17 était recouvert par le bas de la baie et une extrémité de menuiserie. Ces surfaces coïncidentes ont été supprimées ou encastrées sous le seuil ; la poignée a été redressée avec sa platine. `check-buirette-15-fixes.mjs` reproduit 0,253 m² de recouvrement sur la sauvegarde, exige zéro recouvrement après correction, simule le seuil avec les paquets FPS et le trottoir réels, et compare les emprises et les triangles hors du 17. Sauvegardes, captures et publication ciblée : `artifacts/buirette-15-fixes/`.

## Exclusion des bâtiments génériques en FPS

Le registre des modèles détaillés est relu sans cache au démarrage FPS. `walk-replacements.js` filtre aussi les emprises remplacées si la liste FPS est plus ancienne. L’installation Buirette remplace les anciens paquets génériques par des paquets vides valides, indiqués dans `walk.retiredNodes` et inclus dans la publication. Cela retire les anciens murs et leurs collisions sans faire boucler les clients anciens sur une erreur 404. Une scène déjà chargée avant la publication doit être rechargée.

`check-walk-replacements.mjs` contrôle les exclusions et les paquets retirés. `artifacts/buirette-overlap-fix/browser-check.mjs` réinjecte la liste antérieure au 15, teste le nouveau chargeur puis l’ancien chargeur, et vérifie que le bâtiment générique n’est plus rendu.
