# Textures des toits — retour arrière

Dans **Réglages → Textures des toits**, choisir **Photos aériennes · ancien rendu**. Le navigateur mémorise ce choix et recharge la page. Le réglage agit aussi sur les toits génériques en promenade. Choisir **Catalogue · 32 textures** pour réactiver le nouveau rendu.

Liens directs, prioritaires sur le choix mémorisé :

- Nouveau rendu : `https://digiaro.duckdns.org/chalons/?roofs=catalogue`
- Ancien rendu : `https://digiaro.duckdns.org/chalons/?roofs=aerial`

Pour changer le défaut du projet, sans recompilation ni Git, depuis le dossier `map` :

```powershell
npm run roofs:mode -- aerial
# Réactivation
npm run roofs:mode -- catalogue
```

Ajouter `--public` pour changer directement le défaut servi par Nginx dans `C:/nginx/html/chalons`. Le script met à jour `roof-config.js` et sa version gzip ; aucun redémarrage de Nginx. Les anciens choix mémorisés sans contexte, ou sous un autre défaut, sont ignorés pour que PC et mobile reprennent le défaut actuel. Les nouveaux choix mémorisés restent prioritaires tant que ce défaut ne change pas. Les liens explicites `?roofs=` restent toujours prioritaires. Les textures et la géométrie sont conservées dans les deux modes.

## Construction et contrôles

```powershell
npm run roofs:build
npm run walk:build
npm run check:roofs
npm run check:walk
```

Les 32 originaux sont dans `artifacts/roofs/originals`, les prompts du générateur intégré dans `artifacts/roofs/prompts.json`. `scripts/prepare-roof-textures.py` effectue uniquement le redimensionnement et la compression WebP (Python + Pillow).

Les observations colorimétriques des vues aériennes locales sont dans `artifacts/roofs/observations.json`. `scripts/roof-policy.mjs` choisit approximativement les matériaux et leur orientation ; `scripts/roof-catalogue.json` définit les dimensions de répétition en mètres. La carte réutilise le maillage OSM original sans modifier les façades ni les 99 éléments exclus de Gérard-de-Nerval.

Les paquets FPS contiennent les indications des anciennes tuiles aériennes en plus des nouvelles affectations. Le retour arrière recalcule uniquement les UV de ces toits au chargement, avec les mêmes triangles. Les paquets détaillés de Nerval ne sont jamais transformés. Il n’y a pas de seconde copie des bâtiments à télécharger.

## Livraison isolée

`node artifacts/roofs/prepare-release.mjs` prépare une copie isolée avec le Nerval actuellement public. Construire le walk depuis ce dossier de livraison : `node scripts/build-walk.mjs`, avec `artifacts/roofs/release` comme dossier courant. Puis, depuis le projet, `node artifacts/roofs/publish.mjs` prépare et sauvegarde les seuls fichiers concernés. `node artifacts/roofs/publish.mjs --publish` les installe dans Nginx après vérification des empreintes et des éventuelles modifications concurrentes. Les fichiers des façades, du sol et de Nerval ne sont pas publiés par ce script.

Le dossier `artifacts/roofs/publication/backup` conserve les fichiers précédents et leurs versions gzip. Le retour visuel normal se fait avec le réglage, sans restaurer cette sauvegarde ni écraser le travail d’une autre tâche.
