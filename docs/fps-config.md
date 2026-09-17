Les réglages FPS se trouvent uniquement dans `fps-config.json`, à la racine du projet.

`batimentsParTelechargement` fixe le nombre maximal de fichiers d'immeubles reçus dans une requête (entier de **1 à 256**, valeur initiale **1**). À `1`, le moteur demande exactement les fichiers individuels existants, sans charger de manifeste de regroupement. À `40`, il reçoit jusqu'à 40 immeubles voisins déjà demandés par le rayon de chargement. Une fin de groupe ou une zone incomplète peut en contenir moins. Les routes et modèles détaillés conservent leurs fichiers individuels. Recharger la page après une modification.

Les archives statiques de `dist/data/walk-downloads/` contiennent les fichiers d'origine, compressés individuellement sans perte. `npm run walk:downloads` les régénère après une modification des données d'immeubles. Le nombre configuré peut ensuite changer sans reconstruction. Le serveur local et Nginx servent les portions demandées avec HTTP Range. Un hébergement sans ce support ou des archives absentes/périmées entraînent un retour aux fichiers individuels. Les diagnostics `streaming.downloads` indiquent les requêtes groupées, individuelles et les replis.

Les paquets ne fusionnent pas les maillages. La préparation conserve les mêmes sommets, matériaux, textures et collisions. Les transferts géométriques sont fractionnés également. Le sous-objet `preparation` contrôle le temps consacré à cette file, aux transferts de textures et à la création des tuiles de sol (maillage, relief et transfert GPU), indépendamment des trois réglages de téléchargement :

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

Son sous-objet `highwind.bombes` contrôle les bombes : `dureeRechargeSecondes` (2,5 s), `tailleMetres` (7 m, longueur totale), `rayonExplosionMetres` (100 m, effets visuels et trace) et `rayonDestructionBatimentsMetres` (100 m, bâtiments et collisions). `rayonCreusementMetres` règle séparément le rayon de la cuvette et de sa terre visible. Les trois rayons sont indépendants ; sans rayon de creusement explicite, il reprend le rayon visuel. Recharge, creusement et destruction acceptent `0` ; taille et rayon visuel sont strictement positifs. Une ancienne configuration sans ce sous-objet conserve les valeurs initiales. Un sous-objet partiel utilise les valeurs initiales pour ses clés absentes ; les clés inconnues et valeurs invalides sont refusées. Voir l'exemple de [REGLAGES-FPS.md](../REGLAGES-FPS.md).

`highwind.bombes.nombreBombes` règle le stock initial : entier positif ou nul, ou `-1` (valeur par défaut) pour l'infini. Le compteur en bas à gauche suit chaque largage réussi ; maintenir B ou le bouton tactile déclenche les suivants dès la fin de la recharge. Le stock reste identique lors d'un retour à la carte et repart de la valeur configurée au redémarrage.

`highwind.bombes.profondeurCratereRatio` règle la profondeur de base au centre sur sol intact : `2 × rayonCreusementMetres × profondeurCratereRatio`. La valeur par défaut `0.1` garde un dixième de la largeur ; `0` désactive le creusement tout en gardant les effets et destructions. `highwind.bombes.attenuationCreusementRepete` réduit progressivement les contributions dans un trou existant : `base / (1 + attenuation × profondeur déjà creusée / base)`. Sa valeur par défaut est `0.1` ; `0` retrouve l'addition constante. Un impact légèrement décalé est aussi atténué selon le creusement à son point d'arrivée ; un nouvel endroit garde sa profondeur initiale. Ces réglages acceptent les nombres positifs ou nuls, sans plafond de profondeur. La contribution finale de chaque impact est enregistrée pour rester identique au retour à la carte, même si la configuration a changé. Les anciens impacts sans profondeur enregistrée gardent leur valeur historique de 10 %.

