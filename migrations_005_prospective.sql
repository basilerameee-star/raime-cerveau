CREATE TABLE IF NOT EXISTS prospective (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture     text,
  projections jsonb,
  adaptations jsonb,
  faits       jsonb,
  modele      text,
  cout_usd    numeric,
  created_at  timestamptz DEFAULT now()
);
