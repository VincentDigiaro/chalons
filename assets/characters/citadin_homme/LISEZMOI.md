# Adrien — citadin contemporain

Homme adulte de 1,80 m, chemise bleue, jean, baskets blanches et cheveux courts.
Personnage assemblé et personnalisé dans Blender 5.2 à partir de la base humaine
et des ressources système MakeHuman sous CC0.

## Fichiers

- **Citadin_Homme.blend** : scène modifiable, squelette, animations et textures incorporées.
- **Citadin_Homme.glb** : personnage pour le jeu, textures et animations incorporées ; sans le studio.
- **Citadin_Homme.fbx** : export alternatif avec squelette, animations et textures incorporées.
- **textures/** : copies PNG des dix textures, jusqu'à 2048 × 2048 pixels.
- **apercu.png** : rendu du personnage dans Blender.
- **controle_articulations.png**, **controle_marche.png** : poses de contrôle.
- **controle_export_glb.png** : rendu après réimportation du véritable GLB.
- **validation.json**, **validation_export.json** : résultats des contrôles.

## Articulations et animations

53 os : racine, bassin, colonne, cou, tête, clavicules, bras, avant-bras,
poignets, trois phalanges par doigt, cuisses, genoux, chevilles et avant-pieds.
Les os du corps emploient les noms `mixamorig:` ; le retargeting vers un autre
squelette demande d'ajuster sa pose de référence. Le personnage est lié en pose A.
La racine `Root` permet de déplacer l'ensemble du personnage.

Dans Blender, sélectionner `Adrien_Rig`, passer en **Pose Mode**, puis sélectionner
un os et le tourner avec **R**. **Alt+R** annule sa rotation de pose.
Pour créer une pose libre, retirer d'abord l'action active dans le **Dope Sheet >
Action Editor** afin que la lecture de l'animation ne remplace pas les réglages.

Trois actions à 30 images/seconde sont fournies :

| Action | Durée | Usage |
| --- | --- | --- |
| Idle | 4 s | Attente avec léger mouvement de respiration |
| Walk | 1,067 s | Cycle de marche sur place |
| Wave | 2,667 s | Geste de salut |

Ce sont des animations de base modifiables, créées pour ce personnage. La marche
doit être synchronisée avec la vitesse de déplacement du contrôleur dans le jeu.
Le squelette s'anime par rotation des os (FK). Pas de contrôleurs IK, de simulation
musculaire, de ragdoll physique, ni de rig facial ou de synchronisation labiale.

## Caractéristiques de l'export

- 46 880 triangles, 9 maillages, 9 matériaux.
- 4 influences d'os au maximum par sommet, poids normalisés.
- UV présents ; textures couleur, transparence des cheveux et normal map des vêtements.
- Matériaux Principled/PBR avec rugosité réglée par matériau.
- GLB en mètres, axe vertical Y ; source Blender avec axe vertical Z.
- Textures, squelette et trois animations vérifiés après export/réimport GLB.
- Le fichier Blender s'ouvre sans avoir à installer MakeHuman ou MPFB.

L'export est un modèle individuel détaillé. Pour afficher une foule, prévoir des
niveaux de détail et vérifier le budget de rendu. Il n'est pas encore placé dans la ville.

## Provenance et licence

Les maillages, morphologies et textures sources sont issus de MakeHuman Community / MPFB.
Les ressources système utilisées sont explicitement sous **CC0 1.0 Universal**.

- Base, morphologies et squelette : https://github.com/makehumancommunity/mpfb2
- Ressources : https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- Licence des ressources : https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.ASSETS.md
- Licence CC0 : https://creativecommons.org/publicdomain/zero/1.0/

Ressources utilisées : young_caucasian_male, low-poly eyes / brown_eye, eyebrow007,
eyelashes01, teeth_base, tongue01, short02, male_casualsuit01 et shoes05.
L'assemblage, les paramètres de morphologie, le réglage des matériaux et les animations
ont été réalisés pour ce projet. L'extension MPFB est un outil distinct sous GPL ; elle
n'est pas nécessaire pour utiliser ces fichiers de personnage.

Les scripts de génération sont dans `scripts/build-citadin.py`, `finish-citadin.py`,
`export-citadin.py` et `verify-citadin.py` à la racine du projet. Les sources téléchargées
et le fichier de travail intermédiaire se trouvent dans `.cache/character-build/`.
