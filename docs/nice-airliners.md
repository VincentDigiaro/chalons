# Avions sur la texture de l’aéroport de Nice

95 avions statiques reprennent les positions, les orientations et les longueurs des silhouettes visibles sur les tuiles IGN déjà utilisées par le jeu. Cela comprend les terminaux, les parkings éloignés, l’aire d’affaires et les deux avions sur les voies de circulation au sud. Les emplacements vides restent vides.

Un même modèle original blanc et bleu est redimensionné : fuselage arrondi, cockpit, 62 hublots, portes, ailes en flèche, winglets, deux réacteurs creux avec aubes, empennage et train d’atterrissage. Les modèles d’avions et livrées réels ne sont pas identifiés ni reproduits ; les longueurs sont des estimations tirées de l’image. Le maillage de référence fait 37,6 m de long, 35,8 m d’envergure et 5 776 triangles. Le motif blanc est découpé dans les faces de la dérive, sans surface superposée susceptible de clignoter à distance ; `node scripts/check-airliner-tail.mjs` vérifie cette absence de chevauchement et la conservation du reste du modèle.

## Sources modifiables

- `artifacts/nice-airliners/Avion-de-ligne.blend` : modèle Blender, +Y vers le nez et roues au niveau Z=0.
- `scripts/build-airliner.py` : construction, export du maillage commun et rendu de présentation.
- `scripts/nice-airliner-observations.json` : relevé manuel du nez et de la queue dans les extraits de la texture.
- `scripts/survey-nice-airliners.py` : assemblage des tuiles locales pour inspection, sans modifier les originaux.
- `scripts/compile-nice-airliner-survey.py` : conversion des pixels en coordonnées, cap et longueur ; extraits annotés `*-survey.jpg`.
- `scripts/build-nice-airliners.mjs` : intégration dans les données de Nice et fusion du registre existant.

Exécuter le script de modèle avec Blender en mode `--background --python-exit-code 1 --python scripts/build-airliner.py`. Pour reconstruire les placements, lancer les deux scripts Python de relevé, puis `node scripts/build-nice-airliners.mjs`. Le relevé géographique final se trouve dans `artifacts/nice-airliners/placements.json`.

## Intégration

Quatre ensembles `airport-airliners-*` sont chargés par le moteur existant en carte 3D, et 147 paquets permettent le chargement progressif et les collisions en FPS. Chaque ensemble utilise une seule passe de rendu et aucune nouvelle texture. Les avions sont alignés sur le plan de sol passant par leurs trois trains ; la compensation du drapage conserve le fuselage droit. Les modèles des terminaux, les matériaux, la configuration FPS et les archives de ville restent inchangés. Reconstruire les terminaux avec `build-nice-airport.mjs` conserve les avions.

Accès direct : `?ville=nice#airport-airliners-terminal2`, `#airport-airliners-terminal1`, `#airport-airliners-affaires-nord`, `#airport-airliners-affaires-sud`.

Validation : `node scripts/check-nice-airliners.mjs` et `node scripts/check-nice-airport.mjs`. Les vérifications couvrent le nez et la queue par rapport au relevé, les trois points d’appui du train, les géométries carte/FPS, les collisions et la conservation du registre existant. Résultats dans `artifacts/nice-airliners/validation.json`.
