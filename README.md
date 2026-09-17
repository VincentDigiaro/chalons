# Châlons en 3D

Un jeu d'exploration de Châlons-en-Champagne dans le navigateur : carte 3D,
promenade à la première personne, quartiers modélisés et pilotage du Hautvent
de Final Fantasy VII. La ville s'appuie sur les données OpenStreetMap et les
photographies aériennes de l'IGN.

## Démarrer sur une nouvelle machine

### Prérequis

- Node.js 24, avec npm inclus.
- Un navigateur prenant en charge WebGL 2, avec l'accélération graphique activée.
- Une connexion Internet pour installer les dépendances et charger les photos
  aériennes qui ne sont pas déjà enregistrées localement.

### Installation et lancement

1. Cloner ou télécharger le dépôt.
2. Ouvrir un terminal dans le dossier du projet, celui qui contient `package.json`.
3. Installer les dépendances et démarrer le jeu :

   ```sh
   npm ci
   npm run dev
   ```

4. Ouvrir l'une de ces adresses dans le navigateur :
   - [Carte 3D](http://localhost:5173/)
   - [Promenade à la première personne](http://localhost:5173/?fps=1)
   - [Piloter le Hautvent](http://localhost:5173/?ship=highwind)
   - [Piloter l’Orca GDI](http://localhost:5173/?ship=orca)

Garder le terminal ouvert pendant la partie. Pour arrêter le serveur, appuyer
sur **Ctrl+C**. Utiliser ces adresses plutôt que d'ouvrir `dist/index.html`
directement depuis l'explorateur de fichiers.

## Réglages et organisation

- `fps-config.json` : vitesses, distances de chargement, sauts et configuration du
  Hautvent. Pour afficher le vaisseau, utiliser le lien avec `ship=highwind` et conserver
  `highwind.present` à `true`. Recharger la page après une modification.
- `dist/` : fichiers JavaScript, HTML et CSS du jeu, ainsi que ses ressources.
- `scripts/` : outils de préparation des données, de génération et de vérification.
- `assets/` et `references_*` : ressources originales et images de référence.

Les scripts de génération servent à reconstruire ou modifier les données ; ils
ne sont pas à lancer pour une simple installation. Certains nécessitent des
originaux ou des outils supplémentaires. Voir [les commandes du Hautvent](docs/HIGHWIND.md),
[la documentation de la promenade](scripts/README-walk.md) et
[les réglages FPS](docs/fps-config.md).

Le [relief IGN](docs/terrain.md) est intégré aux données locales et activé sur
la carte comme en promenade. Les routes suivent le terrain, les déplacements
et les sauts tiennent compte des pentes, et le Hautvent respecte le sol.
