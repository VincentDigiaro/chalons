Le seul fichier à modifier est `fps-config.json`, à la racine de ce projet.

Pour choisir le Highwind, mettre **`"modele": "v5"`**, **`"v6"`**, etc. dans l'objet `highwind`, puis recharger la page. Le jeu retrouve automatiquement **`assets/Highwind/Highwind-v5.blend`**, **`Highwind-v6.blend`**, etc. : aucune nouvelle version à ajouter dans le code et aucun export manuel à lancer. Enregistrer le fichier Blender avant de recharger. La première préparation peut prendre quelques secondes ; les suivantes réutilisent l'export tant que le fichier est inchangé. Cela fonctionne avec le serveur local et le site Châlons. `"original"` et `"redrawn-v3"` restent disponibles. Un fichier absent ne bloque pas le démarrage du jeu.

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

`highwind.angleCameraDegres` règle l'inclinaison verticale de la caméra de conduite, de **−89 à 89 degrés**. `0` la place à hauteur du centre du vaisseau ; `20` la place légèrement au-dessus ; `45` donne une vue plus plongeante. Une valeur négative la place en dessous. La distance configurée reste constante et la caméra regarde le centre du vaisseau. Ce réglage est appliqué au lancement et au retour au cadrage initial par clic droit. Sans cette clé, l'inclinaison historique d'environ 20,22° est conservée.

Le Hautvent possède deux vitesses indépendantes dans `highwind` :

```json
"vitesseNormaleKmh": 400,
"vitesseMaxKmh": 800
```

Sur ordinateur, le pilotage utilise `vitesseNormaleKmh`. Maintenir **Maj gauche ou droite** sélectionne `vitesseMaxKmh` ; relâcher les deux touches rétablit la vitesse normale. Sur mobile, le pilotage utilise toujours `vitesseMaxKmh`, sans bouton ni indication de boost à l'écran. Le joystick reste progressif. Les deux valeurs sont strictement positives, avec une vitesse maximale supérieure ou égale à la vitesse normale. Il n'y a plus de multiplicateur : par exemple, `300` et `950` donnent bien 300 et 950 km/h. Enregistrer puis recharger le jeu.

Le passage à la vitesse maximale avec Maj est progressif : il utilise `highwind.dureeAccelerationSecondes`, comme le démarrage. Au relâchement, le retour à la vitesse normale utilise `highwind.dureeFreinageSecondes`. Une durée de `0` rend la transition immédiate.

Les bombes se règlent dans le sous-objet **`highwind.bombes`** :

```json
"bombes": {
  "nombreBombes": -1,
  "dureeRechargeSecondes": 2.5,
  "tailleMetres": 7,
  "rayonExplosionMetres": 100,
  "rayonCreusementMetres": 100,
  "rayonDestructionBatimentsMetres": 100,
  "profondeurCratereRatio": 0.1,
  "attenuationCreusementRepete": 0.1,
  "noircissement": {
    "tailleRatio": 1,
    "opacite": 0.84,
    "douceurBord": 0.5
  },
  "terre": {
    "opacite": 1,
    "tailleMotifMetres": 12
  }
}
```

