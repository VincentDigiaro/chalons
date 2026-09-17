# Rue Gérard-de-Nerval — méthode et reproduction

Le fond de l’impasse et sa boucle utilisent une reconstruction architecturale guidée par les 27 captures et leur vue aérienne. Les 35 volumes de cette zone ne portent aucune photographie de façade : les fenêtres, volets, encadrements, portes et garages sont de la géométrie, avec des ouvertures découpées dans les murs et un vitrage en retrait. Les 64 volumes déjà détaillés ailleurs dans la rue conservent leur modèle antérieur. Une chaussée simple couvre désormais les trois axes OSM de toute la rue Gérard-de-Nerval ; cette extension n’ajoute aucun détail architectural aux autres maisons.

La dernière maison (parties internes 112 et 115) reçoit des fenêtres hautes basculantes, une entrée vitrée en bois, les volets observés, une cheminée avec chapeau, un jardin avec muret, grillage et cheminement pavé. L’écran vert a été supprimé à la suite de la correction explicite de l’utilisateur. Les clichés 01 et 02 distinguent la maison située de l’autre côté du passage : elle correspond aux parties 119–121, avec un auvent ouvert en charpente, et non à la partie 117. Le passage suit l’axe OSM `way/119936729`, bordé d’une haie continue et de petites bornes. Les dimensions de ces détails restent estimées d’après les photos.

Ce n’est ni un relevé cadastral, ni une reconstruction photogrammétrique calibrée. Les emprises horizontales proviennent de l’extrait OSM du projet. Hauteurs, pentes, fenêtres, cheminées, plantations, clôtures et mobilier sont des estimations visuelles. Les panoramas de 2014 et 2022 ne constituent pas un état temporel unique. Les six volumes ajoutés autour de la boucle sont interprétés sur la vue aérienne ; les élévations non photographiées restent simples.

La vue supplémentaire fournie le 13 septembre précise l’arrière de la maison 42. `build-nerval-house42-rear.mjs` ajoute cinq ouvertures, deux fenêtres de toit, les gouttières arrière et les plantations. La correction annotée ultérieure prévaut sur l’interprétation de la photo : la fenêtre de l’aile basse est retirée, deux portes-fenêtres sont ajoutées sur le mur de la terrasse et la dernière annotation confirme une porte-fenêtre vitrée sur le pignon, à la place de la porte pleine. La petite fenêtre haute du pignon et la porte vitrée du retour de l’aile basse sont conservées. Le jardin comprend une pelouse centrale, des haies périphériques, deux persistants verticaux, un arbre de fond, des massifs et des cheminements pavés. Le contour du terrain et la terrasse restent interprétés, sans prétention cadastrale. Le module s’applique automatiquement lors de `nerval:build` ; les SHA-256 des références sont enregistrés dans `survey.supplementaryReferences`. La vue est accessible par `#nerval-rear` et dans les destinations de la carte.

Les repères numériques de `nerval-survey.py` sont des identifiants internes d’emprises, pas des numéros de rue. Les descriptions et correspondances restent indicatives. Seuls les numéros effectivement lisibles dans les captures sont présentés comme visibles. Les coordonnées des panoramas ne sont pas utilisées comme positions des maisons.

## Entrées

- Originaux en lecture seule : `C:/Users/cid77/Documents/ChatGPT/map2/captures-rue-gerard-de-nerval`.
- `dist/data/buildings.geojson` et `dist/data/lines.geojson` : extrait OSM existant.
- `nerval-survey.py` : observations, correspondances, quadrilatères et masques manuels.
- `nerval-footprints.json` : inventaire des emprises sélectionnées.

## Construction

