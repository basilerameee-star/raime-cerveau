// LES ENTREPRISES SANS SITE (08/10/2026) — Basile : « n'oublie pas les entreprises qui n'ont PAS de site ; on n'écarte
// pas des profils pour rien ».
//
// Sherlock (n8n) trouve les cabinets et agences de la région par leur code d'activité (notaires, avocats, comptables,
// immobilier, courtiers, recrutement, conseil, architectes ; 10 salariés et plus). Le Fureteur cherche leur site : celles
// qu'il déclare sans site (« absent ») ou seulement présentes sur le portail de leur profession (« portail ») ne servaient
// plus à rien. Elles deviennent ici des fiches de la liste VITRINES (raime_brain), comme les commerçants sans site :
//   1. le siège au registre public des entreprises (recherche-entreprises.api.gouv.fr : gratuit, sans clé, une
//      demande par seconde au plus) : adresse, coordonnées, département ; le siège doit être dans la région de Basile ;
//      ni association, ni service public, ni entreprise fermée ;
//   2. le métier, d'après le code d'activité et le nom ;
//   3. la fiche : son téléphone seulement s'il est connu ET vérifié (format français, ni gabarit ni surtaxé, indicatif du
//      département), son adresse seulement si elle porte son nom ; une maquette de site à son nom.
// Statut : « a_appeler » quand un numéro est connu ; sinon « a_completer » — la fiche est GARDÉE, Basile lit le numéro
// dans l'annuaire officiel de la profession (liens dans la fiche, jarvis/sans_site.cjs) et le saisit. Jamais « brouillon » :
// Basile n'a pas encore validé de texte d'e-mail pour ces entreprises. Rien n'est envoyé d'ici, aucun modèle, aucun coût.
import pg from 'pg';
import { joliNom, joliVille, adresseFiable, NAF_EXCLUS, NON_LUCRATIF, SANS_ACCENTS } from './prospection_auto.js';
import { preparer as preparerVitrines, maquette, slugifier, MAQUETTE_V } from './vitrines.js';
import { verifier, lisible, memeNumero } from '../jarvis/telephone.cjs';
import { NAF_SANS_SITE, REGION, bilan } from '../jarvis/sans_site.cjs';

const API = 'https://recherche-entreprises.api.gouv.fr/search';
const dort = (ms) => new Promise((r) => setTimeout(r, ms));
const NON_LUCRATIF_JS = new RegExp(NON_LUCRATIF, 'i');

// Le métier d'une entreprise, d'après son code d'activité (NAF) et son nom. 69.10Z couvre toutes les professions du
// droit : le nom (ou le registre des avocats) départage ; sinon « cabinet juridique », sans rien supposer.
export function metierFirme({ naf, name, est_avocat = false } = {}) {
  const nom = SANS_ACCENTS(name);
  switch (naf) {
    case '69.10Z':
      if (/notaire|notarial/.test(nom)) return 'notaire';
      if (est_avocat || /avocat/.test(nom)) return 'avocat';
      if (/huissier|commissaire/.test(nom)) return 'commissaire de justice';
      return 'cabinet juridique';
    case '69.20Z': return 'expert-comptable';
    case '68.31Z': case '68.32A': return 'agence immobilière';
    case '66.22Z': return 'courtier en assurance';
    case '78.10Z': return 'cabinet de recrutement';
    case '70.22Z': return 'cabinet de conseil';
    case '71.11Z': return 'architecte';
    default: return null;
  }
}

// Une entreprise de Sherlock entre ici : à prospecter, déclarée sans site (ou sur son seul portail), d'un code d'activité
// de Sherlock jamais exclu, à but lucratif.
export function candidate(p) {
  return p.status === 'nouveau' && ['absent', 'portail'].includes(p.site_statut) && NAF_SANS_SITE.includes(p.naf)
    && !NAF_EXCLUS.includes(p.naf) && !NON_LUCRATIF_JS.test(p.name || '');
}

