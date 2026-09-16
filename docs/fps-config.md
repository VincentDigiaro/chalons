Les réglages FPS se trouvent uniquement dans `fps-config.json`, à la racine du projet.

`batimentsParTelechargement` fixe le nombre maximal de fichiers d'immeubles reçus dans une requête (entier de **1 à 256**, valeur initiale **1**). À `1`, le moteur demande exactement les fichiers individuels existants, sans charger de manifeste de regroupement. À `40`, il reçoit jusqu'à 40 immeubles voisins déjà demandés par le rayon de chargement. Une fin de groupe ou une zone incomplète peut en contenir moins. Les routes et modèles détaillés conservent leurs fichiers individuels. Recharger la page après une modification.

Les archives statiques de `dist/data/walk-downloads/` contiennent les fichiers d'origine, compressés individuellement sans perte. `npm run walk:downloads` les régénère après une modification des données d'immeubles. Le nombre configuré peut ensuite changer sans reconstruction. Le serveur local et Nginx servent les portions demandées avec HTTP Range. Un hébergement sans ce support ou des archives absentes/périmées entraînent un retour aux fichiers individuels. Les diagnostics `streaming.downloads` indiquent les requêtes groupées, individuelles et les replis.

Les paquets ne fusionnent pas les maillages. La préparation conserve les mêmes sommets, matériaux, textures et collisions. Les transferts géométriques sont fractionnés également. Le sous-objet `preparation` contrôle le temps consacré à cette file et aux transferts de textures, indépendamment des trois réglages de téléchargement :

```json
"preparation": {
  "budgetParImageMs": 4,
  "budgetInitialParImageMs": 8
}
```

`budgetParImageMs` s'applique pendant le jeu ; `budgetInitialParImageMs` s'applique avant l'entrée dans la scène. Ces valeurs acceptent les nombres positifs, y compris décimaux, et **0 pour supprimer le plafond de temps**. `20` autorise 20 ms, sans réduction automatique à 4 ms ni ajustement caché selon le temps de dessin. `0` traite toute la file déjà prête dans le même passage ; cela peut figer temporairement l'affichage. Une nouvelle arrivée réseau attend toujours le prochain passage de préparation, et un téléchargement ou décompactage encore en cours ne peut pas être terminé par ce réglage.

Les valeurs initiales sont 4 et 8 ms ; un ancien JSON sans ce sous-objet conserve ces valeurs. Recharger la page après une modification. Une opération WebGL ou une pause du navigateur ne peut pas être interrompue : une étape peut dépasser le budget visé. Les objets proches passent en premier et une géométrie partielle n'est jamais affichée. `streaming.preparation.budgetMs` expose le budget réellement appliqué ; `0` signifie sans plafond.

Les autres limites et attentes du chargement FPS sont inventoriées dans [limites-chargement-fps.md](limites-chargement-fps.md). Elles sont distinctes du budget par image.

Le filtrage hors champ affecte uniquement les commandes de dessin. Les objets et textures restent chargés à 360° dans les rayons configurés ; tourner la caméra ne déclenche ni déchargement ni reconstruction. Les boîtes calculées depuis les sommets déplacés par le relief et la véritable caméra du Hautvent sont utilisées pour conserver les objets qui débordent dans l'écran.

Les limites de chargement sont indépendantes : `chargementsGeometrieSimultanes` (8 au départ) et `chargementsTexturesSimultanes` (6 au départ). Elles fixent le nombre de chargements en cours dans chaque file d'attente, pas le nombre de bâtiments affichés. Un chargement géométrique contient un fichier à `batimentsParTelechargement: 1`, ou un groupe lorsque le regroupement est actif. Il garde sa place jusqu'à la fin de sa préparation pour ne pas accumuler des données reçues en attente. Les textures gardent leur place jusqu'au transfert graphique. Dès qu'une place se libère, le chargement suivant démarre. Les deux clés sont obligatoires et acceptent des entiers supérieurs ou égaux à 1, sans valeur de remplacement dans le chargeur. Aucun rapport entre ces nombres n'est imposé. Recharger la page après modification.

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

En vol, maintenir un bouton de souris permet de tourner la caméra autour du Hautvent. Relâcher le bouton droit mémorise l'angle horizontal et vertical comme nouvelle position de suivi, relative au vaisseau. Relâcher le bouton gauche revient doucement à cet angle mémorisé. Le réglage reste pendant le pilotage et les pauses ; remonter aux commandes restaure la caméra initiale. La molette conserve son rôle de zoom.

Un second `E` ou **Sortir** lance une descente automatique à 45 m/s, arrêtée par le sol ou les obstacles chargés. La sortie cherche un emplacement libre à côté du vaisseau. Si le terrain manque, le vol attend son chargement. Les collisions du vaisseau utilisent une enveloppe de coque échantillonnée ; celles du joueur restent inchangées.

Les deux hélices tournent autour de leurs pivots Collada. Le fichier fourni `assets/highwind-takes-to-the-skies.mid` est copié dans les ressources du modèle et joué en boucle par un synthétiseur Web Audio à l'embarquement. La partition est conservée ; le timbre provient du synthétiseur du jeu. Pause suspend la musique et le vol ; sortie arrête la musique. `node scripts/check-highwind-flight.mjs` couvre les pivots, le contact, l'apparition, les axes simultanés, la vitesse, l'inclinaison, la descente sur un toit et le cycle de vie audio.