1. `python scripts/inspect-nerval.py` produit l’inventaire et le plan de contrôle dans `artifacts/nerval`.
2. `node scripts/fetch-nerval-imagery.mjs` met en cache les 42 tuiles IGN z19 couvrant la rue. Aucun téléchargement en masse du territoire.
3. `python scripts/prepare-nerval.py` prépare les observations et les matériaux. Dans la zone sélectionnée, les tuiles du cliché 03 deviennent un matériau répétable ; les teintes d’enduit sont annotées. Le redressement des anciennes façades est conservé uniquement hors de cette zone. Les références réduites gardent leurs crédits. `python scripts/prepare-nerval-ground.py` encode les quatre nouveaux matériaux générés (enrobé, herbe, pavés hexagonaux, feuillage), décrits dans `artifacts/nerval/ground-texture-prompts.md`. Le feuillage généré remplace l’ancien échantillon photographique trop répétitif. Dépendances : NumPy et Pillow. Les captures originales ne sont pas retouchées.
4. `node scripts/build-nerval.mjs` génère le maillage en coordonnées locales est/nord/haut, les formes de toit découpées aux emprises OSM, 69 ouvertures architecturales avec leurs références, les bordures, la cour et son îlot planté. Le module `build-nerval-end-site.mjs` construit le jardin, le passage, la haie et l’auvent. La voirie utilise les axes OSM complets, jamais les positions des panoramas.
5. `node scripts/build-roofs.mjs` retire ces 99 volumes du maillage général de toitures, pour éviter deux surfaces superposées. Régénérer ensuite le catalogue avec `node scripts/build-facades.mjs` si les exclusions ont changé.
6. `node scripts/build-walk.mjs` synchronise les données dérivées du mode promenade.
7. `node scripts/check-nerval.mjs` puis `npm run check` contrôlent les données et la conservation des emprises.

Le modèle détaillé charge un atlas pour le reste de la rue, une mosaïque IGN et cinq matériaux répétables (toiture, feuillage et trois sols). Les textures utilisent des mipmaps et un filtrage anisotrope limité à 8 ; les références sont chargées seulement à l’ouverture du lecteur. Les images de sol représentent environ 2 mètres de côté. Le maillage utilise 44 octets par sommet, regroupés par matériau. La sélection teste les triangles du bâtiment, sans volume transparent pouvant masquer la scène.

`nerval-landscape.mjs` complète les haies frontales et les séparations de parcelle, le jardin d’angle de la partie 117 jusqu’au passage piéton, la séparation de l’accès au garage 112, les chemins et massifs, les boîtes aux lettres et l’arbre taillé visible dans les clichés. Les silhouettes de haies ont un sommet arrondi légèrement irrégulier. Les gouttières suivent un bord réel du bâtiment : elles ne traversent plus le vide créé par une emprise en L. Le shader de sol est partagé par les vues cartographique et piétonne, dans la zone du cul-de-sac à la boucle uniquement.

`build-nerval-house42.mjs` reprend précisément l’entrée visible sur les deux gros plans supplémentaires du 13 septembre. Le sas vitré se projette d’environ 1,18 m devant la partie à étage 115, sous un prolongement du toit bas 112. Il comprend un panneau fixe sur soubassement de briques à gauche, un retour vitré, une porte à droite avec imposte, poignée et seuil, les montants de bois et le dessous de toit. L’ancien panneau générique est supprimé. Les fenêtres du corps bas et la porte-fenêtre du corps haut sont repositionnées par rapport à cet ensemble. Les piliers ont des briques à joints décalés. Le tracé des pavés rejoint l’entrée par une courbe. Voir `artifacts/nerval/house42-notes.md`.

Après la reprise de l’arrière et sa correction annotée, le modèle compte 91 199 triangles (12,04 Mo). Le matériau de vitrage opaque à reflets doux est partagé par les deux moteurs : il évite les problèmes de tri de transparence sur mobile. Les volumes OSM restent identiques. Le petit prolongement de toiture et le sas, estimés sur les clichés et absents des emprises OSM, sont des détails ajoutés ; ils ne sont pas compris dans le contrôle de surface projetée des emprises principales.

## Limites à préserver

- Pas de prétention à une précision centimétrique ou à des hauteurs mesurées.
- Pas de détail inventé derrière les floutages ni de restauration de visages ou de plaques.
- Les éléments dont le bas est caché sont explicitement signalés comme interprétés dans les observations `openings`. Les façades non documentées restent simples ; aucun remplissage génératif de photographie.
- Les vues aériennes restantes peuvent inclure ombres et décalages de prise de vue.
- Des retraits de façades, murs mitoyens et petites annexes restent simplifiés ; les trottoirs et limites de jardin sont interprétés.
- Les originaux et leurs métadonnées restent dans le dossier fourni. Les SHA-256 dans `survey.json` permettent de les identifier.

