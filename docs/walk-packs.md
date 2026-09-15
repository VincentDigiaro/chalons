# Paquets de bâtiments FPS

Les bâtiments sont transportés par zones. Le paquet contient les fichiers binaires originaux, sans modifier leurs sommets, matériaux, UV ou collisions. `data/walk/index.json` garde les coordonnées et identifiants individuels ; son champ `geometryPacks` indique dans quel paquet retrouver chaque fichier.

Le chargeur regroupe les demandes visant le même paquet. Une seule requête occupe une place dans `chargementsGeometrieSimultanes`. Les bâtiments et les modèles détaillés utilisent ces paquets ; les routes, déjà découpées en cellules, utilisent la même file avec leurs fichiers existants. Les textures restent partagées par leur URL dans leur file indépendante.

Le rayon reste appliqué à chaque bâtiment. Un paquet peut contenir des bâtiments hors rayon : leurs données sont reçues avec leurs voisins, mais leurs géométries ne sont ni installées sur le GPU ni affichées avant leur entrée dans le rayon. Le paquet est conservé en mémoire tant qu'au moins un bâtiment résident l'utilise. Il est libéré quand le joueur quitte cette zone, ou quitte le mode FPS. Annuler un bâtiment ne coupe pas le téléchargement encore nécessaire à ses voisins.

## Réglages et reconstruction

`fps-config.json` conserve les distances et les limites de chargements simultanés. Aucun réglage de mouvement, texture, brouillard ou réseau serveur n'est changé par cette livraison.

`walk-pack-config.json` règle la génération :

- `tailleZoneMetres` : côté des zones de regroupement, actuellement 200 mètres.
- `tailleMaxPaquetOctets` : taille cible maximale avant compression, actuellement 2 097 152 octets. Une zone est divisée en plusieurs paquets si nécessaire. Un fichier individuel plus gros reste entier.

Ces deux valeurs organisent les fichiers à produire ; elles ne constituent pas des limites d'affichage. Après leur modification, exécuter `npm run walk:packs`, puis publier. Une reconstruction complète du mode FPS et les commandes d'installation des modèles reconstruisent les paquets. La préparation de publication les régénère aussi à partir des fichiers effectivement livrés, pour inclure les modifications ultérieures des maisons.

Les noms de paquets incluent une empreinte de leur contenu. Une modification de géométrie produit une nouvelle URL ; un ancien paquet en cache ne peut pas remplacer le nouveau. Les anciens fichiers individuels restent disponibles pour les pages déjà ouvertes et les outils de génération. Une version du chargeur qui ne connaît pas encore les paquets continue de lire l'ancien index individuel. Les exclusions des maisons remplacées restent individuelles, même si les octets de l'ancien bâtiment se trouvent dans un paquet.

## Vérifications

`npm run check:walk-packs` compare tous les fichiers extraits avec leurs originaux, puis compare les deux modes de transport dans le véritable chargeur et le rendu instrumenté. Il vérifie le rayon par bâtiment, les collisions, la réutilisation du cache, le partage des requêtes et les annulations. Ce contrôle ne mesure pas les FPS d'un téléphone.

Mesures de la livraison initiale, avec un rayon de 1 000 mètres :

| Emplacement | Requêtes de bâtiments avant | Après |
| --- | ---: | ---: |
| Départ, x=-110, y=-115 | 4 242 | 102 |
| Déplacement de 100 m depuis ce départ | 199 | 4 |
| Arrivée au 14 Résidence du Parc | 1 460 | 69 |

Sur l'ensemble des données, 33 908 fichiers de bâtiments sont regroupés en 1 103 paquets. Les routes et les textures ne sont pas incluses dans ces nombres. Les rapports détaillent aussi le total de requêtes de géométrie, routes comprises.
