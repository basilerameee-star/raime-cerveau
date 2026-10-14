-- Le vérificateur des publications (clippeur/verificateur.py, 08/10/2026). Le 08/10, Basile a découvert que 16 clips
-- TikTok avaient disparu sans que rien ne le signale. Chaque matin, chaque lien de clips_publies est testé, et son état
-- est noté ici. Le vérificateur passe aussi ces lignes lui-même à chaque passage (idempotent) ; ce fichier les rend visibles.
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS etat text;               -- 'en_ligne' ou 'disparu' ; vide : jamais contrôlé
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS controle_le timestamptz; -- le dernier contrôle qui a pu conclure
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS disparu_le timestamptz;  -- la première fois qu'il a été vu disparu
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS controle_note text;      -- la réponse de la plateforme, en clair
ALTER TABLE clips_publies ADD COLUMN IF NOT EXISTS compte text;             -- le compte qui porte le clip, lu à la plateforme
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clips_publies_etat_check') THEN
    ALTER TABLE clips_publies ADD CONSTRAINT clips_publies_etat_check CHECK (etat IS NULL OR etat IN ('en_ligne', 'disparu'));
  END IF;
END $$;
