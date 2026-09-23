-- HISTORIQUE DES PRIX — l'ingredient de la veille, c'est le TEMPS.
-- La synchronisation ecrasait les prix a chaque passage : on savait ce qui avait change
-- la veille, jamais ce que coutait une tache trois mois plus tot. Chaque jour sans cette
-- table etait un jour de donnee perdu sans retour.
CREATE TABLE IF NOT EXISTS model_prices_history (
  id             bigserial PRIMARY KEY,
  openrouter_id  text        NOT NULL,
  price_in       numeric,
  price_out      numeric,
  context_tokens bigint,
  releve_le      date        NOT NULL DEFAULT current_date,
  UNIQUE(openrouter_id, releve_le)          -- un releve par modele et par jour
);
CREATE INDEX IF NOT EXISTS mph_modele_date ON model_prices_history(openrouter_id, releve_le DESC);

-- On amorce avec l'etat connu aujourd'hui : le premier point de la courbe.
INSERT INTO model_prices_history(openrouter_id, price_in, price_out, context_tokens, releve_le)
SELECT openrouter_id, price_in, price_out, context_tokens, current_date
FROM models WHERE openrouter_id IS NOT NULL
ON CONFLICT (openrouter_id, releve_le) DO NOTHING;
