// INSTRUMENTS — les capteurs déterministes que les agents de jugement viennent lire.
//
// Leçon de la journée : le Fureteur a été déclaré mort alors qu'il ajoutait 67 adresses,
// parce qu'aucune colonne n'enregistrait QUAND une adresse avait été trouvée. On mesurait
// la date de découverte du prospect. Une mesure fausse produit une conclusion fausse,
// énoncée avec assurance.
//
// Ces instruments ne jugent rien. Ils posent une trace là où il n'y en avait pas, pour que
// le Superviseur et le Réflexif décident sur des faits plutôt que sur des approximations.
import pg from 'pg';

// ── Instrument 1 : rendement réel de l'enrichissement ────────────────────────
// Le Fureteur tourne 24 fois par jour, 50 s à chaque passage. On ne peut pas le modifier
// sans risque — c'est un workflow n8n en production. On l'observe donc de l'extérieur :
// on note quel prospect possède une adresse, et la date à laquelle on l'a constaté.
export async function mesurerEnrichissement({ n8n, brain }) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS enrichissement_suivi (
      siren       text PRIMARY KEY,
      email_vu_le timestamptz NOT NULL DEFAULT now(),
      origine     text NOT NULL DEFAULT 'observe'
    )`);

  const { rows: connus } = await brain.query('SELECT count(*)::int AS n FROM enrichissement_suivi');
  const premierPassage = connus[0].n === 0;

  const { rows: joignables } = await n8n.query(
    `SELECT siren FROM prospects WHERE contact_email <> '' AND siren IS NOT NULL`);

  // Au premier passage on ne peut pas dater l'existant : on le marque honnêtement
  // « antérieur » plutôt que de prétendre l'avoir vu apparaître aujourd'hui.
  const origine = premierPassage ? 'anterieur' : 'observe';
  let nouveaux = 0;
  for (const p of joignables) {
    const { rowCount } = await brain.query(
      `INSERT INTO enrichissement_suivi(siren, origine) VALUES($1,$2)
       ON CONFLICT (siren) DO NOTHING`, [p.siren, origine]);
    nouveaux += rowCount;
  }

  const { rows: totaux } = await n8n.query(
    `SELECT count(*)::int AS prospects,
            count(*) FILTER (WHERE contact_email <> '')::int AS joignables FROM prospects`);
  const { rows: cadence } = await brain.query(`
    SELECT count(*) FILTER (WHERE email_vu_le > now() - interval '24 hours' AND origine='observe')::int AS jour,
           count(*) FILTER (WHERE email_vu_le > now() - interval '7 days'  AND origine='observe')::int AS semaine
    FROM enrichissement_suivi`);

  const t = totaux[0];
  return {
    premier_passage: premierPassage,
    prospects: t.prospects,
    joignables: t.joignables,
    couverture_pct: t.prospects ? +(100 * t.joignables / t.prospects).toFixed(1) : null,
    nouveaux_ce_passage: premierPassage ? 0 : nouveaux,
    trouves_24h: cadence[0].jour,
    trouves_7j: cadence[0].semaine,
    injoignables: t.prospects - t.joignables,
  };
}

// ── Instrument 2 : santé des sources de veille ───────────────────────────────
// Une source morte ne crie pas. Elle se contente de ne rien envoyer, ce qui ressemble
// exactement à une source calme. On mesure donc le silence, source par source.
export async function mesurerVeille({ n8n }) {
  const { rows } = await n8n.query(`
    SELECT source, count(*)::int AS items,
           (now()::date - max(captured_at)::date) AS silence_jours
    FROM veille_ia GROUP BY source`);
  const vivantes = rows.filter((s) => s.silence_jours <= 2);
  const ralenties = rows.filter((s) => s.silence_jours > 2 && s.silence_jours <= 7);
  const mortes = rows.filter((s) => s.silence_jours > 7);
  const { rows: recent } = await n8n.query(
    `SELECT count(*)::int AS n FROM veille_ia WHERE captured_at > now() - interval '7 days'`);
  return {
    sources: rows.length,
    vivantes: vivantes.length,
    ralenties: ralenties.length,
    mortes: mortes.length,
    mortes_noms: mortes.map((s) => `${s.source} (${s.silence_jours}j)`).slice(0, 12),
    captures_7j: recent[0].n,
  };
}

// ── Instrument 3 : dérive entre le prix du code et le prix réel ──────────────
export async function mesurerDerive() {
  const { derivePrix } = await import('./lib.js');
  return await derivePrix();
}

export async function relever({ n8n, brain }) {
  const enrichissement = await mesurerEnrichissement({ n8n, brain });
  const veille = await mesurerVeille({ n8n });
  const derive = await mesurerDerive();

  await brain.query(`
    CREATE TABLE IF NOT EXISTS releves (
      id bigserial PRIMARY KEY,
      mesures jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await brain.query('INSERT INTO releves(mesures) VALUES($1)',
    [JSON.stringify({ enrichissement, veille, derive })]);

  return { enrichissement, veille, derive };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const m = await relever({ n8n, brain });
    const e = m.enrichissement;
    console.log(`\n╔══ RELEVÉ DES INSTRUMENTS ══╗\n`);
    console.log(`ENRICHISSEMENT (le goulot)`);
    console.log(`  prospects        : ${e.prospects}`);
    console.log(`  joignables       : ${e.joignables}  (${e.couverture_pct} %)`);
    console.log(`  injoignables     : ${e.injoignables}`);
    if (e.premier_passage) console.log(`  → premier relevé : l'existant est marqué « antérieur », la cadence se mesurera à partir de maintenant`);
    else console.log(`  adresses trouvées: ${e.trouves_24h} sur 24 h · ${e.trouves_7j} sur 7 j`);
    console.log(`\nVEILLE`);
    console.log(`  ${m.veille.sources} sources · ${m.veille.vivantes} vivantes · ${m.veille.ralenties} ralenties · ${m.veille.mortes} mortes`);
    console.log(`  ${m.veille.captures_7j} captures sur 7 jours`);
    if (m.veille.mortes_noms.length) console.log(`  mortes : ${m.veille.mortes_noms.join(', ')}`);
    console.log(`\nDÉRIVE DES PRIX`);
    if (!m.derive.length) console.log(`  aucune : les prix du code sont à jour`);
    else m.derive.forEach((d) => console.log(`  ${d.tache} · ${d.modele} : code ${d.code_in} → réel ${d.reel_in} (${d.ecart_pct > 0 ? '+' : ''}${d.ecart_pct} %)`));
    console.log('');
  } finally { await brain.end(); await n8n.end(); }
}
