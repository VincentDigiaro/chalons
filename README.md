# Châlons en 3D

Atlas web de Châlons-en-Champagne et de ses alentours proches, construit avec les données réelles d’OpenStreetMap et MapLibre GL JS. Le sol utilise les photographies aériennes IGN et les toitures génériques un catalogue de 32 textures, avec retour aux photos aériennes dans les réglages. Gérard-de-Nerval conserve son modèle détaillé. Compatible avec les navigateurs récents disposant de WebGL 2, avec commandes souris, clavier et tactiles.

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

Aucune clé API n’est requise. Les données OSM, le moteur, les glyphes et les volumes sont servis avec le projet. Pour le sol et les toitures en mode « Photos aériennes », le navigateur demande d’abord la photo directement à l’IGN. Si cette demande échoue, renvoie une image invalide ou dépasse 2,5 secondes, il utilise silencieusement l’original conservé sur notre serveur. Les copies JPEG restent sans expiration dans `dist/data/imagery/ign/`. Quand l’IGN répond normalement, notre serveur n’envoie pas une seconde fois le corps de l’image. Le navigateur peut également utiliser son cache HTTP.

`npm run imagery:cache` prépare la rue Nerval et ses abords jusqu’au zoom 19, les toitures de la ville au zoom 17 et les vues d’ensemble jusqu’au zoom 15. Cette commande réutilise les images existantes ; elle ne les retélécharge pas. La couverture exacte et la liste des fichiers se trouvent dans `dist/data/imagery/saved.json`. Pour une image nouvelle, le navigateur demande discrètement au serveur de conserver un original via une requête HEAD, sans recevoir une seconde image. Les acquisitions sont regroupées et limitées ; le serveur enregistre chaque original avant de le servir et le réutilise ensuite. `node scripts/cache-imagery.mjs --offline` vérifie les copies sans contacter l’IGN ; `IGN_OFFLINE=1` interdit les nouvelles acquisitions côté serveur.

Pour Nginx, copier aussi `dist/data/imagery/` : la couverture préparée fonctionne en hébergement statique. Pour conserver automatiquement les images de nouveaux secteurs, laisser le serveur Node actif et utiliser les routes de `scripts/nginx-imagery.conf`. Ne pas supprimer les originaux lors d’une mise à jour du reste du site.

## Catalogue des toits et retour arrière

`roof-catalogue.html` présente les 32 matériaux. Dans **Réglages → Textures des toits**, choisir **Photos aériennes · ancien rendu** pour revenir immédiatement au précédent habillage après rechargement, sur la carte comme en FPS. Aucun Git ni rebuild requis. Le choix du navigateur est mémorisé ; les liens `?roofs=aerial` et `?roofs=catalogue` le remplacent pour la page ouverte.

Les textures pèsent 1,51 Mo en détail (512 × 512) et 66 Ko pour les vues lointaines (128 × 128). La carte utilise 256 × 256 sur mobile en vue rapprochée et des mipmaps. La répartition approximative couvre 33 822 bâtiments ; les 99 éléments de Gérard-de-Nerval sont exclus. Les façades et les maillages des toits sont conservés. Les emprises qui se chevauchent à la même hauteur partagent leur matériau et leurs UV pour éviter les bandes de superposition.

Construction, réglage du défaut Nginx et sauvegardes : [scripts/README-roofs.md](scripts/README-roofs.md).

## Textures IGN (sol et ancien rendu des toits)

- Couche `ORTHOIMAGERY.ORTHOPHOTOS`, WMTS `PM_0_19`, EPSG:3857, JPEG 256 × 256. Source, licence et lien vers les dates de prises de vue dans `dist/data/imagery.json`.
- © IGN, BD ORTHO, Licence Ouverte 2.0. Attributions regroupées dans Réglages → Crédits et aide, avec les clichés de référence. Aucun bandeau de crédits sur la carte ou en promenade. Le millésime varie selon le secteur et ne correspond pas à la date de consultation.
- Les toitures OSM sont triangulées avec conservation des cours intérieures, découpées aux limites des tuiles et stockées en coordonnées locales pour limiter les erreurs numériques.
- Une couche WebGL partage la caméra et le tampon de profondeur des bâtiments. Les photos sont projetées géographiquement sur leurs toits plats, avec un détail progressif jusqu’au niveau IGN 19.
- Les murs OSM auparavant unis reçoivent un catalogue de façades originales inspirées des vues de quartier fournies (voir ci-dessous). Les ombres, les déformations des bâtiments hauts et les différences de dates OSM/IGN peuvent créer des décalages.
- Cache graphique plafonné à 128 images sur mobile et 320 sur ordinateur ; quatre téléchargements de toitures simultanés, au plus dix démarrages par seconde. Les textures les plus proches sont prioritaires ; les volumes restent présents pendant le chargement. Les requêtes du fond raster sont gérées séparément par MapLibre.

