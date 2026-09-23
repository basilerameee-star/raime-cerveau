-- Memoire institutionnelle des changements : le Superviseur doit savoir ce qui vient d'etre fait,
-- sinon il recommande de defaire ce qu'on vient de reparer.
CREATE TABLE IF NOT EXISTS journal (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur     text,
  changement text NOT NULL,
  motif      text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_date_idx ON journal(created_at DESC);
