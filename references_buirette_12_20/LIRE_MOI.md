# Rue Buirette de Verrières — références du secteur 12 à 20

Châlons-en-Champagne (51000). Captures réalisées le 14 septembre 2026 dans l’onglet Google Street View déjà ouvert dans Chrome.

## Contenu

13 clichés Street View depuis 6 positions de panorama, et 2 captures de carte. Images PNG de 2560 × 1305 pixels. Ouvrir **index.html** pour la galerie, les coordonnées et les liens permettant de retrouver chaque vue.

Les images 04 à 11, 14 et 15 datent de **juillet 2024**. Les images 01 à 03 datent d’**octobre 2017** et servent de contexte historique. La clôture et la végétation changent entre ces deux campagnes.

## Identification des façades

| Numéro demandé | Références utiles | Identification |
|---|---|---|
| 12 | 09, 10 ; vues voisines 07, 08 | Numéro visible ; façade en pierre et briques, porte en bois |
| 14 | 07, 08, 15 ; vue voisine 06 | Numéro visible ; façade beige, encadrement blanc, garage brun |
| 16 | 05, 06, 11 ; raccord sur 15 | Numéro visible sur 06 et 11 ; façade blanche à bandeaux, avancée et garage |
| 18 | Contexte 04, 14 ; carte 13 | Façade non identifiée avec certitude ; Google signale un repère imprécis |
| 20 | Contexte 01 à 04, 14 ; carte 12 | Façade non identifiée avec certitude ; Google signale un repère imprécis |

Les repères Google des 18 et 20 sont presque superposés au carrefour avec la rue Lamairesse. Les captures de carte conservent l’avertissement de Google. Aucun bâtiment n’est attribué arbitrairement à ces numéros.

## Positions et cadrage

**positions.json** et **positions_cameras.geojson** décrivent les caméras des 13 vues : latitude, longitude, azimut, paramètres URL `y` et `t`, identifiant du panorama, date de l’image et lien exact. Les métadonnées sont également intégrées à chaque PNG dans le champ texte `ReferenceMetadata`.

Les coordonnées sont celles des panoramas, extraites des URL, en WGS84 (latitude/longitude en degrés décimaux). Leur précision réelle n’est pas fournie. En GeoJSON, l’ordre est longitude puis latitude. L’azimut vaut 0° au nord, 90° à l’est, 180° au sud et 270° à l’ouest. Les paramètres `y` et `t` sont conservés tels qu’affichés dans l’URL ; ils ne constituent pas une calibration optique. L’altitude des caméras est inconnue.

**reperes_carte.json** contient séparément les deux repères d’adresse approximatifs. Ils ne sont pas utilisés comme positions de caméra.

Dans les noms de fichiers, `P13`, `P19`, `P20`, etc. désignent l’étiquette affichée par Street View au point de prise de vue, et non nécessairement le numéro de la façade photographiée. Utiliser les légendes pour identifier les bâtiments.

## Pour la modélisation 3D

Commencer avec 10 (12), 15 (14), 11 (16), puis 05, 06, 07 et 08 pour les raccords et les volumes. Les vues 04 et 14 décrivent l’extrémité du secteur, la clôture bleue, le bâtiment bas et le carrefour.

Ces captures sont des références visuelles pour une modélisation manuelle. Elles ne fournissent ni dimensions mesurées ni calibration de photogrammétrie. Des véhicules et la végétation masquent certaines parties basses ; les faces arrière et les pans de toit invisibles ne sont pas documentés. Les vues issues d’un même panorama ont une même origine et ne créent pas de parallaxe supplémentaire. Vérifier l’échelle avec des mesures indépendantes et conserver la distinction entre 2017 et 2024.

Les seules modifications d’image sont le retrait de la barre Chrome et l’enregistrement en PNG. Les mentions Google, les dates et les autres indications de la vue sont conservées. Source : Google Street View / Google Maps ; attributions visibles dans chaque capture.