| Clé | Effet |
| --- | --- |
| `dureeRechargeSecondes` | Délai entre chaque largage au clavier ou sur mobile, indépendant des bombes en chute et des explosions. `0,1` seconde permet dix largages par seconde ; écrire `0.1` dans le JSON. `0` supprime ce délai. Il n'y a pas de stock de bombes à recharger en groupe. |
| `nombreBombes` | Stock au début de chaque partie. Entier positif ou nul ; `-1` donne un stock infini, affiché **∞** en bas à gauche. Chaque largage réussi retire une bombe ; à `0`, le largage est bloqué. Passer à la carte conserve le stock ; redémarrer le jeu le réinitialise. |
| `tailleMetres` | Longueur totale de la bombe, du nez aux ailettes. Largeur, hauteur, position de largage et contact au sol suivent cette échelle. |
| `rayonExplosionMetres` | Rayon visuel : onde de choc, feu, fumée, projections, éclairage et trace noire au sol. `100` correspond à un diamètre de 200 m. |
| `rayonCreusementMetres` | Rayon de la cuvette et de la terre visible, indépendant des effets de l’explosion et des destructions. `25` creuse une zone de 50 m de diamètre ; `0` désactive le creusement. Nombre positif ou nul. Sans cette clé, le rayon suit `rayonExplosionMetres` comme auparavant. |
| `rayonDestructionBatimentsMetres` | Rayon dans lequel le rendu et les collisions des bâtiments sont supprimés définitivement, indépendamment de la taille visuelle. `0` conserve les bâtiments. |
| `profondeurCratereRatio` | Profondeur de base au centre d'un impact sur un sol intact, en proportion de la largeur du cratère : `0.1` = un dixième, `0.05` = la moitié de cette profondeur, `0.2` = le double. Avec un rayon de creusement de 100 m, cela donne respectivement 20, 10 ou 40 m au premier tir. `0` désactive le creusement ; les autres effets et dégâts restent actifs. Nombre positif ou nul, sans plafond ajouté. Sans cette clé, la valeur reste `0.1`. |
| `attenuationCreusementRepete` | Ralentissement du creusement dans un trou existant : `0.1` par défaut, `0` garde la même profondeur à chaque tir, une valeur plus grande ralentit davantage. La profondeur ajoutée vaut `base / (1 + attenuation × profondeur déjà creusée / base)`. Avec une base de 5 m et `0.1`, les trois premiers tirs ajoutent 5 m, 4,55 m puis 4,20 m. Aucun plafond de profondeur : chaque tir continue de creuser. Nombre positif ou nul. |

Les dimensions visuelles doivent être strictement positives. Les décimales sont acceptées. Enregistrer puis recharger le jeu suffit. Ce rechargement commence une nouvelle partie avec une carte intacte, sans dégâts ni traces. Pendant une partie, les impacts gardent leurs rayons et la profondeur réellement ajoutée ; les bâtiments détruits ne réapparaissent pas, même après un passage à la carte. Le ralentissement dépend du creusement au point d'impact : un tir légèrement décalé dans la même cuvette est aussi atténué, tandis qu'un sol intact garde toute la profondeur de base. La réduction est calculée une seule fois par impact, jamais lors du rechargement du terrain. Les tirs répétés ne densifient pas le maillage.

Maintenir **B** ou le bouton Bombe sur mobile largue automatiquement dès que la recharge se termine. Relâcher, mettre en pause ou quitter le pilotage arrête le tir. Avec une recharge de `0`, un maintien largue par défaut au maximum une bombe par image, dans la limite du stock ; cette cadence se règle dans `simulation` ci-dessous.

**`highwind.bombes.noircissement`** contrôle la trace au sol en FPS et sur la carte :

| Clé | Défaut | Effet |
| --- | --- | --- |
| `tailleRatio` | `1` | Multiplie le rayon visuel de l’explosion pour dimensionner le noircissement. `0.5` = moitié, `2` = double, `0` = aucun noircissement. Ne change ni la terre visible, ni le cratère, ni la destruction. |
| `opacite` | `0.84` | Intensité du noircissement, de `0` (invisible) à `1` (très opaque), avec un léger grain. |
| `douceurBord` | `0.5` | Proportion du rayon consacrée au fondu, de `0` (bord net) à `1` (fondu depuis le centre). |

Ces réglages ne changent pas le nombre de polygones. Enregistrer puis recharger le jeu. Les clés absentes reprennent leur valeur par défaut.

**`highwind.bombes.terre`** habille le cratère de terre brune et de petits graviers, avec des bords plus clairs et un centre brûlé. L'éclairage suit les pentes ; le motif reste fixé au sol quand la caméra bouge. La terre couvre le rayon du cratère, indépendamment de la taille du noircissement.

| Clé | Défaut | Effet |
| --- | --- | --- |
| `opacite` | `1` | De `0` à `1`. `1` masque la photo aérienne dans le creux ; `0` retrouve les traces noires seules. Pour tout masquer, mettre aussi `noircissement.opacite` à `0`. |
| `tailleMotifMetres` | `12` | Taille de répétition du motif en mètres, strictement positive. Plus petit = grain plus fin ; plus grand = mottes plus grosses. |