Crédits : Google Street View / Google Maps pour les captures fournies (2014/2022) ; IGN BD ORTHO, Licence Ouverte 2.0 ; contributeurs OpenStreetMap, ODbL. Les quatre nouveaux albédo de sol et feuillage sont générés par IA : ils représentent des matériaux plausibles, pas un relevé photographique de chaque parcelle. Cette itération et la véranda de la maison 42 sont publiées sur https://digiaro.duckdns.org/chalons/ depuis le 13 septembre 2026, à la demande de l’utilisateur. Le manifeste, les sauvegardes des fichiers remplacés et les contrôles HTTPS sont dans `artifacts/nerval-publication-20260913/`.

## Vérification de cette version

Le contrôle Nerval valide 99 parties de bâtiments, 69 ouvertures modélisées et l’absence de photo plaquée dans les 35 volumes sélectionnés. Les 39 surfaces photographiques restantes sont hors de cette zone. La somme des surfaces de toiture projetées conserve les 5 627,066 m² d’emprises OSM sélectionnées ; ce contrôle garantit la cohérence du maillage avec OSM, pas une précision métrique sur le terrain. Un contrôle compare les 64 autres volumes et leurs observations au modèle précédent pour vérifier leur conservation. Les trois chaussées doivent conserver l’intégralité de leurs axes OSM.

Le contrôle visuel porte sur la zone d’ensemble, les deux côtés de l’impasse et la boucle, puis sur un affichage mobile de 390 × 844. Les photographies IGN du reste de l’atlas restent tributaires du service distant. Le lecteur conserve les sources de façade et la vue aérienne pour comparer les interprétations au matériau fourni.

## Affinage du cul-de-sac à la boucle, 13 septembre 2026

`build-nerval-refinements.mjs` applique les onze références supplémentaires de `nerval-refinement-references.json`, après la reconstruction de l’arrière de la maison 42. Les fichiers originaux et leurs SHA-256 sont conservés dans `artifacts/nerval/refinement-20260913/`. Les portes-fenêtres de cette maison suivent la dernière annotation : trois baies blanches à deux vantaux avec volets bois ; la porte dans le retour de l’aile basse est en bois plein.

La reprise ajoute notamment les deux garages à panneaux de la maison bleue et son aile d’entrée basse, les deux garages de la façade aux rails blancs, ses portes-fenêtres, les auvents à poteaux, les lanternes et les marches. Les deux maisons à l’est de la cour utilisent deux sections de toit de hauteurs différentes à l’intérieur de leurs emprises OSM. Les façades du fond auparavant aveugles reçoivent les ouvertures visibles sur la vue aérienne. Les jardins, les allées pavées à motifs, les bandes de gravier, les clôtures et le muret courbe sont des surfaces et des volumes 3D. L’îlot porte un massif taillé et un lampadaire à deux bras ; un panneau d’impasse, des antennes, une jardinière à étages et des grilles d’évacuation complètent les éléments visibles.

Les limites côté rue sont estimées à partir des axes OSM et d’une largeur de chaussée et de trottoir. Les limites courbes de la boucle sont décrites séparément pour éviter les clôtures diagonales entre parcelles. Le shader partagé affiche aussi les sols du nord de la cour et distingue le gravier clair de l’enrobé. Les photos servent de références, sans projection sur les façades sélectionnées. Aucun changement des 64 autres volumes ni du catalogue de toitures génériques.

Validation : `node scripts/check-nerval.mjs`, `node scripts/check-nerval-refinements.mjs`, vérification des paquets du mode promenade, puis contrôle visuel PC et format mobile. Le contrôle de circulation échantillonne 343 positions le long des trois axes détaillés. Les fichiers de livraison, sauvegardes et contrôles HTTPS se trouvent dans `artifacts/nerval-refinement-release/`.

## Sols vus en altitude, 14 septembre 2026

Les pelouses, pavés, graviers et chaussées comportaient des superpositions, parfois coplanaires ou séparées de quelques millimètres. La caméra FPS, dont le plan proche est à 6 cm, ne distingue plus systématiquement ces couches à distance : des bandes de la surface inférieure réapparaissent lors des déplacements.

