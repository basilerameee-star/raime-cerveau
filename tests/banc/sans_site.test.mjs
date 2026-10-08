// Les entreprises sans site (08/10/2026) — Basile : « n'oublie pas les entreprises qui n'ont PAS de site ; on n'écarte pas
// des profils pour rien ». Le Fureteur rend trois verdicts (prouvé, absent ou portail, inconnu) ; les entreprises sans site
// deviennent des fiches VITRINES : à appeler quand un numéro vérifié est connu, à compléter sinon (gardées, jamais jetées),
// jamais en brouillon d'e-mail. Le siège vient du registre public (bouchonné ici) ; rien n'est envoyé.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { bases } from './outils.mjs';

Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime' });
const require = createRequire(import.meta.url);
const s = await import('../../agents/sans_site.js');
const f = await import('../../agents/fureteur.js');
const tel = require('../../jarvis/telephone.cjs');
const partage = require('../../jarvis/sans_site.cjs');

// ── Les règles, sans base ─────────────────────────────────────────────────────
test('le métier vient du code d’activité et du nom ; 69.10Z se départage par le nom ou le registre des avocats', () => {
  const m = (naf, name, est_avocat) => s.metierFirme({ naf, name, est_avocat });
  assert.equal(m('69.10Z', 'SCP NAZ & ASSOCIES, NOTAIRES'), 'notaire');
  assert.equal(m('69.10Z', 'OFFICE NOTARIAL DU LAC'), 'notaire');
  assert.equal(m('69.10Z', 'CABINET DURAND', true), 'avocat');
  assert.equal(m('69.10Z', 'DURAND AVOCATS'), 'avocat');
  assert.equal(m('69.10Z', 'HUISSIERS ASSOCIES'), 'commissaire de justice');
  assert.equal(m('69.10Z', 'ALPES COMMISSAIRES DE JUSTICE'), 'commissaire de justice');
  assert.equal(m('69.10Z', 'ARCANE JURIS'), 'cabinet juridique', 'rien de supposé quand le nom ne dit rien');
  assert.equal(m('69.20Z', 'X'), 'expert-comptable');
  assert.equal(m('68.31Z', 'X'), 'agence immobilière');
  assert.equal(m('68.32A', 'X'), 'agence immobilière');
  assert.equal(m('66.22Z', 'X'), 'courtier en assurance');
  assert.equal(m('78.10Z', 'X'), 'cabinet de recrutement');
  assert.equal(m('70.22Z', 'X'), 'cabinet de conseil');
  assert.equal(m('71.11Z', 'X'), 'architecte');
  assert.equal(m('85.59A', 'X'), null);
});

test('le Fureteur : trois verdicts ; un moteur fermé ou muet ne prouve jamais l’absence d’un site', () => {
  assert.equal(f.verdict({ prouve: true, recherche: true, ferme: true }), 'prouve');
  assert.equal(f.verdict({ recherche: false }), null, 'pas encore cherché : aucun verdict');
  assert.equal(f.verdict({ recherche: true, ferme: true }), 'inconnu');
  assert.equal(f.verdict({ recherche: true, muet: true }), 'inconnu');
  assert.equal(f.verdict({ recherche: true, portails: 1 }), 'portail');
  assert.equal(f.verdict({ recherche: true }), 'absent');
  // la page de résultats : le pied de page du moteur ne compte pas comme un résultat
  const vide = f.lireResultats('<a href="https://search.brave.com/x">a</a><a href="https://status.brave.app/">s</a><a href="https://hackerone.com/brave">h</a>');
  assert.deepEqual(vide, { sites: [], portails: [], vide: true });
  const r = f.lireResultats('<a href="https://www.notaires.fr/fr/office/banc">o</a><a href="https://www.notaires.fr/">accueil</a><a href="https://www.pappers.fr/x">p</a><a href="https://banc.fr/">b</a>');
  assert.deepEqual(r, { sites: ['https://banc.fr'], portails: ['https://www.notaires.fr/fr/office/banc'], vide: false }, 'l’accueil d’un portail n’est la page de personne');
  assert.equal(f.estPortail('annuaire.experts-comptables.org'), true);
  assert.equal(f.estPortail('naz-associes.notaires.fr'), false, 'le site d’une étude en .notaires.fr est le sien');
});

