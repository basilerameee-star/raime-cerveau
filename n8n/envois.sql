-- LES ENVOIS AUTOMATIQUES (14/10/2026). Basile : « Je ne veux plus valider… je veux la garantie que ça tourne tout seul,
-- constamment » ; confirmé à Claude le 14/10 au soir : « oui, pose et ouvre l'envoi seul ». Ce fichier (base n8n) dit, en un seul endroit, QUI peut partir et COMBIEN par jour ; les deux workflows
-- d'envoi (n8n/expediteur_envoi.json, n8n/vitrines_envoi.json), la Sentinelle et le rapport de 7 h 30 le lisent.
-- Posé par n8n/poser_envois.py (et par le banc d'essai). Il se rejoue sans dommage.

-- Ce que Resend a répondu, e-mail par e-mail : son numéro, son refus, puis l'état de livraison qu'il annonce ensuite
-- (delivered, bounced, complained…), relu le lendemain par l'Expéditeur.
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS resend_id text;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS erreur text;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS livraison text;
ALTER TABLE vitrines_envoi ADD COLUMN IF NOT EXISTS livraison text;

-- Le plafond monte seul : départ prudent, + `montee` chaque jour ouvré depuis `rampe_depuis`, jusqu'au maximum
-- (daily_cap, plafond_jour). Les e-mails qui reviennent (rebonds, plaintes) le ramènent au départ.
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS daily_cap int NOT NULL DEFAULT 10;
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS from_email text NOT NULL DEFAULT 'contact@raime.fr';
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS from_name text NOT NULL DEFAULT 'Basile Ramé';
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS auto_brouillons boolean NOT NULL DEFAULT true;
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS plafond_depart int NOT NULL DEFAULT 10;
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS montee int NOT NULL DEFAULT 2;
ALTER TABLE send_config ADD COLUMN IF NOT EXISTS rampe_depuis date NOT NULL DEFAULT (current_date + 1);
ALTER TABLE vitrines_envoi_config ADD COLUMN IF NOT EXISTS auto boolean NOT NULL DEFAULT true;
ALTER TABLE vitrines_envoi_config ADD COLUMN IF NOT EXISTS plafond_depart int NOT NULL DEFAULT 8;
ALTER TABLE vitrines_envoi_config ADD COLUMN IF NOT EXISTS montee int NOT NULL DEFAULT 2;
ALTER TABLE vitrines_envoi_config ADD COLUMN IF NOT EXISTS rampe_depuis date NOT NULL DEFAULT (current_date + 1);

-- Les pré-audits prêts à partir. Un brouillon part seul (auto_brouillons) s'il est le texte écrit par le code
-- (agents/prospection_auto.js), donc s'il porte le lien du pré-audit de son métier ; un e-mail validé à la main part aussi.
-- Garde-fous : l'adresse est au nom de domaine du site prouvé, jamais une boîte de service (dpo, rgpd, no-reply…), jamais
-- en Suisse (.ch : pas d'e-mail commercial sans accord), jamais une adresse désinscrite, jamais une adresse déjà écrite
-- (par l'un ou l'autre des deux envois).
CREATE OR REPLACE VIEW envoi_preaudits AS
SELECT o.id, o.to_email, o.subject, o.body, o.prospect_name, o.segment, o.status, p.departement, p.score
FROM outreach o JOIN prospects p ON p.siren = o.siren
WHERE o.sent_at IS NULL AND o.to_email LIKE '%_@_%'
  AND (o.status = 'valide' OR (o.status = 'brouillon'
    AND coalesce((SELECT c.auto_brouillons FROM send_config c WHERE c.id = 1), false)
    AND o.body ~ 'https://raime\.fr/dossiers/rAIme-pre-audit-[a-z0-9-]+\.pdf'))
  AND p.website IS NOT NULL AND position(lower(split_part(o.to_email, '@', 2)) IN lower(p.website)) > 0
  AND lower(split_part(o.to_email, '@', 2)) NOT IN ('cerfapp.fr', 'expertcomptapro.fr', 'orientation.com', 'net1901.org', 'e-pro.fr', 'creer.fr')
  AND lower(split_part(o.to_email, '@', 1)) !~ '^(dpo|rgpd|privacy|postmaster|abuse|no-?reply|ne-?pas-?repondre|mailer-daemon|webmaster|webmestre)'
  AND lower(o.to_email) !~ '\.ch$'
  AND NOT EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(o.to_email))
  AND NOT EXISTS (SELECT 1 FROM outreach d WHERE lower(d.to_email) = lower(o.to_email) AND d.id <> o.id
    AND d.sent_at IS NOT NULL AND d.status <> 'non_recu')
  AND NOT EXISTS (SELECT 1 FROM vitrines_envoi v WHERE lower(v.to_email) = lower(o.to_email) AND v.statut = 'envoye');

-- Les vitrines prêtes à partir (la file que remplit agents/vitrines.js : brouillons complets validés seuls, ou par Basile) : jamais en Suisse, jamais une adresse désinscrite,
-- jamais une adresse qui a déjà reçu un pré-audit.
CREATE OR REPLACE VIEW envoi_vitrines AS
SELECT e.id, e.to_email, e.sujet, e.corps, e.cree_le
FROM vitrines_envoi e
WHERE e.statut = 'a_envoyer' AND e.to_email LIKE '%_@_%' AND lower(e.to_email) !~ '\.ch$'
  AND NOT EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(e.to_email))
  AND NOT EXISTS (SELECT 1 FROM outreach o WHERE lower(o.to_email) = lower(e.to_email) AND o.status = 'envoye');

-- Le plafond du jour d'un canal ('preaudits' ou 'vitrines'). Les deux envois partagent le domaine raime.fr : les rebonds
-- et plaintes des 7 derniers jours se comptent ensemble ; au-delà de 5 % (et de 1), le plafond revient au départ.
CREATE OR REPLACE FUNCTION plafond_envoi(canal text) RETURNS int LANGUAGE sql STABLE AS $f$
  WITH c AS (
    SELECT daily_cap AS maxi, plafond_depart AS depart, montee, rampe_depuis FROM send_config WHERE id = 1 AND canal = 'preaudits'
    UNION ALL
    SELECT plafond_jour, plafond_depart, montee, rampe_depuis FROM vitrines_envoi_config WHERE id = 1 AND canal = 'vitrines'),
  e AS (SELECT
    (SELECT count(*) FROM outreach WHERE status = 'envoye' AND sent_at > now() - interval '7 days')
      + (SELECT count(*) FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le > now() - interval '7 days') AS envois,
    (SELECT count(*) FROM outreach WHERE livraison IN ('bounced', 'complained') AND sent_at > now() - interval '7 days')
      + (SELECT count(*) FROM vitrines_envoi WHERE livraison IN ('bounced', 'complained') AND envoye_le > now() - interval '7 days') AS retours)
  SELECT greatest(0, least(c.maxi, CASE WHEN e.retours > greatest(1, 0.05 * e.envois) THEN c.depart
    ELSE c.depart + c.montee * (SELECT count(*)::int FROM generate_series(c.rampe_depuis::timestamp,
      ((now() AT TIME ZONE 'Europe/Paris')::date - 1)::timestamp, interval '1 day') AS j(d) WHERE extract(isodow FROM j.d) < 6) END))::int
  FROM c, e
$f$;