`nerval-ground-surfaces.mjs`, appelé automatiquement par `build-nerval.mjs`, découpe les parties de sol cachées sous un autre sol. La découpe suit la surface la plus haute, y compris lorsque deux plans se croisent ; les surfaces coplanaires conservent la priorité de dessin existante. Elle concerne uniquement les matériaux de sol sous 25 cm. Les hauteurs, couleurs et UV sont interpolés sans déplacement des surfaces. Les murs, pierres, clôtures, plantations et jardins surélevés restent intacts.

Cette version retire 2 012,97 m² de superpositions et passe de 122 250 à 125 124 triangles (+2,35 %). Les matériaux et les 109 parties de bâtiments sont conservés. Le modèle cartographique et les paquets FPS sont régénérés ensemble avec `node scripts/build-nerval.mjs`, puis `node scripts/build-walk.mjs`.

`node scripts/check-nerval-ground.mjs` vérifie les recouvrements, les plans inclinés, les attributs interpolés et le maillage float32 final. Les contrôles de conservation et les comparaisons WebGL à 40, 60, 90, 150 et 250 m sont dans `artifacts/nerval-ground-depth-20260914/`. L'ancien contrôle `check-nerval-impasse-fixes.mjs` échoue déjà sur la sauvegarde antérieure pour une haie au point `[-106.5161425, -117.3055172]` ; cette correction des sols ne modifie pas cet obstacle.

## Relevé Google Earth du secteur sud, 17 septembre 2026

À la demande de l’utilisateur, les bâtiments dans le rectangle rouge de `artifacts/nerval-earth-2026-09-17T00-37-32-064Z/user-excluded-zone.png` sont exclus. Par prudence, tous les identifiants internes inférieurs ou égaux à 59 restent inchangés, y compris les volumes à cheval sur la limite. Ces identifiants sont ceux du plan, pas les numéros postaux.

Les vues Google Earth / Street View de juillet 2022 documentées dans `nerval-earth-survey.json` permettent de reprendre les volumes 62, 66, 69, 70, 72, 75, 82, 85, 88, 89, 91, 93 et 95 : 20 ouvertures avec embrasures, cadres et volets, 6 fenêtres de toit suivant les pentes, la cheminée extérieure du pignon 70 et deux porches ouverts devant les garages. Les enduits et les tuiles utilisent les matériaux existants du jeu. Les vues Google servent de références, sans nouvelle texture photographique Google dans le jeu.

Les dimensions sont estimées visuellement. Cinq châssis de toit sont visibles sur les nouvelles vues ; le quatrième de la maison 82 est conservé d’après la description du relevé antérieur, car l’arbre le masque sur la nouvelle vue. Les éléments cachés par les haies sont indiqués dans les observations. Les maisons floutées et les corrections précédentes de la boucle et de l’impasse restent intactes. Les emprises OSM, les hauteurs principales, les 144 ouvertures précédentes et les 518 objets documentés sont conservés.

Reconstruction : `node scripts/build-nerval.mjs`, puis `node scripts/build-walk.mjs --detail-only`. Le manifeste de téléchargement doit conserver les mêmes paquets génériques et recevoir l’empreinte SHA-256 du nouvel index FPS. Actualiser les versions `.gz` existantes des fichiers modifiés.

Validation : `node scripts/check-nerval-earth.mjs` compare le maillage réel et les matériaux à la sauvegarde, exige que chaque changement reste dans les seuls volumes autorisés, conserve les données antérieures et contrôle 885 points de chaussée. Les contrôles Nerval, sol, détails précédents, mobilier, boucle, accès et FPS passent. Les deux limites historiques des suites complètes sont conservées : haie de l’impasse déjà signalée ci-dessus et anciennes empreintes figées dans `check-walk-replacements.mjs`.

La sauvegarde vérifiée avant modification, les captures, le relevé KML, le manifeste des fichiers modifiés et le rapport de validation sont dans `artifacts/nerval-earth-2026-09-17T00-37-32-064Z/`. Les captures du nord éventuellement présentes dans ce dossier sont des observations abandonnées après la correction du périmètre par l’utilisateur ; aucun ajout correspondant n’est intégré à cette version.

