-- ============================================================
--  rAIme Brain — Pilier 1 (contexte statique) + audits
--  Postgres 15+ avec pgvector.  À charger sur le VPS existant.
--  psql "$DATABASE_URL" -f schema.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
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
CREATE TABLE IF NOT EXISTS kb_chunks (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id    uuid REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk     text,
  embedding vector(1024),                      -- adapter à la dim. de ton modèle d'embeddings
  meta      jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS kb_chunks_emb_idx
  ON kb_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

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
