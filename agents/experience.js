// LA MÉMOIRE D'EXPÉRIENCE — la matière d'un futur modèle du monde (type JEPA).
//
// Avant et après chaque passage d'un agent, la boucle photographie la situation de la
// maison : quelques chiffres qui disent où elle en est. Avec l'action entre les deux et son
// résultat, chaque ligne devient un exemple (avant, action, après, résultat). Quand il y en
// aura assez, un petit prédicteur apprendra « si je fais ceci, voilà ce qui arrive » et sera
// comparé, mesure à l'appui, à l'estimation actuelle de l'architecte (voir JEPA.md).
//
// Règles : des comptages seulement (aucune donnée personnelle), une requête qui échoue vaut
// null et ne bloque jamais la boucle, et la photographie coûte quelques millisecondes.

const MESURES = {
  bibliotheque_morceaux:  `SELECT count(*) FROM kb_chunks`,
  savoir_articles:        `SELECT count(*) FROM savoir_pages`,
  questions_ouvertes:     `SELECT count(*) FROM demandes WHERE etat = 'ouverte'`,
  echecs_24h:             `SELECT count(*) FROM boucle_passages WHERE statut = 'echec' AND fin_le > now() - interval '24 hours'`,
  depense_modeles_24h:    `SELECT coalesce(round(sum(cost_usd)::numeric, 4), 0) FROM agent_runs WHERE created_at > now() - interval '24 hours'`,
  portes_reperees:        `SELECT count(*) FROM portes`,
  publications_brouillon: `SELECT count(*) FROM publications WHERE statut = 'brouillon'`,
  pistes_trouvees:        `SELECT count(*) FROM pistes`,
};

export async function photographier(brain) {
  const photo = { le: new Date().toISOString() };
  for (const [nom, sql] of Object.entries(MESURES)) {
    try {
      const { rows } = await brain.query(sql);
      photo[nom] = Number(Object.values(rows[0])[0]);
    } catch { photo[nom] = null; /* table absente : la mesure attend */ }
  }
  return photo;
}

export async function noter(brain, { source = 'boucle', agent, action, arguments: args = {}, avant, apres = null,
  succes = null, resultat = null, cout_usd = null, duree_ms = null }) {
  try {
    await brain.query(
      `INSERT INTO experiences(source, agent, action, arguments, avant, apres, succes, resultat, cout_usd, duree_ms)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [source, agent, action, JSON.stringify(args), JSON.stringify(avant), apres && JSON.stringify(apres),
       succes, resultat && String(resultat).slice(0, 500), cout_usd, duree_ms]);
  } catch { /* la mémoire d'expérience ne doit jamais faire tomber un agent */ }
}

export async function preparer(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS experiences (
      id bigserial PRIMARY KEY, source text NOT NULL DEFAULT 'boucle', agent text NOT NULL,
      action text NOT NULL, arguments jsonb NOT NULL DEFAULT '{}', avant jsonb NOT NULL, apres jsonb,
      succes boolean, resultat text, cout_usd numeric(12,6), duree_ms int,
      cree_le timestamptz NOT NULL DEFAULT now())`);
  await brain.query(`CREATE INDEX IF NOT EXISTS experiences_agent ON experiences(agent, cree_le DESC)`);
}
