Les réglages FPS se trouvent uniquement dans `fps-config.json`, à la racine du projet.

Les limites de chargement sont indépendantes : `chargementsGeometrieSimultanes` (8 au départ) et `chargementsTexturesSimultanes` (6 au départ). Elles fixent le nombre de fichiers traités en même temps dans chaque file d'attente, pas le nombre de bâtiments affichés. Dès qu'un fichier termine, le suivant démarre. Les deux clés sont obligatoires et acceptent des entiers supérieurs ou égaux à 1, sans valeur de remplacement dans le chargeur. Aucun rapport entre ces nombres n'est imposé. Recharger la page après modification.

`node scripts/check-walk-concurrency.mjs` modifie ces valeurs dans des JSON isolés et vérifie les limites effectives des deux files, leur reprise après une fin de chargement et leur vidage complet.

Les distances FPS sont indépendantes et exprimées en mètres :

| Clé | Valeur initiale | Effet |
| --- | --- | --- |
| `rayonChargementBatimentsMetres` | 600 | Chargement, affichage et retrait des bâtiments et modèles de rues détaillées. |
| `rayonChargementSolMetres` | 600 | Chargement des photos aériennes et couverture des tuiles de sol. |
| `rayonChargementRoutesMetres` | 600 | Chargement, affichage et retrait des routes de la ville (`roads/`). |
| `debutBrouillardMetres` | 450 | Distance où le brouillard commence. |
| `finBrouillardMetres` | 600 | Distance où le brouillard devient opaque. Doit dépasser son début. |

Modifier un rayon ne change aucun des autres réglages. Le plan lointain de la caméra couvre automatiquement le plus grand rayon ; le brouillard reste aux distances saisies. Les rayons acceptent `0` pour désactiver une catégorie. Un bâtiment, un morceau de route ou une photo est chargé quand toute son emprise tient dans son rayon. Les tuiles en bordure gardent une couleur de sol sans demander une photo hors rayon. Les chemins intégrés aux modèles de rues détaillées restent avec ces modèles. Les anciennes configurations sans ces cinq clés gardent les valeurs initiales ci-dessus pour compatibilité.

`node scripts/check-walk-radii.mjs` vérifie trois rayons différents dans chaque ordre, leur retrait en se déplaçant, le chargement des photos, la caméra, le rendu et le brouillard indépendant, sans modifier le JSON de l'utilisateur.

`multiplicateurHauteurSautSpeed` multiplie la **hauteur** du saut quand Ctrl ou Flash est actif. La valeur `3` donne un saut trois fois plus haut ; `1` conserve la hauteur normale ; `0` supprime l'impulsion de saut dans ce mode. Le saut normal et la gravité restent indépendants de ce coefficient. La physique applique la racine carrée du coefficient à la vitesse initiale du saut.

Le serveur de développement et la route Nginx `/chalons/fps-config.json` lisent directement le fichier à la racine avec `Cache-Control: no-store`. Il n'y a pas de copie générée à maintenir dans `dist`. Lors d'un déploiement sur un autre hébergement, servir ce même fichier à côté de `walk-config.js`. Recharger la page après une modification : chaque nouveau chargement relit et valide le JSON.

Validation : `node scripts/check-fps-config.mjs` vérifie des coefficients 4, 1 et 0, les commandes Ctrl/Flash, et le rechargement du JSON même si une ancienne copie existe dans `dist`. `node scripts/check-walk-jump.mjs` contrôle les trajectoires et les collisions avec la configuration courante.

Le bloc `highwind` contrôle le modèle importé dans la promenade FPS :

```json
"highwind": {
  "present": true,
  "longueurMetres": 237,
  "position": { "x": 20, "y": 60, "z": 140 },
  "angleDegres": 135,
  "vitesseMaxKmh": 400
}
```

- `present` : autorise le vaisseau, mais le paramètre **`ff7` doit aussi être présent dans l'URL** (`?ff7` ou `?fps=1&ff7`). Sans ce paramètre, ou avec `present:false`, aucun modèle ni musique du Hautvent n'est chargé.
- `longueurMetres` : distance de la proue à la poupe. La largeur et la hauteur suivent la même échelle ; à 237 m, elles valent environ 117,40 m et 65,31 m.
- `position.x`, `position.y`, `position.z` : coordonnées initiales exactes du centre du modèle, en mètres dans le repère FPS. `z` est la hauteur du centre, sans correction automatique pour la coque. Le joueur peut commencer ailleurs : cela ne déplace pas le vaisseau.
- `angleDegres` : cap initial du vaisseau en degrés, dans le même repère que l’angle FPS (0° vers le nord, 90° vers l’est). Le cap du joueur ne le remplace pas.
- `vitesseMaxKmh` : plafond de vitesse du pilotage, toutes directions combinées (400 km/h). Les diagonales ne dépassent pas ce plafond.
- Les anciens `hauteurApparitionMetres` et `distanceDerriereJoueurMetres` restent acceptés pour compatibilité mais n’ont plus d’effet. Le pilotage modifie ensuite la position et le cap en mémoire ; il ne réécrit pas le JSON. Recharger la page restaure la position et l’angle du fichier.

Ces valeurs sont appliquées à chaque chargement de page, sans reconstruire le modèle. Le Highwind utilise les textures de l'archive fournie dans `tmp`. Il est chargé à proximité, puis libéré au-delà de 500 m de son emprise. Ses fichiers ne modifient pas les données des rues ou des maisons.

Import reproductible : `scripts/import-highwind.py` produit `dist/data/highwind` à partir de l'archive Collada. `node scripts/check-highwind.mjs` vérifie l'échelle, les rotations, la désactivation, le chargement à proximité et la libération des ressources.

Au contact de la coque (2,2 m), `E` ou le bouton mobile **Entrer** embarque. La caméra suit derrière le vaisseau. ZQSD/WASD déplacent, les flèches gauche/droite tournent, Espace monte et Ctrl descend. Sur mobile : joystick gauche pour avancer/reculer et se déplacer latéralement, droit pour tourner et monter/descendre. Les axes se combinent. L'inclinaison atteint ±10° en montée/descente puis revient à plat.

Un second `E` ou **Sortir** lance une descente automatique à 45 m/s, arrêtée par le sol ou les obstacles chargés. La sortie cherche un emplacement libre à côté du vaisseau. Si le terrain manque, le vol attend son chargement. Les collisions du vaisseau utilisent une enveloppe de coque échantillonnée ; celles du joueur restent inchangées.

Les deux hélices tournent autour de leurs pivots Collada. Le fichier fourni `assets/highwind-takes-to-the-skies.mid` est copié dans les ressources du modèle et joué en boucle par un synthétiseur Web Audio à l'embarquement. La partition est conservée ; le timbre provient du synthétiseur du jeu. Pause suspend la musique et le vol ; sortie arrête la musique. `node scripts/check-highwind-flight.mjs` couvre les pivots, le contact, l'apparition, les axes simultanés, la vitesse, l'inclinaison, la descente sur un toit et le cycle de vie audio.
