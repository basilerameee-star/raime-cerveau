# knowledge/ — contexte statique (Pilier 1)

Notes markdown, versionnées (git), indexées en embeddings (`kb_documents` / `kb_chunks`).
Objectif : long terme, efficace pour l'IA, résilient. Une note = une idée claire, titrée, taguée.

## Taxonomie
```
knowledge/
  modeles/          # fiches par modèle : forces/faiblesses par tâche, params, notes d'usage
  methodologie/     # audit : 7 regards, 8 questions, principe de preuve, gabarits de rapport
  fournisseurs/     # paysage des intégrateurs / no-code / code-building : offres, verrous, prix
  patterns/         # archétypes d'archi (RAG, agents, déterministe) : quand / pourquoi / coût
  secteurs/         # playbooks par secteur (archi, formation, comptables, avocats, CCI…)
  souverainete/     # RGPD, hébergement UE, réversibilité, checklists
  entreprises/      # profils clients (miroir markdown de la table companies)
```

## Convention de note
```markdown
---
title: <titre clair>
tags: [modele, cout, rag]
updated: 2026-09-02
---
Le fait / l'idée, en clair. Relié à [[autre-note]].
```

## Ingestion
Un flux n8n (ou script) parcourt `knowledge/`, upsert dans `kb_documents`, découpe en chunks,
calcule les embeddings (modèle local ou via OpenRouter) et remplit `kb_chunks`.
L'agent Auditeur récupère les passages pertinents par similarité au moment de l'audit.
