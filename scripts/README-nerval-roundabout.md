Maisons 22 à 32 — rond-point Gérard-de-Nerval

`build-nerval-roundabout.mjs` interprète les huit photographies fournies le 14 septembre 2026. Les références originales et leurs empreintes SHA-256 sont conservées dans `nerval-roundabout-references.json`. Les emprises OSM restent inchangées ; hauteurs et détails sont estimés visuellement.

Correspondance : 32 → partie 86 ; 30 → 78 ; 28 → 77 ; 26 → 76 et 73 ; 24 → 80 ; 22 → 83. Le 26 remplace désormais les volumes génériques `way/156772542` et `way/396532599` dans les façades, les toitures et le mode FPS.

Reconstruction : `node scripts/build-nerval.mjs`, puis `node scripts/build-walk.mjs --detail-only`. Le test `scripts/check-nerval-roundabout.mjs` vérifie les ouvertures caractéristiques, les empreintes, la pelouse et la géométrie. `scripts/check-nerval-refinements.mjs` contrôle notamment les 343 positions sur la chaussée.

La publication isolée est conservée dans `artifacts/nerval-roundabout-release` : elle part de la version publique, conserve les autres maisons, les textures et les contrôles FPS, et ne retire des catalogues génériques que les deux emprises nouvellement détaillées. Elle contient les sauvegardes, les contrôles d’intégrité et le résultat de vérification HTTPS.

Avec la portée FPS de 500 mètres, la version publiée charge environ 20,20 Mo de fichiers de géométrie au départ (1 209 éléments). Ce n’est pas une mesure de la mémoire totale GPU ou de la fréquence d’image sur téléphone. Le plafond de vérification est porté à 24 Mo pour tenir compte des six maisons détaillées et des autres modèles locaux en cours de développement.

Correction des accès et des sols : la rampe du 32 mesure 1,44 m de large et relie le portail au palier à 1,28 m. La pelouse est découpée et le muret interrompu. Son revêtement est un gravier blanc-gris ; sa géométrie reste identique à la rampe validée. Le portail reste fermé, conformément à la demande de l’utilisateur. Le doublon de clôture du 30 qui traversait cette pelouse est supprimé. Le test `check-nerval-access.mjs` fait parcourir la rampe au personnage dans les deux sens à l’intérieur de la propriété, sans saut, vérifie la fermeture du portail et contrôle les surfaces au sol. Le mur du 22 reste à au moins 4,75 m de l’axe de la rue (chaussée de 6,20 m, trottoir conservé). Les raccords de voirie, l’allée entre la maison aux volets bleus et la maison d’angle et leur bande côté rue ont des surfaces texturées.

La livraison `artifacts/nerval-access-release` applique uniquement la différence de géométrie de ce correctif à la version publique, avec contrôle de chaque triangle conservé. Elle préserve les autres maisons, le catalogue de façades et les commandes FPS, y compris les livraisons intervenues pendant le travail.