// « 923 ROUTE DE FLERIER 74440 TANINGES » → « 923 Route de Flerier 74440 Taninges ».
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'sur', 'sous', 'd', 'l', 'bis', 'ter']);
const majuscules = (w) => w.replace(/(^|[-'’])(\p{L})/gu, (_, x, y) => x + y.toUpperCase());
export function joliAdresse(a) {
  return String(a || '').toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => {
    if (i > 0 && PETITS.has(w)) return w;
    const elision = i > 0 ? /^([ld]['’])(.+)$/.exec(w) : null;   // « rue de l'église » : l' reste en minuscule
    return elision ? elision[1] + majuscules(elision[2]) : majuscules(w);
  }).join(' ');
}

// Le siège, lu dans la réponse du registre ; null si l'entreprise n'y est pas.
export function lireRegistre(d, siren) {
  const e = ((d && d.results) || []).find((x) => x.siren === siren);
  if (!e) return null;
  const s = e.siege || {}, c = e.complements || {};
  const nombre = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  return {
    adresse: s.adresse ? joliAdresse(s.adresse) : null, ville: s.libelle_commune ? joliVille(s.libelle_commune) : null,
    departement: s.departement || null, lat: nombre(s.latitude), lon: nombre(s.longitude),
    nom_commercial: s.nom_commercial || null, ferme: e.etat_administratif === 'C' || s.etat_administratif === 'F',
    association: !!c.est_association, service_public: !!c.est_service_public, est_avocat: !!c.est_avocat,
  };
}

// Pourquoi une entreprise du registre n'entre pas, ou null si elle entre.
export function horsChamp(r) {
  if (!r) return 'absente du registre public des entreprises';
  if (r.ferme) return 'fermée au registre des entreprises';
  if (r.association) return 'association (à but non lucratif)';
  if (r.service_public) return 'service public';
  if (!REGION.includes(r.departement)) return `siège hors de la région (${r.departement || 'département inconnu'})`;
  return null;
}

// Le statut de la fiche : un numéro vérifié la met dans les appels ; sans numéro, elle est à compléter (même avec une
// adresse e-mail : aucun texte d'e-mail n'est encore validé pour les entreprises).
export const statutDe = ({ telephone }) => (telephone ? 'a_appeler' : 'a_completer');

const plat = (s) => SANS_ACCENTS(s).replace(/[^a-z0-9]+/g, ' ').trim();
// La page du portail notée par le Fureteur (« … seulement sur le portail de sa profession : https://… »), ou null.
export const portailDe = (note) => ((String(note || '').match(/portail de sa profession : (https?:\/\/[^\s;]+)/) || [])[1] || null);

export async function preparer({ n8n, brain }) {
  await preparerVitrines(brain);
  await brain.query('ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS telephone_source text');
  // Le nouveau statut « a_completer » : une contrainte sur le statut (s'il y en a une) l'accepte. Aujourd'hui la table n'en
  // a pas ; si elle en reçoit une, « a_completer » y est ajouté, rien d'autre ne change.
  await brain.query(`DO $$ DECLARE c record; def text; BEGIN
    FOR c IN SELECT conname, pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'vitrines'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%statut%' AND pg_get_constraintdef(oid) NOT LIKE '%a_completer%' LOOP
      def := replace(c.d, 'ARRAY[', 'ARRAY[''a_completer''::text, ');
      EXECUTE format('ALTER TABLE vitrines DROP CONSTRAINT %I', c.conname);
      IF def <> c.d THEN EXECUTE format('ALTER TABLE vitrines ADD CONSTRAINT %I %s', c.conname, def); END IF;
    END LOOP; END $$`);
  if (n8n) await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_statut text');
}

// Un passage : `combien` entreprises au plus, la région de Basile d'abord (la Haute-Savoie en tête), les plus grandes d'abord.
// fetch : pour le banc ; attente : le délai entre deux demandes au registre.
export async function depuisSherlock({ n8n, brain, combien = 10, fetch: f = globalThis.fetch, attente = 1100 } = {}) {
  await preparer({ n8n, brain });
  const bilanP = { candidates: 0, ajoutees: 0, a_appeler: 0, a_completer: 0, ecartees: 0, doublons: 0, erreur: null };
  const deja = (await brain.query(`SELECT substr(source_id, 8) AS siren FROM vitrines WHERE source_id LIKE 'sirene:%'`)).rows.map((r) => r.siren);
  const refus = (await brain.query(`SELECT siren FROM appels WHERE etat = 'pas_interesse'`).catch(() => ({ rows: [] }))).rows.map((r) => r.siren);
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS furete_note text');
  const { rows } = await n8n.query(`SELECT p.siren, p.name, p.naf, p.sector, p.city, p.departement, p.status, p.site_statut, p.telephone,
      p.telephone_source, p.contact_email, p.furete_note FROM prospects p
    WHERE p.status = 'nouveau' AND p.site_statut IN ('absent', 'portail') AND p.naf = ANY($1::text[]) AND p.naf <> ALL($2::text[])
      AND p.name !~* '${NON_LUCRATIF}' AND NOT (p.siren = ANY($3::text[]))
      -- déjà écrite par l'automatisation (ou en attente de l'être) : elle a sa place ailleurs
      AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.siren = p.siren AND o.status NOT IN ('non_recu', 'annule'))
    ORDER BY (p.departement = '74') DESC, (p.departement = ANY($4::text[])) DESC, p.effectif_est DESC NULLS LAST, p.siren
    LIMIT $5`, [NAF_SANS_SITE, NAF_EXCLUS, [...deja, ...refus], REGION, combien]);
  bilanP.candidates = rows.length;
  // les vitrines déjà connues (OpenStreetMap, Google) : une entreprise déjà présente n'est pas ajoutée deux fois
  const autres = (await brain.query(`SELECT id, nom, ville, telephone FROM vitrines WHERE source <> 'sirene' AND nom IS NOT NULL`)).rows;
  let premiere = true;
  for (const p of rows) {
    if (!candidate(p)) continue;
    if (!premiere) await dort(attente);
    premiere = false;
    let d;
    try {
      const r = await f(`${API}?q=${encodeURIComponent(p.siren)}&per_page=1`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`registre : ${r.status}`);
      d = await r.json();
    } catch (e) {
      // le registre ne répond pas (ou demande d'attendre) : on s'arrête, la suite au prochain passage
      bilanP.erreur = String(e.message || e).slice(0, 120);
      break;
    }
    const reg = lireRegistre(d, p.siren);
    const base = { source: 'sirene', source_id: `sirene:${p.siren}`, nom: joliNom(p.name), pays: 'FR' };
    const motifHors = horsChamp(reg);
    if (motifHors) {
      await brain.query(`INSERT INTO vitrines (source, source_id, nom, metier, ville, pays, departement, statut, motif)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecarte', $8) ON CONFLICT (source_id) DO NOTHING`,
      [base.source, base.source_id, base.nom, metierFirme(p), reg && reg.ville, base.pays, reg && reg.departement, motifHors]);
      bilanP.ecartees++;
      continue;
    }
    const metier = metierFirme({ ...p, est_avocat: reg.est_avocat });
    // le numéro de la fiche Sherlock, seulement s'il passe les précautions de l'annuaire (département du siège)
    const numero = verifier(p.telephone, reg.departement);
    const telephone = numero ? lisible(numero) : null;
    const email = p.contact_email && adresseFiable({ name: p.name, contact_email: p.contact_email }) ? String(p.contact_email).trim().toLowerCase() : null;
    // déjà parmi les vitrines (même numéro, ou même nom dans la même ville) : pas de deuxième fiche
    const noms = [base.nom, reg.nom_commercial && joliNom(reg.nom_commercial)].filter(Boolean).map(plat);
    const double = autres.find((a) => (telephone && memeNumero(a.telephone, telephone))
      || (plat(a.ville) === plat(reg.ville) && noms.includes(plat(a.nom))));
    if (double) {
      await brain.query(`INSERT INTO vitrines (source, source_id, nom, metier, ville, pays, departement, statut, motif)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecarte', $8) ON CONFLICT (source_id) DO NOTHING`,
      [base.source, base.source_id, base.nom, metier, reg.ville, base.pays, reg.departement, `déjà dans les vitrines (n°${double.id})`]);
      bilanP.doublons++;
      continue;
    }
    const statut = statutDe({ telephone });
    // « portail » : la page de l'entreprise sur le portail de sa profession, trouvée par la recherche du Fureteur (notée dans
    // sa fiche) ; Basile peut y lire le numéro. Elle n'est pas prouvée (ni SIREN ni nom et ville vérifiés) : dite telle quelle.
    const portail = p.site_statut === 'portail' ? portailDe(p.furete_note) : null;
    const v = { ...base, metier, adresse: reg.adresse, ville: reg.ville, departement: reg.departement, telephone, lat: reg.lat, lon: reg.lon };
    const motif = (p.site_statut === 'portail' ? 'aucun site à son nom : seulement une page sur le portail de sa profession' : 'aucun site à son nom')
      + (statut === 'a_completer' ? (email ? ' ; e-mail connu, numéro à trouver dans l’annuaire de la profession' : ' ; numéro à trouver dans l’annuaire de la profession') : '');
    const r = await brain.query(`INSERT INTO vitrines (source, source_id, nom, metier, adresse, ville, telephone, telephone_source, email, email_source,
        lat, lon, pays, departement, statut, motif, site, site_etat, site_signaux, slug, demo_html, maquette_v)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ON CONFLICT (source_id) DO NOTHING RETURNING id`,
    [v.source, v.source_id, v.nom, v.metier, v.adresse, v.ville, telephone, telephone ? `fiche Sherlock (${p.telephone_source || 'source non notée'})` : null,
      email, email ? 'fiche Sherlock' : null, v.lat, v.lon, v.pays, v.departement, statut, motif, portail, portail ? 'portail' : 'aucun',
      [p.site_statut === 'portail' ? 'seulement une page sur le portail de sa profession (trouvée par la recherche, non vérifiée)' : 'aucun site prouvé (Fureteur)'],
      slugifier(v), maquette(v), MAQUETTE_V]);
    if (r.rowCount) { bilanP.ajoutees++; bilanP[statut]++; }
  }
  if (bilanP.candidates || bilanP.erreur) {
    await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES ('sans_site', $1, $2)`,
      [`Entreprises sans site : ${bilanP.ajoutees} fiches ajoutées (${bilanP.a_appeler} à appeler, ${bilanP.a_completer} à compléter), ${bilanP.ecartees} hors champ, ${bilanP.doublons} déjà connues`,
        bilanP.erreur ? `registre des entreprises : ${bilanP.erreur} ; la suite au prochain passage` : 'Siège lu au registre public des entreprises ; numéro gardé seulement s’il est vérifié ; rien n’est envoyé.']).catch(() => {});
  }
  return bilanP;
}

// Le compte par verdict du Fureteur et par secteur (page Prospection) : le même que celui du Cockpit (jarvis/sans_site.cjs).
export async function bilanSansSite({ n8n }) {
  return bilan(async (sql, params) => (await n8n.query(sql, params)).rows);
}

// CLI : node agents/sans_site.js [nombre]
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); const brain = db();
  await n8n.connect(); await brain.connect();
  try { console.log('sans site :', JSON.stringify(await depuisSherlock({ n8n, brain, combien: Number(process.argv[2]) || 10 }))); }
  finally { await n8n.end(); await brain.end(); }
}
