CREATE TABLE IF NOT EXISTS supervision (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etat       text,
  resume     text,
  faits      jsonb,
  anomalies  jsonb,
  decisions  jsonb,
  modele     text,
  cout_usd   numeric,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supervision_date_idx ON supervision(created_at DESC);
