---
name: architecte
description: L'agent réflexif du cerveau rAIme — son cycle (auto-observation, proposer, exécuter, évaluer, corriger, mémoriser, méta-réflexion, demander des informations), ses trois gardes, ses tables (buts, croyances, limites, états, demandes), et comment relire son carnet ou répondre à ses questions. À utiliser au début de chaque session sur rAIme, et dès qu'il s'agit d'objectifs, de croyances, d'autonomie ou de réflexivité du cerveau.
---

# L'architecte : l'agent qui tient le cap

Le cycle est celui que Basile a écrit le 23 septembre 2026. Le code vit dans `agents/architecte.js`.

## Le cycle

| Étape | Événement | Ce qui se passe |
|---|---|---|
| ① | (lecture) | buts ouverts, croyances et leur confiance, limites, leçons, questions en suspens, réponses de Basile |
| ② | `PROPOSER` | un but immédiat, sa pertinence pour le long terme, les incertitudes, 1 à 4 sous-tâches atomiques |
| ③ | `EXECUTER` | chaque sous-tâche, par le code, avec résultat et durée |
| ④ | `EVALUER` | écart entre l'attendu et l'obtenu, cause probable |
| ⑤ | `CORRIGER` | mise à jour d'état, refactoring à proposer, ou demande de données |
| ⑥ | `MEMORISER` | action, résultat, évaluation, correction, leçon |
| ⑦ | `METAFLECHIR` | révision des croyances ; un écart qui revient deux fois en sept jours désigne une croyance erronée |
| ⑧ | `DEMANDER_INFOS` | une question à Basile, posée sans bloquer le cycle |

## Les trois gardes, écrites dans le code

- **Souveraineté** : aucun argument, aucune note, aucune question ne transporte une clé ou un secret.
- **Faisabilité** : catalogue fermé de huit actions (`mesurer`, `chercher`, `examiner_consigne`, `ecrire_note`, `proposer_offre`, `rechercher_solution`, `ouvrir_chantier`, `rien`), quatre sous-tâches au plus, budget de 0,05 $ par cycle.
- **Éthique** : rien ne part vers un tiers ; une note sans source est refusée.

Les croyances qui portent le nom d'une limite de la Constitution (`argent`, `souverainete`, `ethique`, `autorite`, `depense`) ne se révisent pas en méta-réflexion. Un but se clôt sur la parole de Basile.

## Relire une journée de réflexion

```sql
SELECT cycle_id, rang, type, action, coalesce(resultat, correction, ecart) AS contenu
FROM etats WHERE cree_le > now() - interval '1 day' ORDER BY cree_le, rang;
```

## Les questions de l'architecte : à poser à Basile à chaque session

```sql
SELECT id, question, pourquoi, bloquant FROM demandes WHERE etat = 'ouverte' ORDER BY bloquant DESC, cree_le;
```

Les poser **en français simple**, une par une, sans jargon. Puis écrire la réponse :

```sql
UPDATE demandes SET etat = 'repondue', reponse = '…', close_le = now() WHERE id = … ;
```

L'architecte lit les réponses au cycle suivant et en tient compte.

## Lancer un cycle à la main

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '/opt/raime/raime-brain/run.sh "node agents/architecte.js"'
```

## Chercher une solution partout

`rechercher_solution {probleme}` (`agents/rechercheur.js`) interroge la bibliothèque, GitHub, Hacker News, arXiv et,
une fois installé, le moteur SearXNG du serveur (`RECHERCHE_URL`). Le code note chaque piste sur six critères :
sécurité (les refus de l'installeur), adéquation, fiabilité, licence, fraîcheur, coût. La meilleure part en
**quarantaine** (table `pistes`) ; elle n'est adoptée qu'après essai et mesure.

## Les chantiers : ce qu'il demande à la session cloud

Quand l'architecte constate un défaut qu'il ne peut pas corriger lui-même, `ouvrir_chantier` ouvre une issue
GitHub étiquetée `chantier` dans `raime-cerveau` : constat, **mesure chiffrée**, attendu et piste retenue (`agents/chantiers.js`).
Trois chantiers ouverts au plus, jamais deux fois le même, aucun secret. Le jeton `GITHUB_CHANTIER_TOKEN`
(droit « Issues : écriture » sur ce seul dépôt) vit dans le `.env` du serveur ; absent, rien ne part.

**À chaque session cloud, d'abord :** lire les issues `chantier` ouvertes, traiter la plus utile sur une branche
`cloud/<sujet>`, puis fermer l'issue avec la mesure avant / après.

## Faire grandir l'agent

Une nouvelle action entre dans le catalogue seulement si elle est **interne et réversible**. Ce qui écrit à quelqu'un, dépense ou engage la maison reste hors du catalogue, et passe par Basile.

Compétences liées : `cerveau`, `evolution`, `agent`, `bibliotheque`.