La terre et le noir utilisent le même dessin de 800 triangles par trace visible, comme auparavant. Une seule texture de 128 × 128 pixels est générée puis partagée entre les impacts, avec ses versions réduites pour éviter le scintillement à distance : environ **85 Kio** au total. Aucun rocher 3D, particule persistante ou plafond d'impacts n'est ajouté. Les surfaces d'eau protégées ne reçoivent ni terre ni noircissement.

Les plans d’eau et le littoral connus ne se creusent pas. Une bande de berge de **12 m** est également protégée, puis le creusement revient progressivement sur 8 m. Cette marge évite qu’un grand triangle tire le bord de l’eau vers le fond du cratère. La précision dépend des contours cartographiques ; les cours d’eau présents seulement sous forme de ligne utilisent une largeur approximative. Les cours d’eau souterrains ne protègent pas le sol de la ville.

### Limites des bombes : affichage, effets et son

Toutes ces valeurs se trouvent dans **`highwind.bombes.limites`**. Elles conservent les valeurs utilisées jusqu'ici, mais sont désormais modifiables. Pour chaque clé : **`-1` = sans plafond logiciel**, **`0` = désactivé**, sinon un entier positif.

Pour l’Orca, modifier **`orca.missiles.explosion.limites`** : les modèles utilisent `missilesVisiblesOrdinateur` et `missilesVisiblesMobile`, et les autres plafonds conservent les noms ci-dessous. Les anciennes clés `bombesVisibles…` restent compatibles. Le plafond de particules ne masque pas les modèles ; il réserve d’abord les flammes de propulsion et les effets récents, puis réduit la fumée persistante. Les réglages du Hautvent n’agissent pas sur l’Orca.

| Clé | Valeur initiale | Effet exact du plafond |
|---|---:|---|
| `bombesVisiblesOrdinateur` | 32 | Seuls les modèles et traînées des bombes les plus récentes sont affichés. Les autres continuent leur chute et causent leurs dégâts. |
| `bombesVisiblesMobile` | 16 | Même règle pour un appareil tactile. |
| `explosionsSimultanees` | 3 | Une nouvelle explosion retire les effets visuels de la plus ancienne si le plafond est atteint. Ses dégâts restent appliqués ; les sons ont leur propre plafond. |
| `particulesVisibles` | 800 | Nombre total de sprites affichés pour feu, fumée, étincelles, projections, ondes et traînées. Au-delà, une partie des effets n'est pas dessinée. Avec `-1`, le tampon grandit au besoin, sans ancienne limite cachée à 800. |
| `eclairagesSimultanes` | 1 | Nombre d'explosions récentes éclairant réellement le sol et les bâtiments, parmi les explosions visuelles conservées. |
| `sonsSimultanes` | 8 | Coupe le plus ancien son d'explosion pour laisser place au nouveau. `0` rend les explosions muettes. |
| `sonsEnAttente` | 128 | Sons attendant le délai de propagation ou le chargement du fichier. Au-delà, le plus ancien son en attente est abandonné. `0` supprime cette attente, pas les sons immédiatement prêts. |

L'éclairage utilise maintenant une texture de taille variable : il n'est plus bloqué à une seule explosion. Une limite matérielle de texture dépassée produit une erreur explicite, au lieu de réduire silencieusement la valeur demandée.

### Détail des particules

**`highwind.bombes.particules`** règle la quantité produite par chaque explosion ou traînée, avant le plafond total ci-dessus. Entiers positifs ou nuls ; ici `0` désactive la catégorie et `-1` n'est pas valable puisqu'il s'agit d'une quantité à produire.

| Clé | Valeur initiale |
|---|---:|
| `groupesFumeeOrdinateur` | 24 |
| `groupesFumeeMobile` | 14 |
| `etincellesOrdinateur` | 54 |
| `etincellesMobile` | 28 |
| `particulesParTrainee` | 5 |

Un groupe produit fumée et poussière, plus une boule de feu au début de l'animation. Une projection sombre accompagne une étincelle sur quatre. Le budget `particulesVisibles` peut donc être atteint avant la fin de ces quantités.