## Hauteurs et limites

Priorité : `height`/`building:height`, puis `building:levels × 3 m + roof:height`, puis hauteur indicative par type. Les mètres et les pieds explicites sont reconnus. Une valeur manifestement incohérente est corrigée et signalée. `min_height` et `building:min_level` sont pris en compte. Les contours et parties peuvent se superposer : les parties plus hautes émergent du volume principal.

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

`facade-catalogue.html` présente les 48 textures et les observations sur les dix secteurs des 30 captures du ZIP fourni. Le catalogue contient des enduits de pavillons, pierre et brique du centre ancien, immeubles collectifs, écoles, bureaux, commerces, ateliers vitrés, églises, garages et murs sans ouverture. Les textures sont des créations originales avec l’outil intégré ImageGen, inspirées des familles observées ; aucun pixel aérien Google n’est projeté sur ces façades.

`scripts/facade-catalogue.json` décrit les familles, modules et observations géographiques. `scripts/facade-policy.mjs` et `scripts/build-facades.mjs` classent les bâtiments selon le secteur, l’usage OSM, l’emprise et la hauteur, puis affectent chaque segment de façade. Les garages sont limités aux murs bas ; les grandes halles et églises disposent de modules avec ouvertures. Le nombre d’étages et la largeur du module s’adaptent aux dimensions du mur. Le choix est déterministe. Les secteurs lointains sont explicitement notés comme extrapolés dans `dist/data/facades/assignments.json`. L’attribution reste volontairement indicative, sans relevé par adresse.

La couche est strictement constituée de murs. Elle n’écrit ni les toits ni leurs textures ni les fichiers du modèle Nerval. Les identifiants du modèle personnalisé et les propriétés explicites de texture sont exclus, sans exclusion géographique des voisins. Elle habille 33 766 bâtiments et 218 391 faces ; les 99 bâtiments personnalisés de Nerval et 56 objets sans mur approprié sont exclus. Les 16 textures originales du premier catalogue sont conservées octet pour octet, avec 32 nouveaux modules ; seules les affectations des façades de catalogue sont recalculées.

Les versions 128 × 64 sont chargées au départ (46 614 octets pour les 48). Les textures détaillées pèsent 1 010 578 octets au total. À partir du zoom 17, les versions 512 × 256 sont chargées ; elles sont décodées à 256 × 128 sur mobile. Les mipmaps et le filtrage anisotrope choisissent les niveaux intermédiaires à distance. Le tableau des 48 textures occupe environ 32 Mio de mémoire GPU en détail sur ordinateur, 8 Mio sur mobile et 2 Mio en aperçu, mipmaps compris. Les 419 cellules géographiques sont chargées à la demande, quatre requêtes simultanées ; 64 cellules visibles sur mobile, 144 sur ordinateur. Les instances de murs occupent 11,3 Mo au total avant compression, avec cache borné. Aucune nouvelle dépendance n’est nécessaire.

```sh
npm run facades:build
npm run check:facades
npm run walk:build
npm run check:walk
```

Après une mise à jour des emprises OSM, du catalogue ou des identifiants personnalisés Nerval, relancer ces commandes pour synchroniser la carte et le mode FPS. Les WebP livrés sont déjà prêts à servir ; leur génération est indépendante de celle des affectations. La provenance est dans `dist/data/facades/texture-provenance.json`, les nouveaux prompts dans `artifacts/facades48/prompts.json`. Les observations, affectations, identifiants protégés, couverture des voisins, dimensions, hauteurs, portes de garage et absence de modification des toits et des anciennes textures sont vérifiées par le contrôle dédié. `read_facade_state` expose le chargement et les compteurs via WebMCP.
#   c h a l o n s  
 #   c h a l o n s  
 