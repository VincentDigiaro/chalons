# Façades de Nerval sans collages

Les 64 parties de bâtiments en amont de la boucle utilisent le catalogue de façades de la ville. Les 39 découpes photographiques (166 triangles superposés) sont retirées. Les photographies de référence restent conservées dans les données d’observation.

`apply-nerval-catalogue.mjs` travaille sur le maillage existant. Il ne modifie que les coordonnées de texture et la teinte des murs identifiés par `pickTriangles`. Les coordonnées, normales, ouvertures, jardins, routes, clôtures, objets et éléments de la boucle/impasse sont conservés. Les pignons utilisent l’enduit sans fenêtres du catalogue. Les toits retrouvent leur photographie aérienne sous-jacente après retrait des découpes de photos de rue.

Le traitement est appelé à la fin de `build-nerval.mjs`. `build-walk.mjs --detail-only` réutilise les matériaux de façades déjà présents en FPS sans décaler les autres matériaux. Aucun changement de géométrie de la ville ni de la maquette Attila n’est nécessaire.

Pour traiter un maillage déjà construit sans reconstruire les modèles :

```powershell
node scripts/apply-nerval-catalogue.mjs dist chemin-vers-sortie --walk
node scripts/check-nerval-catalogue.mjs dist chemin-vers-sortie
```

Le deuxième argument désigne une sortie séparée recommandée pour la vérification avant installation. Un maillage déjà traité n’est pas transformé une seconde fois.

Vérifications : `check-nerval.mjs`, `check-nerval-roundabout.mjs`, `check-walk.mjs`, `check-walk-streaming.mjs`. Le contrôle dédié compare chaque triangle avant/après et vérifie que seuls les collages sont supprimés et seuls les matériaux des murs autorisés changent. Il compare également les triangles de la carte avec ceux du FPS.

La publication ciblée est dans `artifacts/nerval-catalogue`. Elle est calculée sur la version publique existante pour préserver les modèles locaux d’autres tâches. `public-before` contient la sauvegarde des seuls fichiers remplacés, y compris leurs `.gz`. Ne pas recopier tout `dist` et ne pas restaurer cette sauvegarde après des modifications ultérieures sans comparaison préalable.
