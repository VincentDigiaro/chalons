# Châlons en 3D

Atlas web de Châlons-en-Champagne et de ses alentours proches, construit avec les données réelles d’OpenStreetMap et MapLibre GL JS. Les photographies aériennes IGN habillent le sol et les toitures. Compatible avec les navigateurs récents disposant de WebGL 2, avec commandes souris, clavier et tactiles.

## Utilisation locale

L’application et ses données sont livrées dans `dist/`. Node.js 22 ou ultérieur suffit pour lancer le serveur ; aucune installation de dépendances n’est nécessaire pour consulter l’extrait fourni.

```sh
npm run dev
```

Ouvrir http://localhost:5173. Pour un téléphone sur le même réseau local, utiliser l’adresse IP du PC et le port 5173, si le pare-feu l’autorise. Un hébergement HTTPS statique est préférable pour la consultation à distance. L’ouverture directe de `index.html` par `file://` ne fonctionne pas, car le navigateur doit charger les données et les workers.

## Périmètre et sources

- Rectangle couvert : longitude 4.26–4.46 ; latitude 48.89–49.035, environ 15 × 16 km.
- Empreintes des bâtiments, parties de bâtiments, routes, voies ferrées, surfaces d’eau, cours d’eau, occupations du sol et lieux : OpenStreetMap.
- Extraction datée et requête reproductible : `dist/data/manifest.json`.
- Données redistribuées sous ODbL 1.0, © les contributeurs OpenStreetMap. Les GeoJSON dérivés sont directement accessibles dans `dist/data/`.
- MapLibre GL JS 5.6.0 : BSD 3-Clause, licence dans `dist/vendor/`.
- Glyphes Noto Sans : SIL Open Font License, licence dans `dist/fonts/`.

Aucune clé API n’est requise. Les données OSM, le moteur, les glyphes et la géométrie des toitures sont servis par l’application ; les visiteurs ne sollicitent pas Overpass. Les photos sont chargées à la demande depuis `data.geopf.fr`, le service officiel utilisé par cartes.gouv.fr. Une connexion internet est nécessaire pour les photos. Désactiver « Photographies IGN » restitue le rendu cartographique local. Il ne s’agit pas d’une application avec cache hors connexion garanti.

## Textures IGN

- Couche `ORTHOIMAGERY.ORTHOPHOTOS`, WMTS `PM_0_19`, EPSG:3857, JPEG 256 × 256. Source, licence et lien vers les dates de prises de vue dans `dist/data/imagery.json`.
- © IGN, BD ORTHO, Licence Ouverte 2.0. Attribution visible sur la carte et dans l’aide. Le millésime varie selon le secteur et ne correspond pas à la date de consultation.
- Les toitures OSM sont triangulées avec conservation des cours intérieures, découpées aux limites des tuiles et stockées en coordonnées locales pour limiter les erreurs numériques.
- Une couche WebGL partage la caméra et le tampon de profondeur des bâtiments. Les photos sont projetées géographiquement sur leurs toits plats, avec un détail progressif jusqu’au niveau IGN 19.
- Les murs OSM auparavant unis reçoivent un catalogue de façades originales inspirées des vues de quartier fournies (voir ci-dessous). Les ombres, les déformations des bâtiments hauts et les différences de dates OSM/IGN peuvent créer des décalages.
- Cache graphique plafonné à 128 images sur mobile et 320 sur ordinateur ; quatre téléchargements de toitures simultanés, au plus dix démarrages par seconde. Les textures les plus proches sont prioritaires ; les volumes restent présents pendant le chargement. Les requêtes du fond raster sont gérées séparément par MapLibre.

## Hauteurs et limites

Priorité : `height`/`building:height`, puis `building:levels × 3 m + roof:height`, puis hauteur indicative par type. La fiche de chaque bâtiment affiche la méthode. Les mètres et les pieds explicites sont reconnus. Une valeur manifestement incohérente est corrigée et signalée. `min_height` et `building:min_level` sont pris en compte. Les contours et parties peuvent se superposer : les parties plus hautes émergent du volume principal.