Pour l’Orca, ces réglages se trouvent dans **`orca.missiles.explosion.particules`**. `particulesParTrainee` réserve ce nombre de points de fumée récents par missile avant de remplir le budget avec les anciennes traces ; `0` désactive la fumée des traînées. Le bloc **`orca.missiles.trainee`** règle leur durée, leur espacement, leur taille et le nombre de points conservés. Les flammes de propulsion restent prioritaires même quand le plafond de particules est atteint.

### Cadence du maintien et simulation

Dans **`highwind.bombes.simulation`** :

- `largagesParImageSansRecharge` : **1** par défaut, entier supérieur ou égal à 1. Avec une recharge à zéro, nombre de largages automatiques autorisés par image tant que B ou le bouton est maintenu. La cadence dépend alors aussi du nombre d'images par seconde. Avec une recharge positive, c'est le délai normal qui s'applique.
- `rattrapageMaximumSecondes` : **0.1** par défaut. Après une image lente, la simulation des bombes n'avance que de ce temps au maximum : le reste du retard est abandonné, ce qui ralentit chute, effets et recharge par rapport au temps réel. `-1` traite toute la durée écoulée ; sinon utiliser un nombre strictement positif.

Audit des autres comportements : pas de plafond global au nombre de bombes physiques en vol, aux impacts, aux bâtiments détruits ou aux traces de la partie. L'animation et le fichier sonore durent 8 secondes, comme demandé précédemment ; le son ne boucle pas. La lumière s'éteint en 1,5 seconde et les phases de feu/étincelles finissent avant la fumée. La préférence système « réduire les animations » supprime le flash et le tremblement. Le brouillard et le rayon de chargement du sol peuvent masquer les effets éloignés ; leurs réglages sont déjà à la racine de ce même JSON. Les dégâts restent présents jusqu'au redémarrage.

Les vitesses des hélices du Highwind se règlent dans `highwind.vitessesHelicesToursParSeconde` :

| Clé | Hélices concernées | Valeur initiale |
| --- | --- | --- |
| `PropL` | Hélice latérale gauche | 0.5 tour/s |
| `PropR` | Hélice latérale droite | 0.5 tour/s |
| `PropRear` | Première hélice sur l'axe central | 0.25 tour/s |
| `PropTail` | Les trois hélices de queue, réunies sur un pivot commun | 2 tours/s |

`0` arrête le groupe concerné. Les décimales sont acceptées ; les nombres négatifs et les clés inconnues sont refusés. Les quatre vitesses doivent être présentes dans ce bloc. Les trois hélices de queue tournent ensemble à la même vitesse. Les sens de rotation et les pivots appartiennent au modèle ; aucune vitesse n'est stockée dans son descripteur. Recharger le jeu après avoir enregistré le JSON.


Le réglage `inertie`, indépendant dans `highwind` et `orca`, multiplie les durées de démarrage, de freinage, de changement de direction et de transition avec Maj. `1` conserve le comportement précédent, `0.2` divise ces durées par cinq, `0` rend ces transitions immédiates et une valeur supérieure à `1` augmente l’inertie. La valeur doit être un nombre positif ou nul ; si elle manque, elle vaut `1`. Les vitesses maximales restent les mêmes. Le Hautvent utilise `1` ; l’Orca utilise `0.2`, soit 0,10 s de démarrage et 0,16 s de freinage avec ses durées de base actuelles. Les filtres de caméra et les armes sont indépendants de ce réglage.


`vitesseMonteeKmh` et `vitesseDescenteKmh` sont réglables séparément dans `highwind` et `orca`, en km/h. Les valeurs initiales sont 150/150 pour le Hautvent et 45/45 pour l’Orca : elles reprennent la vitesse verticale précédente sans Maj. Ces valeurs sont indépendantes de la vitesse horizontale et restent identiques avec Maj ou sur mobile. `0` désactive le déplacement dans le sens concerné. Les commandes combinées restent normalisées, et les sous-pas de collision tiennent compte de la vitesse verticale configurée. Si une clé manque dans un ancien JSON, ce sens conserve la moitié de la vitesse horizontale courante. L’Orca ne prend plus de tangage à cause de la montée ou de la descente seules ; il garde son tangage lié à l’avance/recul et son roulis de déplacement latéral. Le Hautvent garde son inclinaison verticale existante. Vérification : `node scripts/check-ship-vertical-flight.mjs`.
