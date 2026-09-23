-- La recherche ne lisait que le corps des textes, jamais leur titre ni leur chemin.
-- « Carte commerciale » ou « Feuille de route commerciale » sont des TITRES : l'architecte
-- les cherchait et tombait sur le manuscrit du livre. Constaté deux cycles de suite par
-- sa méta-réflexion, le 2026-09-23 (écart persistant « chercher ×2 »).
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS mots_titre tsvector
  GENERATED ALWAYS AS (to_tsvector('french',
    coalesce(titre, '') || ' ' || regexp_replace(coalesce(source, ''), '[/_.-]+', ' ', 'g'))) STORED;
CREATE INDEX IF NOT EXISTS kb_chunks_mots_titre ON kb_chunks USING GIN(mots_titre);
