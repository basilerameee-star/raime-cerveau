-- ============================================================
--  rAIme Brain — Pilier 1 (contexte statique) + audits
--  Postgres 15+ avec pgvector.  À charger sur le VPS existant.
--  psql "$DATABASE_URL" -f schema.sql
-- ============================================================
-- (pgvector en phase 2)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ PILIER 1 : CONTEXTE STATIQUE ============

-- Catalogue des modèles : la référence perf / coût / tâche (précision chirurgicale)
CREATE TABLE IF NOT EXISTS models (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text NOT NULL,
  name           text NOT NULL,
  openrouter_id  text,                    -- id pour la sync OpenRouter (Pilier 2)
  context_tokens integer,
  price_in       numeric,                 -- USD / 1M tokens entrée
  price_out      numeric,                 -- USD / 1M tokens sortie
  modality       text[] DEFAULT '{text}',
  strengths      jsonb  DEFAULT '{}',     -- { "classification": 0.9, "raisonnement": 0.8, ... }
  params         jsonb  DEFAULT '{}',     -- reasoning, tools, fenêtre, etc.
  deterministic_friendly boolean,         -- se prête à un usage encadré/déterministe
  source         text   DEFAULT 'manual', -- 'openrouter' | 'manual'
  verify         boolean DEFAULT true,    -- à confirmer via sync
  as_of          date,
  updated_at     timestamptz DEFAULT now(),
  UNIQUE(provider, name)
);

-- Les 7 regards d'audit
CREATE TABLE IF NOT EXISTS audit_criteria (
  id          serial PRIMARY KEY,
  rank        integer,
  code        text UNIQUE,
  label       text,
  description text,
  checks      jsonb DEFAULT '[]'
);

-- Les 8 questions de challenge fournisseur
CREATE TABLE IF NOT EXISTS audit_questions (
  id        serial PRIMARY KEY,
  rank      integer,
  question  text,
  method    text,                              -- comment rAIme y répond
  criterion text REFERENCES audit_criteria(code)
);

-- Base documentaire (notes markdown) + embeddings
CREATE TABLE IF NOT EXISTS kb_documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path       text UNIQUE,
  title      text,
  tags       text[],
  body       text,
  updated_at timestamptz DEFAULT now()
);
-- kb_chunks : phase 2 (pgvector)

-- ============ PILIER 2 : CONTEXTE DYNAMIQUE ============

-- Veille : nouveaux modèles, prix, fournisseurs, annonces
CREATE TABLE IF NOT EXISTS radar_events (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind    text,                                -- 'model_release'|'price_change'|'vendor'|'news'
  source  text,
  title   text,
  payload jsonb,
  seen_at timestamptz DEFAULT now()
);

-- ============ ENTREPRISES & AUDITS ============

-- Bibliothèque de profils d'entreprise
CREATE TABLE IF NOT EXISTS companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  sector     text,
  size       text,
  profile    jsonb DEFAULT '{}',              -- contexte statique client
  dynamic    jsonb DEFAULT '{}',              -- contexte dynamique client
  created_at timestamptz DEFAULT now()
);

-- Propositions fournisseurs (parsées)
CREATE TABLE IF NOT EXISTS proposals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  vendor      text,
  raw         text,
  parsed      jsonb DEFAULT '{}',             -- archi, modèles, coûts, flux de données...
  received_at timestamptz DEFAULT now()
);

-- Rapports d'audit : sortie du moteur de corrélation
CREATE TABLE IF NOT EXISTS audits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid REFERENCES companies(id),
  proposal_id    uuid REFERENCES proposals(id),
  scores         jsonb DEFAULT '{}',          -- score par regard
  findings       jsonb DEFAULT '[]',
  recommendation text,
  cost_model     jsonb DEFAULT '{}',          -- branché sur le ROI Engine V1
  created_at     timestamptz DEFAULT now()
);


