# Châlons en 3D

Atlas web de Châlons-en-Champagne et de ses alentours proches, construit avec les données réelles d’OpenStreetMap et MapLibre GL JS. Compatible avec les navigateurs récents disposant de WebGL, avec commandes souris, clavier et tactiles.

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

Aucune clé API n’est requise. Les données, le moteur et les glyphes sont servis par l’application ; les visiteurs ne sollicitent pas Overpass ni un fournisseur de tuiles. Le téléchargement initial reste nécessaire. Il ne s’agit pas d’une application avec cache hors connexion garanti.

## Hauteurs et limites

Priorité : `height`/`building:height`, puis `building:levels × 3 m + roof:height`, puis hauteur indicative par type. La fiche de chaque bâtiment affiche la méthode. Les mètres et les pieds explicites sont reconnus. Une valeur manifestement incohérente est corrigée et signalée. `min_height` et `building:min_level` sont pris en compte. Les contours et parties peuvent se superposer : les parties plus hautes émergent du volume principal.

Le rendu est une extrusion simplifiée sur sol plat : pas de relief mesuré, de textures photographiques, de toits géométriques détaillés ou de garantie de précision architecturale. La géométrie OSM peut être incomplète ; les éléments incomplets signalés par le convertisseur sont écartés et comptés. La date est celle de l’extrait, pas une mise à jour en temps réel.

## Actualiser les données

```sh
npm ci
npm run data:refresh
node scripts/fetch-fonts.mjs
npm run check
```

Le script réutilise `.cache/osm.json` pour ne pas répéter les requêtes. Pour un nouvel extrait, renommer ce fichier avant la commande. L’extraction utilise une seule requête bornée, avec un deuxième serveur en cas d’échec. Les fichiers de `dist/` sont prêts à être servis et doivent être redéployés après une actualisation.

## Validation

`npm run check` vérifie la syntaxe JavaScript, les ressources locales, les glyphes, les identifiants, la fermeture des polygones, les hauteurs et la présence de bâtiments au centre de Châlons. La vérification visuelle et tactile reste nécessaire sur les appareils cibles, dont les capacités graphiques varient.

Si disponible dans le navigateur, WebMCP expose la lecture de la vue et la navigation entre les destinations. Son absence ne change pas les commandes de l’application.
