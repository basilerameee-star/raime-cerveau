-- Données FICTIVES du banc d'essai (base n8n). Entreprises inventées, adresses en .invalid.
INSERT INTO prospects(siren, name, sector, city, status, contact_email) VALUES
  ('000000001', 'Fictive Conseil', 'conseil', 'Annecy', 'nouveau', 'contact@fictive-conseil.invalid'),
  ('000000002', 'Exemple Logistique', 'transport', 'Chambéry', 'client', 'accueil@exemple-logistique.invalid'),
  ('000000003', 'Troisième Fictive', 'industrie', 'Annecy', 'nouveau', 'contact@troisieme-fictive.invalid');

INSERT INTO outreach(siren, prospect_name, subject, body, status, sent_at, reply_at) VALUES
  ('000000001', 'Fictive Conseil', 'Objet fictif', 'Corps fictif', 'envoye', now() - interval '3 days', NULL),
  ('000000002', 'Exemple Logistique', 'Objet fictif', 'Corps fictif', 'envoye', now() - interval '5 days', now() - interval '4 days'),
  ('000000003', 'Troisième Fictive', 'Objet fictif', 'Corps fictif', 'brouillon', NULL, NULL);

-- Portes d'entrée fictives (chantier 4 bis) : une CCI, deux organismes de formation. Sites en .invalid.
INSERT INTO prospects(siren, name, sector, city, status, website, effectif_est) VALUES
  ('000000011', 'CCI Fictive Savoie', 'CCI', 'Annecy', 'nouveau', 'https://cci-fictive.invalid', 120),
  ('000000012', 'Formation Exemple', 'Organismes de formation', 'Lyon', 'nouveau', 'https://formation-exemple.invalid', 12),
  ('000000013', 'Organisme Gardé', 'Organismes de formation', 'Grenoble', 'nouveau', 'https://organisme-garde.invalid', 30);