test('fureter : moteur fermé → inconnu ; recherche vide puis témoin vide → inconnu ; témoin qui répond → absent ; portail seul → portail', async () => {
  const p = { siren: '930000099', name: 'CABINET BANC', city: 'ANNECY', departement: '74' };
  const sans = { lire: async () => null, existe: async () => false, attente: 0 };
  const reponse = (x) => async () => ({ ferme: false, sites: [], portails: [], vide: false, ...x });
  assert.equal((await f.fureter(p, { ...sans, chercher: async () => ({ ferme: true, sites: [], portails: [], vide: true }) })).statut, 'inconnu');
  const etat = { ferme: false, temoin: null };
  assert.equal((await f.fureter(p, { ...sans, etat, chercher: reponse({ vide: true }) })).statut, 'inconnu');
  assert.equal(etat.ferme, true, 'muet pour le témoin aussi : on n’insiste pas pendant le passage');
  const questions = [];
  const temoinOk = async (q) => { questions.push(q); return q === 'mairie annecy' ? { ferme: false, sites: ['https://annecy.fr'], portails: [], vide: false } : { ferme: false, sites: [], portails: [], vide: true }; };
  const e2 = { ferme: false, temoin: null };
  assert.equal((await f.fureter(p, { ...sans, etat: e2, chercher: temoinOk })).statut, 'absent');
  assert.equal((await f.fureter(p, { ...sans, etat: e2, chercher: temoinOk })).statut, 'absent');
  assert.equal(questions.filter((q) => q === 'mairie annecy').length, 1, 'une seule recherche témoin par passage');
  const port = await f.fureter(p, { ...sans, chercher: reponse({ portails: ['https://www.notaires.fr/fr/office/banc'] }) });
  assert.deepEqual([port.statut, port.portails], ['portail', ['https://www.notaires.fr/fr/office/banc']]);
  const ancien = await f.fureter({ ...p, website: 'https://www.notaires.fr/fr/office/banc-2' }, { ...sans, chercher: reponse({}) });
  assert.equal(ancien.statut, 'portail', 'la page de portail notée comme site compte comme portail');
  assert.equal((await f.fureter(p, { ...sans, recherche: false, chercher: () => assert.fail('pas de recherche') })).statut, null);
});

test('les numéros : gabarits et surtaxés refusés ; l’indicatif doit aller avec le département quand il est connu', () => {
  assert.equal(tel.normaliser('06 12 34 56 78'), null, 'le numéro des gabarits de site');
  assert.equal(tel.normaliser('08 92 12 34 56'), null);
  assert.equal(tel.normaliser('+33 4 50 11 22 33'), '0450112233');
  assert.equal(tel.coherent('0559422655', '74'), false, 'un standard de Pau pour un cabinet d’Annecy');
  assert.equal(tel.coherent('0188689018', '74'), false);
  assert.equal(tel.coherent('0450112233', '74'), true);
  assert.equal(tel.coherent('0478112233', '69'), true);
  assert.equal(tel.coherent('0612345670', '74'), true, 'un mobile, partout');
  assert.equal(tel.coherent('0559422655', '33'), true, 'département hors de la liste : rien n’est affirmé');
  assert.equal(tel.verifier('04 50 11 22 33', '01'), '0450112233');
  assert.equal(tel.lisible('0450112233'), '04 50 11 22 33');
  assert.equal(tel.memeNumero('+33 4 50 99 88 77', '04.50.99.88.77'), true);
});

