---
name: evolution
description: Comment le cerveau rAIme se construit tous les jours — cycle quotidien constat → proposition → essai → preuve, dépôt Git privé et modification de soi par pull request, ce qui se fusionne seul et ce qui attend Basile, mesure de la performance. À utiliser pour toute amélioration du cerveau, de ses agents, de ses consignes ou de sa base de connaissance.
---

# Se construire chaque jour

Un cerveau qui ne change jamais est un outil. Un cerveau qui change sans preuve est un danger. Entre les deux : un cycle court, tracé, réversible.

## Le cycle du jour

1. **Constat** — `instruments` relève les chiffres, `superviseur` lit l'écart entre ce qui était prévu et ce qui s'est produit.
2. **Proposition** — `reflexif` écrit une amélioration : quoi, pourquoi, ce qu'elle change, comment revenir en arrière.
3. **Contradiction** — `contradicteur` cherche ce qui casse. Une proposition sans objection examinée reste en attente.
4. **Essai** — la mesure d'abord : `sas` pour un modèle, un passage à blanc pour un agent, une cohorte pour un message.
5. **Preuve** — un chiffre avant, un chiffre après, la date. Sans chiffre, la proposition retourne en attente.
6. **Trace** — `journal` reçoit l'acteur, le changement, le motif.

## Le dépôt : le cerveau se modifie lui-même

Le code du cerveau vit dans un dépôt **Git privé**. Le cerveau y écrit comme un collaborateur :

- une branche par proposition, nommée `auto/<sujet>` (cerveau) ou `cloud/<sujet>` (session cloud) ;
- une pull request qui commence par « ## Pour Basile » (cinq lignes : ce qui change en ligne, ce qu'il pourra vendre, comment revenir en arrière) puis porte le constat, le changement, la preuve et le retour arrière ;
- le banc d'essai (`npm test`) juge dans la CI ; une pull request rouge ne se fusionne jamais ;
- la confirmation de Basile, puis la fusion.

**Se fusionne seul** (le cerveau décide) : notes de la base de connaissance, seeds de données publiques, corrections de prix venues du catalogue, documentation, ajout d'essais.

**Attend Basile** (toujours) : tout ce qui écrit vers l'extérieur, tout ce qui touche l'argent, un prix, un texte public, un secret, un fournisseur, et toute modification de `boucle.js`, de la Constitution ou de cette compétence.

Après fusion, la livraison est automatique : l'action « Livraison » envoie `main` par la porte de déploiement, qui vérifie et revient seule en arrière si la vérification échoue (`RUNBOOK.md`). Ce que le cerveau ne peut pas coder lui-même, il le demande par une issue `chantier` (compétence `architecte`).

## Mesurer la performance

Trois chiffres, relevés chaque semaine, visibles dans le rapport du matin :

- **avancement** : propositions livrées avec preuve ;
- **rendement** : coût des modèles rapporté au travail produit (plafond 16 €/mois) ;
- **vie** : agents sous rythme qui ont tourné dans les 48 heures, sur le total.

Une semaine sans preuve est un signal, pas un échec : elle se dit dans le rapport, avec ce qui a bloqué.

## Les limites qui tiennent le tout

La Constitution du cerveau (`CONSTITUTION.md` dans ce plugin) prime sur toute proposition. Une amélioration qui l'affaiblit se refuse, même si elle fait gagner du temps.

Compétences liées : `cerveau`, `agent`, `souverainete`, `argent`.
