-- LE CAP, LE GOÛT, LES API PUBLIQUES (30/09/2026, demandes de Basile). Les agents créent aussi ces
-- tables s'il le faut (agents/cap.js, agents/gout.js, agents/apis_publiques.js) : ce fichier en est la trace.

-- Chaque version distincte du cap (jarvis/cap.cjs + la partie vivante) : comment la boussole a évolué.
CREATE TABLE IF NOT EXISTS cap (
  id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(),
  version text NOT NULL, empreinte text UNIQUE NOT NULL, texte text NOT NULL, faits jsonb);

-- Les jugements du goût (AUTO, REVUE, BASILE, BLOQUE) et leur suite réelle : la matière de son réglage.
CREATE TABLE IF NOT EXISTS jugements (
  id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, action text NOT NULL, verdict text NOT NULL, motif text, scores jsonb, modele text,
  cout_usd numeric(12,8) DEFAULT 0, suite text, suite_le timestamptz);

-- Le répertoire public-apis (MIT), reversé quand le dépôt change.
CREATE TABLE IF NOT EXISTS apis_publiques (
  id serial PRIMARY KEY, nom text NOT NULL, lien text NOT NULL, description text, categorie text,
  auth text, https boolean, cors text, source_commit text NOT NULL, maj_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nom, lien));
CREATE INDEX IF NOT EXISTS apis_publiques_texte ON apis_publiques
  USING gin (to_tsvector('english', nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, '')));

-- Contradiction relevée le 30/09/2026 : l'objectif n° 1 de Basile (précisé le 26/09) n'était pas dans les
-- buts ; l'architecte travaillait donc sans lui, pendant que Jarvis le citait.
INSERT INTO buts (horizon, enonce, mesure, cible)
SELECT 'moyen', '2 000 € par mois de monétisation des contenus de Basile (Instagram, Facebook, TikTok, YouTube)',
       'revenus des plateformes du mois (table revenus)', '2000 €/mois'
WHERE NOT EXISTS (SELECT 1 FROM buts WHERE enonce LIKE '2 000 € par mois de monétisation%');

-- Basile, 25/09/2026 : « j'ai pas de budget » (organique seulement). Le but 13 parlait de publicités.
UPDATE buts SET enonce = replace(enonce, 'publications et publicités Meta ciblées par questions',
                                 'publications organiques Meta ciblées par questions (aucun budget publicitaire)')
WHERE enonce LIKE 'Chaîne publicitaire autonome%' AND enonce LIKE '%publications et publicités Meta%';
