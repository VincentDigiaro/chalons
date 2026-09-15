# 14, rue de la Résidence du Parc

Repère fourni dans le jeu : **x = −413, y = 2800**. L’origine du modèle conserve ce point ; les cinq emprises remplacées restent aux coordonnées de l’extrait OSM existant.

## Contenu

- Maison principale : toit brun foncé à deux pans, trois lucarnes triangulaires vitrées et leurs croisillons, deux lucarnes arrière, deux fenêtres de toit, cheminée à chapeau, garage, baies en retrait, volets, gouttières et lanterne.
- Jardin avant : allée pavée sans voiture, buissons taillés dont l’arbuste rougeâtre et le massif bas à baies, haies, petites plantations et statue en pierre portant une vasque sur un socle rond décoré.
- Arrière : trois portes-fenêtres sur la terrasse, prolongement vitré, pelouse, haies et grands arbres périphériques.
- Deux voisines simplifiées : pignon et balcon à droite ; deux lucarnes et petite annexe à gauche. Leurs numéros ne sont pas affirmés.

Les huit originaux sont conservés dans `references_parc14`. Leurs empreintes SHA-256 et les observations sont dans `dist/data/parc14/survey.json`. Les photos sont consultables dans `dist/parc14-references.html`. Crédits Google Maps / Street View conservés. Les dimensions, limites de jardin et éléments partiellement cachés sont interprétés à partir des vues fournies ; aucune mesure cadastrale n’est revendiquée. Aucune photographie de façade n’est projetée sur le bâtiment.

## Construire et intégrer

```sh
npm run parc14:build
npm run parc14:install
npm run check:parc14
```

L’installation retire les cinq emprises des toits/façades génériques et ajoute les cellules du mode FPS. Les matériaux existants et les autres paquets sont conservés. Les anciens paquets remplacés deviennent des fichiers vides valides, y compris pour les sessions dont l’index est ancien. `build-walk.mjs`, `detailed-buildings.mjs` et `build-facades.mjs` prennent aussi le modèle en compte lors des reconstructions complètes.

Accès : `#parc14` dans la carte, destination « 14 · rue de la Résidence du Parc », ou `parc14-preview.html`. Entrée à pied dans la rue : `?fps=1&x=-418.51&y=2816.94&angle=162&pitch=11`.

## Vérification

`check-parc14.mjs` compare les triangles carte/FPS, les emprises OSM, les références et les empreintes de Nerval, Attila et Buirette. Il contrôle la suppression des anciennes géométries, la conservation des autres cellules, 268 échantillons de la rue, l’accès au garage et sa collision. Les contrôles communs des toits, façades, paquets FPS et du chargement des modèles sont également exécutés. Résultat détaillé : `artifacts/parc14/validation.json`.

Cette livraison est intégrée à la version locale du jeu.

## Corrections d'après les annotations

- Les trois lucarnes avant mesurent environ 2,50 m de large pour 1,65 m de haut. Leurs six carreaux inférieurs sont plus hauts ; les traverses sont placées à 45 %, 70 % et 86 % de la hauteur vitrée, d'après le gros plan fourni.
- La bordure supplémentaire devant l'allée est retirée : la rue conserve sa bordure existante. Tous les sols ajoutés sont découpés contre les triangles de la chaussée et du trottoir pour éviter les surfaces superposées.
- La pelouse de la voisine gauche rejoint celle du numéro 14 sous les arbres et couvre le triangle laissé nu côté rue. La découpe préserve la chaussée et les emprises des bâtiments.

`check-parc14-corrections.mjs` vérifie les proportions, sept points des zones auparavant nues, la disparition de la bordure en double et l'absence de recouvrement entre sols du modèle et rue. Les captures annotées et le constat avant/après sont conservés dans `artifacts/parc14-corrections`. Si le tracé des rues est reconstruit, reconstruire puis réinstaller Parc14 pour recalculer ses découpes.

## Livraison du 15 septembre 2026

Maison, voisines et zoom tactile du Hautvent publiés sur https://digiaro.duckdns.org/chalons/. Les 49 fichiers livrés ont été vérifiés par HTTPS. Le manifeste et les sauvegardes sont dans artifacts/parc14-highwind-release/publication. La version publique des autres modèles est conservée.

En pilotage mobile : un doigt oriente la vue ; écarter deux doigts rapproche la caméra, les pincer l’éloigne. Les joysticks restent indépendants ; la pause, la perte de contact et la sortie de l’appareil annulent le geste en cours. Contrôle : npm run check:highwind-pinch.
