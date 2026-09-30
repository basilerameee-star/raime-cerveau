// LES APPELS DE RELANCE — Basile, 30/09/2026 : « si ce n'est pas le cas, au bout d'une semaine, je veux que
// mon interface me dise d'appeler ce numéro-là, parce que ça fait une semaine. Je me chargerai de l'appeler. »
//
// Un prospect entre dans la liste quand son dernier e-mail est parti il y a au moins sept jours, que personne
// n'a répondu (sur aucun de ses e-mails) et que son numéro est connu. Il en sort quand Basile note l'appel
// (« appelé », « pas intéressé »), ou pour quelques jours s'il dit « plus tard ». Lu par /api/etat (l'interface,
// celle en 3D comprise), par /api/appels, et par Jarvis à l'oral. Rien n'est appelé ni envoyé ici.
'use strict';

const { lire, lireN8n } = require('./bases.cjs');

const DELAI_JOURS = 7;
const ETATS = ['appele', 'pas_interesse', 'plus_tard'];

async function preparer() {
  await lire(`CREATE TABLE IF NOT EXISTS appels (siren text PRIMARY KEY, etat text NOT NULL CHECK (etat IN ('appele','pas_interesse','plus_tard')),
    note text, rappel_le date, maj_le timestamptz NOT NULL DEFAULT now())`);
}

// Les prospects à appeler, le plus ancien d'abord : { total, liste: [{ siren, nom, segment, telephone, ville, envoye_le, jours }] }.
async function aFaire(limite = 20) {
  await preparer();
  const traites = new Set((await lire(`SELECT siren FROM appels WHERE etat <> 'plus_tard' OR rappel_le > current_date`)).map((r) => r.siren));
  const rows = await lireN8n(`SELECT * FROM (
      SELECT DISTINCT ON (o.siren) o.siren, o.prospect_name AS nom, o.segment, p.telephone, p.city AS ville, o.sent_at
      FROM outreach o JOIN prospects p ON p.siren = o.siren
      WHERE o.status = 'envoye' AND coalesce(p.telephone, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM outreach r WHERE r.siren = o.siren AND r.reply_at IS NOT NULL)
      ORDER BY o.siren, o.sent_at DESC) x
    WHERE x.sent_at < now() - make_interval(days => $1) ORDER BY x.sent_at LIMIT 500`, [DELAI_JOURS]);
  const liste = rows.filter((r) => !traites.has(r.siren)).map((r) => ({
    siren: r.siren, nom: r.nom, segment: r.segment, telephone: r.telephone, ville: r.ville,
    envoye_le: new Date(r.sent_at).toISOString().slice(0, 10), jours: Math.floor((Date.now() - new Date(r.sent_at)) / 86400e3) }));
  // Les commerçants des vitrines (agents/vitrines.js) : sans e-mail, tout de suite ; avec, sept jours après l'envoi.
  const vitrines = await lire(`SELECT id, nom, metier, telephone, ville, envoye_le, email FROM vitrines
    WHERE telephone IS NOT NULL AND nom IS NOT NULL
      AND (statut = 'a_appeler' OR (statut = 'envoye' AND envoye_le < now() - make_interval(days => $1)))
    ORDER BY coalesce(envoye_le, cree_le) LIMIT 500`, [DELAI_JOURS]).catch(() => []);
  for (const v of vitrines) {
    if (traites.has(`v${v.id}`)) continue;
    liste.push({ siren: `v${v.id}`, nom: v.nom, segment: `Commerce sans site · ${v.metier}`, telephone: v.telephone, ville: v.ville,
      envoye_le: v.envoye_le ? new Date(v.envoye_le).toISOString().slice(0, 10) : null,
      jours: v.envoye_le ? Math.floor((Date.now() - new Date(v.envoye_le)) / 86400e3) : null,
      raison: v.email ? `e-mail sans réponse depuis ${DELAI_JOURS} jours` : 'e-mail non trouvé', fiche: `/api/vitrines/${v.id}` });
  }
  return { total: liste.length, liste: liste.slice(0, limite) };
}

// Basile note un appel. « plus_tard » : le prospect revient dans `dans_jours` jours (3 par défaut).
async function noter(siren, { etat, note = null, dans_jours = 3 } = {}) {
  if (!/^(\d{9}|v\d+)$/.test(String(siren))) return { ok: false, erreur: 'siren invalide' };
  if (!ETATS.includes(etat)) return { ok: false, erreur: `état attendu : ${ETATS.join(', ')}` };
  await preparer();
  const jours = Math.min(60, Math.max(1, Number(dans_jours) || 3));
  await lire(`INSERT INTO appels (siren, etat, note, rappel_le) VALUES ($1, $2, $3, CASE WHEN $2 = 'plus_tard' THEN current_date + $4::int END)
    ON CONFLICT (siren) DO UPDATE SET etat = EXCLUDED.etat, note = EXCLUDED.note, rappel_le = EXCLUDED.rappel_le, maj_le = now()`,
  [String(siren), etat, note ? String(note).slice(0, 500) : null, jours]);
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`,
    [`Appel de relance noté : ${etat}`, `siren ${siren}${note ? ` · ${String(note).slice(0, 200)}` : ''}`]);
  return { ok: true };
}

// Pour Jarvis, à l'oral : les trois plus anciens, avec leur numéro.
async function phrase() {
  try {
    const a = await aFaire(3);
    if (!a.total) return '';
    return `\nAppels de relance : ${a.total} prospect(s) sans réponse depuis au moins ${DELAI_JOURS} jours, à appeler par Basile ; `
      + a.liste.map((x) => `${x.nom}${x.ville ? ` (${x.ville})` : ''}, ${x.telephone}, ${x.jours != null ? `e-mail parti il y a ${x.jours} jours` : x.raison}`).join(' ; ') + '.';
  } catch { return ''; }
}

module.exports = { aFaire, noter, phrase, DELAI_JOURS };