test('visiter : le numéro du site passe les précautions de l’annuaire (département du cabinet)', async () => {
  const p = { siren: '123456789', name: 'CABINET BANC', city: 'ANNECY', departement: '74' };
  const pages = { 'https://banc.fr': '<p>Cabinet Banc, RCS Annecy 123 456 789</p><a href="tel:0559422655">siège</a> <a href="tel:0612345678">x</a> Tél. 04 50 11 22 33' };
  const lire = async (u) => (pages[u.replace(/\/$/, '')] ? { url: u.replace(/\/$/, ''), html: pages[u.replace(/\/$/, '')] } : null);
  const v = await f.visiter('https://banc.fr', p, lire);
  assert.equal(v.preuve, 'siren');
  assert.equal(v.telephone, '0450112233', 'ni le standard du siège à Pau, ni le gabarit');
});

test('qui entre : sans site ou sur son portail seulement, code de Sherlock non exclu, à but lucratif ; le registre départage', () => {
  const p = { status: 'nouveau', site_statut: 'absent', naf: '69.20Z', name: 'CABINET BANC' };
  assert.equal(s.candidate(p), true);
  assert.equal(s.candidate({ ...p, site_statut: 'portail' }), true);
  assert.equal(s.candidate({ ...p, site_statut: 'inconnu' }), false, 'un moteur fermé ne fait pas une entreprise sans site');
  assert.equal(s.candidate({ ...p, site_statut: 'prouve' }), false);
  assert.equal(s.candidate({ ...p, naf: '78.30Z' }), false);
  assert.equal(s.candidate({ ...p, name: 'AGC DES SAVOIE' }), false);
  assert.equal(s.candidate({ ...p, name: 'ASSOCIATION DE GESTION' }), false);
  assert.equal(s.candidate({ ...p, status: 'exclu' }), false);
  const reg = (x) => ({ ferme: false, association: false, service_public: false, departement: '74', ...x });
  assert.equal(s.horsChamp(reg({})), null);
  assert.equal(s.horsChamp(reg({ departement: '75' })), 'siège hors de la région (75)');
  assert.equal(s.horsChamp(reg({ association: true })), 'association (à but non lucratif)');
  assert.equal(s.horsChamp(reg({ ferme: true })), 'fermée au registre des entreprises');
  assert.equal(s.horsChamp(null), 'absente du registre public des entreprises');
  assert.equal(s.statutDe({ telephone: '04 50 11 22 33' }), 'a_appeler');
  assert.equal(s.statutDe({ telephone: null }), 'a_completer', 'sans numéro : gardée, à compléter');
  assert.equal(s.joliAdresse("12 BIS RUE DE L'EGLISE 74000 ANNECY"), "12 bis Rue de l'Eglise 74000 Annecy");
});

test('le registre : le siège (adresse, coordonnées, département) ; association, service public, fermeture', () => {
  const r = s.lireRegistre({ results: [{ siren: '930000001', etat_administratif: 'A', siege: { adresse: '1 RUE DU BANC 74000 ANNECY', libelle_commune: 'ANNECY',
    departement: '74', latitude: '45.9', longitude: '6.12', nom_commercial: null, etat_administratif: 'A' }, complements: { est_association: false, est_avocat: true } }] }, '930000001');
  assert.deepEqual(r, { adresse: '1 Rue du Banc 74000 Annecy', ville: 'Annecy', departement: '74', lat: 45.9, lon: 6.12, nom_commercial: null,
    ferme: false, association: false, service_public: false, est_avocat: true });
  assert.equal(s.lireRegistre({ results: [{ siren: '111111111' }] }, '930000001'), null, 'une autre entreprise n’est pas celle-ci');
  assert.equal(s.lireRegistre({ results: [{ siren: '930000001', etat_administratif: 'C', siege: {} }] }, '930000001').ferme, true);
});

