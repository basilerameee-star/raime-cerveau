// LES APPELS DE RELANCE — Basile, 30/09/2026 : « si ce n'est pas le cas, au bout d'une semaine, je veux que
// mon interface me dise d'appeler ce numéro-là, parce que ça fait une semaine. Je me chargerai de l'appeler. »
//
// Un prospect entre dans la liste quand son dernier e-mail est parti il y a au moins sept jours, que personne
// n'a répondu (sur aucun de ses e-mails) et que son numéro est connu. Il en sort quand Basile note l'appel
// (« appelé », « pas intéressé »), ou jusqu'à la date choisie s'il dit « plus tard ». Lu par /api/etat (l'interface,
// celle en 3D comprise), par /api/appels, et par Jarvis à l'oral. Rien n'est appelé ni envoyé ici.
//
// 08/10/2026 (l'agenda, jarvis/agenda.cjs) : « plus tard » crée une relance datée de l'agenda (de 1 à 731 jours) ; un contact
// qui a une relance FUTURE sort de la liste, une relance ÉCHUE l'y ramène quel que soit l'état de son e-mail (les cabinets
// appelés le 07/10 avaient encore un brouillon). Et la catégorie affichée est l'activité RÉELLE (code NAF et nom) : un
// numéro étiqueté « organisme de formation » n'avait rien à voir ; les associations, syndicats, codes NAF exclus et
// prospects écartés n'y apparaissent plus (jarvis/naf_exclus.json, partagé avec la prospection).
'use strict';

const { lire, lireN8n } = require('./bases.cjs');
const REGLES = require('./naf_exclus.json');

const DELAI_JOURS = 7;
const MAX_JOURS = 731;
const ETATS = ['appele', 'pas_interesse', 'plus_tard', 'mal_classe'];
const NAF_EXCLUS = new Set(REGLES.naf);
const NON_LUCRATIF = new RegExp(REGLES.nom_non_lucratif, 'i');
const ZONE = 'Europe/Paris';

async function preparer() {
  await lire(`CREATE TABLE IF NOT EXISTS appels (siren text PRIMARY KEY, etat text NOT NULL CHECK (etat IN ('appele','pas_interesse','plus_tard')),
    note text, rappel_le date, maj_le timestamptz NOT NULL DEFAULT now())`);
}

// L'activité réelle d'une entreprise, lue dans son code NAF et son nom (le secteur de la fiche peut être faux).
// Sans code NAF, le secteur de la fiche reste affiché tel quel.
function activite(naf, nom = '', secteur = '') {
  const n = String(naf || '').trim().toUpperCase();
  if (!n) return secteur || 'Sans secteur';
  if (n === '69.20Z') return 'Cabinets comptables';
  if (n === '69.10Z') return /notaire|notarial/i.test(nom) ? 'Notaires' : /avocat/i.test(nom) ? 'Avocats' : 'Activités juridiques (à vérifier)';
  if (n === '70.22Z') return 'Conseil';
  if (n === '68.31Z' || n === '68.32A') return 'Immobilier';
  if (n === '66.22Z') return 'Courtiers en assurance';
  if (n === '78.10Z') return 'Recrutement';
  if (n === '71.11Z') return 'Architectes';
  return `NAF ${n}`;
}
// Jamais proposé à l'appel : prospect écarté, code NAF exclu, ou nom d'une structure à but non lucratif.
const exclu = (p) => p.status === 'exclu' || NAF_EXCLUS.has(String(p.naf || '').trim().toUpperCase()) || NON_LUCRATIF.test(String(p.name || p.nom || ''));
const domaine = (site) => { try { return new URL(/^https?:/i.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, ''); } catch (e) { return null; } };
const jourIso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const depuis = (d) => (d ? Math.floor((Date.now() - new Date(d)) / 86400e3) : null);

