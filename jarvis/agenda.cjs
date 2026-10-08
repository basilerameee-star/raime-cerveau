// L'AGENDA DE BASILE (08/10/2026) — les relances à ne plus jamais oublier, au même endroit que ce qui attend sa décision.
//
// Ses réponses du 08/10/2026 : en ouvrant le Cockpit, un résumé chiffré et les alertes d'abord, le détail à un clic ;
// ce qui rapporte vite passe devant (celui qui a répondu ou demandé à être rappelé, puis les relances du jour et en retard,
// puis le reste) ; ce qui n'est pas traité le jour J reste en haut, « en retard depuis N jours », jamais déplacé en silence ;
// trois gestes pour reporter (boutons rapides, glisser sur un jour de la semaine, la voix) ; après un appel, des états fixes
// (joint, pas joint, rappeler le…, intéressé, pas intéressé, gagné) qui décident de la suite ; « pas pour nous / mal classé »
// à part, qui écarte vraiment (prospects.status = 'exclu') avec son motif au journal.
//
// Une relance est une ligne de la table rappels (créée par outils.cjs, partagée avec les minuteries « libres » dites à voix
// haute) qui vise une cible : un prospect (siren), une vitrine (son numéro), une candidature, un contact saisi à la main
// (téléphone ou e-mail), une décision, ou une tâche personnelle. Une seule relance ouverte par cible (index unique) : une
// deuxième demande déplace la première. Chaque geste est gardé dans rappels_historique. Le jour se compte à Paris.
// Rien n'est appelé ni envoyé d'ici ; aucun chiffre n'est inventé (l'argent du mois vient de la table revenus, 0 sinon).
'use strict';

const { lire, lireN8n, lireCoffre } = require('./bases.cjs');
const outils = require('./outils.cjs');
const appels = require('./appels.cjs');
const { preaudit } = require('./preaudits.cjs');

const ZONE = 'Europe/Paris';
const MAX_JOURS = 731;                 // deux ans au plus
const ADRESSE = process.env.COCKPIT_ADRESSE || 'https://cockpit.raime.fr';
const CIBLES = ['prospect', 'vitrine', 'candidature', 'contact', 'decision', 'tache'];
const SOURCES = ['basile', 'voix', 'appels', 'reconciliateur', 'vitrines', 'candidatures', 'migration'];
// Les états d'après l'appel, et ce que chacun décide pour la suite.
const RESULTATS = { joint: 'joint', pas_joint: 'pas joint', rappeler: 'à rappeler', interesse: 'intéressé',
  pas_interesse: 'pas intéressé', gagne: 'gagné', fait: 'fait' };
const SUITE_JOURS = { pas_joint: 7, interesse: 2 };   // la relance suivante, modifiable d'un geste
const VERS_APPELS = { joint: 'appele', interesse: 'appele', gagne: 'appele', fait: 'appele', pas_interesse: 'pas_interesse',
  pas_joint: 'plus_tard', rappeler: 'plus_tard' };
// ESF La Clusaz : noté « plus tard » le 07/10, c'est un syndicat (à but non lucratif), exclu depuis : jamais repris.
const NE_PAS_MIGRER = new Set(['329188494']);
const HEURE_RELANCE = '09:00';          // une relance « du jour » tombe à 9 h, heure de Paris

// ── Les jours, comptés à Paris ────────────────────────────────────────────────────────────────
const FORMAT_JOUR = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const aujourdhui = (maintenant = new Date()) => FORMAT_JOUR.format(maintenant);
const versUtc = (j) => { const [a, m, d] = String(j).split('-').map(Number); return Date.UTC(a, m - 1, d); };
const plusJours = (j, n) => new Date(versUtc(j) + n * 86400e3).toISOString().slice(0, 10);
function plusMois(j, n) {
  const [a, m, d] = String(j).split('-').map(Number);
  const debut = new Date(Date.UTC(a, m - 1 + n, 1));
  const dernier = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 0)).getUTCDate();
  debut.setUTCDate(Math.min(d, dernier));
  return debut.toISOString().slice(0, 10);
}
const ecart = (de, a) => Math.round((versUtc(a) - versUtc(de)) / 86400e3);
const dateValide = (j) => /^\d{4}-\d{2}-\d{2}$/.test(String(j)) && new Date(versUtc(j)).toISOString().slice(0, 10) === j;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function direJour(j) {
  const t = new Date(versUtc(j));
  return `${JOURS[t.getUTCDay()]} ${t.getUTCDate() === 1 ? '1er' : t.getUTCDate()} ${MOIS[t.getUTCMonth()]}`;
}
const court = (j) => (j ? `${String(j).slice(8, 10)}/${String(j).slice(5, 7)}` : '');
const jourDe = (d) => (d ? aujourdhui(new Date(d)) : null);
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const propre = (s, n = 500) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t ? t.slice(0, n) : null; };
// En SQL : la date du jour à Paris ($n::date) devient l'heure de la relance.
const ECHEANCE = (n) => `($${n}::date + time '${HEURE_RELANCE}') AT TIME ZONE '${ZONE}'`;
const JOUR_SQL = `to_char(echeance AT TIME ZONE '${ZONE}', 'YYYY-MM-DD')`;

