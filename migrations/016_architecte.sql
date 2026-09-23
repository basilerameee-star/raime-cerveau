-- L'ARCHITECTE — la mémoire d'un agent qui poursuit un but et se corrige.
-- Trois tables, exactement ce que Basile a décrit : des buts, des croyances, des états.

-- ① Les buts, par horizon. Un but sans mesure ne vaut rien : la colonne mesure dit
-- comment on saura qu'il est atteint, et cible donne le chiffre à atteindre.
CREATE TABLE IF NOT EXISTS buts (
  id         bigserial PRIMARY KEY,
  horizon    text NOT NULL CHECK (horizon IN ('long', 'moyen', 'court')),
  enonce     text NOT NULL,
  mesure     text,
  cible      text,
  etat       text NOT NULL DEFAULT 'ouvert' CHECK (etat IN ('ouvert', 'atteint', 'abandonne')),
  parent_id  bigint REFERENCES buts(id) ON DELETE SET NULL,
  cree_le    timestamptz NOT NULL DEFAULT now(),
  clos_le    timestamptz,
  UNIQUE(enonce)
);

-- ② Les croyances, avec leur confiance. Une croyance qui ne bouge jamais est un dogme :
-- chaque état peut la relever ou la baisser, et la source dit d'où elle vient.
CREATE TABLE IF NOT EXISTS croyances (
  sujet      text PRIMARY KEY,
  enonce     text NOT NULL,
  confiance  numeric NOT NULL DEFAULT 0.5 CHECK (confiance >= 0 AND confiance <= 1),
  source     text,
  maj_le     timestamptz NOT NULL DEFAULT now()
);

-- ③ Les états : une ligne par action, avec ce qui était attendu AVANT et ce qui est
-- arrivé APRÈS. C'est la table qui rend l'agent améliorable plutôt que bavard.
CREATE TABLE IF NOT EXISTS etats (
  id                bigserial PRIMARY KEY,
  but_id            bigint REFERENCES buts(id) ON DELETE SET NULL,
  action            text NOT NULL,
  arguments         jsonb NOT NULL DEFAULT '{}'::jsonb,
  attendu           text,
  probabilite_echec numeric CHECK (probabilite_echec >= 0 AND probabilite_echec <= 1),
  detection         text,
  resultat          text,
  ecart             text,
  cause             text,
  correction        text,
  lecon             text,
  cout_usd          numeric DEFAULT 0,
  duree_ms          integer,
  cree_le           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etats_date ON etats(cree_le DESC);

-- Les buts d'origine, tels que Basile les a posés. Ils se modifient par la suite,
-- mais la maison commence avec un cap écrit.
INSERT INTO buts (horizon, enonce, mesure, cible) VALUES
 ('long',  'Devenir une intelligence utile qui fait vivre rAIme sans intervention permanente',
           'part du travail de la firme fait sans main humaine', 'la majorité'),
 ('moyen', 'Obtenir le premier client payant', 'clients dans la base', '1'),
 ('moyen', 'Tenir la dépense sous le prix du serveur', 'coût mensuel des modèles', '16 € par mois'),
 ('court', 'Faire passer le taux de réponse des messages au-dessus de 5 %',
           'réponses divisées par envois', 'plus de 5 %')
ON CONFLICT (enonce) DO NOTHING;

INSERT INTO croyances (sujet, enonce, confiance, source) VALUES
 ('mesure',       'Une amélioration sans chiffre avant et après reste une idée', 0.95, 'Constitution'),
 ('souverainete', 'Tout composant doit pouvoir partir ailleurs en une journée', 0.9, 'Constitution'),
 ('argent',       'Le cerveau prépare et surveille, il ne déplace jamais de fonds', 1.0, 'Constitution'),
 ('doublon',      'Chercher ce qui existe avant de créer coûte moins cher que refaire', 0.9, 'Basile, 2026-09-23')
ON CONFLICT (sujet) DO NOTHING;
