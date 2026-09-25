# rAIme — le cerveau

Le cerveau de rAIme est une petite firme logicielle qui tourne seule sur un serveur : elle mesure, elle juge, elle écrit, elle range ce qu'elle apprend, et elle propose chaque jour une amélioration d'elle-même.

Ce dépôt porte le code, les compétences et la Constitution. Les données de travail — prospection, dossiers clients, bibliothèque — restent privées.

## Le principe

> Un **fait** s'applique seul. Un **jugement** passe par la mesure. Ce qui ne se mesure pas ne se promeut jamais.

Cette phrase gouverne tout le reste : le choix des modèles, la réécriture des consignes, l'entrée d'une nouveauté en production.

## Comment il vit

- **Une boucle permanente** (`agents/boucle.js`) réveille chaque agent à son rythme, survit aux redémarrages et garde la trace de chaque passage.
- **Un journal** : acteur, changement, motif. Une décision sans motif écrit n'existe pas.
- **Une autonomie bornée** : le cerveau prépare, chiffre et propose ; ce qui sort vers le monde ou touche à l'argent attend une main humaine.

## Les agents

| Agent | Ce qu'il fait |
|---|---|
| `boucle` | le cœur battant : les rythmes, la survie, la trace |
| `instruments` · `superviseur` | relève les chiffres, lit l'écart entre le prévu et le réel |
| `metrologue` | rejoue une batterie de tâches figées et mesure coût, durée, qualité — **notée par du code**, jamais par un modèle juge |
| `chasseur` | prend les modèles candidats, les passe à la batterie, puis rouvre la porte |
| `sas` | la porte : promeut seulement ce qui est mesuré et moins cher |
| `reflexif` | mesure les agents, désigne le maillon faible, propose une consigne meilleure — créée **inactive** |
| `contradicteur` | cherche ce qui casse avant que la réalité s'en charge |
| `bibliothecaire` | la mémoire longue : range les textes, les retrouve en français, sans appeler personne |
| `auditeur` · `analyste` · `redacteur` | le métier : corréler, expliquer, écrire |
| `cordon` · `garde_audit` | les garde-fous de ce qui part vers l'extérieur |
| `architecte` | l'agent réflexif : buts, croyances, cycle complet ; cherche ses solutions (`rechercheur`) et ouvre des chantiers |
| `encyclopediste` | le savoir général, depuis Wikipédia en français |
| `chiffres_ia` | le répertoire des chiffres officiels (Insee, Eurostat) sur l'usage de l'IA par les entreprises : phrase exacte, source et lien figés pour ne jamais citer un pourcentage de mémoire |
| `publiciste` | neuf brouillons de publication par semaine — jamais publiés par lui |
| `portes` | cartographie les CCI et organismes de formation, pèse chaque porte, présente un lot à Basile |

L'**atelier** (`atelier/`) fait d'une phrase un service vendable à `<nom>.raime.fr`.

## La souveraineté, en quatre couches

| Couche | Aujourd'hui | Porte de sortie |
|---|---|---|
| Machine | un serveur à 16 €/mois | `docker compose` + sauvegarde chiffrée : remontable ailleurs |
| Données | Postgres | sauvegarde quotidienne vers un autre fournisseur |
| Orchestration | n8n auto-hébergé | flux exportés en JSON chaque nuit |
| Intelligence | routage par tâche | le choix du modèle tient dans une table ; la batterie tranche |

## Les compétences (`plugin-cerveau/`)

Un plugin de compétences décrit la maison à qui veut l'aider : la carte du cerveau, comment ajouter un agent, la souveraineté, l'offre, l'argent, l'identité, la bibliothèque, l'évolution. La **Constitution** prime sur toute amélioration automatique.

## Tester, livrer, revenir en arrière

`npm test` fait tourner le banc d'essai (bases fictives, modèle factice, réseau coupé) ; la CI le rejoue sur chaque
pull request. Chaque fusion sur `main` part en ligne par la porte de déploiement, qui revient seule en arrière si la
vérification échoue. Détails : [`ARCHITECTURE.md`](ARCHITECTURE.md) et [`RUNBOOK.md`](RUNBOOK.md).

## Ce que ce dépôt ne contient jamais

Clés, mots de passe, listes de prospection, données nominatives, dossiers clients. Ces fichiers vivent sur le serveur et sur le disque de la maison.

---

rAIme · conseil en intelligence artificielle · [raime.fr](https://raime.fr)
