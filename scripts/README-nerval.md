# Rue Gérard-de-Nerval — méthode et reproduction

Le modèle restitue des éléments visibles dans les 27 captures fournies et leur vue aérienne. Ce n’est ni un relevé cadastral, ni une reconstruction photogrammétrique calibrée. Les emprises horizontales proviennent de l’extrait OSM du projet. Hauteurs, pentes, lucarnes, cheminées, plantations, clôtures et mobilier sont des estimations visuelles. Les panoramas de 2014 et 2022 ne constituent pas un état temporel unique.

Les repères numériques de `nerval-survey.py` sont des identifiants internes d’emprises, pas des numéros de rue. Les descriptions et correspondances restent indicatives. Seuls les numéros effectivement lisibles dans les captures sont présentés comme visibles. Les coordonnées des panoramas ne sont pas utilisées comme positions des maisons.

## Entrées

- Originaux en lecture seule : `C:/Users/cid77/Documents/ChatGPT/map2/captures-rue-gerard-de-nerval`.
- `dist/data/buildings.geojson` et `dist/data/lines.geojson` : extrait OSM existant.
- `nerval-survey.py` : observations, correspondances, quadrilatères et masques manuels.
- `nerval-footprints.json` : inventaire des emprises sélectionnées.

## Construction

1. `python scripts/inspect-nerval.py` produit l’inventaire et le plan de contrôle dans `artifacts/nerval`.
2. `node scripts/fetch-nerval-imagery.mjs` met en cache les 42 tuiles IGN z19 couvrant la rue. Aucun téléchargement en masse du territoire.
3. `python scripts/prepare-nerval.py` redresse les plans visibles par homographie, masque les obstacles annotés, rassemble les textures dans des atlas et conserve des références réduites avec leurs crédits. Dépendances : NumPy et Pillow. Les captures originales ne sont pas retouchées.
4. `node scripts/build-nerval.mjs` génère le maillage en coordonnées locales est/nord/haut, les formes de toit découpées aux emprises OSM, les textures et les données de sélection.
5. `node scripts/build-roofs.mjs` retire ces 90 volumes du maillage général de toitures, pour éviter deux surfaces superposées.
6. `node scripts/check-nerval.mjs` puis `npm run check` contrôlent les données et la conservation des emprises.

Le modèle détaillé charge deux atlas de façades/toits et une mosaïque IGN ; il ne lance aucun service de photogrammétrie à chaque visite. Les références sont chargées seulement à l’ouverture du lecteur. Le maillage utilise 44 octets par sommet, regroupés par matériau. La sélection teste les triangles visibles du bâtiment, sans volume transparent pouvant masquer la scène.

## Limites à préserver

- Pas de prétention à une précision centimétrique ou à des hauteurs mesurées.
- Pas de détail inventé derrière les floutages ni de restauration de visages ou de plaques.
- Les régions masquées montrent la teinte du mur, estimée sur les pixels visibles ; aucun remplissage génératif.
- Les vues aériennes restantes peuvent inclure ombres et décalages de prise de vue.
- Des retraits de façades, murs mitoyens et petites annexes restent simplifiés ; les trottoirs et limites de jardin sont interprétés.
- Les originaux et leurs métadonnées restent dans le dossier fourni. Les SHA-256 dans `survey.json` permettent de les identifier.

Crédits : Google Street View / Google Maps pour les captures fournies (2014/2022) ; IGN BD ORTHO, Licence Ouverte 2.0 ; contributeurs OpenStreetMap, ODbL. La publication conserve l’accès privé du Site existant.

## Vérification de cette version

`npm run check` valide 90 parties de bâtiments, 57 surfaces photographiques et 23 831 triangles. La somme des surfaces de toiture projetées conserve les 4 972,886 m² d’emprises OSM sélectionnées ; ce contrôle garantit la cohérence du maillage avec OSM, pas une précision métrique sur le terrain.

Le rendu a été inspecté dans le navigateur, notamment au carrefour Francis-Jammes et dans l’impasse, en 1280 × 720 et 390 × 844. Le lecteur affiche les références de façade et la vue aérienne, sans débordement horizontal sur mobile. La sélection d’un bâtiment, les modes 2D/3D, les textures et le masquage des volumes ont été vérifiés. La couche détaillée charge ses trois textures locales sans erreur ; les photographies IGN du reste de l’atlas restent tributaires du service distant.