Hors de la maquette dédiée de Nerval, le rendu est une extrusion simplifiée sur sol plat avec photographies du sol et des toitures et façades de catalogue approximatives : pas de relief mesuré, de façades photographiques à l’adresse exacte, de toits géométriques détaillés ou de garantie de précision architecturale. La géométrie OSM peut être incomplète ; les éléments incomplets signalés par le convertisseur sont écartés et comptés. La date est celle de l’extrait, pas une mise à jour en temps réel.

## Actualiser les données

```sh
npm ci
npm run data:refresh
node scripts/fetch-fonts.mjs
npm run roofs:build
node scripts/record-imagery.mjs
npm run check
```

Le script réutilise `.cache/osm.json` pour ne pas répéter les requêtes. Pour un nouvel extrait, renommer ce fichier avant la commande. L’extraction utilise une seule requête bornée, avec un deuxième serveur en cas d’échec. Les fichiers de `dist/` sont prêts à être servis et doivent être redéployés après une actualisation.

## Validation

`npm run check` vérifie la syntaxe JavaScript, les ressources locales, les glyphes, les identifiants, la fermeture des polygones, les hauteurs, la présence de bâtiments au centre de Châlons, les coordonnées UV des toitures, la conservation de leur surface (trous déduits) et les paramètres IGN. La vérification visuelle et tactile reste nécessaire sur les appareils cibles, dont les capacités graphiques varient.

Si disponible dans le navigateur, WebMCP expose la lecture de la vue et la navigation entre les destinations. Son absence ne change pas les commandes de l’application.

## Catalogue de façades approximatives

`facade-catalogue.html` présente les 16 textures et les observations sur les dix secteurs des 30 captures du ZIP fourni. Le catalogue contient des enduits de pavillons, pierre et brique du centre ancien, immeubles collectifs, équipements, bardage, garage et murs sans ouverture. Les textures sont des créations originales avec l’outil intégré ImageGen, inspirées des familles observées ; aucun pixel aérien Google n’est projeté sur ces façades.

`scripts/facade-catalogue.json` décrit les familles, modules et pondérations géographiques. `scripts/build-facades.mjs` classe les bâtiments selon le secteur, l’usage OSM, l’emprise et la hauteur, puis affecte chaque segment de façade. Le choix est déterministe. Les secteurs lointains sont explicitement notés comme extrapolés dans `dist/data/facades/assignments.json`. L’attribution reste volontairement indicative, sans relevé par adresse.

La couche est strictement constituée de murs. Elle n’écrit ni les toits ni leurs textures ni les fichiers du modèle Nerval. Les identifiants Nerval, son emprise augmentée de 15 m et les propriétés explicites de texture sont exclus. La première passe habille 33 602 bâtiments et 217 445 faces ; 263 bâtiments sont protégés autour de Nerval et 56 objets sans mur approprié sont exclus.

Les versions 128 × 64 sont chargées au départ (environ 12 Ko pour les 16). À partir du zoom 17, les versions 512 × 256 sont chargées progressivement (environ 321 Ko). Les mipmaps et le filtrage anisotrope choisissent les niveaux intermédiaires à distance. Les 419 cellules géographiques sont chargées à la demande, quatre requêtes simultanées ; 64 cellules visibles sur mobile, 144 sur ordinateur. Les instances de murs occupent 11,3 Mo au total avant compression, avec cache borné. Aucune nouvelle dépendance n’est nécessaire.

```sh
npm run facades:build
npm run check:facades
```

Après une mise à jour des emprises OSM ou de l’emprise protégée Nerval, relancer ces deux commandes. Les WebP livrés sont déjà prêts à servir ; `scripts/prepare-facade-textures.py` permet de les reconstruire depuis les PNG originaux avec Pillow. La provenance est dans `dist/data/facades/texture-provenance.json`. Les observations, affectations, surfaces protégées, dimensions, hauteurs, portes de garage et absence de modification des toits sont vérifiées par le contrôle dédié. `read_facade_state` expose le chargement et les compteurs via WebMCP.