## Relevé Street View du numéro postal 31 à l’impasse, 17 septembre 2026

Le nouveau périmètre est défini dans `nerval-streetview-survey.json`. Ne pas confondre le numéro postal 31 avec le volume interne 31, situé dans la zone rouge exclue : l’adresse 31 correspond aux volumes 91/93/95. Neuf vues Google Maps Street View ont été consultées et archivées avec leurs URL et dates. Les premières vues datent de juillet 2022 ; au fond de l’impasse, Google propose mai 2014. Les dimensions restent estimées.

`build-nerval-streetview.mjs` reconstruit la toiture perpendiculaire en L du n°33 sans changer son emprise, ses façades, son garage en retrait et son bouleau. Dix ouvertures sont ajoutées au total, trois finitions de menuiseries sont corrigées, quatre limites de propriété sont reprises (31, 33, paire 35/37, 47). Le portail générique qui barrait l’entrée du 47 est remplacé par l’accès ouvert observé ; son ancien volume d’auvent plein est ouvert pour révéler le garage. Le conifère du 31, des aérations et antennes complètent le relevé. Les 144 ouvertures antérieures et les corrections utilisateur de l’impasse sont conservées.

Reconstruction : `node scripts/build-nerval.mjs`, puis `node scripts/build-walk.mjs --detail-only` et `node scripts/finalize-nerval-streetview.mjs`. Le dernier script synchronise les copies gzip et l’index de téléchargement, sans reconstruire les paquets génériques. Le décompte des octets dans `build-walk.mjs` est calculé sur les paquets réellement réutilisés, pour rester correct après une interruption.

Validation de cette étape : `node scripts/check-nerval-streetview.mjs`, en complément des contrôles Nerval et FPS. Ce contrôle compare le maillage avec la sauvegarde immédiatement antérieure, protège le carré rouge et les autres bâtiments, vérifie les sources et les 885 points de chaussée. Le contrôle historique `check-nerval-earth.mjs` décrit la précédente étape Earth uniquement et son ancien périmètre de 13 volumes.

Sauvegarde SHA-256, captures avant/après, références, rapport et manifeste de restauration : `artifacts/nerval-streetview-31-impasse-2026-09-17T01-42-17-651Z/`. La publication reste effectuée par `npm run publish:code`, qui inclut les fichiers Nerval et leurs paquets FPS.

## Sols et jardins du 42, 17 septembre 2026

Les deux liens Google Earth fournis par l’utilisateur montrent la vue aérienne du 1er octobre 2023 et Street View de mai 2014. `nerval-house42-ground.mjs` remplace le chemin discontinu par une courbe de petits pavés rosés carrés, raccordée à l’entrée et à l’allée du garage. Le garage conserve ses pavés hexagonaux. Les bordures et le couvre-sol bas suivent le massif visible ; les pelouses latérales et arrière des voisins sont complétées. Les limites et dimensions sont estimées visuellement. Les corrections antérieures des bâtiments et clôtures restent intactes.

Les trous de pelouse venaient de grands triangles qui passaient sous le relief entre leurs sommets. Les surfaces de sol autour du 42 sont maintenant subdivisées à 1,25 m avant leur adaptation au terrain, dans les rendus carte et FPS. Le marqueur UV des pavés rosés utilise le matériau existant, avec un motif procédural partagé par les deux rendus. Les images Google restent des références visuelles.

Reconstruction : `node scripts/build-nerval.mjs`, puis `node scripts/build-walk.mjs --detail-only` et `node scripts/finalize-nerval-ground42.mjs`. Validation : `node scripts/check-nerval-house42-ground.mjs` protège tous les bâtiments, les objets antérieurs et les surfaces de rue, vérifie les raccords du chemin et mesure la hauteur des pelouses par rapport au relief réel.

Sauvegarde vérifiée avant modification, références et captures : `artifacts/nerval-ground42-2026-09-17T02-24-11-070Z/`. Le fichier `artifacts/nerval-ground42-current.txt` donne le dossier courant. `npm run publish:code` inclut le shader, le modèle et les paquets FPS corrigés.
