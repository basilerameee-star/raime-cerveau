-- JARVIS (25/09/2026) : ce que Basile demande à voix haute ou par écrit, et la jauge de Claude.
--
-- Une COMMANDE est une demande d'action (« crée… », « corrige… », « lance… ») : Jarvis ne l'exécute
-- pas lui-même, il la note ici. Claude la lit à l'ouverture de chaque session et la traite ; un
-- agent du cerveau pourra en prendre une part plus tard, par le sas du Gardien.
CREATE TABLE IF NOT EXISTS commandes (
  id        serial PRIMARY KEY,
  cree_le   timestamptz NOT NULL DEFAULT now(),
  texte     text NOT NULL,
  source    text NOT NULL DEFAULT 'jarvis',          -- jarvis (voix ou écrit)
  pour      text NOT NULL DEFAULT 'claude',          -- claude | cerveau
  etat      text NOT NULL DEFAULT 'a_faire' CHECK (etat IN ('a_faire','en_cours','faite','refusee')),
  reponse   text,
  traite_le timestamptz
);
CREATE INDEX IF NOT EXISTS commandes_etat ON commandes(etat, cree_le);

-- La jauge du forfait Claude de Basile (fenêtre de 5 h, semaine). Jarvis ne peut pas la lire
-- lui-même : Claude y dépose sa lecture à chaque session, et Jarvis dit la dernière, datée.
CREATE TABLE IF NOT EXISTS claude_usage (
  id              serial PRIMARY KEY,
  lu_le           timestamptz NOT NULL DEFAULT now(),
  fenetre         text NOT NULL,                     -- '5 heures' | 'semaine'
  pourcent        int NOT NULL CHECK (pourcent BETWEEN 0 AND 100),
  reinitialise_le timestamptz
);
