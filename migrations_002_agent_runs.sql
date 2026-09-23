-- Pilier 4 : tracabilite. Chaque appel d'agent est journalise et rejouable.
CREATE TABLE IF NOT EXISTS agent_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent          text NOT NULL,
  task           text,
  model          text,
  prompt_version text,
  ref            uuid,
  tokens_in      integer,
  tokens_out     integer,
  cost_usd       numeric,
  duration_ms    integer,
  status         text,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_agent_idx ON agent_runs(agent, created_at DESC);