// Les prospects à appeler, le plus ancien d'abord : { total, categories: {nom: n}, reportes, liste: [{ siren, nom, segment,
// categorie, naf, site, numero_verifie, telephone, ville, envoye_le, jours, agenda_id?, raison? }] }. 07/10/2026 : Basile trie
// par catégorie (filtre `categories`, liste de noms ; vide = toutes) ; les compteurs sont calculés AVANT le filtre.
async function aFaire(limite = 20, { categories = [] } = {}) {
  await preparer();
  const agenda = require('./agenda.cjs');
  const auj = agenda.aujourdhui();
  // Les relances ouvertes de l'agenda : futures, elles cachent le contact ; échues, elles le ramènent en tête.
  const ouverts = await lire(`SELECT id, cible_type, cible_id, nom, telephone, motif, priorite,
      to_char(echeance AT TIME ZONE '${ZONE}', 'YYYY-MM-DD') AS jour
    FROM rappels WHERE statut = 'a_faire' AND cible_type IN ('prospect', 'vitrine') AND cible_id IS NOT NULL`);
  const cle = (o) => (o.cible_type === 'vitrine' ? 'v' : '') + o.cible_id;
  const futurs = new Set(), echus = new Map();
  for (const o of ouverts) { if (o.jour > auj) futurs.add(cle(o)); else echus.set(cle(o), o); }
  const traites = new Set((await lire(`SELECT siren FROM appels WHERE etat <> 'plus_tard' OR rappel_le > (now() AT TIME ZONE '${ZONE}')::date`)).map((r) => r.siren));
  const raisonAgenda = (o) => {
    const n = agenda.ecart(o.jour, auj);
    return `${o.motif || 'relance prévue'} · ${n > 0 ? `en retard depuis ${n} jour${n > 1 ? 's' : ''}` : 'prévue aujourd’hui'}`;
  };
  const COLS = `p.name, p.naf, p.status, p.website, to_jsonb(p) ->> 'site_preuve' AS site_preuve, p.telephone, p.city AS ville`;
  const rows = await lireN8n(`SELECT * FROM (
      SELECT DISTINCT ON (o.siren) o.siren, o.prospect_name AS nom, coalesce(o.segment, p.sector) AS segment, ${COLS}, o.sent_at
      FROM outreach o JOIN prospects p ON p.siren = o.siren
      WHERE o.status = 'envoye' AND coalesce(p.telephone, '') <> ''
        AND NOT EXISTS (SELECT 1 FROM outreach r WHERE r.siren = o.siren AND r.reply_at IS NOT NULL)
      ORDER BY o.siren, o.sent_at DESC) x
    WHERE x.sent_at < now() - make_interval(days => $1) ORDER BY x.sent_at LIMIT 500`, [DELAI_JOURS]);
  const vus = new Set(rows.map((r) => r.siren));
  const manquants = [...echus.values()].filter((o) => o.cible_type === 'prospect' && !vus.has(o.cible_id)).map((o) => o.cible_id);
  const ajoutes = manquants.length ? await lireN8n(`SELECT p.siren, p.sector AS segment, ${COLS},
      (SELECT o.prospect_name FROM outreach o WHERE o.siren = p.siren ORDER BY o.created_at DESC LIMIT 1) AS nom,
      (SELECT max(o.sent_at) FROM outreach o WHERE o.siren = p.siren) AS sent_at
    FROM prospects p WHERE p.siren = ANY($1::text[])`, [manquants]) : [];
  const entree = (r, o) => ({
    siren: r.siren, nom: r.nom || agenda.joli(r.name) || (o && o.nom), segment: r.segment || null, categorie: activite(r.naf, r.name || r.nom, r.segment),
    naf: r.naf || null, site: r.website ? domaine(r.website) : null, numero_verifie: !!r.site_preuve,
    telephone: r.telephone || (o && o.telephone) || null, ville: r.ville || null, envoye_le: jourIso(r.sent_at), jours: depuis(r.sent_at),
    ...(o ? { agenda_id: Number(o.id), priorite: Number(o.priorite), raison: raisonAgenda(o) } : {}),
  });
  const liste = [];
  for (const r of [...rows, ...ajoutes]) {
    const o = echus.get(r.siren);
    if (exclu(r) || futurs.has(r.siren) || (traites.has(r.siren) && !o)) continue;
    const e = entree(r, o);
    if (e.telephone) liste.push(e);
  }
  // une relance échue d'un prospect absent de la base n8n : ce que l'agenda en sait
  for (const o of echus.values()) {
    if (o.cible_type !== 'prospect' || vus.has(o.cible_id) || ajoutes.some((a) => a.siren === o.cible_id) || !o.telephone) continue;
    liste.push(entree({ siren: o.cible_id, nom: o.nom, telephone: o.telephone }, o));
  }
  // Les commerçants des vitrines (agents/vitrines.js) : sans e-mail ou dès leur réponse, tout de suite ; sinon, sept jours après l'envoi.
  const vitrinesEchues = [...echus.values()].filter((o) => o.cible_type === 'vitrine').map((o) => Number(o.cible_id)).filter(Number.isInteger);
  const vitrines = await lire(`SELECT id, nom, metier, telephone, ville, envoye_le, email, statut, motif, source FROM vitrines
    WHERE telephone IS NOT NULL AND nom IS NOT NULL
      AND (statut IN ('a_appeler', 'repondu') OR (statut = 'envoye' AND envoye_le < now() - make_interval(days => $1)) OR id = ANY($2::int[]))
    ORDER BY coalesce(envoye_le, cree_le) LIMIT 500`, [DELAI_JOURS, vitrinesEchues]).catch(() => []);
  for (const v of vitrines) {
    const k = `v${v.id}`, o = echus.get(k);
    if (futurs.has(k) || (traites.has(k) && !o)) continue;
    const sirene = v.source === 'sirene';   // trouvé au registre, sans site : la maquette est prête
    liste.push({ siren: k, nom: v.nom, segment: `Commerce sans site · ${v.metier}`,
      categorie: sirene ? `Sans site · ${v.metier || 'commerce'}` : `Vitrines · ${v.metier || 'commerce'}`,
      telephone: v.telephone, ville: v.ville, numero_verifie: true, envoye_le: jourIso(v.envoye_le), jours: depuis(v.envoye_le),
      repondu: v.statut === 'repondu',
      raison: o ? raisonAgenda(o) : v.statut === 'repondu' ? (v.motif || 'a répondu à l’e-mail') : sirene ? 'aucun site trouvé : maquette prête'
        : v.statut === 'a_appeler' ? (v.email ? (v.motif || 'à appeler') : 'aucun e-mail envoyé (adresse introuvable)')
          : `e-mail sans réponse depuis ${DELAI_JOURS} jours`,
      fiche: `/api/vitrines/${v.id}`, ...(o ? { agenda_id: Number(o.id), priorite: Number(o.priorite) } : {}) });
  }
  // ce qui rapporte vite passe devant : qui a répondu ou demandé à être rappelé, puis les relances échues, puis le reste
  const rang = (x) => (x.priorite === 3 || x.repondu ? 0 : x.agenda_id ? 1 : 2);
  liste.sort((a, b) => rang(a) - rang(b));
  const compte = {};
  for (const x of liste) compte[x.categorie] = (compte[x.categorie] || 0) + 1;
  const choix = new Set((Array.isArray(categories) ? categories : String(categories || '').split(',')).map((c) => String(c).trim()).filter(Boolean));
  const filtree = choix.size ? liste.filter((x) => choix.has(x.categorie)) : liste;
  const anciens = (await lire(`SELECT siren FROM appels WHERE etat = 'plus_tard' AND rappel_le > (now() AT TIME ZONE '${ZONE}')::date`)).map((r) => r.siren);
  const reportes = new Set([...futurs, ...anciens]).size;
  return { total: liste.length, affiches: filtree.length, categories: compte, reportes, liste: filtree.slice(0, limite) };
}

