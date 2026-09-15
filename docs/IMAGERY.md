# Conservation des photographies IGN

Le navigateur demande uniquement `data/imagery/ign/{z}/{x}/{y}.jpg` au serveur
du jeu. Il ne télécharge plus de photo directement depuis l’IGN.

- Un original déjà présent est lu immédiatement sur disque.
- Un original absent est acquis une fois par le serveur Node, validé, enregistré
  complètement, puis renvoyé. Les demandes simultanées sont regroupées.
- Aucun original n’expire et aucune éviction automatique n’est prévue.
- Une interruption de navigation ne supprime pas une acquisition en cours côté
  serveur. Une panne IGN ne supprime pas les fichiers déjà enregistrés.
- Les secteurs jamais acquis restent dépendants de l’IGN. Le sol provisoire est
  affiché pendant l’attente et les nouvelles tentatives.

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

`scripts/run-imagery-service.ps1` lance le service sans fenêtre, via une tâche
Windows configurée à l’ouverture de session et avec reprise sur échec.
Ses journaux sont dans `artifacts/imagery-service/`.

Un hébergement purement statique ne peut pas enregistrer les nouvelles images.
Il peut seulement servir les originaux déjà copiés. La présence de `saved.json`
ou un succès de téléchargement dans le navigateur ne prouve pas leur conservation.

## Vérification

`npm run check:imagery` vérifie la conservation avant livraison, les demandes
simultanées, un redémarrage avec IGN indisponible, les erreurs et annulations,
et l’absence de requêtes IGN directes dans le navigateur.