-- ============ SEED ============
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(1,'adequation_metier','Adéquation métier','Le système résout-il le bon problème ?','["volumes réels", "fréquences", "exceptions", "interventions humaines", "critères de réussite mesurables"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(2,'architecture','Architecture technique','Le choix des modèles, agents, workflows, RAG, bases, APIs et hébergement est-il justifié par le besoin ?','["justification vs alternative plus simple", "part déterministe vs LLM", "dépendances"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(3,'performance','Performance réelle','Les promesses sont-elles démontrées par des tests ?','["taux de réussite sur données client", "erreurs et cas limites", "latence", "robustesse"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(4,'economie','Économie','Quel coût réel et quel ROI à l''échelle ?','["coût par exécution", "coût à volume x10", "inférence + infra + maintenance", "gain marginal vs surcoût"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(5,'donnees_securite','Données & sécurité','Quelles données sortent, où sont-elles traitées ?','["champs concernés", "prestataires tiers", "zones d''hébergement", "logs, accès, permissions", "durées de conservation"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(6,'souverainete','Souveraineté & réversibilité','Le client peut-il changer de modèle, d''intégrateur ou d''hébergeur ?','["export données/workflows/configs", "absence de verrou propriétaire", "documentation"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
INSERT INTO audit_criteria(rank,code,label,description,checks) VALUES(7,'exploitabilite','Exploitabilité','Qui maintient le système dans la durée ?','["responsabilité mises à jour", "gestion incidents", "changements d''API/modèle", "suivi des dérives"]'::jsonb) ON CONFLICT(code) DO UPDATE SET rank=EXCLUDED.rank,label=EXCLUDED.label,description=EXCLUDED.description,checks=EXCLUDED.checks;
DELETE FROM audit_questions;
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(1,'Pourquoi cette architecture plutôt qu''une alternative plus simple ?','Établir un scénario de référence plus sobre (modèle plus léger, logique déterministe, moins d''agents) et le comparer sur des critères identiques ; l''écart de prix n''est retenu que s''il est justifié par un gain mesurable.','architecture');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(2,'Ce niveau de modèle correspond-il vraiment à la tâche ?','Évaluer plusieurs niveaux de modèle sur la tâche réelle et quantifier l''écart de qualité ; aligner la capacité sur l''exigence métier.','architecture');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(3,'Quels résultats sur les données réelles du client ?','Exiger une évaluation sur un échantillon représentatif ; documenter taux de réussite, nature des erreurs, coût métier.','performance');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(4,'Quel coût réel à volume multiplié par dix ?','Modéliser le coût complet par exécution au volume actuel puis à l''échelle (inférence + infra + maintenance).','economie');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(5,'Qu''est-ce qui est déterministe, et qu''est-ce qui dépend d''un modèle ?','Cartographier la part déterministe (règles, code) et probabiliste (modèle) ; favoriser un socle déterministe large.','architecture');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(6,'Quelles données quittent l''entreprise et où sont-elles traitées ?','Établir le flux précis : champs, prestataires tiers, zones d''hébergement, durées de conservation.','donnees_securite');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(7,'Peut-on changer de prestataire en gardant ses données ?','Vérifier réversibilité : export données/workflows/configs, absence de dépendance propriétaire.','souverainete');
INSERT INTO audit_questions(rank,question,method,criterion) VALUES(8,'Qui maintient le système quand une API ou un modèle évolue ?','Clarifier la gouvernance d''exploitation : mises à jour, incidents, dérives de performance et coûts associés.','exploitabilite');
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('DeepSeek','DeepSeek V3','deepseek/deepseek-chat','{"code": 0.8, "raisonnement": 0.75, "rapport_cout": 0.95}'::jsonb,'{}'::jsonb,true,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('DeepSeek','DeepSeek R1','deepseek/deepseek-r1','{"raisonnement": 0.9, "rapport_cout": 0.85}'::jsonb,'{"reasoning": true}'::jsonb,NULL,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('Qwen','Qwen3 (via OpenRouter)','qwen/qwen3','{"rapport_cout": 0.95, "multilingue": 0.85}'::jsonb,'{}'::jsonb,true,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('Mistral','Mistral (à préciser)','mistralai/…','{}'::jsonb,'{}'::jsonb,NULL,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('OpenAI','GPT (palier à préciser)','openai/…','{}'::jsonb,'{}'::jsonb,NULL,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('Google','Gemini (palier à préciser)','google/…','{}'::jsonb,'{}'::jsonb,NULL,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of) VALUES('Anthropic','Claude (palier à préciser)','anthropic/…','{}'::jsonb,'{}'::jsonb,NULL,'manual',true,'2026-09-02') ON CONFLICT(provider,name) DO UPDATE SET openrouter_id=EXCLUDED.openrouter_id,strengths=EXCLUDED.strengths,params=EXCLUDED.params,verify=EXCLUDED.verify,as_of=EXCLUDED.as_of;