// Basile note un appel. « plus_tard » : le contact revient à la date choisie (`rappel_le`, AAAA-MM-JJ), dans `dans_mois`
// mois, ou dans `dans_jours` jours (3 par défaut) ; entre demain et deux ans (731 jours). La relance part dans l'agenda.
// « mal_classe » : pas pour nous (prospect écarté, motif au journal), sans ligne d'appel.
async function noter(siren, { etat, note = null, dans_jours = 3, dans_mois = null, rappel_le = null } = {}) {
  if (!/^(\d{9}|v\d+)$/.test(String(siren))) return { ok: false, erreur: 'siren invalide' };
  if (!ETATS.includes(etat)) return { ok: false, erreur: `état attendu : ${ETATS.join(', ')}` };
  await preparer();
  const agenda = require('./agenda.cjs');
  const cible = String(siren).startsWith('v') ? { cible_type: 'vitrine', cible_id: String(siren).slice(1) } : { cible_type: 'prospect', cible_id: String(siren) };
  const texte = note ? String(note).slice(0, 500) : null;
  if (etat === 'mal_classe') return agenda.malClasseCible(cible, texte);
  const auj = agenda.aujourdhui();
  let jour = null;
  if (etat === 'plus_tard') {
    if (rappel_le) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rappel_le))) return { ok: false, erreur: 'date attendue : AAAA-MM-JJ' };
      jour = String(rappel_le);
    } else if (dans_mois != null && dans_mois !== '') {
      const n = Number(dans_mois);
      if (!Number.isInteger(n) || n < 1 || n > 24) return { ok: false, erreur: 'délai attendu : de 1 à 24 mois' };
      jour = agenda.plusMois(auj, n);
    } else {
      const n = dans_jours == null || dans_jours === '' ? 3 : Number(dans_jours);
      if (!Number.isInteger(n) || n < 1 || n > MAX_JOURS) return { ok: false, erreur: `délai attendu : de 1 à ${MAX_JOURS} jours` };
      jour = agenda.plusJours(auj, n);
    }
    const n = agenda.ecart(auj, jour);
    if (!(n >= 1 && n <= MAX_JOURS)) return { ok: false, erreur: 'la date doit tomber entre demain et dans deux ans' };
  }
  const jours = jour ? agenda.ecart(auj, jour) : null;
  await lire(`INSERT INTO appels (siren, etat, note, rappel_le) VALUES ($1, $2, $3, $4::date)
    ON CONFLICT (siren) DO UPDATE SET etat = EXCLUDED.etat, note = EXCLUDED.note, rappel_le = EXCLUDED.rappel_le, maj_le = now()`,
  [String(siren), etat, texte, jour]);
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`,
    [`Appel de relance noté : ${etat}${etat === 'plus_tard' ? ` (dans ${jours} jour${jours > 1 ? 's' : ''})` : ''}`, `siren ${siren}${texte ? ` · ${texte.slice(0, 200)}` : ''}`]);
  if (etat === 'plus_tard') {
    await agenda.creer({ ...cible, echeance: jour, motif: texte ? `à rappeler : ${texte.slice(0, 200)}` : 'à rappeler (noté depuis la liste d’appels)',
      source: 'appels' }, { auj });
  } else {
    await agenda.fermerCible(cible, etat === 'appele' ? 'joint' : 'pas_interesse', texte);
  }
  return { ok: true, ...(etat === 'plus_tard' ? { dans_jours: jours } : {}) };
}

// Pour Jarvis, à l'oral : les trois premiers (qui a répondu d'abord, puis les plus anciens), avec leur numéro.
async function phrase() {
  try {
    const a = await aFaire(3);
    if (!a.total) return '';
    return `\nAppels à passer par Basile : ${a.total} (réponse reçue, e-mail introuvable, relance du jour, ou sans réponse depuis ${DELAI_JOURS} jours) ; `
      + a.liste.map((x) => `${x.nom}${x.ville ? ` (${x.ville})` : ''}, ${x.telephone}, ${x.raison || (x.jours == null ? 'à appeler' : `e-mail parti il y a ${x.jours} jours`)}`).join(' ; ') + '.';
  } catch { return ''; }
}

module.exports = { aFaire, noter, phrase, preparer, activite, exclu, DELAI_JOURS, MAX_JOURS };
