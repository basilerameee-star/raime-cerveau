-- LA MÉMOIRE D'EXPÉRIENCE — première brique d'un modèle du monde de type JEPA.
--
-- Un modèle JEPA apprend à prédire, dans une représentation abstraite, la situation qui
-- suit une action. Il lui faut des exemples : (situation avant, action, situation après,
-- résultat). L'architecte notait déjà attendu, résultat et écart (table etats) ; il manquait
-- la photographie de la situation, pour TOUS les agents. La boucle la prend avant et après
-- chaque passage (agents/experience.js).
CREATE TABLE IF NOT EXISTS experiences (
  id         bigserial PRIMARY KEY,
  source     text        NOT NULL DEFAULT 'boucle',   -- boucle | architecte | porte
  agent      text        NOT NULL,
  action     text        NOT NULL,
  arguments  jsonb       NOT NULL DEFAULT '{}',
  avant      jsonb       NOT NULL,                    -- la situation photographiée avant
  apres      jsonb,                                   -- et après
  succes     boolean,
  resultat   text,
  cout_usd   numeric(12,6),
  duree_ms   int,
  cree_le    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experiences_agent ON experiences(agent, cree_le DESC);

-- Les buts ajoutés le 25 septembre 2026, sur la parole de Basile : « tu peux encore
-- rajouter des choses » à la liste des missions du cerveau.
INSERT INTO buts (horizon, enonce, mesure, cible) VALUES
 ('court', 'Mettre en ligne une page par offre : formation des particuliers, formation des professionnels, audit, arbitrage, automatisation',
           'pages d''offre qui répondent', '5'),
 ('court', 'Présenter à Basile le premier lot de portes d''entrée (CCI, organismes de formation)',
           'lots présentés', '1'),
 ('moyen', 'Être référencé comme formateur par une CCI ou un organisme de formation',
           'référencements obtenus', '1'),
 ('moyen', 'Signer la première convention de formation, qui ouvre le dépôt du NDA',
           'conventions signées', '1'),
 ('moyen', 'Lire chaque jour les revenus de rAIme, sans jamais toucher à l''argent',
           'jours de revenus relevés automatiquement', 'tous'),
 ('court', 'Tenir les pages légales du site exactes (prestataires réels, aucune mention périmée)',
           'mentions périmées', '0'),
 ('long',  'Apprendre à prédire la conséquence de ses actes avant d''agir (modèle du monde de type JEPA)',
           'écart moyen entre attendu et obtenu, mois après mois', 'en baisse chaque mois'),
 ('court', 'Rendre compte à Basile chaque matin : ce qui a été fait, ce qui attend sa décision',
           'jours avec compte rendu et questions ouvertes', 'tous')
ON CONFLICT (enonce) DO NOTHING;
