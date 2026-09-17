Les boutons **Nice** et **Châlons**, sous **Jouer** en mode carte, choisissent les données géographiques utilisées par le moteur commun. Cliquer sur la ville active ne recharge rien. Changer de ville recharge la page et libère la scène précédente ; les deux villes ne restent pas simultanément en mémoire.

La ville figure dans l’URL (`?ville=nice` ou `?ville=chalons`). Sans paramètre, Châlons reste la valeur par défaut. Le choix persiste dans la promenade, le retour à la carte et les catalogues. Un changement de ville retire les coordonnées FPS et la vue cartographique précédentes ; `ff7` et le choix des toitures sont conservés. Les réglages FPS et le Hautvent sont communs aux deux villes. Les coordonnées locales du Hautvent se rapportent à l’origine de la ville sélectionnée.

`dist/city-config.js` contient les origines, échelles, emprises, points de départ et destinations. Châlons conserve les données sous `dist/data/`. Nice utilise `dist/data/cities/nice/`. Les fichiers JavaScript, modèles détaillés de Châlons, Hautvent, ciel et audio restent ceux de ce projet. Les données de Nice n’incluent aucun autre moteur.

Au lancement sans paramètres et après un changement de ville, la carte s’ouvre à la verticale et au dézoom maximal permis par son emprise de navigation et la taille de l’écran. Les liens vers un lieu précis et le retour depuis le jeu conservent leur cadrage. Le changement de ville ajoute `#overview`, afin de rester en carte même si `ff7` est conservé.

Avec `ff7` et `highwind.present: true`, une arrivée directe dans le jeu place immédiatement aux commandes du Hautvent. En carte (`#overview` ou retour par **Carte**), le même modèle reste visible à toutes les inclinaisons. Le retour conserve sa position pour la ville en cours. Sous 0,9° d’inclinaison depuis la verticale, seuls les bâtiments 3D de la carte cessent d’être dessinés ; leurs caches sont conservés. Le mode FPS et le Hautvent n’utilisent jamais ce filtre.

Les routes du mode carte suivent la grille du relief MapLibre, encodée au centimètre et alignée sur ses échantillons. Une marge de 5 cm et une subdivision ciblée sur les ruptures de pente évitent les intersections avec le fond. La projection corrige aussi l’échelle verticale selon la latitude. Le terrain et les collisions FPS sont inchangés. La transition vers le jeu mesure la position réelle de la caméra avant de changer son champ de vision.

La copie locale de MapLibre 5.6 contient un correctif ponctuel dans `_updateRetainedTiles` : à inclinaison élevée, une image peut déjà avoir atteint son zoom maximal alors que le zoom moyen de couverture est inférieur. Le code utilise alors son unique enfant surzoomé, sans essayer de lire quatre enfants. `npm run check:map-view` couvre ce cas ; ne pas écraser ce correctif lors d’une recopie de la bibliothèque sans vérifier sa présence en amont.

L’import provient de `C:\Users\cid77\Documents\ChatGPT\nice`. Il comprend les bâtiments, routes, façades, toitures, relief et photographies aériennes enregistrées. Le fichier `import.json` conserve la provenance et les empreintes des principaux index ; `source-city.config.json` documente l’extraction d’origine. Le relief de Nice est encodé en décimètres, celui de Châlons en centimètres ; le lecteur commun respecte ces deux unités.

Pour actualiser les données de Nice :

```powershell
npm run nice:import
npm run nice:downloads
npm run check:cities
```

Le script d’import accepte aussi un chemin explicite : `node scripts/import-nice-data.mjs "C:\chemin\vers\nice"`. Il copie uniquement les ressources géographiques et les métadonnées. Le second script reconstruit les archives de téléchargement sans fusionner les maillages. Le serveur local applique une emprise et un cache d’images propres à chaque ville ; le redémarrer après une modification de son code.

Lors d’une publication, inclure les nouveaux modules communs et tout `dist/data/cities/nice/`. Les images importées sont servables statiquement. Pour conserver l’acquisition de nouvelles images par Nginx, les routes Nice correspondantes sont fournies dans `scripts/nginx-imagery.conf`.
