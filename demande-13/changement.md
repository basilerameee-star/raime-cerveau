# Le créateur d'images de l'atelier (visuels de publication)

## Ce qui change
Le cerveau apprend à fabriquer ses propres visuels de publication : un nouveau module
`atelier/images.js` transforme un texte de la maison en image PNG prête à publier,
pour Facebook (1080 × 1080) et Instagram (1080 × 1350). Aucun service payant : le
module dessine lui-même, en pur code, grâce à `@napi-rs/canvas` (le dessin libre de
Skia). Charte noire respectée : fond noir, texte blanc, le rose (#ff7eb0) pour les
seuls mots-clés (marqués « *mot* » ou donnés en liste), en mode jour fond #ededed et
rose #db4f8b, une seule police (Inter, `briques/charte/polices/InterVariable.woff2`),
un seul logo en deux encres (blanc sur fond noir, noir sur fond clair). Retenue :
trois tailles de titres (surtitre, titre, appui), la signature en pied. L'API expose
`composer()` (le plan, déterministe) et `rendrePng()` (les pixels), réunis par
`fabriquerVisuel()`, plus une ligne de commande.

## Cas figés
`tests/cas_figes_images.mjs` verrouille : les deux formats exacts (1080 × 1080 et
1080 × 1350), la charte (rose pour les seuls mots-clés, nuit et jour), la séparation
des « *mots* », le découpage des lignes sans débordement, la hiérarchie des trois
corps, la composition complète, et le rendu réel en PNG (signature PNG, pixels noirs
et roses en nuit, pixels #ededed et #db4f8b en jour). Il est ajouté à la chaîne de
déploiement (`deploy.sh`).

## Résultat des tests (cerveau, cas figés exécutables)
```
cas figes images : OK (formats, charte, mots-clés, rendu)
  rendu nuit : noir 1137766 px · blanc 10712 px · rose 6414 px
  rendu jour : fond #ededed 1130382 px · rose 3421 px
```

## Retour en arrière
`git revert` du commit ; le module et le test disparaissent, les visuels déjà produits
restent des fichiers PNG autonomes, rien d'autre ne dépend d'eux.