`highwind.bombes.noircissement` contrôle le style des traces : `tailleRatio` (1 par défaut, multiplicateur du rayon visuel, positif ou nul), `opacite` (0.84, entre 0 et 1) et `douceurBord` (0.5, entre 0 et 1). Une taille ou une opacité nulle masque le noir tout en gardant la terre, les impacts et dégâts. Ce style est commun au FPS et à la carte ; il s’applique à toutes les traces de la partie sans modifier les profondeurs enregistrées.

`highwind.bombes.terre` ajoute la terre brune avec graviers, éclairée selon les pentes : `opacite` (1 par défaut, de 0 à 1) et `tailleMotifMetres` (12, strictement positif). La terre suit le rayon du cratère ; le noir se concentre au fond lorsque la terre est active. `terre.opacite: 0` revient au noircissement seul. Aucun polygone ou dessin supplémentaire par impact : la texture de 128² pixels est partagée et filtrée à distance. Les deux rendus et le retour à la carte utilisent le même style, sans marquer l'eau protégée. Les paramètres sont détaillés dans [REGLAGES-FPS.md](../REGLAGES-FPS.md).

Les sous-objets `highwind.bombes.limites`, `particules` et `simulation` exposent les plafonds d'affichage, d'éclairage, de son, les quantités de particules par plateforme, la cadence avec recharge nulle et le rattrapage de la simulation. Les plafonds acceptent `-1` (aucun), `0` (désactivé) ou un entier positif. Les quantités de particules sont des entiers positifs ou nuls. Un sous-objet partiel reprend les valeurs initiales pour les clés absentes ; les valeurs invalides et clés inconnues sont refusées. La liste complète des valeurs et des effets de saturation se trouve dans [REGLAGES-FPS.md](../REGLAGES-FPS.md#limites-des-bombes--affichage-effets-et-son). Test : `node scripts/check-highwind-bomb-limits.mjs`, notamment au-delà des anciens plafonds de 800 particules, un éclairage, huit sons et 128 sons en attente.

Les rayons de chaque impact sont conservés avec sa position pendant la partie, y compris lors d'un passage à la carte. Recharger la page pour appliquer une nouvelle configuration commence une partie intacte : bâtiments, collisions et traces sont réinitialisés. Les anciennes sauvegardes de dégâts ne sont plus restaurées. Les effets conservent le même nombre plafonné de particules quelle que soit la taille. Vérification des paramètres réellement lus depuis des JSON isolés : `node scripts/check-highwind-bomb-config.mjs`.

```json
"highwind": {
  "present": true,
  "modele": "original",
  "longueurMetres": 237,
  "position": { "x": 20, "y": 60, "z": 140 },
  "angleDegres": 135,
  "vitesseNormaleKmh": 400,
  "vitesseMaxKmh": 800
}
```

- `present` : autorise le vaisseau, mais le paramètre **`ship=highwind` doit aussi être présent dans l'URL** (`?ship=highwind` ou `?fps=1&ship=highwind`). Sans ce paramètre, ou avec `present:false`, aucun modèle ni musique du Hautvent n'est chargé.
- `modele` : `"original"`, `"redrawn-v3"`, ou `"vN"` pour tout numéro entier positif (`"v3"`, `"v4"`, `"v5"`, `"v6"`, etc.). Le jeu retrouve `assets/Highwind/Highwind-vN.blend` et prépare automatiquement son export lors du premier chargement ou après modification du fichier. Aucune nouvelle entrée dans le code ni commande manuelle : enregistrer le `.blend`, changer le numéro et recharger la page. Les géométries, textures, collisions et hélices du fichier sont utilisées en FPS et sur la carte. Un numéro sans fichier correspondant ne bloque pas le démarrage du jeu. Les autres syntaxes sont refusées. Un ancien JSON sans cette clé conserve `"original"`.
- `longueurMetres` : distance de la proue à la poupe. La largeur et la hauteur suivent la même échelle ; à 237 m, elles valent environ 117,40 m et 65,31 m.
- `position.x`, `position.y`, `position.z` : coordonnées initiales exactes du centre du modèle, en mètres dans le repère FPS. `z` est la hauteur du centre, sans correction automatique pour la coque. Le joueur peut commencer ailleurs : cela ne déplace pas le vaisseau.
- `angleDegres` : cap initial du vaisseau en degrés, dans le même repère que l’angle FPS (0° vers le nord, 90° vers l’est). Le cap du joueur ne le remplace pas.
- `distanceCameraMetres` : distance de la caméra au centre du vaisseau, strictement positive.
- `angleCameraDegres` : inclinaison verticale de la caméra, entre −89 et 89°. `0` correspond à la hauteur du centre, une valeur positive place la caméra au-dessus et une valeur négative en dessous. La distance reste constante. Le lancement et le clic droit reprennent cet angle ; les anciens JSON sans cette clé conservent environ 20,22°.
- `vitesseNormaleKmh` : vitesse de pilotage sur ordinateur sans Maj (400 km/h).
- `vitesseMaxKmh` : vitesse de pilotage avec Maj gauche ou droite, et vitesse utilisée automatiquement sur mobile (800 km/h). Aucun indicateur de boost n'est affiché sur mobile. Le joystick reste progressif et les déplacements diagonaux restent limités à la vitesse sélectionnée. Les rotations gardent leur vitesse.
- Les deux vitesses sont indépendantes, strictement positives, avec `vitesseMaxKmh >= vitesseNormaleKmh`. Une ancienne configuration sans `vitesseNormaleKmh` utilise `vitesseMaxKmh` dans les deux modes ; aucun multiplicateur n'est appliqué.
- Le passage de la vitesse normale à la vitesse maximale avec Maj utilise `dureeAccelerationSecondes`, comme le démarrage. Le retour à la vitesse normale au relâchement utilise `dureeFreinageSecondes`. Une nouvelle pression pendant la transition repart de la vitesse courante, sans saut. Une durée de `0` désactive cette inertie. Sur mobile, l'accélération au démarrage continue de viser directement la vitesse maximale.
- Les anciens `hauteurApparitionMetres` et `distanceDerriereJoueurMetres` restent acceptés pour compatibilité mais n’ont plus d’effet. Le pilotage modifie ensuite la position et le cap en mémoire ; il ne réécrit pas le JSON. Recharger la page restaure la position et l’angle du fichier.

Ces valeurs sont appliquées à chaque chargement de page, sans reconstruire le modèle. Le Highwind utilise les textures de l'archive fournie dans `tmp`. Il est chargé à proximité, puis libéré au-delà de 500 m de son emprise. Ses fichiers ne modifient pas les données des rues ou des maisons.

Une arrivée avec `ship=highwind` place maintenant directement aux commandes du Hautvent. Le bouton **Carte** conserve sa position dans la session de la ville courante et l’affiche aussi sur la carte ; ce retour ne relance pas automatiquement le pilotage. `?ship=highwind#overview` ouvre explicitement la carte. Le modèle de la carte n’a aucun filtre d’inclinaison et ne force pas une boucle de rendu quand la carte est immobile. Le seuil de 0,9° depuis la verticale concerne uniquement les bâtiments 3D en carte, jamais le Hautvent ou le FPS. Lors d’un lancement direct, la musique peut attendre le premier clic ou la première touche selon la politique audio du navigateur.

Import reproductible : `scripts/import-highwind.py` produit `dist/data/highwind` à partir de l'archive Collada. `node scripts/check-highwind.mjs` vérifie l'échelle, les rotations, la désactivation, le chargement à proximité et la libération des ressources.

Au contact de la coque (2,2 m), `E` ou le bouton mobile **Entrer** embarque. La caméra suit derrière le vaisseau. ZQSD/WASD déplacent, les flèches gauche/droite tournent, Espace monte et Ctrl descend. Sur mobile : joystick gauche pour avancer/reculer et se déplacer latéralement, droit pour tourner et monter/descendre. Les axes se combinent. L'inclinaison du Hautvent atteint ±10° en montée/descente puis revient à plat. L’Orca reste à plat lors d’une montée ou descente seules.

En vol, maintenir un bouton de souris permet de tourner la caméra autour du Hautvent. Chaque nouvel appui droit rétablit immédiatement le cadrage par défaut du lancement : derrière le vaisseau selon son cap actuel, inclinaison initiale et distance `distanceCameraMetres` du JSON. Cela ne déplace ni ne tourne le vaisseau. Le glissement commence depuis ce cadrage. Relâcher le bouton droit mémorise l'angle horizontal et vertical comme nouvelle position de suivi, relative au vaisseau. Relâcher le bouton gauche revient doucement à cet angle mémorisé. Le réglage reste pendant le pilotage et les pauses ; remonter aux commandes restaure l'angle de suivi initial. La molette conserve son rôle de zoom.

Un second `E` ou **Sortir** lance une descente automatique à 45 m/s, arrêtée par le sol ou les obstacles chargés. La sortie cherche un emplacement libre à côté du vaisseau. Si le terrain manque, le vol attend son chargement. Les collisions du vaisseau utilisent une enveloppe de coque échantillonnée ; celles du joueur restent inchangées.

Les deux hélices tournent autour de leurs pivots Collada. Le fichier fourni `assets/highwind-takes-to-the-skies.mid` est copié dans les ressources du modèle et joué en boucle par un synthétiseur Web Audio à l'embarquement. La partition est conservée ; le timbre provient du synthétiseur du jeu. Pause suspend la musique et le vol ; sortie arrête la musique. `node scripts/check-highwind-flight.mjs` couvre les pivots, le contact, l'apparition, les axes simultanés, la vitesse, l'inclinaison, la descente sur un toit et le cycle de vie audio.

## Choix du vaisseau

- `?ship=highwind` démarre au pilotage du Hautvent, configuré par `highwind`.
- `?ship=orca` démarre au pilotage de l’Orca GDI, configuré par `orca`.
- Le paramètre peut se combiner à `ville=nice`. `#overview` garde la carte ; le retour vers la carte conserve le choix.
- Sans `ship`, avec une valeur inconnue ou avec l’ancien `ff7`, aucun vaisseau n’est sélectionné.

Les deux objets de `fps-config.json` sont indépendants : présence, modèle, taille, position, orientation, vitesses, caméra, embarquement et bombes. Leurs poses et stocks sont mémorisés séparément. L’Orca mesure 9,454 m, utilise une caméra à 18 m et possède uniquement les turbines `PropL` et `PropR`. Le thème musical FFVII reste réservé au Hautvent.



Le réglage `inertie`, indépendant dans `highwind` et `orca`, multiplie les durées de démarrage, de freinage, de changement de direction et de transition avec Maj. `1` conserve le comportement précédent, `0.2` divise ces durées par cinq, `0` rend ces transitions immédiates et une valeur supérieure à `1` augmente l’inertie. La valeur doit être un nombre positif ou nul ; si elle manque, elle vaut `1`. Les vitesses maximales restent les mêmes. Le Hautvent utilise `1` ; l’Orca utilise `0.2`, soit 0,10 s de démarrage et 0,16 s de freinage avec ses durées de base actuelles. Les filtres de caméra et les armes sont indépendants de ce réglage.


`vitesseMonteeKmh` et `vitesseDescenteKmh` sont réglables séparément dans `highwind` et `orca`, en km/h. Les valeurs initiales sont 150/150 pour le Hautvent et 45/45 pour l’Orca : elles reprennent la vitesse verticale précédente sans Maj. Ces valeurs sont indépendantes de la vitesse horizontale et restent identiques avec Maj ou sur mobile. `0` désactive le déplacement dans le sens concerné. Les commandes combinées restent normalisées, et les sous-pas de collision tiennent compte de la vitesse verticale configurée. Si une clé manque dans un ancien JSON, ce sens conserve la moitié de la vitesse horizontale courante. L’Orca ne prend plus de tangage à cause de la montée ou de la descente seules ; il garde son tangage lié à l’avance/recul et son roulis de déplacement latéral. Le Hautvent garde son inclinaison verticale existante. Vérification : `node scripts/check-ship-vertical-flight.mjs`.
