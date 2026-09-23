# rAIme Brain — cerveau souverain d'audit

Outil interne, permanent et souverain qui transforme rAIme en **cabinet de data & d'analyse d'entreprise** pour auditer, avec une précision chirurgicale, les propositions d'automatisation faites à nos clients.

> Ne remplace pas l'auditeur : il l'**assiste** avec une base de connaissance toujours à jour et un moteur de corrélation.

## Les 3 piliers

1. **Contexte statique** — le socle durable : catalogue des modèles (perf / prix / tâche), méthodologie d'audit (7 regards, 8 questions, principe de preuve), benchmarks, règles RGPD/souveraineté, playbooks secteur. → `schema.sql` (tables `models`, `audit_criteria`, `audit_questions`, `kb_documents`/`kb_chunks`) + `knowledge/`.
2. **Contexte dynamique** — le mouvant : sync quotidienne OpenRouter (modèles/prix), veille sorties de modèles & fournisseurs, et le dynamique par client. → table `radar_events`, jobs n8n.
3. **Capacités** — les agents sur **DeepSeek harness + OpenRouter** : `Profiler` (profil entreprise), `Radar` (ingestion techno), `Auditeur` (corrélation profil × proposition × base → audit scoré), `Rédacteur` (livrable). Gouvernés par la Constitution (autonomie bornée).

## Le cœur : moteur de corrélation
`companies.profile` × `proposals.parsed` → évaluation sur les 7 regards + 8 questions + modèle de coût (**ROI Engine V1**) → `audits` (scores, findings, recommandation).

## Stack souveraine (sur le VPS existant)
- **Runtime agents** : DeepSeek harness (déjà téléchargé) ; modèles via **OpenRouter** (DeepSeek V3/R1, Qwen) ; repli **Ollama** local possible.
- **Données** : Postgres + **pgvector** (embeddings), markdown/git (`knowledge/`), **n8n** (orchestration/ingestion) — briques déjà en place.
- **Souveraineté** : hébergé sur ta VM, open source, résilient. Tu gardes la data et la propriété de l'intelligence.

## Déploiement (à lancer sur le VPS)
```bash
# 1. schéma (Postgres + pgvector)
psql "$DATABASE_URL" -f schema.sql

# 2. amorcer méthodologie + catalogue (script de seed à écrire — voir roadmap)
node seed/load_seed.js        # ou un flux n8n : lit les .json et remplit audit_criteria/questions/models
```

## Roadmap (Pilier 1 d'abord)
- [x] Schéma base de connaissance + audits (`schema.sql`)
- [x] Méthodologie d'audit structurée (`seed/audit_methodology.json`)
- [x] Amorce catalogue modèles + task-router (`seed/models.seed.json`)
- [ ] Script de seed (charge les .json dans Postgres)
- [ ] Taxonomie `knowledge/` + premières notes + pipeline d'embeddings
- [ ] Sync OpenRouter (Pilier 2) → `models` + `radar_events`
- [ ] Agent **Auditeur** (POC) sur DeepSeek harness : `profil + proposition → audit scoré`
- [ ] Brancher le **ROI Engine V1** sur `audits.cost_model`

## Réutilisation de l'existant (pivot)
- Machine outbound (VPS/Postgres/n8n) → **repointée** vers l'acquisition de clients d'audit.
- **ROI Engine V1** → moteur de coût des audits.
- Agent **Radar** → ingesteur de contexte dynamique.
- **Constitution + Gardien** → gouvernance du cerveau.
