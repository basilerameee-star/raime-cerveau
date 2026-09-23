-- LE CYCLE COMPLET DE L'ARCHITECTE (schéma posé par Basile le 2026-09-23).
-- Chaque étape devient un événement typé, rattaché à un cycle, pour qu'on puisse relire
-- une journée de réflexion comme on relit un carnet.

ALTER TABLE etats ADD COLUMN IF NOT EXISTS type text
  CHECK (type IN ('PROPOSER','DEMANDER_INFOS','EXECUTER','EVALUER','CORRIGER','MEMORISER','METAFLECHIR'));
ALTER TABLE etats ADD COLUMN IF NOT EXISTS cycle_id text;
ALTER TABLE etats ADD COLUMN IF NOT EXISTS rang int;
CREATE INDEX IF NOT EXISTS etats_cycle ON etats(cycle_id, rang);

-- Ce que l'architecte demande à Basile quand ses croyances ne suffisent plus.
-- Il ne bloque pas : il pose la question, continue son chemin, et la garde ouverte.
CREATE TABLE IF NOT EXISTS demandes (
  id        bigserial PRIMARY KEY,
  question  text NOT NULL,
  pourquoi  text,
  bloquant  boolean NOT NULL DEFAULT false,
  etat      text NOT NULL DEFAULT 'ouverte' CHECK (etat IN ('ouverte','repondue','abandonnee')),
  reponse   text,
  cycle_id  text,
  cree_le   timestamptz NOT NULL DEFAULT now(),
  close_le  timestamptz,
  UNIQUE(question)
);

-- Les limites que l'architecte connaît de lui-même. Elles se lisent avant d'agir et
-- se révisent en méta-réflexion : une limite dépassée sans dommage mérite d'être revue.
CREATE TABLE IF NOT EXISTS limites (
  sujet     text PRIMARY KEY,
  enonce    text NOT NULL,
  origine   text,
  maj_le    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO limites (sujet, enonce, origine) VALUES
 ('souverainete', 'Aucun appel sortant ne transporte une clé, un secret ou une donnée personnelle', 'garde de souveraineté'),
 ('faisabilite',  'Une sous-tâche hors du catalogue d''actions est refusée par le code', 'garde de faisabilité'),
 ('ethique',      'Rien ne part vers un tiers, et toute note cite ses sources', 'garde d''éthique'),
 ('depense',      'Un cycle coûte au plus quelques centimes ; le mois reste sous le prix du serveur', 'Constitution'),
 ('autorite',     'Un but se clôt sur la parole de Basile, jamais sur celle de l''agent', 'Constitution')
ON CONFLICT (sujet) DO NOTHING;
