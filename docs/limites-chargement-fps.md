# Limites et attentes du chargement FPS

État du code local après ajout du sous-objet `preparation`. Ce document décrit le circuit de chargement et d'apparition de la promenade FPS et du Hautvent ; il ne prétend pas inventorier les limites internes du navigateur ou du pilote graphique.

## Réglages dans fps-config.json

| Réglage | Ce qu'il contrôle |
| --- | --- |
| `chargementsGeometrieSimultanes` | Nombre de chargements géométriques en cours. Chaque place reste occupée jusqu'à la préparation de tout son paquet. |
| `batimentsParTelechargement` | Maximum de bâtiments par requête, de 1 à 256. Routes et modèles détaillés restent individuels. |
| `chargementsTexturesSimultanes` | Nombre de textures en cours, jusqu'à leur transfert graphique. |
| `preparation.budgetParImageMs` | Temps de préparation visé par image pendant le jeu. `0` supprime le plafond de temps. |
| `preparation.budgetInitialParImageMs` | Même réglage avant l'entrée dans la scène. `0` supprime le plafond de temps. |
| Les trois `rayonChargement…Metres` | Distance de chargement des bâtiments, du sol et des routes. L'emprise entière d'un bâtiment doit tenir dans son rayon. |
| `debutBrouillardMetres` / `finBrouillardMetres` | Visibilité visuelle par brouillard ; cela ne rend pas le calcul ou le téléchargement plus rapide. |

Le budget n'est plus automatiquement réduit par le temps de dessin. Il n'y a plus de plafond caché à 4 ms lorsqu'une valeur supérieure est saisie. Les valeurs de repli pour un ancien JSON sont 4 ms pendant le jeu et 8 ms au chargement initial.

## Attentes encore présentes dans le code

| Mécanisme | Valeur ou règle | Effet |
| --- | --- | --- |
| Découverte des nouveaux objets après un déplacement | Toutes les 350 ms, recherche dans un index spatial construit à l'entrée | Un nouvel objet entrant dans le rayon peut attendre ce rafraîchissement avant sa demande. Le catalogue entier n'est plus parcouru à chaque passage. `walk-mode.js`, `walk-renderer.js`. |
| Décompactage des paquets | Décompression successive de chaque fichier, retour après le dernier | Les premiers fichiers du paquet ne sont pas encore transmis progressivement à la préparation. `walk-downloads.js`. |
| Admission dans la file de préparation | Prochain `requestAnimationFrame` | Même sans plafond, une arrivée réseau est traitée au prochain passage ; les étapes `yield` ne forcent pas chacune une nouvelle image. `walk-preparation.js`. |
| Priorité des tâches | Géométries proches d'abord ; transferts de textures prioritaires | Un objet éloigné peut attendre derrière un objet proche ou une texture. Un paquet ne conserve pas un créneau CPU exclusif. |
| Publication de la géométrie | Après relief, collisions et transfert graphique complets | Les collisions sont encore préparées pour chaque objet, même pendant le pilotage. C'est une dépendance coûteuse, pas un réglage de téléchargement. |
| Affichage d'un matériau texturé | Texture requise disponible sur le GPU | Les parties d'un bâtiment dont la texture manque ne sont pas dessinées. Le sol aérien a une couleur de remplacement. `walk-renderer.js`. |
| Entrée dans la promenade | Tous les objets à moins de 100 m, plus leurs textures non aériennes disponibles ou signalées en échec | L'écran de chargement peut attendre un objet proche. Les photos aériennes ne bloquent pas cette entrée. |
| Vérification de cette entrée | Toutes les 80 ms | Ajoute jusqu'à environ 80 ms après disponibilité de la scène proche. |
| Génération du sol | Dans la même file de préparation que les bâtiments | Création, relief et transfert GPU des nouvelles tuiles utilisent le budget partagé. `refresh` planifie les tuiles ; seules les tuiles complètes sont dessinées. Le sol à moins de 100 m doit être prêt avant l'entrée. |
| Tailles des étapes de préparation | Relief/collisions : 128 triangles ; routes : 384 sommets par fragment ; transfert : 44 Kio | Définissent la granularité à laquelle on peut rendre la main. Aucun maximum de bâtiments par image n'est imposé en plus du budget. |
| Archives physiques | Au plus 256 fichiers par archive | Une requête prend des fichiers contigus déjà demandés, parfois moins que le maximum configuré. |

Le filtrage hors champ agit sur le dessin. Il garde en mémoire les ressources dans le rayon ; une rotation ne les décharge pas. Un changement de position peut en revanche faire sortir des objets du rayon.

## Délais en cas de réseau lent ou défaillant

Ces valeurs ne sont pas des pauses systématiques après chaque objet. Elles interviennent en cas d'attente réseau, d'échec ou de repli.

| Circuit | Limites actuelles |
| --- | --- |
| Géométrie individuelle et métadonnées | 20 s sans progression avant abandon de la tentative ; nouvelle tentative après 750 ms, puis délai exponentiel plafonné à 5 s. Les tentatives continuent tant que l'objet est demandé. |
| Paquet | 20 s pour recevoir la réponse et son corps ; en cas d'échec, retour aux fichiers individuels. Ce délai ne couvre pas le décompactage une fois le corps reçu. |
| Texture FPS | 10 s pour téléchargement/décodage ; nouvelle tentative autorisée après 30 s × numéro de tentative, au plus 3 tentatives. Le temps passé ensuite dans la file de préparation n'est pas compté dans ces 10 s. |
| Photo IGN côté navigateur | Tentative directe de 2,5 s avant repli sur la copie locale ; lecture locale limitée à 12 s. L'enveloppe de texture FPS de 10 s peut interrompre l'ensemble avant cela. |
| Acquisition d'une photo absente du cache du serveur local | 4 acquisitions simultanées, au moins 125 ms entre démarrages ; délai réseau de 20 s, 2 nouvelles tentatives, puis 30 s avant nouvel essai ; file de 512 demandes maximum. Les photos déjà enregistrées sont lues directement. |
| Sauvegarde des photos côté navigateur | 2 demandes d'archivage simultanées, file de 256 ; ces demandes n'empêchent pas d'afficher une photo déjà reçue. |
| Résidence du modèle Hautvent | Rayon de 500 m autour de son emprise ; nouvelle tentative après 3 s en cas d'échec. Ce circuit est distinct de celui des bâtiments. |

Augmenter `preparation.budgetParImageMs` retire seulement l'attente due au partage du temps de préparation. Cela ne supprime pas les autres dépendances de ce tableau.
