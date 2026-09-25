# Répertoire des chiffres officiels IA (chiffres_ia)

## Ce qui change
L'agent `agents/chiffres_ia.js` centralise les chiffres officiels — Insee puis Eurostat —
sur l'usage de l'intelligence artificielle par les entreprises. Règle du cerveau : un
pourcentage d'adoption ne se cite jamais de mémoire ; il se tire de ce répertoire, où
chaque entrée figure avec sa phrase exacte, son millésime de données, sa source,
sa collection, sa date de parution et son lien, et avec ses déclinaisons par taille
et par secteur. `verifierIntegrite()` écarte toute entrée tronquée (champ vide, lien
non officiel, part hors bornes). Le chiffre le plus récent porte sur les données 2025
(Insee Première n° 2120, paru le 21/07/2026) : 18 % des entreprises de 10 salariés
ou plus, contre 6 % en 2023 et 10 % en 2024.

## Cas figés
`tests/cas_figes_chiffres_ia.mjs` verrouille : le chiffre le plus récent (2025, Insee,
18 %, avec sa phrase exacte et son lien), l'intégrité de tout le répertoire,
la série Insee 2023→2025 (6 / 10 / 18, strictement croissante), les déclinaisons par
taille du millésime le plus récent, et la fonction `citer()` qui joint phrase et source.

## Résultat des tests (cerveau, cas figés exécutables)
```
cas figes chiffres_ia : 12/12 OK        (nouveau)
cas figes arbitrage   : 43/43 OK
cas figes atelier     : 18/18 OK
cas figes audit       : 22/22 OK
cas figes course      : 41/41 OK
cas figes econome     : 15/15 OK
cas figes essayeur    : 37/37 OK
cas figes gardien     : 16/16 OK
cas figes penseur     : 14/14 OK
cas figes priorite    : 14/14 OK
cas figes relecture   : 26/26 OK
cas figes score       : 36/36 OK
cas figes score v2    : 13/13 OK
```
Seul `cas_figes_heraut.mjs` ne tourne pas ici : il exige un PostgreSQL (connexion
ECONNREFUSED sur 5432), indisponible dans ce bac à sable — limite identique sur
l'original, non liée à ce changement. Le banc d'essai (`npm test`) suit la même
contrainte de base de données.

`node agents/chiffres_ia.js` imprime en direct le chiffre le plus récent et le
contrôle d'intégrité.