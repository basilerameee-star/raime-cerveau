# Vérification du 11 octobre 2026

Base examinée : `a0d495c4bc7a3e9c204e54c9c3b9d89527539429`.
Inventaire du dépôt entier ; contrôle local de 176 fichiers JavaScript, 37 Python, 19 scripts shell et 19 JSON
appartenant au périmètre récupéré. Aucune erreur de syntaxe constatée. Les imports vers les fichiers vendor de
l'interface ont été vérifiés dans l'arbre distant ; les imports avec paramètres et le fallback volontaire de
`tools/preuve.js` ne sont pas des défauts. Ce contrôle ne constitue pas une revue sémantique de chaque ligne ni
des centaines de compétences tierces.

## Défauts reproduits sur l'ancien code

| Cas injecté | Avant | Après |
|---|---|---|
| Reprise avec un brouillon, sans compte rendu | Ordre déclaré terminé | Interruption visible, fichiers conservés |
| Agent sans passage enregistré | « aucune panne », aucune alerte | Alerte « aucun passage enregistré » |
| Une base de test et une base nommée `production` | Appel du client SQL autorisé | Refus avant le premier appel SQL |

Les deux premiers comportements ont été rejoués à partir des sources anciennes et corrigées ; le client SQL
est un témoin qui s'arrête avant toute opération réelle. Le script de test vérifie désormais chaque nom de base
séparément et exige deux noms distincts. Le workflow Livraison échoue désormais si la porte ne répond pas,
au lieu de terminer en vert sans envoi.

## Première boucle autonome

Directeur → besoin mesuré → Hermes → MCP → issue candidate → sandbox → promotion → Livraison.
Surface unique : une expression arithmétique de classement. Elle est interprétée par un parseur fermé, sans
`eval`, imports, accès réseau, fichiers, secrets ou installation. Les refus de l'installeur restent en amont.
Les tests et le contrôleur ne font pas partie des fichiers qu'elle peut modifier.

Le banc de classement initial réussit 5/6 cas figés ; une expression candidate témoin réussit 6/6 sans perdre
les cas déjà réussis. Ce chiffre mesure ces six classements, pas un bénéfice commercial ou une correction de
toutes les pannes. Les autres modules restent hors de cette surface automatique.

Vérifications locales : sept tests de garde-fous passent ; les 18 tests Python de la porte et de l'Envoyeur passent.
La CI exécute le banc Postgres complet et un essai réel du conteneur avec réseau Docker interne, données jetables,
aucun secret de production, racine en lecture seule, capacités retirées et limites de temps/mémoire/processus.
Son résultat et le résultat de Livraison doivent être lus dans Actions avant d'annoncer ces étapes comme réalisées.
