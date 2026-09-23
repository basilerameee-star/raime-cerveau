-- Les prompts quittent le code pour vivre en base : c'est ce qui permet a un agent
-- d'etre reecrit sans redeploiement, et surtout d'etre ANNULE en une requete.
CREATE TABLE IF NOT EXISTS prompt_versions (
  id            bigserial PRIMARY KEY,
  agent         text NOT NULL,
  version       int  NOT NULL,
  active        boolean NOT NULL DEFAULT false,
  instruction   text NOT NULL,
  motif         text,
  critere_succes text,
  seuil_retour  text,
  propose_par   text NOT NULL DEFAULT 'reflexif',
  active_par    text,
  active_le     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent, version)
);
-- Un seul prompt actif par agent : la regle est dans la base, pas dans la bonne volonte du code.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_un_seul_actif
  ON prompt_versions(agent) WHERE active;

-- Mesure de l'effet reel d'une version : sans ca, "amelioration" n'est qu'une opinion.
CREATE TABLE IF NOT EXISTS prompt_evaluations (
  id         bigserial PRIMARY KEY,
  agent      text NOT NULL,
  version    int  NOT NULL,
  executions int  NOT NULL,
  mesure     jsonb NOT NULL,
  verdict    text CHECK (verdict IN ('conserver','annuler','en_cours')),
  created_at timestamptz NOT NULL DEFAULT now()
);
