Pour publier les changements du jeu :

```powershell
npm run publish:code
```

Malgré son nom historique, cette commande publie par défaut **tous les fichiers nouveaux ou modifiés dans `dist`** : code à tous les niveaux, modèles (Orca, Highwind, bâtiments…), textures, sons, polices et données de toutes les villes. Aucun nom de modèle, de ville ou de nouveau dossier n’a besoin d’être ajouté au script. Les fichiers cachés et les copies `.gz` locales sont exclus ; les versions gzip nécessaires sont régénérées à partir des fichiers originaux.

La commande compare le contenu local avec `C:/nginx/html/chalons`, prépare seulement les différences, sauvegarde chaque fichier remplacé, publie puis contrôle les octets réellement servis sur `https://digiaro.duckdns.org/chalons/`. Le contrôle HTTP demande les réponses normales et gzip, afin de détecter une ancienne version compressée. Les fichiers identiques ne sont pas recopiés ; un cache des comparaisons accélère les passages suivants. Une modification de taille, de date de modification, de date de changement ou d’identité du fichier invalide ce cache, côté source comme côté serveur.

Les ressources sont installées avant leurs index, puis le code et les index d’activation ; les pages HTML arrivent en dernier. Les fichiers présents uniquement sur le site ne sont pas supprimés. Les modèles, textures et paquets référencés par les index sont contrôlés avant toute écriture sur le site. Un export incomplet, un index FPS périmé ou un changement intervenu pendant la préparation fait échouer la publication avec le chemin concerné. Cette commande publie les exports de `dist` ; elle ne lance pas Blender ni les générateurs de données.

Pour contrôler les changements sans publier :

```powershell
npm run publish:code -- --prepare-only
```

Chaque lancement crée un dossier `artifacts/publication-code-*`. Son `summary.json` liste les fichiers à remplacer et leur taille ; `files/` contient uniquement les nouvelles versions nécessaires et `backup/` les anciennes. Le `manifest.json` conserve la portée, les empreintes et les contrôles des modifications concurrentes. Il n’y a pas de copie complète de `dist`.

Pour publier une préparation terminée, utiliser le dossier affiché par la commande :

```powershell
node scripts/publish-site.mjs publish artifacts/publication-code-XXXXXX
node scripts/publish-site.mjs verify-http artifacts/publication-code-XXXXXX
```

Si les sources ou le site ont changé depuis la préparation, relancer `npm run publish:code`. Une étape échouée arrête les suivantes ; une vérification HTTP échouée est signalée même si la copie sur le serveur est déjà terminée. Les contrôles HTTP en échec sont enregistrés et repris au lancement suivant, même sans nouveau fichier à copier. Le rapport `https-validation.json` indique les réponses vérifiées et les erreurs restantes.

Les portées anciennes restent disponibles explicitement : `npm run publish:code -- --code-only` limite aux fichiers de code historiques ; `npm run publish:code -- --with-models` conserve l’ancienne sélection code + Nice + Nerval. Elles utilisent `scripts/publish-buirette.mjs` pour préparer, publier et vérifier leurs manifestes. Ces options ne sont pas nécessaires pour une publication ordinaire, y compris après un export de l’Orca. Les anciens dossiers de publication restent utilisables avec leur script d’origine.

Les variables `CODE_PUBLICATION_SOURCE` et `CODE_PUBLICATION_ARTIFACTS` permettent de changer la source et le dossier de préparation ; `BUIRETTE_LIVE` et `BUIRETTE_BASE_URL` désignent la destination et son URL. Les noms `BUIRETTE_*` sont conservés pour compatibilité.

Les configurations JSON à la racine du projet, dont `fps-config.json` et `imagery-config.json`, restent servies directement par les alias nginx existants ; elles ne nécessitent pas de copie dans `dist`.

Le service Highwind sert tous les fichiers ordinaires présents dans le dossier public de chaque version, y compris les textures d’un export précédent qui ne sont plus dans l’index. Le chargement d’`index.json` conserve la préparation automatique depuis Blender.

`npm run check:publication` teste la commande sur un site temporaire : ajout de ressources dans des dossiers inconnus du script, publication incrémentale, cache, gzip périmé, HTTP normal et gzip, reprise après une erreur HTTP, routage réel du service Highwind, sauvegardes, préparation sans écriture sur le site, dépendance manquante et modifications concurrentes. Les anciens modes ciblés conservent également leurs tests.
