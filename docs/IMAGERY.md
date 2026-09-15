# Conservation des photographies IGN

Le jeu (carte et mode FPS) charge des **paquets de 4 × 4 tuiles** par défaut.
Un paquet représente une seule requête HTTP, partagée entre toutes ses tuiles.
Les bâtiments continuent d'utiliser leur propre transport de géométrie.

- Les JPEG déjà enregistrés sont incorporés tels quels, sans recompression.
- Pour les tuiles manquantes d'un paquet, le serveur demande **une image WMS
  IGN** couvrant le rectangle entier, à la résolution de chaque tuile : 1024 ×
  1024 pixels pour 4 × 4 tuiles de 256 pixels. Ce n'est pas une série de requêtes
  WMTS cachée derrière un appel au serveur.
- Le JPEG IGN est enregistré sans modification dans
  `dist/data/imagery/ign/mosaics/v1/{cote}/{z}/{x}/{y}.jpg`.
- Le paquet est enregistré complètement dans
  `dist/data/imagery/ign/packs/v1/{cote}/{z}/{x}/{y}.bin` avant livraison.
  Il contient ses images et l'index des découpes. Le navigateur décode chaque
  image une fois et découpe les tuiles sans réencodage. MapLibre et le FPS
  reçoivent chacun les bitmaps de 256 × 256 pixels attendus.
- Les fichiers sur disque n'expirent pas. Un redémarrage ou une panne IGN
  ne supprime pas les paquets acquis. Nginx les sert directement.
- Les annulations de tuiles sont indépendantes : annuler une tuile ne coupe
  pas le téléchargement utilisé par une autre. Même après déconnexion du
  navigateur, le serveur termine et enregistre l'acquisition commencée.
- Une zone jamais acquise dépend encore d'IGN. Le sol provisoire reste visible
  pendant l'attente. Les limites de rayon et la programmation des textures
  du FPS restent celles du jeu.

## Configuration des paquets

Modifier `imagery-config.json` à la racine. Le serveur le relit pour les
nouvelles demandes ; recharger la page pour actualiser le navigateur.

| Champ | Effet |
| --- | --- |
| `tuilesParCotePaquet` | Côté du paquet : 4 donne 16 tuiles ; 2 en donne 4. |
| `cachePaquetsNavigateurOctets` | Mémoire des paquets et images décodées, hors textures GPU ; 0 désactive ce cache. |
| `delaiRequeteNavigateurMs` | Délai du téléchargement d'un paquet côté navigateur. |
| `chargementsPaquetsIGNSimultanes` | Nombre d'acquisitions WMS simultanées sur le serveur. |
| `intervalleRequetesIGNMs` | Espacement entre deux départs de requêtes WMS. |
| `delaiRequeteIGNMs` | Délai de chaque tentative IGN. |
| `nouvellesTentativesIGN` | Nombre de nouvelles tentatives après la première. |
| `delaiNouvelleTentativeIGNMs` | Attente initiale entre tentatives, doublée à chaque échec. |
| `delaiApresEchecIGNMs` | Attente avant de relancer un paquet ayant épuisé ses tentatives. |
| `paquetsIGNEnAttenteMax` | Nombre de paquets dans la file d'acquisition IGN. |
| `octetsMaxImageIGN` | Taille maximale admise pour une réponse IGN. |

Changer le côté crée une autre famille de paquets, sans supprimer les anciens.
Les requêtes incluent leur côté ; une page déjà ouverte reste compatible.
Le maximum de 19 tuiles par côté vient de la capacité IGN annoncée de 5010 pixels
par image (19 × 256 = 4864), pas d'un réglage de performances inventé.
Le transport Nginx existant coupe une acquisition sans réponse après 75 secondes ;
augmenter le délai navigateur au-delà nécessite aussi d'ajuster ce timeout Nginx.

Les images WMS peuvent présenter de petites différences d'encodage JPEG par
rapport aux fichiers WMTS. Le découpage ne change ni les coordonnées ni la
résolution, et n'ajoute aucune recompression. Les anciens JPEG restent identiques.

La route individuelle `data/imagery/ign/{z}/{x}/{y}.jpg` reste compatible avec
les anciens clients et les outils d'acquisition WMTS. Le jeu utilise les paquets.

## Développement local

`npm run dev` assure déjà la lecture et l’acquisition sur disque.
`npm run imagery:cache` précharge la couverture définie par le script ; ce n’est
pas un inventaire de tous les téléchargements effectués ensuite.

## Serveur Nginx existant

