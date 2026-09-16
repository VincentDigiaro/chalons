# Relief

Le jeu utilise une extraction locale **IGN RGE ALTI**, échantillonnée à environ
25 mètres sur Châlons et ses environs (4,15–4,57° E, 48,80–49,125° N).
Le relief est activé sur la carte, en promenade et pour le contact du Hautvent
avec le sol. Son échelle verticale est réelle, sans exagération.

`dist/data/terrain/index.json` conserve la provenance, la licence, l’emprise et
la date d’acquisition. `elevations.bin` contient les altitudes en centimètres
sur une grille de 1 229 × 1 448 points, soit environ 3,4 Mio sans compression.
Les valeurs suivent les centres des pixels du GeoTIFF IGN, du nord vers le sud.
Le moteur soustrait l’altitude de référence du départ (84,05 m) pour conserver
le repère local du jeu. Les coordonnées horizontales et les hauteurs de
bâtiments du dépôt restent inchangées.

`dist/terrain.js` fournit la même interpolation au rendu et aux collisions à pied.
Les photographies recouvrent des tuiles subdivisées, les routes sont découpées
en triangles d’au plus 8 m avant déplacement, et les maillages sont ajustés
en mémoire. Les normales suivent les pentes. Les textures, les fichiers de
modèles et les générateurs existants sont conservés. Les façades et les toits
suivent localement le terrain ; ce n’est pas une reconstruction topographique
précise de chaque fondation. Les petits détails sous la résolution de la grille
restent ceux des maquettes existantes.

La carte fabrique ses tuiles DEM à partir de cette même grille locale. Aucun
appel à un service d’altitude distant n’est nécessaire pendant une partie.
La promenade attend le relief avant de placer le joueur et le Hautvent.
La marche suit les pentes et les sauts retombent sur leur altitude locale.
Le Hautvent utilise une altitude moyenne lissée, tout en conservant sa règle
de traversée des bâtiments.
Au-delà de l’extraction, l’altitude du bord est prolongée sans falaise artificielle.

## Collisions et performances

À pied, `walk-collision-index.js` indexe les objets chargés dans une grille
spatiale. Les tests précis portent sur une zone de **75 cm autour du trajet
prévu pendant l’image**, incluant la position de départ et d’arrivée. Le mode
Flash étend donc la recherche dans le sens du mouvement ; les petits pas de
simulation continuent d’empêcher le passage à travers un mur. Les sols, les
clôtures et les plafonds proches conservent leurs triangles précis. Les index
des triangles sont créés à la première visite et libérés avec les objets.
La vérification des fichiers encore en chargement utilise aussi l’index, avec
une marge de 12 m. Les effets de particules gardent leur portée propre de 3 m.

En vol, chaque cellule IGN d’environ 25 m possède une altitude moyenne, obtenue
par la moyenne de ses quatre coins. Ces valeurs sont calculées une seule fois,
puis interpolées entre les centres des cellules pour éviter les marches aux
frontières. Le cache ajoute environ 6,8 Mio de mémoire quand le Hautvent est
activé. La coque utilise au maximum 32 points d’appui (22 sur le modèle actuel),
répartis selon sa longueur et sa largeur. Il n’y a plus de parcours des triangles
de la coque à chaque test de sol. Des bosses peuvent pénétrer légèrement le
vaisseau : c’est le compromis choisi pour la fluidité. La marche sur les ponts
conserve la géométrie précise, filtrée autour du joueur.

La lecture `read_walk_state` expose `streaming.collisions` : marge locale,
déplacement prévu, nombre d’objets proches, segments et surfaces retenus.
`npm run check:collision-performance` vérifie la sélection locale sans parcours
des objets lointains, la collision Flash avec un mur à 4 m, les cellules moyennes
et leurs raccords, l’absence de lecture du maillage en vol et le redécollage.

Pour régénérer les données (Python avec Pillow et NumPy) :

```sh
python scripts/build-terrain.py
# ou réutiliser l’extraction IGN déjà téléchargée :
python scripts/build-terrain.py artifacts/terrain-ign.tif
```

Vérification : `npm run check:collision-performance`, `npm run check:terrain`, `npm run check:walk` et
`npm run check:highwind-inertia`.