test('les annuaires de la fiche : celui de la profession quand il répond, puis Pages Jaunes sur le nom et la ville ; aucun lu par un programme', () => {
  const a = partage.annuaires({ metier: 'avocat', nom: 'Durand & Associés', ville: 'Annecy' });
  assert.deepEqual(a.map((x) => x.url), ['https://www.avocat.fr/annuaire-des-avocats-de-france',
    'https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=Durand+%26+Associ%C3%A9s&ou=Annecy']);
  assert.equal(partage.annuaires({ metier: 'notaire', nom: 'X', ville: 'Y' }).length, 1, 'notaires.fr ne répondait pas 200 : pas de lien');
  for (const l of Object.values(partage.ANNUAIRES)) assert.match(l.url, /^https:\/\//);
});

test('les maquettes des cabinets : sobres, l’action « Prendre rendez-vous », rien d’inventé ; le défaut ne dit plus « commerce »', async () => {
  const m = await import('../../jarvis/maquette_premium.mjs');
  const photos = require('../../jarvis/vitrines_photos.json');
  const metiers = ['notaire', 'avocat', 'expert-comptable', 'agence immobilière', 'courtier en assurance', 'cabinet de recrutement', 'cabinet de conseil',
    'architecte', 'commissaire de justice', 'cabinet juridique'];
  for (const metier of metiers) {
    const fi = m.fiche(metier);
    assert.notEqual(fi.accroche, m.fiche('inconnu').accroche, metier);
    assert.equal(fi.action, 'Prendre rendez-vous', metier);
    assert.equal(fi.rubriques.length, 3, metier);
    assert.ok(photos[m.cleMetier(metier)], `photos d’exemple pour ${metier}`);
    const h = m.maquettePremium({ nom: 'Cabinet Banc', metier, ville: 'Annecy', adresse: '1 Rue du Banc 74000 Annecy', telephone: '04 50 11 22 33' },
      { images: 'https://cockpit.raime.fr/demo/img' });
    const visible = h.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    assert.ok(!/€|\d+\s?%|avis|étoiles|boutique|vos produits/i.test(visible), `${metier} : ni prix, ni chiffre, ni avis, ni boutique`);
    assert.match(h, new RegExp(`/demo/img/${m.cleMetier(metier)}/1\\.jpg`));
    assert.match(h, /href="tel:0450112233">Prendre rendez-vous</);
  }
  assert.ok(!/commerce/i.test(m.fiche('métier inconnu').accroche));
  assert.match(m.maquettePremium({ nom: 'Boulangerie Banc', metier: 'boulangerie', ville: 'Annecy', telephone: '04 50 00 00 01' }), /La boutique, l’équipe/, 'les commerces gardent leur texte');
});

// ── Avec les bases du banc ─────────────────────────────────────────────────────
const SIRENS = Array.from({ length: 13 }, (_, i) => `9300000${String(i + 1).padStart(2, '0')}`);
const db = await bases().catch(() => null);
let avant = { vitrines: false, appels: false };
after(async () => {
  if (!db) return;
  await db.n8n.query('DELETE FROM prospects WHERE siren = ANY($1::text[])', [SIRENS]).catch(() => {});
  await db.n8n.query('DELETE FROM outreach WHERE siren = ANY($1::text[])', [SIRENS]).catch(() => {});
  if (avant.vitrines) await db.brain.query(`DELETE FROM vitrines WHERE source = 'sirene' OR source_id = 'osm:node/930'`).catch(() => {});
  else for (const t of ['vitrines', 'vitrines_recherches', 'vitrines_villes']) await db.brain.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
  if (avant.appels) await db.brain.query(`DELETE FROM appels WHERE siren = ANY($1::text[])`, [SIRENS]).catch(() => {});
  else await db.brain.query('DROP TABLE IF EXISTS appels').catch(() => {});
  await db.fermer();
  const b = require('../../jarvis/bases.cjs'); await b.cerveau.end().catch(() => {}); await b.n8n.end().catch(() => {});
});

// Le registre public, bouchonné : chaque SIREN a son siège ; les appels sont comptés.
function registre(table) {
  const appels = [];
  const fetch = async (url) => {
    const siren = new URL(url).searchParams.get('q');
    appels.push(siren);
    const x = table[siren];
    if (x === 'panne') return { ok: false, status: 429, json: async () => ({}) };
    const res = x ? [{ siren, etat_administratif: 'A', siege: { adresse: `1 RUE DU BANC ${x.cp || '74000'} ${x.ville || 'ANNECY'}`, libelle_commune: x.ville || 'ANNECY',
      departement: x.dep || '74', latitude: '45.9', longitude: '6.12', nom_commercial: null, etat_administratif: 'A' },
    complements: { est_association: !!x.asso, est_service_public: null, est_avocat: false } }] : [];
    return { ok: true, status: 200, json: async () => ({ results: res, total_results: res.length }) };
  };
  return { fetch, appels };
}

test('depuisSherlock : une fiche par entreprise sans site — à appeler avec un numéro vérifié, à compléter sinon ; rien n’est jeté sans motif', async (t) => {
  if (!db) { t.skip('bases du banc absentes'); return; }
  const { n8n, brain } = db;
  avant.vitrines = !!(await brain.query(`SELECT to_regclass('vitrines') AS t`)).rows[0].t;
  avant.appels = !!(await brain.query(`SELECT to_regclass('appels') AS t`)).rows[0].t;
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_statut text, ADD COLUMN IF NOT EXISTS furete_note text');
  const bilanAvant = await s.bilanSansSite({ n8n });
  const P = [
    ['930000001', 'CABINET BANC COMPTA', '69.20Z', 'Cabinets comptables', 'absent', '0450112233', null],
    ['930000002', 'SCP BANC NOTAIRES', '69.10Z', 'Cabinets d avocats', 'portail', null, 'accueil@banc-notaires.fr'],
    ['930000003', 'AGENCE BANC GABARIT', '68.31Z', 'Immobilier', 'absent', '0612345678', null],
    ['930000004', 'CONSEIL BANC PARIS', '70.22Z', 'Cabinets de conseil', 'absent', null, null],
    ['930000005', 'ASSOCIATION BANC', '69.20Z', 'Cabinets comptables', 'absent', null, null],
    ['930000006', 'BANC EMPLOI PARTAGE', '78.30Z', 'RH / recrutement', 'absent', null, null],
    ['930000007', 'CABINET BANC REFUSE', '69.20Z', 'Cabinets comptables', 'absent', '0450223344', null],
    ['930000008', 'CABINET BANC MOTEUR FERME', '69.20Z', 'Cabinets comptables', 'inconnu', null, null],
    ['930000009', 'CABINET BANC DOUBLON', '69.20Z', 'Cabinets comptables', 'absent', '0450998877', null],
    ['930000010', 'CABINET BANC DEJA ECRIT', '69.20Z', 'Cabinets comptables', 'absent', null, null],
    ['930000011', 'CABINET BANC REGISTRE ASSO', '69.20Z', 'Cabinets comptables', 'absent', null, null],
    ['930000012', 'CABINET BANC STANDARD PAU', '69.20Z', 'Cabinets comptables', 'absent', '0559422655', null],
  ];
  for (const [siren, name, naf, sector, statut, telephone, email] of P) {
    await n8n.query(`INSERT INTO prospects (siren, name, naf, sector, city, departement, status, site_statut, telephone, telephone_source, contact_email, effectif_est, furete_note)
      VALUES ($1, $2, $3, $4, 'ANNECY', '74', 'nouveau', $5, $6, $7, $8, 20, $9)`, [siren, name, naf, sector, statut, telephone, telephone ? 'site (texte)' : null, email,
      statut === 'portail' ? 'aucun site prouvé ; seulement sur le portail de sa profession : https://www.notaires.fr/fr/office/banc' : null]);
  }
  await n8n.query(`INSERT INTO outreach (siren, prospect_name, subject, body, status, sent_at) VALUES ('930000010', 'Banc', 'Objet', 'Corps', 'envoye', now())`);
  await s.preparer({ n8n, brain });
  await brain.query(`CREATE TABLE IF NOT EXISTS appels (siren text PRIMARY KEY, etat text NOT NULL CHECK (etat IN ('appele','pas_interesse','plus_tard')),
    note text, rappel_le date, maj_le timestamptz NOT NULL DEFAULT now())`);
  await brain.query(`INSERT INTO appels (siren, etat) VALUES ('930000007', 'pas_interesse') ON CONFLICT (siren) DO UPDATE SET etat = 'pas_interesse'`);
  const [{ id: osm }] = (await brain.query(`INSERT INTO vitrines (source, source_id, nom, metier, ville, telephone, statut)
    VALUES ('osm', 'osm:node/930', 'Cabinet Banc (OSM)', NULL, 'Annecy', '+33 4 50 99 88 77', 'a_appeler') RETURNING id`)).rows;

  const { fetch, appels } = registre({ 930000001: {}, 930000002: {}, 930000003: {}, 930000004: { dep: '75', cp: '75008', ville: 'PARIS' },
    930000009: {}, 930000011: { asso: true }, 930000012: {} });
  const b = await s.depuisSherlock({ n8n, brain, combien: 20, fetch, attente: 0 });
  assert.deepEqual([...appels].sort(), ['930000001', '930000002', '930000003', '930000004', '930000009', '930000011', '930000012'],
    'ni l’association, ni le code exclu, ni le refus au téléphone, ni le moteur fermé, ni l’entreprise déjà écrite ne sont demandés au registre');
  assert.deepEqual([b.ajoutees, b.a_appeler, b.a_completer, b.ecartees, b.doublons], [4, 1, 3, 2, 1]);
  const { rows } = await brain.query(`SELECT substr(source_id, 8) AS siren, nom, metier, statut, motif, telephone, telephone_source, email, adresse, ville,
    departement, site, site_etat, slug, demo_html, lat FROM vitrines WHERE source = 'sirene'`);
  const v = Object.fromEntries(rows.map((r) => [r.siren, r]));
  assert.deepEqual([v['930000001'].statut, v['930000001'].telephone, v['930000001'].metier], ['a_appeler', '04 50 11 22 33', 'expert-comptable']);
  assert.match(v['930000001'].telephone_source, /^fiche Sherlock/);
  assert.equal(v['930000001'].adresse, '1 Rue du Banc 74000 Annecy');
  assert.equal(v['930000001'].lat, 45.9);
  assert.match(v['930000001'].demo_html, /Prendre rendez-vous/);
  assert.ok(v['930000001'].slug);
  assert.deepEqual([v['930000002'].statut, v['930000002'].metier, v['930000002'].email, v['930000002'].site_etat, v['930000002'].site],
    ['a_completer', 'notaire', 'accueil@banc-notaires.fr', 'portail', 'https://www.notaires.fr/fr/office/banc']);
  assert.match(v['930000002'].motif, /numéro à trouver/);
  assert.deepEqual([v['930000003'].statut, v['930000003'].telephone], ['a_completer', null], 'le numéro de gabarit n’est jamais repris');
  assert.deepEqual([v['930000012'].statut, v['930000012'].telephone], ['a_completer', null], 'un standard hors du département n’est pas le sien');
  assert.deepEqual([v['930000004'].statut, v['930000004'].motif], ['ecarte', 'siège hors de la région (75)']);
  assert.deepEqual([v['930000011'].statut, v['930000011'].motif], ['ecarte', 'association (à but non lucratif)']);
  assert.deepEqual([v['930000009'].statut, v['930000009'].motif], ['ecarte', `déjà dans les vitrines (n°${osm})`]);
  for (const x of ['930000005', '930000006', '930000007', '930000008', '930000010']) assert.equal(v[x], undefined, x);
  assert.ok(!rows.some((r) => r.statut === 'brouillon'), 'jamais de brouillon d’e-mail : aucun texte validé pour les entreprises');

  // le passage suivant ne redemande rien au registre
  const second = registre({});
  const b2 = await s.depuisSherlock({ n8n, brain, combien: 20, fetch: second.fetch, attente: 0 });
  assert.deepEqual([b2.candidates, second.appels.length], [0, 0]);

  // le registre en panne (429) : on s'arrête, rien n'est noté, la suite au prochain passage
  await n8n.query(`INSERT INTO prospects (siren, name, naf, sector, city, departement, status, site_statut, effectif_est)
    VALUES ('930000013', 'CABINET BANC PANNE', '69.20Z', 'Cabinets comptables', 'ANNECY', '74', 'nouveau', 'absent', 20)`);
  const panne = registre({ 930000013: 'panne' });
  const b3 = await s.depuisSherlock({ n8n, brain, combien: 20, fetch: panne.fetch, attente: 0 });
  assert.match(b3.erreur, /429/);
  assert.equal((await brain.query(`SELECT count(*)::int AS n FROM vitrines WHERE source_id = 'sirene:930000013'`)).rows[0].n, 0);

  // le compte de la page Prospection : par verdict et par secteur
  const bilan = await s.bilanSansSite({ n8n });
  assert.equal(bilan.total.portail - bilanAvant.total.portail, 1);
  assert.equal(bilan.total.inconnu - bilanAvant.total.inconnu, 1);
  assert.equal(bilan.total.absent - bilanAvant.total.absent, 10, 'le code exclu (78.30Z) n’est pas de Sherlock');
  assert.ok(bilan.secteurs['Cabinets comptables'].absent >= 8);
  assert.equal(bilan.sans_site, bilan.total.absent + bilan.total.portail);
});

test('le Cockpit : « Registre des entreprises », les annuaires dans la fiche ; Basile saisit le numéro, la fiche passe aux appels', async (t) => {
  if (!db) { t.skip('bases du banc absentes'); return; }
  const vit = require('../../jarvis/vitrines.cjs');
  const { rows: [r] } = await db.brain.query(`SELECT id FROM vitrines WHERE source_id = 'sirene:930000002'`);
  if (!r) { t.skip('le test précédent n’a pas créé la fiche'); return; }
  const fi = await vit.uneFiche(r.id, 'https://cockpit.raime.fr');
  assert.equal(fi.source, 'Registre des entreprises');
  assert.equal(fi.statut, 'a_completer');
  assert.deepEqual(fi.annuaires.map((a) => a.url), ['https://www.notaires.fr/fr/office/banc',
    'https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=Banc+Notaires&ou=Annecy']);
  assert.deepEqual(await vit.agir(r.id, { action: 'telephone', numero: '06 12 34 56 78' }),
    { ok: false, erreur: 'numéro français attendu : 10 chiffres (04 50 12 34 56), ni 08 ni numéro de démonstration' });
  assert.equal((await vit.agir(r.id, { action: 'telephone', numero: '12' })).ok, false);
  assert.deepEqual(await vit.agir(r.id, { action: 'telephone', numero: '+33 4 50 55 66 77' }), { ok: true, telephone: '04 50 55 66 77' });
  const apres = await vit.uneFiche(r.id, 'https://cockpit.raime.fr');
  assert.deepEqual([apres.statut, apres.telephone, apres.telephone_source], ['a_appeler', '04 50 55 66 77', 'saisi par Basile']);
  const { rows: [h] } = await db.brain.query('SELECT demo_html FROM vitrines WHERE id = $1', [r.id]);
  assert.match(h.demo_html, /href="tel:0450556677"/, 'la maquette porte désormais le bouton d’appel');
  assert.deepEqual(await vit.agir(r.id, { action: 'telephone', numero: '04 50 55 66 78' }), { ok: false, erreur: 'seule une fiche « à compléter » reçoit un numéro' });
  const l = await vit.liste({ statut: 'a_completer' }, 'https://cockpit.raime.fr');
  assert.ok(l.vitrines.every((x) => x.statut === 'a_completer') && l.compteurs.a_completer >= 2);
  const p = require('../../jarvis/prospection.cjs');
  const file = await p.file();
  assert.ok(file.sans_site && file.sans_site.total && typeof file.sans_site.total.absent === 'number', 'le compte sans site sur la page Prospection');
});
