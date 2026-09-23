-- Les brouillons de publication et la place de leurs mesures (agent publiciste, chantier 5).
-- L'agent crée aussi ces objets lui-même au premier passage ; ce fichier les rend visibles.
CREATE TABLE IF NOT EXISTS publications (
  id              bigserial PRIMARY KEY,
  semaine         date NOT NULL,
  jour            date NOT NULL,
  reseau          text NOT NULL CHECK (reseau IN ('linkedin','facebook','instagram','tiktok')),
  offre           text NOT NULL,
  texte           text NOT NULL,
  visuel_titre    text,
  visuel_fichier  text,
  statut          text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','publie','abandonne')),
  publie_le       timestamptz,
  adresse         text,
  impressions     int, reactions int, commentaires int, partages int, clics int, abonnes_gagnes int,
  mesure_le       timestamptz,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jour, reseau)
);
CREATE OR REPLACE VIEW publications_mesure AS
SELECT reseau, offre, count(*) FILTER (WHERE statut = 'publie') AS publiees,
       sum(impressions) AS impressions,
       round(100.0 * sum(coalesce(reactions,0) + coalesce(commentaires,0) + coalesce(partages,0))
             / nullif(sum(impressions), 0), 2) AS engagement_pct,
       round(100.0 * sum(clics) / nullif(sum(impressions), 0), 2) AS clics_pct,
       sum(abonnes_gagnes) AS abonnes_gagnes
FROM publications GROUP BY reseau, offre;
