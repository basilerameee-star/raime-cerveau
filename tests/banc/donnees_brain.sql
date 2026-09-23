-- Données FICTIVES du banc d'essai (base raime_brain). Aucune personne, aucun client réel.
INSERT INTO buts(horizon, enonce, mesure, cible, etat) VALUES
  ('court', 'Rendre l''offre de formation lisible pour un dirigeant', 'pages d''offre publiées', '1', 'ouvert'),
  ('long',  'Premier client payant', 'clients', '1', 'ouvert');

INSERT INTO croyances(sujet, enonce, confiance, source) VALUES
  ('argent', 'L''argent reste à Basile : aucun mouvement de fonds.', 1, 'constitution'),
  ('bibliotheque', 'La bibliothèque ne couvre pas encore l''offre.', 0.4, 'banc');

INSERT INTO limites(sujet, enonce, origine) VALUES
  ('argent', 'Aucun mouvement de fonds.', 'constitution'),
  ('souverainete', 'Aucun secret dans une note.', 'constitution');

-- Catalogue de modèles fictifs, pour le sas.
INSERT INTO models(provider, name, openrouter_id, context_tokens, price_in, price_out) VALUES
  ('fictif', 'Titulaire', 'fictif/titulaire', 200000, 0.065, 0.18),
  ('fictif', 'Candidat bon', 'fictif/candidat-bon', 200000, 0.02, 0.05);

-- Métrologie fictive : trois passages sur deux tâches pour chaque modèle.
INSERT INTO metrologie(modele, tache, famille, note, cout_usd)
SELECT m.modele, t.tache, 'extraction', m.note, m.cout
FROM (VALUES ('fictif/titulaire', 70, 0.0010), ('fictif/candidat-bon', 80, 0.0004),
             ('fictif/candidat-faible', 50, 0.0002)) AS m(modele, note, cout),
     (VALUES ('extraire_devis'), ('extraire_facture')) AS t(tache),
     generate_series(1, 3);
-- Un candidat mesuré une seule fois : l'échantillon ne suffit pas.
INSERT INTO metrologie(modele, tache, famille, note, cout_usd) VALUES
  ('fictif/candidat-neuf', 'extraire_devis', 'extraction', 95, 0.0001);
