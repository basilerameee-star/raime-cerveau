// LES ENVOIS dans le rapport de 7 h 30 (14/10/2026). Depuis le 14/10, les pré-audits et les vitrines partent seuls (accord de
// Basile) : le matin, il lit ce qui est parti la veille, ce que Resend dit de la livraison, le plafond du jour, ce qui attend, et
// l'état du Fureteur (qui trouve les adresses). Rien ici ne demande de geste : ce qui en demande part par la Sentinelle
// (n8n/sentinelle_diagnostic.sql). Les vues et le plafond viennent de n8n/envois.sql. Une lecture en échec le dit.
const { n8n, cerveau } = require('./bases.cjs');

const JOUR = "date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris'";
const HIER = "(date_trunc('day', now() AT TIME ZONE 'Europe/Paris') - interval '1 day') AT TIME ZONE 'Europe/Paris'";
const ARRIVES = "('delivered', 'opened', 'clicked')";

async function chiffres() {
  const { rows: [c] } = await n8n.query(`SELECT
    (SELECT count(*)::int FROM outreach WHERE status = 'envoye' AND sent_at >= ${HIER} AND sent_at < ${JOUR}) AS pa_hier,
    (SELECT count(*)::int FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le >= ${HIER} AND envoye_le < ${JOUR}) AS vi_hier,
    (SELECT count(*)::int FROM envoi_preaudits) AS pa_attente, (SELECT count(*)::int FROM envoi_vitrines) AS vi_attente,
    plafond_envoi('preaudits') AS pa_plafond, plafond_envoi('vitrines') AS vi_plafond,
    (SELECT mode FROM send_config WHERE id = 1) AS pa_mode, (SELECT mode FROM vitrines_envoi_config WHERE id = 1) AS vi_mode,
    (SELECT count(*)::int FROM (SELECT livraison FROM outreach WHERE status = 'envoye' AND sent_at > now() - interval '7 days'
      UNION ALL SELECT livraison FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le > now() - interval '7 days') l) AS partis_7j,
    (SELECT count(*)::int FROM (SELECT livraison FROM outreach WHERE status = 'envoye' AND sent_at > now() - interval '7 days'
      UNION ALL SELECT livraison FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le > now() - interval '7 days') l WHERE livraison IN ${ARRIVES}) AS arrives_7j,
    (SELECT count(*)::int FROM (SELECT livraison FROM outreach WHERE status = 'envoye' AND sent_at > now() - interval '7 days'
      UNION ALL SELECT livraison FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le > now() - interval '7 days') l WHERE livraison = 'bounced') AS revenus_7j,
    (SELECT count(*)::int FROM (SELECT livraison FROM outreach WHERE status = 'envoye' AND sent_at > now() - interval '7 days'
      UNION ALL SELECT livraison FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le > now() - interval '7 days') l WHERE livraison = 'complained') AS plaintes_7j,
    (SELECT count(*)::int FROM prospects WHERE furete_le > now() - interval '24 hours' AND furete_note LIKE 'adresse sur le site%') AS adresses_24h`);
  return c;
}

async function fureteur() {
  const { rows: [p] } = await cerveau.query(`SELECT count(*)::int AS n FROM boucle_passages WHERE agent = 'fureteur' AND statut = 'ok'
    AND fin_le > now() - interval '24 hours'`);
  const { rows: [j] } = await cerveau.query(`SELECT motif FROM journal WHERE acteur = 'fureteur' AND created_at > now() - interval '24 hours'
    ORDER BY created_at DESC LIMIT 1`);
  return { passages: p ? p.n : 0, ferme: !!(j && /Moteur : fermé/.test(j.motif || '')) };
}

const mode = (m, heure) => (m === 'live' ? `partent seuls à ${heure} les jours ouvrés` : m === 'test' ? 'envoi en essai' : 'envoi en pause');

async function section() {
  try {
    const c = await chiffres();
    const f = await fureteur().catch(() => null);
    const sansNouvelle = c.partis_7j - c.arrives_7j - c.revenus_7j - c.plaintes_7j;
    return { titre: 'Les envois (partis seuls, rien à faire)', lignes: [
      `Pré-audits partis hier : ${c.pa_hier} · plafond du jour ${c.pa_plafond} · en attente ${c.pa_attente} (${mode(c.pa_mode, '8 h')}).`,
      `Vitrines parties hier : ${c.vi_hier} · plafond du jour ${c.vi_plafond} · en attente ${c.vi_attente} (${mode(c.vi_mode, '9 h')}).`,
      `Livraison sur 7 jours (selon Resend) : ${c.arrives_7j} arrivés, ${c.revenus_7j} revenus, ${c.plaintes_7j} plainte(s), ${sansNouvelle} pas encore relus, sur ${c.partis_7j} partis.`,
      f ? `Fureteur : ${f.passages} passage(s) en 24 h, ${c.adresses_24h} adresse(s) trouvée(s)${f.ferme ? ' ; le moteur de recherche est fermé, aucune nouvelle adresse : le stock des pré-audits ne se remplit plus' : ''}.`
        : `Fureteur : lecture en échec.`,
    ] };
  } catch (e) {
    return { titre: 'Les envois : lecture en échec', lignes: [`Les chiffres d’envoi n’ont pas pu être lus ce matin (${String(e && e.message || e).slice(0, 120)}).`] };
  }
}

module.exports = { section };