Le dossier de référence est `dist/data/imagery/ign/` dans le projet. Il est
indépendant de la copie publiée dans `C:/nginx/html/chalons/`.
Ne pas le supprimer lors d’une publication ou d’un nettoyage des ressources.

La configuration `scripts/nginx-imagery.conf` sert ce dossier directement.
Seuls les fichiers absents passent au service Node sur `127.0.0.1:5174`.
Le service n’expose que les routes des images IGN, avec les limites géographiques
du projet. Les fichiers enregistrés restent accessibles même si ce service est
arrêté. Pour acquérir de nouvelles images, il doit être en marche.

La tâche Windows `ChalonsImageryCache`, déclenchée à l’ouverture de session,
lance `artifacts/imagery-service/runtime/ChalonsImageryCache.exe`. Cet exécutable
est compilé à partir de `scripts/windows/ChalonsImageryCache.cs` avec le
compilateur .NET déjà présent dans Windows (`scripts/build-imagery-launcher.ps1`).
Il démarre Node avec `UseShellExecute=false` et `CreateNoWindow=true` : aucune
console n’est créée, même lorsque Windows Terminal est le terminal par défaut.
Il attend la sortie de Node et transmet son code à la tâche Windows pour la
reprise sur échec. Un objet Job Windows arrête aussi Node si le lanceur est
terminé, afin de ne pas laisser une instance sans supervision.
Ses journaux restent dans `artifacts/imagery-service/`.

`scripts/check-imagery-launcher.ps1` vérifie l’absence de console dans le processus
enfant, les sorties standard/erreur, les codes de sortie, un lancement en échec
et l’arrêt du processus enfant avec le lanceur, sur une instance isolée.
`scripts/install-imagery-launcher.ps1` sauvegarde la tâche existante, remplace
uniquement son action et vérifie sa réponse HTTP ; il conserve le compte,
le déclencheur et la politique de reprise. L’ancien lanceur PowerShell
`scripts/run-imagery-service.ps1` reste disponible pour les tests/manipulations
manuels, mais n’est plus l’action de démarrage automatique.

### Journaux du service

- `events.jsonl` : démarrage, adresse d’écoute, acquisitions IGN (tuile, durée,
  numéro de tentative), images enregistrées, erreurs réseau/HTTP/disque avec
  leur cause, déconnexions du navigateur, arrêts et exceptions fatales.
- Une ligne `service_alive` chaque minute indique que la boucle du service
  fonctionne, avec les téléchargements, lectures locales et demandes en attente.
- `supervisor.jsonl` : lancement du programme par la tâche Windows, PID du
  processus, échecs de démarrage et code de sortie lorsque le programme se termine.
- Un couple `*.stdout.log` / `*.stderr.log` par lancement conserve aussi les
  sorties brutes de Node, y compris les erreurs avant l’initialisation du journal.

Chaque ligne JSON porte une date UTC, un niveau (`info`, `warn`, `error`, `fatal`)
et un nom d’événement. Le journal Node est écrit et vidé vers le disque à chaque
événement. À 5 Mio, `events.jsonl` est archivé ; cinq archives sont conservées.
Cette rotation ne touche jamais aux images. Les anciens `stdout.log` et
`stderr.log` sont conservés.

Une fermeture forcée de tout le processus ou une coupure de courant peut empêcher
l’écriture d’une ligne d’arrêt : la dernière ligne `service_alive` reste le
repère. Ces journaux n’envoient pas d’alerte automatique et ne constituent pas
une surveillance externe. Les lectures d’images faites directement par Nginx
restent dans les journaux Nginx, pas dans ceux du service d’acquisition.

Un hébergement purement statique ne peut pas enregistrer les nouvelles images.
Il peut seulement servir les originaux déjà copiés. La présence de `saved.json`
ou un succès de téléchargement dans le navigateur ne prouve pas leur conservation.

## Vérification

`npm run check:imagery` vérifie la conservation avant livraison, les demandes
simultanées, un redémarrage avec IGN indisponible, les erreurs et annulations,
et l’absence de requêtes IGN directes dans le navigateur.

### Tests du transport groupé

`npm run check:imagery-packs` vérifie de vrais échanges HTTP locaux, le découpage
pixel par pixel, les JPEG existants, les redémarrages hors ligne, les annulations,
la libération des bitmaps et l'utilisation des réglages JSON.

`node scripts/check-imagery-packs-http.mjs` mesure une acquisition IGN réelle
dans un cache de test vide, puis sa lecture hors ligne.
`node scripts/check-imagery-packs-http.mjs --public` vérifie les requêtes HTTPS
du site publié. Ces mesures ne sont pas un test de FPS sur téléphone.