// ── Le français : « dans 3 semaines », « le 12 novembre », « mardi prochain », « 12/11 » ─────────
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, trente: 30 };
const MOIS_SANS = MOIS.map(sansAccents);
function dateDuMois(jourDuMois, mois, an, auj) {
  if (!(mois >= 1 && mois <= 12 && jourDuMois >= 1 && jourDuMois <= 31)) return null;
  const iso = (a) => `${a}-${String(mois).padStart(2, '0')}-${String(jourDuMois).padStart(2, '0')}`;
  let x = iso(an || Number(auj.slice(0, 4)));
  if (!an && x < auj) x = iso(Number(auj.slice(0, 4)) + 1);   // sans année, une date passée est celle de l'an prochain
  return dateValide(x) ? x : null;
}
// Rend la date AAAA-MM-JJ comprise, ou null. Rien n'est deviné : une tournure inconnue n'est pas une date.
function comprendreDate(texte, auj = aujourdhui()) {
  const t = sansAccents(String(texte || '').toLowerCase()).replace(/’/g, "'").replace(/[.!?,;:]+$/, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^(aujourd'hui|ce jour)$/.test(t)) return auj;
  if (t === 'demain') return plusJours(auj, 1);
  if (/^apres[- ]demain$/.test(t)) return plusJours(auj, 2);
  if (t === 'la semaine prochaine') return plusJours(auj, 7);
  if (t === 'le mois prochain') return plusMois(auj, 1);
  if (/^l'(an|annee) prochaine?$/.test(t)) return plusMois(auj, 12);
  let m = t.match(/^dans (\d{1,3}|[a-z]+(?:-[a-z]+)?) (jours?|semaines?|mois|ans?|annees?)$/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NOMBRES[m[1]];
    if (!n) return null;
    // « dans huit jours », « dans quinze jours » : une et deux semaines, comme on le dit
    if (m[2].startsWith('jour')) return plusJours(auj, m[1] === 'huit' ? 7 : m[1] === 'quinze' ? 14 : n);
    if (m[2].startsWith('semaine')) return plusJours(auj, 7 * n);
    if (m[2] === 'mois') return plusMois(auj, n);
    return plusMois(auj, 12 * n);
  }
  m = t.match(new RegExp(`^(?:le |pour le )?(?:(?:${JOURS.join('|')}) )?(\\d{1,2})(?:er)? (${MOIS_SANS.join('|')})(?: (\\d{4}))?$`));
  if (m) return dateDuMois(Number(m[1]), MOIS_SANS.indexOf(m[2]) + 1, m[3] ? Number(m[3]) : null, auj);
  m = t.match(/^(?:le )?(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?$/);
  if (m) return dateDuMois(Number(m[1]), Number(m[2]), m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null, auj);
  m = t.match(new RegExp(`^(?:le |ce |pour )?(${JOURS.join('|')})(?: prochain)?$`));
  if (m) {
    let n = (JOURS.indexOf(m[1]) - new Date(versUtc(auj)).getUTCDay() + 7) % 7;
    if (n === 0) n = 7;                      // « lundi » dit un lundi : le suivant
    return plusJours(auj, n);
  }
  return null;
}

// La date d'une relance, d'après ce que l'écran envoie : une date précise (aujourd'hui permis), un délai en jours (au moins
// un), en mois (boutons « 1 mois », « 3 mois »…), ou une tournure française. Toujours entre aujourd'hui et deux ans.
function resoudre(d = {}, { auj = aujourdhui() } = {}) {
  let jour;
  const donne = (v) => v != null && v !== '';
  if (donne(d.echeance)) {
    jour = String(d.echeance).slice(0, 10);
    if (!dateValide(jour)) return { erreur: 'date attendue : AAAA-MM-JJ' };
  } else if (donne(d.dans_mois)) {
    const n = Number(d.dans_mois);
    if (!Number.isInteger(n) || n < 1 || n > 24) return { erreur: 'délai attendu : de 1 à 24 mois' };
    jour = plusMois(auj, n);
  } else if (donne(d.dans)) {
    const n = Number(d.dans);
    if (!Number.isInteger(n) || n < 1 || n > MAX_JOURS) return { erreur: `délai attendu : de 1 à ${MAX_JOURS} jours` };
    jour = plusJours(auj, n);
  } else if (donne(d.dans_texte)) {
    jour = comprendreDate(d.dans_texte, auj);
    if (!jour) return { erreur: 'délai non compris (ex. « dans 3 semaines », « le 12 novembre »)' };
  } else return { erreur: 'date ou délai attendu' };
  const n = ecart(auj, jour);
  if (n < 0) return { erreur: 'cette date est passée' };
  if (n > MAX_JOURS) return { erreur: `au plus ${MAX_JOURS} jours (deux ans)` };
  return { jour, dans: n };
}

// ── Les tables ───────────────────────────────────────────────────────────────────────────────
// rappels et rappels_historique : outils.preparer() ; agenda_vus : ce que la migration et le balayage ont déjà repris
// (une réponse, une vitrine qui a répondu), pour ne jamais recréer une relance que Basile a déjà traitée.
async function preparerTables() {
  await outils.preparer();
  await appels.preparer();
  await lire('CREATE TABLE IF NOT EXISTS agenda_vus (cle text PRIMARY KEY, vu_le timestamptz NOT NULL DEFAULT now())');
}
async function assurer() {
  const [x] = await lire(`SELECT to_regclass('agenda_vus') IS NOT NULL AND to_regclass('rappels_historique') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rappels' AND column_name = 'maj_le') AS ok`);
  if (!x || !x.ok) await preparerTables();
}

const COLONNES = `id, texte, cible_type, cible_id, nom, telephone, email, canal, motif, note, source, priorite, statut, resultat,
  ${JOUR_SQL} AS jour, echeance, cree_le, fait_le, signale_le, maj_le`;
const GROUPES = ['en_retard', 'aujourdhui', 'demain', 'semaine', 'plus_tard'];
function decorer(r, auj = aujourdhui()) {
  const n = ecart(auj, r.jour);
  const groupe = r.statut !== 'a_faire' ? 'traite' : n < 0 ? 'en_retard' : n === 0 ? 'aujourdhui' : n === 1 ? 'demain' : n <= 6 ? 'semaine' : 'plus_tard';
  return { id: Number(r.id), cible_type: r.cible_type, cible_id: r.cible_id, nom: r.nom || r.texte, telephone: r.telephone || null,
    email: r.email || null, canal: r.canal || null, motif: r.motif || null, note: r.note || null, source: r.source, priorite: Number(r.priorite),
    statut: r.statut, resultat: r.resultat || null, jour: r.jour, groupe, retard_jours: n < 0 && r.statut === 'a_faire' ? -n : 0,
    retard: n < 0 && r.statut === 'a_faire' ? `en retard depuis ${-n} jour${-n > 1 ? 's' : ''}` : null,
    cree_le: r.cree_le, fait_le: r.fait_le || null };
}
const rangGroupe = (g) => { const i = GROUPES.indexOf(g); return i < 0 ? GROUPES.length : i; };   // les relances traitées en dernier
const trier = (a, b) => rangGroupe(a.groupe) - rangGroupe(b.groupe) || b.priorite - a.priorite || (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : a.id - b.id);
async function un(id) {
  const [r] = await lire(`SELECT ${COLONNES} FROM rappels WHERE id = $1 AND cible_type <> 'libre'`, [Number(id)]);
  return r || null;
}
async function histo(id, geste, avant, apres, resultat = null, note = null) {
  await lire(`INSERT INTO rappels_historique (rappel_id, geste, echeance_avant, echeance_apres, resultat, note)
    VALUES ($1, $2, CASE WHEN $3::date IS NULL THEN NULL ELSE ${ECHEANCE(3)} END, CASE WHEN $4::date IS NULL THEN NULL ELSE ${ECHEANCE(4)} END, $5, $6)`,
  [Number(id), geste, avant || null, apres || null, resultat, note]);
}
const journal = (changement, motif) => lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`,
  [String(changement).slice(0, 300), motif ? String(motif).slice(0, 500) : null]);
const cleAppel = (type, id) => (type === 'vitrine' ? `v${id}` : String(id));

// ── Les contacts : prospects (base n8n), vitrines, candidatures ; un numéro ou une adresse saisis bruts ─────
const PETITS = new Set(['et', 'de', 'du', 'des', 'la', 'le', 'les', 'à', 'en', 'au', 'aux', 'd', 'l', 'sur']);
function joli(nom) {
  const s = String(nom || '').replace(/\s+/g, ' ').trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(' ').map((w, i) => (i > 0 && PETITS.has(w) ? w : w.replace(/(^|[-'’(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()))).join(' ');
}
const ACCENTS_SQL = (x) => `translate(lower(${x}), 'éèêëàâäîïôöùûüç', 'eeeeaaaiioouuuc')`;
function analyser(q) {
  const t = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const chiffres = t.replace(/[^0-9]/g, '');
  return { t, chiffres, tel: chiffres.length >= 9 && /^[+\d\s().\-/]+$/.test(t), mail: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(t) };
}
async function contacts(q, { limite = 8 } = {}) {
  const a = analyser(q);
  if (a.t.length < 2) return [];
  const terme = sansAccents(a.t.toLowerCase()).replace(/^(?:le |la |les |l'|l’|du |chez |au |aux )/, '').replace(/[%_\\]/g, (c) => '\\' + c);
  const motif = a.tel || a.mail ? '' : `%${terme}%`;
  const fin9 = a.tel ? a.chiffres.slice(-9) : '';
  const mail = a.mail ? a.t.toLowerCase() : '';
  const telSql = (col) => `right(regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g'), 9)`;
  const [pros, vits, cands] = await Promise.all([
    lireN8n(`SELECT siren, name, sector, naf, city, telephone, contact_email, website, status FROM prospects
      WHERE ($1 <> '' AND ${ACCENTS_SQL('name')} LIKE $1) OR siren = $2 OR ($3 <> '' AND ${telSql('telephone')} = $3)
        OR ($4 <> '' AND lower(contact_email) = $4)
      ORDER BY (${ACCENTS_SQL('name')} LIKE $5) DESC, score DESC NULLS LAST LIMIT $6`,
    [motif, a.t.replace(/\s/g, ''), fin9, mail, `${terme}%`, limite]),
    lire(`SELECT id, nom, metier, ville, telephone, email, statut FROM vitrines
      WHERE nom IS NOT NULL AND (($1 <> '' AND ${ACCENTS_SQL('nom')} LIKE $1) OR ($2 <> '' AND ${telSql('telephone')} = $2) OR ($3 <> '' AND lower(email) = $3))
      ORDER BY maj_le DESC LIMIT $4`, [motif, fin9, mail, limite]),
    motif ? lire(`SELECT id, offre ->> 'titre' AS titre, offre ->> 'entreprise' AS entreprise, offre ->> 'lieu' AS lieu, statut FROM candidatures
      WHERE statut NOT IN ('nouvelle', 'ecartee', 'hors_auto') AND (${ACCENTS_SQL("offre ->> 'entreprise'")} LIKE $1 OR ${ACCENTS_SQL("offre ->> 'titre'")} LIKE $1)
      ORDER BY maj DESC LIMIT $2`, [motif, limite]) : [],
  ]);
  const liste = [
    ...pros.map((p) => ({ cible_type: 'prospect', cible_id: p.siren, nom: joli(p.name), telephone: p.telephone || null, email: p.contact_email || null,
      ville: joli(p.city) || null, detail: [appels.activite(p.naf, p.name, p.sector), joli(p.city), p.status === 'exclu' ? 'écarté' : null].filter(Boolean).join(' · ') })),
    ...vits.map((v) => ({ cible_type: 'vitrine', cible_id: String(v.id), nom: v.nom, telephone: v.telephone || null, email: v.email || null,
      ville: v.ville || null, detail: ['Vitrine', v.metier, v.ville, v.statut === 'ecarte' ? 'écartée' : null].filter(Boolean).join(' · ') })),
    ...cands.map((c) => ({ cible_type: 'candidature', cible_id: c.id, nom: `${c.titre || 'Offre'} · ${c.entreprise || ''}`.replace(/ · $/, ''),
      telephone: null, email: null, ville: c.lieu || null, detail: ['Candidature', c.lieu, c.statut].filter(Boolean).join(' · ') })),
  ].slice(0, limite * 2);
  if (!liste.length && (a.tel || a.mail)) {
    liste.push({ cible_type: 'contact', cible_id: a.tel ? `tel:${a.chiffres}` : `mail:${a.t.toLowerCase()}`, nom: a.t,
      telephone: a.tel ? a.t : null, email: a.mail ? a.t.toLowerCase() : null, ville: null, detail: 'Contact saisi à la main' });
  }
  return liste;
}

// Ce que l'on sait d'une cible, pour remplir une relance créée sans tout (un siren seul, un numéro de vitrine…).
async function completer(type, id, d) {
  if (type === 'prospect') {
    const [p] = await lireN8n('SELECT name, telephone, contact_email FROM prospects WHERE siren = $1', [id]);
    if (p) return { nom: d.nom || joli(p.name), telephone: d.telephone || p.telephone || null, email: d.email || p.contact_email || null };
  } else if (type === 'vitrine') {
    const [v] = await lire('SELECT nom, telephone, email FROM vitrines WHERE id = $1', [Number(id)]);
    if (v) return { nom: d.nom || v.nom, telephone: d.telephone || v.telephone || null, email: d.email || v.email || null };
  } else if (type === 'candidature') {
    const [c] = await lire(`SELECT offre ->> 'titre' AS titre, offre ->> 'entreprise' AS entreprise, offre ->> 'email_candidature' AS email
      FROM candidatures WHERE id = $1`, [id]);
    if (c) return { nom: d.nom || `${c.titre || 'Offre'} · ${c.entreprise || ''}`.replace(/ · $/, ''), telephone: d.telephone || null, email: d.email || c.email || null };
  } else if (type === 'decision') {
    const [x] = await lire('SELECT question FROM demandes WHERE id = $1', [Number(id)]);
    if (x) return { nom: d.nom || propre(x.question, 200), telephone: null, email: null };
  }
  return null;
}

// ── Créer, agir ──────────────────────────────────────────────────────────────────────────────
// Rend { ok, id, item, deplace? } ou { ok: false, erreur }. Une relance déjà ouverte sur la même cible est déplacée.
async function creer(d = {}, { auj = aujourdhui() } = {}) {
  await assurer();
  const type = CIBLES.includes(d.cible_type) ? d.cible_type : (d.cible_type ? null : 'tache');
  if (!type) return { ok: false, erreur: `cible attendue : ${CIBLES.join(', ')}` };
  const quand = resoudre(d, { auj });
  if (quand.erreur) return { ok: false, erreur: quand.erreur };
  let id = propre(d.cible_id, 120);
  let nom = propre(d.nom, 200), telephone = propre(d.telephone, 40), email = propre(d.email, 160);
  if (type === 'prospect' && !/^\d{9}$/.test(id || '')) return { ok: false, erreur: 'siren attendu (9 chiffres)' };
  if (type === 'vitrine') { id = String(id || '').replace(/^v/, ''); if (!/^\d+$/.test(id)) return { ok: false, erreur: 'numéro de vitrine attendu' }; }
  if (type === 'candidature' && !id) return { ok: false, erreur: 'candidature attendue' };
  if (type === 'decision' && !/^\d+$/.test(id || '')) return { ok: false, erreur: 'numéro de décision attendu' };
  if (type === 'contact') {
    const a = analyser(telephone || email || id || nom);
    if (!telephone && a.tel) telephone = a.t;
    if (!email && a.mail) email = a.t.toLowerCase();
    if (!telephone && !email) return { ok: false, erreur: 'un numéro ou une adresse e-mail est attendu' };
    id = telephone ? `tel:${String(telephone).replace(/[^0-9]/g, '')}` : `mail:${String(email).toLowerCase()}`;
    nom = nom || telephone || email;
  }
  if (type === 'tache') { id = null; nom = nom || propre(d.motif, 200); if (!nom) return { ok: false, erreur: 'que faut-il faire ?' }; }
  if (['prospect', 'vitrine', 'candidature', 'decision'].includes(type)) {
    const c = await completer(type, id, { nom, telephone, email });
    if (!c && !nom) return { ok: false, erreur: 'cible introuvable' };
    if (c) ({ nom, telephone, email } = c);
  }
  const motifDonne = propre(d.motif, 300);
  const motif = motifDonne || (type === 'tache' ? null : 'relance');
  const note = propre(d.note, 500);
  const priorite = [1, 2, 3].includes(Number(d.priorite)) ? Number(d.priorite) : 2;
  const source = SOURCES.includes(d.source) ? d.source : 'basile';
  const canal = ['telephone', 'email', 'autre'].includes(d.canal) ? d.canal : telephone ? 'telephone' : email ? 'email' : null;
  const deplacer = async () => {
    const [x] = id ? await lire(`SELECT id FROM rappels WHERE statut = 'a_faire' AND cible_type = $1 AND cible_id = $2`, [type, id]) : [];
    if (!x) return null;
    // le motif ne change que s'il est dit : déplacer une relance garde son « pourquoi »
    const r = await agir(x.id, { action: 'reporter', echeance: quand.jour, motif: motifDonne, note, priorite, telephone, email }, { auj });
    return r.ok ? { ...r, deplace: true } : r;
  };
  const deja = await deplacer();
  if (deja) return deja;
  const texte = `${nom}${motif && motif !== nom ? ` : ${motif}` : ''}`.slice(0, 300);
  const [r] = await lire(`INSERT INTO rappels (texte, echeance, cible_type, cible_id, nom, telephone, email, canal, motif, note, source, priorite)
    VALUES ($1, ${ECHEANCE(2)}, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
  [texte, quand.jour, type, id, nom, telephone, email, canal, motif, note, source, priorite]);
  if (!r) {
    const course = await deplacer();   // un double clic : l'autre requête vient d'ouvrir la même cible
    return course || { ok: false, erreur: 'agenda indisponible pour l’instant' };
  }
  await histo(r.id, 'cree', null, quand.jour, null, note);
  return { ok: true, id: Number(r.id), item: decorer(await un(r.id), auj) };
}

// Ce que l'appel change ailleurs : la ligne de appels (la liste À appeler, le badge « déjà appelé » de la validation, et
// la prospection qui n'écrit plus à qui a dit non), l'état d'une vitrine, et le journal.
async function consigner(it, resultat, note, suite) {
  const etat = VERS_APPELS[resultat];
  if (['prospect', 'vitrine'].includes(it.cible_type) && etat) {
    await appels.preparer();
    await lire(`INSERT INTO appels (siren, etat, note, rappel_le) VALUES ($1, $2, $3, $4::date)
      ON CONFLICT (siren) DO UPDATE SET etat = EXCLUDED.etat, note = coalesce(EXCLUDED.note, appels.note), rappel_le = EXCLUDED.rappel_le, maj_le = now()`,
    [cleAppel(it.cible_type, it.cible_id), etat, note, etat === 'plus_tard' && suite ? suite.jour : null]);
  }
  if (it.cible_type === 'vitrine' && (resultat === 'gagne' || resultat === 'pas_interesse')) {
    await require('./vitrines.cjs').agir(Number(it.cible_id), { action: resultat === 'gagne' ? 'client' : 'pas_interesse', note });
  }
  await journal(`Agenda : ${it.nom || it.texte} — ${RESULTATS[resultat]}${suite ? `, relance le ${court(suite.jour)}` : ''}`,
    it.cible_id && ['prospect', 'vitrine'].includes(it.cible_type) ? `siren ${cleAppel(it.cible_type, it.cible_id)}${note ? ` · ${note}` : ''}` : note);
}

// Les gestes de Basile sur une relance : fait (avec l'état de l'appel), reporter, annuler, noter, mal_classe.
async function agir(id, d = {}, { auj = aujourdhui() } = {}) {
  const r0 = await un(id);
  if (!r0) return { ok: false, erreur: 'relance introuvable' };
  const it = decorer(r0, auj);
  const note = propre(d.note, 500);
  const action = d.action;
  if (action === 'noter') {
    if (!note) return { ok: false, erreur: 'note vide' };
    await lire('UPDATE rappels SET note = $2, maj_le = now() WHERE id = $1', [it.id, note]);
    await histo(it.id, 'note', null, null, null, note);
    return { ok: true, item: decorer(await un(it.id), auj) };
  }
  if (it.statut !== 'a_faire') return { ok: false, erreur: 'relance déjà traitée' };
  if (action === 'reporter') {
    const q = resoudre(d, { auj });
    if (q.erreur) return { ok: false, erreur: q.erreur };
    const prio = [1, 2, 3].includes(Number(d.priorite)) ? Number(d.priorite) : 1;
    const x = await lire(`UPDATE rappels SET echeance = ${ECHEANCE(2)}, signale_le = NULL, note = coalesce($3, note), motif = coalesce($4, motif),
        priorite = greatest(priorite, $5), telephone = coalesce(telephone, $6), email = coalesce(email, $7), maj_le = now()
      WHERE id = $1 AND statut = 'a_faire' RETURNING id`, [it.id, q.jour, note, propre(d.motif, 300), prio, propre(d.telephone, 40), propre(d.email, 160)]);
    if (!x.length) return { ok: false, erreur: 'relance déjà traitée' };
    await histo(it.id, 'reporte', it.jour, q.jour, d.resultat && RESULTATS[d.resultat] ? d.resultat : null, note);
    return { ok: true, id: it.id, item: decorer(await un(it.id), auj) };
  }
  if (action === 'annuler') {
    const x = await lire(`UPDATE rappels SET statut = 'annule', fait_le = now(), maj_le = now() WHERE id = $1 AND statut = 'a_faire' RETURNING id`, [it.id]);
    if (!x.length) return { ok: false, erreur: 'relance déjà traitée' };
    await histo(it.id, 'annule', it.jour, null, null, note);
    return { ok: true, item: decorer(await un(it.id), auj) };
  }
  if (action === 'mal_classe') return malClasseCible(it, note, { id: it.id });
  if (action === 'fait') {
    const resultat = d.resultat || 'fait';
    if (!RESULTATS[resultat]) return { ok: false, erreur: `état attendu : ${Object.keys(RESULTATS).join(', ')}` };
    let suite = null;
    const dateDonnee = ['echeance', 'dans', 'dans_mois', 'dans_texte'].some((k) => d[k] != null && d[k] !== '');
    if (resultat === 'rappeler') {
      const q = resoudre(d, { auj });
      if (q.erreur) return { ok: false, erreur: `rappeler le… : ${q.erreur}` };
      suite = { jour: q.jour, motif: 'a demandé à être rappelé', priorite: 3 };
    } else if (SUITE_JOURS[resultat]) {
      const q = dateDonnee ? resoudre(d, { auj }) : resoudre({ dans: SUITE_JOURS[resultat] }, { auj });
      if (q.erreur) return { ok: false, erreur: q.erreur };
      suite = resultat === 'pas_joint'
        ? { jour: q.jour, motif: `pas joint le ${court(auj)} : nouvel essai`, priorite: it.priorite }
        : { jour: q.jour, motif: 'intéressé : faire avancer (proposition, rendez-vous)', priorite: 3 };
    }
    const x = await lire(`UPDATE rappels SET statut = 'fait', fait_le = now(), resultat = $2, note = coalesce($3, note), maj_le = now()
      WHERE id = $1 AND statut = 'a_faire' RETURNING id`, [it.id, resultat, note]);
    if (!x.length) return { ok: false, erreur: 'relance déjà traitée' };
    await histo(it.id, 'fait', it.jour, null, resultat, note);
    await consigner(it, resultat, note, suite);
    let suivant = null;
    if (suite) {
      const s = await creer({ cible_type: it.cible_type, cible_id: it.cible_type === 'tache' ? null : it.cible_id, nom: it.nom,
        telephone: it.telephone, email: it.email, motif: it.cible_type === 'tache' ? it.nom : suite.motif, priorite: suite.priorite,
        echeance: suite.jour, source: 'basile' }, { auj });
      suivant = s.ok ? s.item : null;
    }
    return { ok: true, item: decorer(await un(it.id), auj), suivant };
  }
  return { ok: false, erreur: 'action attendue : fait, reporter, annuler, noter, mal_classe' };
}

// Une relance ouverte sur cette cible est close (appel noté depuis la liste À appeler : la ligne de appels est déjà écrite).
async function fermerCible({ cible_type, cible_id }, resultat, note = null) {
  const x = await lire(`UPDATE rappels SET statut = 'fait', fait_le = now(), resultat = $3, note = coalesce($4, note), maj_le = now()
    WHERE statut = 'a_faire' AND cible_type = $1 AND cible_id = $2 RETURNING id, ${JOUR_SQL} AS jour`, [cible_type, String(cible_id), resultat, note]);
  for (const r of x) await histo(r.id, 'fait', r.jour, null, resultat, note);
  return x.length;
}

// « Pas pour nous / mal classé » : la cible est vraiment écartée (prospect exclu et ses brouillons refusés, vitrine écartée),
// ses relances sont annulées, et le motif part au journal. « Pas intéressé » n'est plus un bouton de suppression.
async function malClasseCible(it, raison = null, { id = null } = {}) {
  const motif = propre(raison, 300) || 'motif non précisé';
  let nom = it.nom || null;
  if (it.cible_type === 'prospect') {
    const [p] = await lireN8n(`UPDATE prospects SET status = 'exclu' WHERE siren = $1 RETURNING name`, [String(it.cible_id)]);
    if (p && !nom) nom = joli(p.name);
    await lireN8n(`UPDATE outreach SET status = 'refuse' WHERE siren = $1 AND status IN ('brouillon', 'differe', 'valide')`, [String(it.cible_id)]);
  } else if (it.cible_type === 'vitrine') {
    await require('./vitrines.cjs').agir(Number(it.cible_id), { action: 'ecarter', note: `mal classé : ${motif}` });
  }
  const ouverts = it.cible_id
    ? await lire(`UPDATE rappels SET statut = 'annule', fait_le = now(), resultat = 'mal_classe', maj_le = now()
        WHERE statut = 'a_faire' AND cible_type = $1 AND cible_id = $2 RETURNING id, ${JOUR_SQL} AS jour`, [it.cible_type, String(it.cible_id)])
    : id ? await lire(`UPDATE rappels SET statut = 'annule', fait_le = now(), resultat = 'mal_classe', maj_le = now()
        WHERE id = $1 AND statut = 'a_faire' RETURNING id, ${JOUR_SQL} AS jour`, [id]) : [];
  for (const r of ouverts) await histo(r.id, 'annule', r.jour, null, 'mal_classe', motif);
  await journal(`Pas pour nous / mal classé : ${nom || cleAppel(it.cible_type, it.cible_id)}`,
    it.cible_id && ['prospect', 'vitrine'].includes(it.cible_type) ? `siren ${cleAppel(it.cible_type, it.cible_id)} · ${motif}` : motif);
  return { ok: true, ...(id ? { item: decorer(await un(id)) } : {}) };
}

// ── Lire ─────────────────────────────────────────────────────────────────────────────────────
// Le résumé du jour, LÉGER (le Cockpit le lit toutes les 10 secondes) : la base du cerveau seulement, jamais n8n.
// a_signaler : les relances arrivées à échéance, rendues UNE fois (notification), mais qui restent dans alertes tant
// que Basile ne les a pas traitées.
async function jour({ maintenant = new Date(), signaler = true } = {}) {
  const auj = aujourdhui(maintenant);
  const [[c], alertes, a_signaler, [argent], [dec]] = await Promise.all([
    lire(`SELECT count(*) FILTER (WHERE j < $1::date)::int AS en_retard, count(*) FILTER (WHERE j = $1::date)::int AS du_jour,
        count(*) FILTER (WHERE j > $1::date AND j <= $1::date + 6)::int AS semaine, count(*)::int AS ouvertes
      FROM (SELECT (echeance AT TIME ZONE '${ZONE}')::date AS j FROM rappels WHERE statut = 'a_faire' AND cible_type <> 'libre') x`, [auj]),
    lire(`SELECT ${COLONNES} FROM rappels WHERE statut = 'a_faire' AND cible_type <> 'libre'
      AND (echeance AT TIME ZONE '${ZONE}')::date <= $1::date
      -- le retard d'abord (Basile, 08/10 : « non traité, ça reste en haut en retard »), puis la priorité : une relance
      -- oubliée ne sort jamais des 10 lignes au profit d'une relance du jour
      ORDER BY (echeance AT TIME ZONE '${ZONE}')::date < $1::date DESC, priorite DESC, echeance, id LIMIT 10`, [auj]),
    signaler ? lire(`UPDATE rappels SET signale_le = now() WHERE statut = 'a_faire' AND cible_type <> 'libre' AND signale_le IS NULL
      AND (echeance AT TIME ZONE '${ZONE}')::date <= $1::date RETURNING id, nom, telephone, motif`, [auj]) : [],
    lire(`SELECT coalesce(sum(montant_eur), 0)::float AS eur FROM revenus
      WHERE le >= date_trunc('month', now() AT TIME ZONE '${ZONE}') AT TIME ZONE '${ZONE}'`),
    lire("SELECT count(*)::int AS n FROM demandes WHERE etat = 'ouverte' AND pour_basile"),
  ]);
  const k = c || {};
  return { aujourdhui: auj,
    compteurs: { du_jour: k.du_jour || 0, en_retard: k.en_retard || 0, semaine: k.semaine || 0, ouvertes: k.ouvertes || 0,
      argent_mois: argent ? Math.round(argent.eur * 100) / 100 : 0, decisions: dec ? dec.n : 0 },
    alertes: alertes.map((r) => decorer(r, auj)),
    a_signaler: a_signaler.map((r) => ({ id: Number(r.id), nom: r.nom, telephone: r.telephone, motif: r.motif })) };
}

// La liste : toutes les relances ouvertes (groupées par l'écran), ou une semaine (du…au, relances faites comprises) avec les
// rendez-vous de Google Agenda en lecture seule.
async function liste({ du = null, au = null } = {}, { auj = aujourdhui() } = {}) {
  const semaine = dateValide(du) && dateValide(au) && ecart(du, au) >= 0 && ecart(du, au) <= 62;
  const rows = semaine
    ? await lire(`SELECT ${COLONNES} FROM rappels WHERE cible_type <> 'libre' AND statut IN ('a_faire', 'fait')
        AND (echeance AT TIME ZONE '${ZONE}')::date BETWEEN $1::date AND $2::date ORDER BY echeance, id LIMIT 500`, [du, au])
    : await lire(`SELECT ${COLONNES} FROM rappels WHERE cible_type <> 'libre' AND statut = 'a_faire' ORDER BY priorite DESC, echeance, id LIMIT 1000`);
  return { aujourdhui: auj, du: semaine ? du : null, au: semaine ? au : null, items: rows.map((r) => decorer(r, auj)).sort(trier),
    ...(semaine ? { google: await evenementsGoogle(du, au) } : {}) };
}

// Google Agenda, en lecture seule, par l'adresse iCal secrète du coffre (AGENDA_ICAL). L'adresse n'est jamais écrite
// nulle part (ni réponse, ni journal) ; une panne se dit en une ligne.
const SANS_AGENDA = 'Agenda Google : ajoute ton adresse iCal secrète au coffre pour l’afficher';
let cacheIcs = { t: 0, adresse: null, evts: null };
async function evenementsGoogle(du, au, { fetch = globalThis.fetch, coffre = lireCoffre() } = {}) {
  const adresse = coffre.AGENDA_ICAL;
  if (!adresse || !/^https:\/\//.test(adresse)) return { configure: false, message: SANS_AGENDA, evenements: [] };
  if (!cacheIcs.evts || cacheIcs.adresse !== adresse || Date.now() - cacheIcs.t > 10 * 60e3) {
    try {
      const r = await fetch(adresse, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('statut');
      cacheIcs = { t: Date.now(), adresse, evts: outils.lireIcs(await r.text()) };
    } catch (e) { return { configure: true, message: 'Agenda Google injoignable pour l’instant', evenements: [] }; }
  }
  const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
  const evenements = cacheIcs.evts.map((e) => ({ jour: e.jour || aujourdhui(e.debut), heure: e.journee ? null : heure(e.debut),
    titre: e.titre || '(sans titre)', lieu: e.lieu || null })).filter((e) => e.jour >= du && e.jour <= au)
    .sort((a, b) => (a.jour + (a.heure || '')).localeCompare(b.jour + (b.heure || ''))).slice(0, 200);
  return { configure: true, evenements };
}

async function decisions() {
  return (await lire(`SELECT id, question, pourquoi, bloquant FROM demandes WHERE etat = 'ouverte' AND pour_basile
    ORDER BY bloquant DESC, cree_le DESC LIMIT 20`)).map((x) => ({ id: Number(x.id), question: x.question, pourquoi: x.pourquoi || '', bloquant: !!x.bloquant }));
}

// La fiche d'une relance (au clic) : le contact, pourquoi rappeler, ce qui a été envoyé, et toute l'histoire avec dates
// (e-mails partis et réponses, appels notés, reports). Ici, les lectures dans la base n8n sont permises : un clic, pas un sondage.
const domaine = (site) => { try { return new URL(/^https?:/i.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, ''); } catch (e) { return null; } };
const LIBELLE_APPEL = { appele: 'appel noté : joint', pas_interesse: 'appel noté : pas intéressé', plus_tard: 'appel noté : à rappeler' };
async function fiche(id, { auj = aujourdhui() } = {}) {
  const r0 = await un(id);
  if (!r0) return null;
  const item = decorer(r0, auj);
  const historique = [], envoye = [];
  let contact = { nom: item.nom, telephone: item.telephone, email: item.email };
  const ajouter = (le, quoi, type) => { if (le) historique.push({ le: new Date(le).toISOString(), quoi, type }); };
  const memes = item.cible_id
    ? (await lire('SELECT id FROM rappels WHERE cible_type = $1 AND cible_id = $2', [item.cible_type, item.cible_id])).map((x) => Number(x.id))
    : [item.id];
  const gestes = await lire(`SELECT h.le, h.geste, to_char(h.echeance_avant AT TIME ZONE '${ZONE}', 'YYYY-MM-DD') AS avant,
      to_char(h.echeance_apres AT TIME ZONE '${ZONE}', 'YYYY-MM-DD') AS apres, h.resultat, h.note
    FROM rappels_historique h WHERE h.rappel_id = ANY($1::int[]) ORDER BY h.le DESC LIMIT 80`, [memes]);
  for (const g of gestes) {
    const quoi = g.geste === 'cree' ? `Relance prévue le ${court(g.apres)}` : g.geste === 'reporte' ? `Relance déplacée du ${court(g.avant)} au ${court(g.apres)}`
      : g.geste === 'fait' ? `Relance faite : ${RESULTATS[g.resultat] || g.resultat || 'fait'}` : g.geste === 'annule' ? `Relance annulée${g.resultat === 'mal_classe' ? ' (mal classé)' : ''}` : 'Note';
    ajouter(g.le, `${quoi}${g.note ? ` — ${g.note}` : ''}`, 'agenda');
  }
  if (item.cible_type === 'prospect') {
    const [p] = await lireN8n(`SELECT siren, name, sector, naf, city, telephone, contact_email, website, status, to_jsonb(p) ->> 'site_preuve' AS site_preuve
      FROM prospects p WHERE siren = $1`, [item.cible_id]);
    const mails = await lireN8n(`SELECT segment, subject, status, created_at, sent_at, reply_at FROM outreach WHERE siren = $1 ORDER BY created_at DESC LIMIT 10`, [item.cible_id]);
    if (p) {
      contact = { nom: joli(p.name), telephone: p.telephone || item.telephone, email: p.contact_email || item.email, ville: joli(p.city) || null,
        activite: appels.activite(p.naf, p.name, p.sector), naf: p.naf || null, site: p.website ? domaine(p.website) : null,
        numero_verifie: !!p.site_preuve, siren: p.siren, ecarte: p.status === 'exclu' };
    }
    for (const o of mails) {
      if (o.reply_at) ajouter(o.reply_at, 'Réponse reçue à l’e-mail', 'email');
      if (o.sent_at) ajouter(o.sent_at, `E-mail envoyé : « ${o.subject || 'sans objet'} »`, 'email');
      else ajouter(o.created_at, `E-mail préparé (${o.status}) : « ${o.subject || 'sans objet'} »`, 'email');
    }
    const parti = mails.find((o) => o.sent_at);
    const lien = preaudit((parti || mails[0] || {}).segment || (p && p.sector) || (contact.activite || ''));
    if (parti) envoye.push({ libelle: `E-mail « ${parti.subject || 'sans objet'} », parti le ${court(jourDe(parti.sent_at))}`, lien: null });
    else if (mails[0]) envoye.push({ libelle: `Rien n’est parti : e-mail en état « ${mails[0].status} »`, lien: null });
    envoye.push(lien ? { libelle: 'Le pré-audit de son secteur', lien } : { libelle: 'Pas de pré-audit publié pour ce secteur', lien: null });
  } else if (item.cible_type === 'vitrine') {
    const [v] = await lire('SELECT id, nom, metier, ville, telephone, email, statut, motif, slug, envoye_le, cree_le, source FROM vitrines WHERE id = $1', [Number(item.cible_id)]);
    if (v) {
      contact = { nom: v.nom, telephone: v.telephone || item.telephone, email: v.email || item.email, ville: v.ville || null,
        activite: v.source === 'sirene' ? `Sans site · ${v.metier || 'commerce'}` : `Vitrine · ${v.metier || 'commerce'}`, numero_verifie: true };
      if (v.slug) envoye.push({ libelle: 'La maquette de son site', lien: `${ADRESSE}/demo/${v.slug}` });
      if (v.envoye_le) { envoye.push({ libelle: `E-mail parti le ${court(jourDe(v.envoye_le))}`, lien: null }); ajouter(v.envoye_le, 'E-mail de la vitrine envoyé', 'email'); }
      if (v.statut === 'repondu') ajouter(v.cree_le, `A répondu${v.motif ? ` : ${v.motif}` : ''}`, 'email');
    }
  } else if (item.cible_type === 'candidature') {
    const [c] = await lire(`SELECT offre ->> 'titre' AS titre, offre ->> 'entreprise' AS entreprise, offre ->> 'lieu' AS lieu, offre ->> 'lien' AS lien,
      statut, envoi ->> 'quand' AS quand, envoi ->> 'recu_le' AS recu_le, cree_le FROM candidatures WHERE id = $1`, [item.cible_id]);
    if (c) {
      contact = { ...contact, ville: c.lieu || null, activite: `Candidature · ${c.statut}` };
      if (c.lien) envoye.push({ libelle: 'L’annonce', lien: c.lien });
      const quand = c.quand || c.recu_le;
      if (quand) { envoye.push({ libelle: `Candidature envoyée le ${court(jourDe(quand))}`, lien: null }); ajouter(quand, 'Candidature envoyée', 'candidature'); }
      ajouter(c.cree_le, 'Offre reçue au Bureau', 'candidature');
    }
  }
  if (['prospect', 'vitrine'].includes(item.cible_type)) {
    const cle = cleAppel(item.cible_type, item.cible_id);
    const lignes = await lire(`SELECT changement, motif, created_at FROM journal WHERE acteur = 'basile' AND (motif = $1 OR motif LIKE $2
        OR ($3::text IS NOT NULL AND changement LIKE $3)) ORDER BY created_at DESC LIMIT 30`,
    [`siren ${cle}`, `siren ${cle} ·%`, item.cible_type === 'vitrine' ? `Vitrine n°${item.cible_id} :%` : null]);
    for (const j of lignes) if (!/^Agenda : /.test(j.changement)) ajouter(j.created_at, `${j.changement}${j.motif && j.motif.includes(' · ') ? ` — ${j.motif.split(' · ').slice(1).join(' · ')}` : ''}`, 'appel');
    if (!lignes.length) {
      const [a] = await lire('SELECT etat, note, maj_le FROM appels WHERE siren = $1', [cle]);
      if (a) ajouter(a.maj_le, `${LIBELLE_APPEL[a.etat] || a.etat}${a.note ? ` — ${a.note}` : ''}`, 'appel');
    }
  }
  historique.sort((a, b) => (a.le < b.le ? 1 : a.le > b.le ? -1 : 0));
  return { item, contact, envoye, historique };
}

// ── Les sources automatiques (sans noyer l'agenda : jamais toute la liste d'appels) ─────────────
// La migration : chaque « plus tard » de la liste d'appels devient une relance datée, une seule fois.
async function migrer({ auj = aujourdhui() } = {}) {
  await assurer();
  const lignes = await lire(`SELECT siren, rappel_le::text AS jour, note, maj_le FROM appels WHERE etat = 'plus_tard' AND rappel_le IS NOT NULL`);
  let n = 0;
  for (const l of lignes) {
    if (NE_PAS_MIGRER.has(l.siren)) continue;
    const cle = `migration:${l.siren}`;
    if ((await lire('SELECT 1 FROM agenda_vus WHERE cle = $1', [cle])).length) continue;
    const vitrine = l.siren.startsWith('v');
    const type = vitrine ? 'vitrine' : 'prospect', id = vitrine ? l.siren.slice(1) : l.siren;
    const c = (await completer(type, id, {})) || { nom: l.siren, telephone: null, email: null };
    const [r] = await lire(`INSERT INTO rappels (texte, echeance, cible_type, cible_id, nom, telephone, email, canal, motif, note, source, priorite)
      VALUES ($1, ${ECHEANCE(2)}, $3, $4, $5, $6, $7, $8, $9, $10, 'migration', 2)
      ON CONFLICT (cible_type, cible_id) WHERE statut = 'a_faire' AND cible_id IS NOT NULL DO NOTHING RETURNING id`,
    [`${c.nom} : rappel demandé`, l.jour, type, id, c.nom, c.telephone, c.email, c.telephone ? 'telephone' : c.email ? 'email' : null,
      `rappel demandé au téléphone le ${court(jourDe(l.maj_le))}`, l.note || null]);
    if (r) { await histo(r.id, 'cree', null, l.jour, null, 'repris de la liste d’appels (« plus tard »)'); n++; }
    await lire('INSERT INTO agenda_vus (cle) VALUES ($1) ON CONFLICT DO NOTHING', [cle]);
  }
  return n;
}

// Ouvre (ou remonte) la relance d'une cible à aujourd'hui, priorité haute : qui a répondu passe devant tout.
async function remonter(type, id, c, motif, source, auj) {
  const [r] = await lire(`INSERT INTO rappels (texte, echeance, cible_type, cible_id, nom, telephone, email, canal, motif, source, priorite)
    VALUES ($1, ${ECHEANCE(2)}, $3, $4, $5, $6, $7, $8, $9, $10, 3)
    ON CONFLICT (cible_type, cible_id) WHERE statut = 'a_faire' AND cible_id IS NOT NULL
    DO UPDATE SET priorite = 3, motif = EXCLUDED.motif, signale_le = NULL, maj_le = now(),
      echeance = least(rappels.echeance, EXCLUDED.echeance) RETURNING id, (xmax = 0) AS nouveau`,
  [`${c.nom} : ${motif}`, auj, type, id, c.nom, c.telephone || null, c.email || null, c.telephone ? 'telephone' : c.email ? 'email' : null, motif, source]);
  if (r) await histo(r.id, r.nouveau ? 'cree' : 'note', null, r.nouveau ? auj : null, null, motif);
  return !!r;
}
// Le balayage (au démarrage, puis toutes les 5 minutes) : une réponse trouvée par le Réconciliateur (outreach.reply_at,
// 14 derniers jours, 50 au plus) et une vitrine passée « repondu » deviennent une relance du jour, priorité haute, une fois.
async function balayer({ auj = aujourdhui() } = {}) {
  await assurer();
  let n = 0;
  const reponses = await lireN8n(`SELECT o.siren, o.prospect_name, o.reply_at, p.name, p.naf, p.status, p.telephone, p.contact_email
    FROM outreach o LEFT JOIN prospects p ON p.siren = o.siren
    WHERE o.reply_at > now() - interval '14 days' AND o.siren ~ '^[0-9]{9}$' ORDER BY o.reply_at DESC LIMIT 50`);
  for (const o of reponses) {
    if (appels.exclu({ status: o.status, naf: o.naf, name: o.name || o.prospect_name })) continue;
    const cle = `reponse:${o.siren}:${new Date(o.reply_at).toISOString()}`;
    if ((await lire('SELECT 1 FROM agenda_vus WHERE cle = $1', [cle])).length) continue;
    const c = { nom: o.prospect_name || joli(o.name) || o.siren, telephone: o.telephone, email: o.contact_email };
    if (await remonter('prospect', o.siren, c, `a répondu à l’e-mail le ${court(jourDe(o.reply_at))}`, 'reconciliateur', auj)) n++;
    await lire('INSERT INTO agenda_vus (cle) VALUES ($1) ON CONFLICT DO NOTHING', [cle]);
  }
  const vits = await lire(`SELECT id, nom, telephone, email, motif FROM vitrines WHERE statut = 'repondu' AND nom IS NOT NULL ORDER BY maj_le DESC LIMIT 50`);
  for (const v of vits) {
    const cle = `vitrine-repondu:${v.id}`;
    if ((await lire('SELECT 1 FROM agenda_vus WHERE cle = $1', [cle])).length) continue;
    if (await remonter('vitrine', String(v.id), v, propre(v.motif, 200) || 'a répondu à l’e-mail', 'vitrines', auj)) n++;
    await lire('INSERT INTO agenda_vus (cle) VALUES ($1) ON CONFLICT DO NOTHING', [cle]);
  }
  return n;
}

async function preparer() {
  await preparerTables();
  await migrer().catch((e) => console.error('[agenda] migration :', e.message));
  await balayer().catch((e) => console.error('[agenda] balayage :', e.message));
}
let minuteur = null;
function demarrer() {
  if (minuteur) return;
  preparer().catch(() => {});
  minuteur = setInterval(() => { balayer().catch(() => {}); }, 5 * 60e3);
}

// ── La voix : « rappelle-moi Ecoger dans 3 semaines », « rappelle Durand le 12 novembre » ─────
const VOIX = /^(?:(?:ok|alors|et|bon|jarvis)[, ]+)*(?:rappelle|rappeler|relance|relancer)(?:[- ]moi)?\s+(.+)$/i;
const HEURE_DITE = /\b\d{1,2}\s*h(?:\s*\d{2})?\b|\d{1,2}:\d{2}|\bheures?\b|\bminutes?\b|\bsecondes?\b/i;
function nettoyerQui(qui) {
  return String(qui || '').trim()
    .replace(/^(?:de |d'|d’|qu'il faut |que je dois |pour )/i, '')
    .replace(/^(?:appeler|rappeler|relancer|t[ée]l[ée]phoner [àa]|contacter|recontacter|joindre)\s+/i, '')
    .replace(/^(?:que |qu'|qu’)/i, '').trim();
}
// Rend { qui, jour, quand } ou null : une minuterie (minutes, heures, « à 9 h ») reste à outils.cjs, un ordre numéroté à l'esprit.
function comprendreVoix(message, auj = aujourdhui()) {
  const brut = String(message || '').trim().replace(/[.!?]+$/, '');
  if (!brut || brut.length > 200 || HEURE_DITE.test(brut) || /\b(ordres?|demandes?|n°)\b/i.test(brut)) return null;
  const m = brut.match(VOIX);
  if (!m) return null;
  const mots = m[1].split(/\s+/);
  for (let i = 1; i < mots.length; i++) {            // « <qui> dans 3 semaines »
    const jourTrouve = comprendreDate(mots.slice(i).join(' '), auj);
    const qui = nettoyerQui(mots.slice(0, i).join(' '));
    if (jourTrouve && qui) return { qui, jour: jourTrouve, quand: mots.slice(i).join(' ') };
  }
  for (let i = mots.length - 1; i >= 1; i--) {       // « dans 3 semaines <qui> »
    const jourTrouve = comprendreDate(mots.slice(0, i).join(' '), auj);
    const qui = nettoyerQui(mots.slice(i).join(' '));
    if (jourTrouve && qui) return { qui, jour: jourTrouve, quand: mots.slice(0, i).join(' ') };
  }
  return null;
}
// Le contact visé : le nom exact, sinon un nom qui contient le mot dit en entier (« Ecoger » dans « Cabinet Ecoger ») ;
// sinon personne, et la relance devient une tâche à son nom : jamais un « Paul » rangé chez « Paulin Conseil ».
function choisir(trouves, qui) {
  const norme = (s) => sansAccents(String(s || '').toLowerCase()).replace(/\s+/g, ' ').trim();
  const cle = norme(qui).replace(/^(?:le |la |les |l'|l’|du |chez |au |aux )/, '');
  if (!cle) return null;
  const exact = trouves.find((x) => norme(x.nom) === cle);
  if (exact) return exact;
  const echappe = cle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mot = new RegExp('(^|[^a-z0-9])' + echappe + '([^a-z0-9]|$)');
  const parMot = trouves.filter((x) => x.cible_type !== 'contact' && mot.test(norme(x.nom)));
  if (parMot.length) return parMot[0];
  return trouves.length === 1 && trouves[0].cible_type === 'contact' ? trouves[0] : null;
}
async function repondreVoix(message, { maintenant = new Date() } = {}) {
  const auj = aujourdhui(maintenant);
  const v = comprendreVoix(message, auj);
  if (!v) return null;
  const n = ecart(auj, v.jour);
  if (n > MAX_JOURS) return 'L’agenda va jusqu’à deux ans : dis-moi une date plus proche.';
  const cible = choisir(await contacts(v.qui, { limite: 5 }), v.qui);
  const r = await creer(cible ? { ...cible, motif: 'rappel demandé à Jarvis', echeance: v.jour, source: 'voix' }
    : { cible_type: 'tache', nom: v.qui, motif: v.qui, echeance: v.jour, source: 'voix' }, { auj });
  if (!r.ok) return `Je n’ai pas pu le noter dans l’agenda : ${r.erreur}.`;
  const quand = n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `le ${direJour(v.jour)}`;
  return `C’est noté dans l’agenda : ${cible ? `rappeler ${r.item.nom}` : r.item.nom}, ${quand}${r.deplace ? ' (la relance déjà prévue est déplacée)' : ''}.`;
}

// ── Pour Jarvis à l'oral, et pour le rapport du matin ─────────────────────────────────────────
const ligne = (x) => `${x.nom}${x.telephone ? ` · ${x.telephone}` : x.email ? ` · ${x.email}` : ''}${x.motif ? ` · ${x.motif}` : ''}${x.retard ? ` · ${x.retard}` : ''}`;
async function phrase() {
  try {
    const j = await jour({ signaler: false });
    const c = j.compteurs;
    if (!c.du_jour && !c.en_retard) return c.ouvertes ? `\nAgenda de Basile : rien à rappeler aujourd'hui ; ${c.ouvertes} relance(s) prévue(s) plus tard.` : '';
    return `\nAgenda de Basile : ${c.du_jour} relance(s) aujourd'hui, ${c.en_retard} en retard ; d'abord : `
      + j.alertes.slice(0, 3).map(ligne).join(' ; ') + '.';
  } catch (e) { return ''; }
}
async function relancesDuJour() {
  const j = await jour({ signaler: false });
  if (!j.alertes.length) return { titre: 'Tes relances du jour', lignes: ['Aucune relance aujourd’hui.'] };
  return { titre: `Tes relances du jour (${j.compteurs.du_jour} aujourd’hui, ${j.compteurs.en_retard} en retard)`,
    lignes: [...j.alertes.map(ligne), `Tout l’agenda : ${ADRESSE}/agenda`] };
}

// ── Les routes (branchées par serveur.cjs, comme la prospection) ──────────────────────────────
async function router(req, res, { url, m, envoyer, json, autorise, fichierInterface }) {
  if (m === 'GET' && url === '/agenda') { fichierInterface(res, 'agenda.html'); return true; }
  if (!url.startsWith('/api/agenda')) return false;
  const q = new URL(req.url, 'http://x').searchParams;
  if (m === 'GET' && url === '/api/agenda/jour') {
    // la page ne consomme pas les alertes à signaler : la notification reste celle du Cockpit
    envoyer(res, 200, { ...(await jour({ signaler: false })), decisions: await decisions() }); return true;
  }
  if (m === 'GET' && url === '/api/agenda/contacts') { envoyer(res, 200, { contacts: await contacts(q.get('q') || '') }); return true; }
  if (m === 'GET' && url === '/api/agenda') { envoyer(res, 200, await liste({ du: q.get('du'), au: q.get('au') })); return true; }
  let r;
  if (m === 'GET' && (r = url.match(/^\/api\/agenda\/(\d+)\/historique$/))) {
    const f = await fiche(Number(r[1]));
    envoyer(res, f ? 200 : 404, f || { erreur: 'relance introuvable' }); return true;
  }
  if (m === 'POST' && url === '/api/agenda') {
    if (!autorise(req)) { envoyer(res, 403, { ok: false }); return true; }
    envoyer(res, 200, await creer({ ...(await json(req, 4000)), source: 'basile' })); return true;
  }
  if (m === 'POST' && (r = url.match(/^\/api\/agenda\/(\d+)$/))) {
    if (!autorise(req)) { envoyer(res, 403, { ok: false }); return true; }
    envoyer(res, 200, await agir(Number(r[1]), await json(req, 4000))); return true;
  }
  return false;
}

module.exports = { router, preparer, demarrer, migrer, balayer, creer, agir, jour, liste, fiche, contacts, decisions, evenementsGoogle,
  fermerCible, malClasseCible, resoudre, comprendreDate, comprendreVoix, repondreVoix, phrase, relancesDuJour,
  aujourdhui, plusJours, plusMois, ecart, direJour, joli, MAX_JOURS, RESULTATS, SANS_AGENDA };
