-- Données FICTIVES du banc d'essai (base n8n). Entreprises inventées, adresses en .invalid.
INSERT INTO prospects(siren, name, sector, city, status, contact_email) VALUES
  ('000000001', 'Fictive Conseil', 'conseil', 'Annecy', 'nouveau', 'contact@fictive-conseil.invalid'),
  ('000000002', 'Exemple Logistique', 'transport', 'Chambéry', 'client', 'accueil@exemple-logistique.invalid'),
  ('000000003', 'Troisième Fictive', 'industrie', 'Annecy', 'nouveau', 'contact@troisieme-fictive.invalid');

INSERT INTO outreach(siren, prospect_name, subject, body, status, sent_at, reply_at) VALUES
  ('000000001', 'Fictive Conseil', 'Objet fictif', 'Corps fictif', 'envoye', now() - interval '3 days', NULL),
  ('000000002', 'Exemple Logistique', 'Objet fictif', 'Corps fictif', 'envoye', now() - interval '5 days', now() - interval '4 days'),
  ('000000003', 'Troisième Fictive', 'Objet fictif', 'Corps fictif', 'brouillon', NULL, NULL);
