# Réseau routier généré

`npm run roads:build` transforme l’extraction OSM déjà stockée dans `.cache/osm.json` en secteurs de 128 m. Python 3.12 et les dépendances de `scripts/roads-requirements.txt` sont nécessaires. `ROADS_PYTHON` permet de choisir l’interpréteur. Le cache facultatif `.cache/python-roads` est reconnu.

Le résultat se trouve dans `dist/data/city-roads`. Le même maillage est repris dans `dist/data/walk/roads` sans déplacer les bâtiments ni changer leurs matériaux. `npm run walk:build` conserve cette intégration lors des prochaines reconstructions. Après une modification des sols détaillés de Nerval ou d’Attila, reconstruire les routes pour actualiser leur masque de protection.

Les chaussées sont réunies avant de créer les trottoirs et bordures : les carrefours ne portent pas de bordures intérieures. Les jardins et sols déjà détaillés, les bâtiments au sol et les plans d’eau sont exclus. Les contours de giratoires conservent leur îlot. Les passages piétons proviennent uniquement des chemins de traversée identifiés dans les données.

La largeur vient du champ OSM `width`, sinon du nombre de voies, sinon d’une valeur indicative par catégorie. Les trottoirs explicites sont respectés ; faute d’information, les rues urbaines reçoivent un trottoir indicatif de 1,35 m. Les ponts ont une hauteur indicative de 4,5 m par niveau et des approches reliées par le graphe routier. Il ne s’agit pas d’un relevé topographique : le terrain général reste plat et les voies souterraines ne sont pas peintes en surface.

La vue éloignée emploie un aperçu simplifié. À proximité, la carte charge au plus 384 secteurs ; la promenade ne charge que les secteurs compris dans son rayon de 500 m. Les fichiers portent une empreinte de leur contenu pour les actualisations.

En mode FPS, la projection utilise des coordonnées horizontales relatives au joueur pour conserver sa précision loin du centre de la ville. La photo du sol reçoit seule un biais de profondeur `polygonOffset(1, 4)`, désactivé avant de dessiner les maillages. Les routes restent ainsi séparées de la photo à haute altitude, sans seuil de hauteur, déplacement de géométrie ni modification des collisions. Les bâtiments et le Highwind gardent leur occlusion normale. Le test `node artifacts/road-depth-20260914/check-render.mjs` compare le rendu WebGL à la version précédente sur 105 vues, entre 1,4 et 3 000 m, puis capture la scène réelle à 80 et 200 m.

Validation : `npm run check:roads`, `npm run check:walk`, puis `python scripts/check-city-roads-geometry.py`. Les résultats sont consignés dans `artifacts/city-roads`. Sources et hypothèses sont aussi stockées dans l’index du réseau, et chaque voie est répertoriée dans `coverage.json`.

Les données dérivées restent attribuées à © OpenStreetMap contributors (ODbL 1.0), conformément à l’attribution déjà présente dans la carte.
