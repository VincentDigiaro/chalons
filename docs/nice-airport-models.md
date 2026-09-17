# Nice : aéroport et îlot du Sheraton

Les modèles sont intégrés au jeu local dans les deux modes, carte 3D et promenade/FPS. Ils utilisent le même moteur, le même terrain et les mêmes collisions que la ville existante.

## Accès

Les nouvelles parties à Nice commencent sur la piste de l’aéroport, vers le nord-est (45°), à pied comme à bord du Hautvent : `?ville=nice&fps=1` ou `?ff7&ville=nice&fps=1`. La hauteur du vaisseau reste celle de `fps-config.json`. Le retour de la carte conserve la position de la partie en cours ; les liens de placement à pied explicites restent prioritaires.

Avec `npm run dev` :

- Sheraton et Air Promenade : http://localhost:5173/?ville=nice#nice-sheraton
- Terminal 1 et vigie : http://localhost:5173/?ville=nice#nice-terminal1
- Terminal 2 : http://localhost:5173/?ville=nice#nice-terminal2
- Tour radar : http://localhost:5173/?ville=nice#nice-radar
- Pistes : http://localhost:5173/?ville=nice#nice-pistes
- À pied devant le Sheraton : http://localhost:5173/?ville=nice&fps=1&x=-4645.52&y=-3491.00&angle=0&pitch=15

## Contenu et limites

- Sheraton : corps principal et aile basse, cage d’escalier ovoïde aux bandeaux blancs et à coiffe basse ajourée, sept bandeaux en retour, terrasse, piscine, chaises et pergolas. La terrasse basse est aménagée avec six tables rectangulaires et leurs chaises ; ses ventilations ont été retirées. En dessous, le préau sur poteaux reste ouvert et traversable, sans accueil. Les sept bâtiments voisins du relevé ont leurs emprises, hauteurs et façades simplifiées.
- Terminal 1 : volumes décomposés, toiture nervurée, cours, passerelles et annexes. Vigie avec fût, cabine élargie, toiture et antennes.
- Terminal 2 : rotunde, verrières, jetées, satellites d’embarquement, passerelles et terminal d’affaires.
- Radar : fût, plateforme 34–36 m, support 36–37 m et antenne simplifiée 37–38 m. L’ancienne enveloppe OSM de 39 m est remplacée par un bâtiment bas et la tour. Hangar à toit bombé et bâtiment de fret.
- Deux pistes, prolongements, voies de circulation, lignes axiales et marquages schématiques, drapés sur le relief.
  Les voies sont fusionnées avec des raccords arrondis. Les pistes restent prioritaires aux croisements : les voies secondaires et leurs lignes jaunes sont découpées sous leur emprise. Les peintures sont intégrées dans le revêtement, sans faces superposées qui clignotent.
- 95 avions placés sur les silhouettes de la texture aérienne : modèle de ligne original, décliné selon la taille et l’orientation relevées. Voir [les sources et réglages des avions](nice-airliners.md).

Il s’agit d’une interprétation extérieure pour le jeu, pas d’une restitution architecturale mesurée. Les dimensions horizontales proviennent du relevé OSM. Les hauteurs non documentées, niveaux, équipements de toiture, vitrages et détails d’antenne sont estimés. Le préau est modélisé ; les autres intérieurs ne le sont pas. Le radar météo historique non localisé avec certitude n’a pas été ajouté.

Les captures Google Earth et la photo fournie servent de références visuelles dans `artifacts/nice-aeroport-releve-3d/`. Aucun maillage ni texture Google Earth n’est incorporé au jeu. Chaque `index.json` contient les sources, les hauteurs retenues et les observations.

## Construction et intégration

`npm run publish:code` publie automatiquement tous les fichiers nouveaux ou modifiés dans `dist`, y compris les modèles détaillés de Nice, leurs textures et paquets FPS, ainsi que les autres données de ville. Les fichiers identiques sont conservés ; chaque remplacement est sauvegardé et vérifié en HTTP normal et gzip. Le registre est activé après le code et les maillages. Voir [la procédure de publication](publication.md).

Pour préparer le dossier sans modifier le site : `npm run publish:code -- --prepare-only`. Pour limiter explicitement l’opération au code : `npm run publish:code -- --code-only`.

`npm run nice:airport` reconstruit les cinq ensembles dans `dist/data/cities/nice/nice-*/`. Le registre `custom-models.json` contient aussi les paquets de promenade et leur table de matériaux. Le moteur ajoute cette table au chargement, sans réécrire l’index de promenade importé ni ses archives de téléchargement.

`node scripts/build-nice-airport.mjs --only-runways` reconstruit uniquement les pistes et voies de circulation, en conservant les bâtiments et avions. Le calcul géométrique utilise Shapely dans `.cache/python-roads` avec le Python fourni par Codex (ou `ROADS_PYTHON`). `scripts/check-airport-pavement.py` vérifie sur les triangles exportés les raccords, l’absence de superpositions et la priorité des pistes. Les résultats sont dans `artifacts/nice-runway-priority/`.

Les 43 emprises remplacées sont exclues des bâtiments génériques. Les façades et toitures génériques sont masquées dans les buffers de rendu, sans modifier les fichiers sources de Nice. Les passages et cours conservent leurs trous OSM. Les triangles sont subdivisés avant leur répartition en petits paquets pour permettre le chargement progressif et les collisions en vue à pied.

Les commandes de vérification sont `npm run nice:airport:check`, `npm run check:cities`, `node scripts/check-walk-preparation.mjs` et `node scripts/check-custom-model-residency.mjs`. Les résultats propres à cette intégration et les captures du jeu se trouvent dans `artifacts/nice-airport-models/`.
