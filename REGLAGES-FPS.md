Le seul fichier à modifier est `fps-config.json`, à la racine de ce projet.

Chargements simultanés, réglables indépendamment :

- `chargementsGeometrieSimultanes` : fichiers de formes en cours de chargement (8 au départ).
- `chargementsTexturesSimultanes` : images de textures en cours de chargement (6 au départ).

Ces deux valeurs sont des entiers supérieurs ou égaux à 1. Elles limitent les chargements en cours, pas les bâtiments affichés. Une place libérée permet de commencer le fichier suivant. Elles sont lues directement dans le JSON, sans valeur de remplacement dans le chargeur. Enregistrer puis recharger le jeu.

Les distances suivantes sont indépendantes, en mètres :

- `rayonChargementBatimentsMetres` : bâtiments (600 au départ).
- `rayonChargementSolMetres` : tuiles et photos du sol (600).
- `rayonChargementRoutesMetres` : routes de la ville (600).
- `debutBrouillardMetres` : début du brouillard (450).
- `finBrouillardMetres` : brouillard opaque (600), supérieur au début.

Enregistrer le JSON puis recharger la page suffit, y compris en ligne. Changer un rayon ne déplace plus le brouillard. Les rayons acceptent `0` pour désactiver une catégorie.

| Clé | Effet | Unité |
| --- | --- | --- |
| `puissanceSautMps` | Impulsion verticale de chaque saut ; une valeur supérieure fait monter plus haut. | mètres/seconde |
| `delaiEntreSautsMs` | Intervalle minimum entre deux déclenchements, pour les appuis rapides et maintenus, au clavier et sur mobile. `0` permet un déclenchement à chaque image. | millisecondes |
| `vitesseMarcheMps` | Marche au clavier. | mètres/seconde |
| `vitesseCourseMps` | Course avec Maj et vitesse maximale du joystick mobile ; le joystick reste progressif. | mètres/seconde |
| `superVitesseKmh` | Super vitesse avec Ctrl ou le bouton Flash mobile. | kilomètres/heure |
| `graviteMps2` | Accélération vers le sol ; une valeur supérieure fait retomber plus vite. | mètres/seconde² |

Enregistrer le JSON, puis **recharger la page**. Le serveur local et Nginx lisent directement ce fichier : aucune compilation, copie ou relance du serveur n'est nécessaire pour changer les valeurs. Une page déjà ouverte garde les valeurs chargées à son ouverture.

Les sauts en l'air restent autorisés. Tous les déclenchements partagent le même délai, même si plusieurs doigts ou le clavier et le tactile sont utilisés ensemble. La vitesse verticale est réinitialisée par chaque saut, pas additionnée.

Utiliser des nombres avec un point décimal, sans guillemets. Toutes les clés sont obligatoires, les valeurs doivent être positives ou nulles, et la gravité strictement positive. Une configuration invalide produit une erreur explicite ; aucune valeur de remplacement cachée n'est utilisée.

Le chargement commun se trouve dans `dist/walk-config.js`. Les scripts Node lisent le fichier racine ; le navigateur lit `fps-config.json` relativement à l'URL du jeu. L'URL publique `/chalons/fps-config.json` correspond exactement au fichier racine grâce à une règle dédiée de `C:/nginx/conf/chalons.conf`. En cas de déplacement du projet, mettre à jour ce chemin dans Nginx.

La distance de la caméra de conduite se règle avec `highwind.distanceCameraMetres`, en mètres depuis le centre du Highwind. Une valeur plus petite rapproche la caméra ; une valeur plus grande l'éloigne. Par exemple, `100` place la caméra à 100 mètres du centre. La distance reste identique lorsque la caméra tourne autour du vaisseau et lorsque sa taille change. Utiliser un nombre strictement positif, puis recharger le jeu. Si cette clé est absente dans un ancien JSON, le cadrage d'origine dépendant de la longueur du vaisseau est conservé.

Les vitesses des hélices du Highwind se règlent dans `highwind.vitessesHelicesToursParSeconde` :

| Clé | Hélices concernées | Valeur initiale |
| --- | --- | --- |
| `PropL` | Hélice latérale gauche | 0.5 tour/s |
| `PropR` | Hélice latérale droite | 0.5 tour/s |
| `PropRear` | Première hélice sur l'axe central | 0.25 tour/s |
| `PropTail` | Les trois hélices de queue, réunies sur un pivot commun | 2 tours/s |

`0` arrête le groupe concerné. Les décimales sont acceptées ; les nombres négatifs et les clés inconnues sont refusés. Les quatre vitesses doivent être présentes dans ce bloc. Les trois hélices de queue tournent ensemble à la même vitesse. Les sens de rotation et les pivots appartiennent au modèle ; aucune vitesse n'est stockée dans son descripteur. Recharger le jeu après avoir enregistré le JSON.
