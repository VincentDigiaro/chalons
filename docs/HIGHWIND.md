# Hautvent en FPS

Ajouter `ff7` à l’URL, par exemple `/chalons/?fps=1&ff7`. Le vaisseau apparaît seulement si `highwind.present` vaut aussi `true` dans le fichier racine `fps-config.json`.

- **E** ou bouton **Monter** : entrer à moins de 40 mètres de la structure ; en vol, sortir immédiatement sur le pont inférieur sous la coque centrale. Le vaisseau conserve sa position, son orientation et son inclinaison. Sur mobile, **Monter** apparaît au-dessus des commandes à proximité, puis devient **Sortir** pendant le pilotage.
- **Souris horizontale** : orienter le vaisseau avec un lissage des variations et une vitesse de rotation limitée à **180° par seconde**, commandes combinées comprises. Les mouvements excédentaires ne sont pas conservés : arrêter la souris freine doucement la rotation jusqu’à l’arrêt en environ un tiers de seconde. La caméra suit son alignement avec un léger retard. **Clic gauche ou droit maintenu + souris** : déplacer seulement la caméra autour du vaisseau ; elle revient doucement derrière lui au relâchement.
- **Molette en vol** : zoomer/dézoomer progressivement, y compris en vue panoramique. La distance initiale vient de la configuration FPS ; le zoom reste propre à la session. La sortie sur le pont place le joueur face à la queue du Hautvent.
- **ZQSD / WASD** : avancer, reculer et se déplacer latéralement. **Flèches gauche/droite** : tourner. **Espace / Ctrl** : monter/descendre.
- Sur mobile : joystick gauche pour le déplacement, joystick droit pour tourner et changer d’altitude. Les commandes se combinent.

La vitesse totale maximale est `highwind.vitesseMaxKmh` (400 par défaut). Les parties fixes du modèle fournissent leurs surfaces de marche et leurs collisions. Les pales mobiles sont exclues des surfaces praticables. La distance d’embarquement tient compte des triangles dégénérés du modèle d’origine.

L’ombre utilise la géométrie du Hautvent et la direction de lumière de la scène. Une carte de profondeur de 1024 × 1024 suit sa position, son inclinaison et les quatre groupes d’hélices, en respectant la transparence des textures. Elle assombrit directement le sol, les routes, les murs et les toitures avec des bords adoucis. Le disque au sol a été supprimé. La carte est libérée quand le vaisseau est déchargé ou le mode FPS fermé. Vérification de la projection : `node scripts/check-highwind-shadow.mjs`.

`scripts/import-highwind.py` importe l’archive située dans `assets/`, sépare les douze pales de l’hélice arrière de son axe fixe et produit trois groupes animés. L’index indique 0,5 tour/seconde pour les hélices supérieures et 0,25 tour/seconde pour l’hélice arrière.

La musique publiée est le fichier fourni `assets/Highwind.mp3`, conservé sans réencodage. `dist/data/highwind/audio.json` conserve son empreinte. Le navigateur décode le MP3 une fois puis le lit en boucle avec un `AudioBufferSourceNode`. L’arrêt et la pause diminuent progressivement le volume jusqu’au silence en deux secondes. La pause conserve la position atteinte à la fin du fondu ; reprendre pendant le fondu restaure doucement le volume sans recommencer le morceau. Quitter la page ferme immédiatement le contexte audio.

L’ancien rendu MIDI se trouve dans `artifacts/highwind-v2-20260914/highwind-rendered.wav`. Le petit outil navigateur `render-audio.html` de ce dossier reproduit la synthèse Web Audio. `scripts/encode-highwind-audio.py` encode ce WAV avec la bibliothèque LAME installée (option `--lame` pour préciser son chemin).

Vérifications : `scripts/check-highwind.mjs`, `scripts/check-highwind-flight.mjs`, `scripts/check-highwind-collision.mjs`, `scripts/check-highwind-controls.mjs` et `scripts/check-highwind-music.mjs`.
