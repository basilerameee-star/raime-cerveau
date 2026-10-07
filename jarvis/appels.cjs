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

// Les prospects à appeler, le plus ancien d'abord : { total, categories: {nom: n}, reportes, liste: [{ siren, nom, segment,
// categorie, telephone, ville, envoye_le, jours }] }. 07/10/2026 : Basile trie par catégorie (filtre `categories`, liste
// de noms ; vide = toutes) ; les compteurs sont calculés AVANT le filtre, pour que chaque case affiche son vrai nombre.
async function aFaire(limite = 20, { categories = [] } = {}) {
  await preparer();
  const traites = new Set((await lire(`SELECT siren FROM appels WHERE etat <> 'plus_tard' OR rappel_le > current_date`)).map((r) => r.siren));
  const rows = await lireN8n(`SELECT * FROM (
      SELECT DISTINCT ON (o.siren) o.siren, o.prospect_name AS nom, coalesce(o.segment, p.sector) AS segment, p.telephone, p.city AS ville, o.sent_at
      FROM outreach o JOIN prospects p ON p.siren = o.siren
      WHERE o.status = 'envoye' AND coalesce(p.telephone, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM outreach r WHERE r.siren = o.siren AND r.reply_at IS NOT NULL)
      ORDER BY o.siren, o.sent_at DESC) x
    WHERE x.sent_at < now() - make_interval(days => $1) ORDER BY x.sent_at LIMIT 500`, [DELAI_JOURS]);
  const liste = rows.filter((r) => !traites.has(r.siren)).map((r) => ({
    siren: r.siren, nom: r.nom, segment: r.segment, categorie: r.segment || 'Sans secteur', telephone: r.telephone, ville: r.ville,
    envoye_le: new Date(r.sent_at).toISOString().slice(0, 10), jours: Math.floor((Date.now() - new Date(r.sent_at)) / 86400e3) }));
  // Les commerçants des vitrines (agents/vitrines.js) : sans e-mail ou dès leur réponse, tout de suite ; sinon, sept jours après l'envoi.
  const vitrines = await lire(`SELECT id, nom, metier, telephone, ville, envoye_le, email, statut, motif FROM vitrines
    WHERE telephone IS NOT NULL AND nom IS NOT NULL
      AND (statut IN ('a_appeler', 'repondu') OR (statut = 'envoye' AND envoye_le < now() - make_interval(days => $1)))
    ORDER BY coalesce(envoye_le, cree_le) LIMIT 500`, [DELAI_JOURS]).catch(() => []);
  for (const v of vitrines) {
    if (traites.has(`v${v.id}`)) continue;
    liste.push({ siren: `v${v.id}`, nom: v.nom, segment: `Commerce sans site · ${v.metier}`, categorie: `Vitrines · ${v.metier || 'commerce'}`,
      telephone: v.telephone, ville: v.ville,
      envoye_le: v.envoye_le ? new Date(v.envoye_le).toISOString().slice(0, 10) : null,
      jours: v.envoye_le ? Math.floor((Date.now() - new Date(v.envoye_le)) / 86400e3) : null, repondu: v.statut === 'repondu',
      raison: v.statut === 'repondu' ? (v.motif || 'a répondu à l’e-mail') : v.statut === 'a_appeler' ? (v.email ? (v.motif || 'à appeler') : 'aucun e-mail envoyé (adresse introuvable)')
        : `e-mail sans réponse depuis ${DELAI_JOURS} jours`, fiche: `/api/vitrines/${v.id}` });
  }
  liste.sort((a, b) => Number(Boolean(b.repondu)) - Number(Boolean(a.repondu))); // qui a répondu passe devant
  const compte = {};
  for (const x of liste) compte[x.categorie] = (compte[x.categorie] || 0) + 1;
  const choix = new Set((Array.isArray(categories) ? categories : String(categories || '').split(',')).map((c) => String(c).trim()).filter(Boolean));
  const filtree = choix.size ? liste.filter((x) => choix.has(x.categorie)) : liste;
  const [r] = await lire(`SELECT count(*)::int AS n FROM appels WHERE etat = 'plus_tard' AND rappel_le > current_date`).catch(() => [{ n: 0 }]);
  return { total: liste.length, affiches: filtree.length, categories: compte, reportes: (r && r.n) || 0, liste: filtree.slice(0, limite) };
}

// Basile note un appel. « plus_tard » : le prospect revient à la date choisie (`rappel_le`, AAAA-MM-JJ : demain, la
// semaine prochaine, ou un jour précis), ou dans `dans_jours` jours (3 par défaut) ; entre 1 et 120 jours.
async function noter(siren, { etat, note = null, dans_jours = 3, rappel_le = null } = {}) {
  if (!/^(\d{9}|v\d+)$/.test(String(siren))) return { ok: false, erreur: 'siren invalide' };
  if (!ETATS.includes(etat)) return { ok: false, erreur: `état attendu : ${ETATS.join(', ')}` };
  await preparer();
  let jours = Math.min(120, Math.max(1, Number(dans_jours) || 3));
  if (rappel_le) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(rappel_le)) ? Date.parse(`${rappel_le}T12:00:00Z`) : NaN;
    if (!Number.isFinite(d)) return { ok: false, erreur: 'date attendue : AAAA-MM-JJ' };
    jours = Math.ceil((d - Date.now()) / 86400e3);
    if (jours < 1 || jours > 120) return { ok: false, erreur: 'la date doit tomber entre demain et dans quatre mois' };
  }
  await lire(`INSERT INTO appels (siren, etat, note, rappel_le) VALUES ($1, $2, $3, CASE WHEN $2 = 'plus_tard' THEN current_date + $4::int END)
    ON CONFLICT (siren) DO UPDATE SET etat = EXCLUDED.etat, note = EXCLUDED.note, rappel_le = EXCLUDED.rappel_le, maj_le = now()`,
  [String(siren), etat, note ? String(note).slice(0, 500) : null, jours]);
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`,
    [`Appel de relance noté : ${etat}${etat === 'plus_tard' ? ` (dans ${jours} jour${jours > 1 ? 's' : ''})` : ''}`, `siren ${siren}${note ? ` · ${String(note).slice(0, 200)}` : ''}`]);
  return { ok: true, ...(etat === 'plus_tard' ? { dans_jours: jours } : {}) };
}

// Pour Jarvis, à l'oral : les trois premiers (qui a répondu d'abord, puis les plus anciens), avec leur numéro.
async function phrase() {
  try {
    const a = await aFaire(3);
    if (!a.total) return '';
    return `\nAppels à passer par Basile : ${a.total} (réponse reçue, e-mail introuvable, ou sans réponse depuis ${DELAI_JOURS} jours) ; `
      + a.liste.map((x) => `${x.nom}${x.ville ? ` (${x.ville})` : ''}, ${x.telephone}, ${x.repondu || x.jours == null ? x.raison : `e-mail parti il y a ${x.jours} jours`}`).join(' ; ') + '.';
  } catch { return ''; }
}

module.exports = { aFaire, noter, phrase, DELAI_JOURS };
