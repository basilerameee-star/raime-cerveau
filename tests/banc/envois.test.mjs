// L'ENVOI SEUL (14/10/2026) : les pré-audits et les vitrines partent sans validation de Basile, un e-mail toutes les 0,7 s,
// chacun marqué selon SA réponse de Resend (le 12–14/10, 24 e-mails refusés en 429 avaient été marqués « envoyés »), au plafond
// du jour qui monte seul et redescend quand les e-mails reviennent. La Sentinelle n'écrit plus que l'actionnable, une fois ;
// le reste va dans le rapport de 7 h 30. Les workflows n8n sont lus tels qu'ils sont livrés ; le SQL tourne sur la base de test.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { createRequire } from 'node:module';
import { db } from '../../agents/lib.js';
import { preparerEnvoi } from '../../agents/vitrines.js';

Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime' });
const require = createRequire(import.meta.url);
const brain = db(); await brain.connect();
const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
const lire = (f) => fs.readFileSync(new URL(`../../n8n/${f}`, import.meta.url), 'utf8');

const existe = async (c, t) => (await c.query('SELECT to_regclass($1) AS r', [`public.${t}`])).rows[0].r !== null;
const crees = [], creesBrain = [];
for (const [t, ddl] of [['suppression', 'email text PRIMARY KEY, reason text'],
  ['replies', 'id serial PRIMARY KEY, from_email text, prospect_siren text, subject text, body text, received_at timestamptz DEFAULT now(), handled boolean DEFAULT false'],
  ['send_config', "id int PRIMARY KEY DEFAULT 1, mode text DEFAULT 'test', test_to text"],
  ['workflow_entity', 'id text PRIMARY KEY, name text, "activeVersionId" text'],
  ['execution_entity', 'id serial PRIMARY KEY, "workflowId" text, status text, "startedAt" timestamptz'],
  ['gardien_log', 'id serial PRIMARY KEY, severity text, rule text, detail text, created_at timestamptz DEFAULT now()']]) {
  if (!(await existe(n8n, t))) { await n8n.query(`CREATE TABLE ${t} (${ddl})`); crees.push(t); }
}
if (!(await existe(brain, 'boucle_passages'))) {
  await brain.query('CREATE TABLE boucle_passages (agent text NOT NULL, fin_le timestamptz NOT NULL DEFAULT now(), statut text NOT NULL, duree_ms int)');
  creesBrain.push('boucle_passages');
}
for (const c of ['furete_le timestamptz', 'furete_note text']) await n8n.query(`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ${c}`);
await n8n.query("INSERT INTO send_config (id, mode, test_to) VALUES (1, 'live', 'essai@exemple.test') ON CONFLICT (id) DO UPDATE SET mode = 'live'");
await preparerEnvoi(n8n);
await n8n.query(lire('envois.sql'));
await n8n.query(lire('envois.sql'));   // se rejoue sans dommage
await n8n.query("UPDATE vitrines_envoi_config SET mode = 'live'");

after(async () => {
  await n8n.query('DROP VIEW IF EXISTS envoi_preaudits, envoi_vitrines; DROP FUNCTION IF EXISTS plafond_envoi(text)');
  await n8n.query("DELETE FROM outreach WHERE siren LIKE 'env%'; DELETE FROM prospects WHERE siren LIKE 'env%'");
  for (const t of ['vitrines_envoi', 'vitrines_envoi_config', ...crees]) await n8n.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  for (const c of ['resend_id', 'erreur', 'livraison']) await n8n.query(`ALTER TABLE outreach DROP COLUMN IF EXISTS ${c}`);
  for (const t of creesBrain) await brain.query(`DROP TABLE IF EXISTS ${t}`);
  await brain.query("DELETE FROM journal WHERE acteur = 'fureteur' AND motif LIKE 'banc envois%'");
  await n8n.end(); await brain.end();
  const b = require('../../jarvis/bases.cjs'); await b.cerveau.end(); await b.n8n.end();
});

// ── Les nœuds Code de n8n, exécutés hors de n8n : $('Nœud'), $input, this.helpers.httpRequest, une horloge réglable ──
const EXP = JSON.parse(lire('expediteur_envoi.json'));
const VIT = JSON.parse(lire('vitrines_envoi.json'));
const noeud = (flux, nom) => flux.nodes.find((n) => n.name === nom);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function executer(flux, nom, { sources = {}, entree = [], maintenant = new Date('2026-10-15T08:00:00Z'), http } = {}) {
  const $ = (n) => ({ all: () => sources[n] || [], first: () => (sources[n] || [])[0] });
  class Horloge extends Date { constructor(...a) { super(...(a.length ? a : [maintenant])); } }
  const helpers = { httpRequest: http || (async () => { throw new Error('réseau coupé'); }) };
  return new AsyncFunction('$', '$input', 'Date', noeud(flux, nom).parameters.jsCode).call({ helpers }, $, { all: () => entree }, Horloge);
}
const PDF = 'https://raime.fr/dossiers/rAIme-pre-audit-experts-comptables.pdf';
const corps = (avecLien = true) => `Bonjour <b>,\n\nLe voici :\n${avecLien ? PDF : 'https://raime.fr'}\n\nBasile Ramé — rAIme · raime.fr`;
const config = (mode, plus = {}) => [{ json: { mode, from_email: 'contact@raime.fr', from_name: 'Basile Ramé', test_to: 'essai@exemple.test', plafond: 10, ...plus } }];
const pdfVivant = async (o) => { pdfVivant.appels.push(o); return { statusCode: 200, headers: { 'content-type': 'application/pdf' } }; };
pdfVivant.appels = [];

test('le workflow livré : l’envoi espacé (0,7 s), chaque réponse lue, la livraison relue ; aucune clé ni adresse personnelle', () => {
  assert.equal(EXP.id, 'expediteurEnv001');
  const chaine = ['Lire config', 'A envoyer', 'Prepare', 'Resend envoie', 'Marque', 'Ecrit statut'];
  for (let i = 0; i < chaine.length - 1; i++) assert.equal(EXP.connections[chaine[i]].main[0][0].node, chaine[i + 1]);
  const livraison = ['Livraison a verifier', 'Resend statut', 'Note livraison', 'Ecrit livraison'];
  for (let i = 0; i < livraison.length - 1; i++) assert.equal(EXP.connections[livraison[i]].main[0][0].node, livraison[i + 1]);
  assert.deepEqual(EXP.connections['Chaque jour 08h'].main[0].map((l) => l.node), ['Lire config', 'Livraison a verifier']);
  for (const [flux, nom] of [[EXP, 'Resend envoie'], [EXP, 'Resend statut'], [VIT, 'Resend envoie']]) {
    const n = noeud(flux, nom);
    assert.deepEqual(n.parameters.options.batching, { batch: { batchSize: 1, batchInterval: 700 } }, `${nom} : un e-mail à la fois (le 429 du 12/10)`);
    assert.equal(n.parameters.options.response.response.neverError, true);
    assert.equal(n.onError, 'continueRegularOutput');
    assert.equal(n.credentials.httpHeaderAuth.id, 'abAOr4U3s8bzRjWi', 'la clé reste dans n8n, par référence');
  }
  for (const f of [EXP, VIT]) {
    const texte = JSON.stringify(f);
    assert.ok(!/re_[A-Za-z0-9]{10,}|Bearer\s+\w/.test(texte), 'aucune clé dans le fichier');
    assert.ok(!/@gmail\.com/i.test(texte), 'aucune adresse personnelle');
  }
  assert.ok(!/@gmail\.com/i.test(lire('sentinelle_formate.js') + lire('sentinelle_diagnostic.sql')));
});

test('Prepare : pause, essai sans adresse, week-end → rien ; en semaine, vers le prospect, texte brut et lien de désinscription', async () => {
  const a = [{ json: { id: 1, to_email: 'contact@cabinet.test', subject: 'Cabinet : j’ai préparé votre pré-audit', body: corps(), status: 'brouillon' } }];
  assert.deepEqual(await executer(EXP, 'Prepare', { sources: { 'Lire config': config('pause'), 'A envoyer': a }, http: pdfVivant }), []);
  assert.deepEqual(await executer(EXP, 'Prepare', { sources: { 'Lire config': config('test', { test_to: null }), 'A envoyer': a }, http: pdfVivant }), []);
  assert.deepEqual(await executer(EXP, 'Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': a }, http: pdfVivant,
    maintenant: new Date('2026-10-17T08:00:00Z') }), [], 'samedi : rien ne part');
  const [e] = await executer(EXP, 'Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': a }, http: pdfVivant });
  assert.deepEqual(e.json.email_body.to, ['contact@cabinet.test']);
  assert.equal(e.json.mode, 'live');
  assert.match(e.json.email_body.html, new RegExp(`<a href="${PDF}">`), 'le pré-audit est un lien cliquable');
  assert.ok(e.json.email_body.html.includes('Bonjour &lt;b&gt;'), 'rien d’injecté');
  assert.match(e.json.email_body.text, /Se désinscrire : https:\/\/cockpit\.raime\.fr\/unsub\?e=contact%40cabinet\.test$/);
  assert.equal(e.json.email_body.headers['List-Unsubscribe'], '<https://cockpit.raime.fr/unsub?e=contact%40cabinet.test>');
  assert.equal(e.json.email_body.reply_to, 'contact@raime.fr');
  const [t] = await executer(EXP, 'Prepare', { sources: { 'Lire config': config('test'), 'A envoyer': a }, http: pdfVivant });
  assert.deepEqual(t.json.email_body.to, ['essai@exemple.test']); assert.match(t.json.email_body.subject, /^\[ESSAI\] /);
});

test('Prepare : le PDF du pré-audit est vérifié avant l’envoi (une fois par lien) ; un brouillon sans pré-audit ne part pas seul ; le plafond tient', async () => {
  const a = [1, 2, 3].map((id) => ({ json: { id, to_email: `c${id}@cabinet.test`, subject: 's', body: corps(), status: 'brouillon' } }))
    .concat([{ json: { id: 4, to_email: 'c4@cabinet.test', subject: 's', body: corps(false), status: 'brouillon' } },
      { json: { id: 5, to_email: 'c5@cabinet.test', subject: 's', body: corps(false), status: 'valide' } }]);
  pdfVivant.appels.length = 0;
  let r = await executer(EXP, 'Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': a }, http: pdfVivant });
  assert.deepEqual(r.map((x) => x.json.id), [1, 2, 3, 5], 'le brouillon sans lien attend Basile ; le validé part');
  assert.equal(pdfVivant.appels.length, 1); assert.equal(pdfVivant.appels[0].method, 'HEAD'); assert.equal(pdfVivant.appels[0].url, PDF);
  r = await executer(EXP, 'Prepare', { sources: { 'Lire config': config('live', { plafond: 2 }), 'A envoyer': a }, http: pdfVivant });
  assert.deepEqual(r.map((x) => x.json.id), [1, 2]);
  const mort = async () => ({ statusCode: 404, headers: { 'content-type': 'text/html' } });
  r = await executer(EXP, 'Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': a }, http: mort });
  assert.deepEqual(r.map((x) => x.json.id), [5], 'pré-audit introuvable : ses e-mails attendent');
  r = await executer(EXP, 'Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': a } });
  assert.deepEqual(r.map((x) => x.json.id), [5], 'réseau en panne : rien n’est affirmé, rien ne part avec un lien non vérifié');
});

// ── La base : la vue des e-mails prêts, le plafond, le marquage ──
async function prospect(siren, website, departement = '74') {
  await n8n.query('INSERT INTO prospects (siren, name, sector, status, website, departement) VALUES ($1, $1, $2, $3, $4, $5)',
    [siren, 'Cabinets comptables', 'nouveau', website, departement]);
}
async function ecrire(siren, to, status, body = corps(), sent = null) {
  const { rows: [r] } = await n8n.query(`INSERT INTO outreach (siren, prospect_name, segment, to_email, subject, body, status, sent_at)
    VALUES ($1, $1, 'Cabinets comptables', $2, 'Sujet', $3, $4, $5) RETURNING id`, [siren, to, body, status, sent]);
  return Number(r.id);
}
const mesIds = async (sql) => (await n8n.query(sql)).rows.map((r) => Number(r.id)).filter((id) => ids.includes(id));
let ids = [];

test('la vue envoi_preaudits : validés et brouillons du code ; jamais dpo, .ch, désinscrit, adresse déjà écrite, ni domaine étranger au site', async () => {
  const s = {};
  for (const [k, site] of [['un', 'https://cabinet-un.fr'], ['deux', 'cabinet-deux.fr'], ['trois', 'cabinet-trois.fr'], ['quatre', 'cabinet-quatre.fr'],
    ['cinq', 'cabinet-cinq.ch'], ['six', 'cabinet-six.fr'], ['sept', 'cabinet-sept.fr'], ['septb', 'cabinet-sept.fr'], ['huit', 'cabinet-huit.fr'], ['neuf', 'cabinet-neuf.fr']]) {
    await prospect(`env${k}`, site, k === 'deux' ? '01' : '74');
  }
  s.un = await ecrire('envun', 'contact@cabinet-un.fr', 'valide', corps(false));
  s.deux = await ecrire('envdeux', 'contact@cabinet-deux.fr', 'brouillon');
  s.trois = await ecrire('envtrois', 'contact@cabinet-trois.fr', 'brouillon', corps(false));
  s.quatre = await ecrire('envquatre', 'dpo.rgpd@cabinet-quatre.fr', 'valide');
  s.cinq = await ecrire('envcinq', 'contact@cabinet-cinq.ch', 'valide');
  s.six = await ecrire('envsix', 'Contact@Cabinet-Six.fr', 'valide');
  s.sept = await ecrire('envsept', 'contact@cabinet-sept.fr', 'brouillon');
  s.septb = await ecrire('envseptb', 'CONTACT@cabinet-sept.fr', 'envoye', corps(), new Date(Date.now() - 86400000 * 3));
  s.huit = await ecrire('envhuit', 'cabinet.huit@gmail.com', 'valide');
  s.neuf = await ecrire('envneuf', 'contact@cabinet-neuf.fr', 'brouillon');
  ids = Object.values(s);
  await n8n.query("INSERT INTO suppression (email, reason) VALUES ('contact@cabinet-six.fr', 'opt-out')");
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps, statut, envoye_le) VALUES (9001, 'contact@cabinet-neuf.fr', 's', 'c', 'envoye', now())`);
  assert.deepEqual(await mesIds('SELECT id FROM envoi_preaudits ORDER BY id'), [s.un, s.deux]);
  const q = noeud(EXP, 'A envoyer').parameters.query;
  assert.deepEqual(await mesIds(q), [s.un, s.deux], 'le validé passe devant');
  await n8n.query('UPDATE send_config SET auto_brouillons = false');
  assert.deepEqual(await mesIds('SELECT id FROM envoi_preaudits'), [s.un], 'envoi seul coupé : le brouillon attend Basile');
  await n8n.query('UPDATE send_config SET auto_brouillons = true');
  await n8n.query('DELETE FROM vitrines_envoi WHERE id = 9001; DELETE FROM suppression');
});

test('le plafond du jour : départ prudent, +2 par jour ouvré, jusqu’au maximum ; les e-mails qui reviennent le ramènent au départ', async () => {
  const plafond = async (c) => (await n8n.query('SELECT plafond_envoi($1) AS p', [c])).rows[0].p;
  await n8n.query("UPDATE send_config SET daily_cap = 30, plafond_depart = 10, montee = 2, rampe_depuis = (now() AT TIME ZONE 'Europe/Paris')::date");
  assert.equal(await plafond('preaudits'), 10, 'le premier jour : 10');
  // 14 jours en arrière : 10 jours ouvrés passés (deux semaines pleines), quel que soit le jour de la semaine
  await n8n.query("UPDATE send_config SET rampe_depuis = (now() AT TIME ZONE 'Europe/Paris')::date - 14");
  assert.equal(await plafond('preaudits'), 30, '10 + 2 × 10 = 30, le maximum');
  await n8n.query('UPDATE send_config SET daily_cap = 25');
  assert.equal(await plafond('preaudits'), 25, 'jamais au-delà du maximum');
  await n8n.query("UPDATE vitrines_envoi_config SET plafond_jour = 20, plafond_depart = 8, montee = 2, rampe_depuis = (now() AT TIME ZONE 'Europe/Paris')::date - 14");
  assert.equal(await plafond('vitrines'), 20);
  await n8n.query(`UPDATE outreach SET livraison = 'bounced' WHERE siren = 'envseptb'`);
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps, statut, envoye_le, livraison) VALUES (9002, 'r@x.test', 's', 'c', 'envoye', now(), 'bounced')`);
  assert.equal(await plafond('preaudits'), 10, 'deux retours sur peu d’envois : retour au départ');
  assert.equal(await plafond('vitrines'), 8);
  await n8n.query(`UPDATE outreach SET livraison = 'delivered' WHERE siren = 'envseptb'; DELETE FROM vitrines_envoi WHERE id = 9002`);
  assert.equal(await plafond('inconnu'), null, 'un canal inconnu n’a pas de plafond');
  // la file : le plafond moins ce qui est parti aujourd'hui
  await n8n.query('UPDATE send_config SET daily_cap = 1');
  const q = noeud(EXP, 'A envoyer').parameters.query;
  const [premier] = await mesIds(q);
  assert.equal((await mesIds(q)).length, 1);
  await n8n.query("UPDATE outreach SET status = 'envoye', sent_at = now() WHERE id = $1", [premier]);
  assert.deepEqual(await mesIds(q), [], 'le plafond du jour est atteint');
  await n8n.query("UPDATE outreach SET status = 'valide', sent_at = NULL WHERE id = $1", [premier]);
  await n8n.query('UPDATE send_config SET daily_cap = 30, rampe_depuis = (now() AT TIME ZONE \'Europe/Paris\')::date');
});

test('Marque : envoyé selon la réponse de Resend ; un 429 reste dans la file ; un refus ou une panne sans réponse ne repart jamais', async () => {
  const [a, b, c, d] = ids;
  const envois = [a, b, c, d].map((id) => ({ json: { id, mode: 'live' } }));
  const reponses = [{ json: { id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' } },
    { json: { statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests' } },
    { json: { statusCode: 422, name: 'validation_error', message: 'adresse invalide' } },
    { json: { error: { message: 'timeout' } } }];
  const [m] = await executer(EXP, 'Marque', { sources: { Prepare: envois }, entree: reponses });
  await n8n.query(m.json.sql);
  const etat = Object.fromEntries((await n8n.query('SELECT id, status, sent_at, resend_id, erreur FROM outreach WHERE id = ANY($1)', [[a, b, c, d]])).rows.map((r) => [Number(r.id), r]));
  assert.equal(etat[a].status, 'envoye'); assert.ok(etat[a].sent_at); assert.equal(etat[a].resend_id, '4ef9a417-02e9-4d39-ad75-9611e0fcc33c');
  assert.equal(etat[b].status, 'brouillon', '429 : Resend n’a rien pris, il repartira'); assert.equal(etat[b].sent_at, null); assert.equal(etat[b].erreur, 'Too many requests');
  assert.equal(etat[c].status, 'erreur'); assert.equal(etat[c].erreur, 'adresse invalide');
  assert.equal(etat[d].status, 'erreur', 'délai dépassé : peut-être parti, jamais renvoyé');
  // l'ancienne forme d'un 429 (sans neverError) : « Request failed with status code 429 »
  const [m2] = await executer(EXP, 'Marque', { sources: { Prepare: [{ json: { id: b, mode: 'live' } }] },
    entree: [{ json: { error: { message: 'Request failed with status code 429' } } }] });
  assert.match(m2.json.sql, /\(\d+,NULL,NULL,/);
  const [t] = await executer(EXP, 'Marque', { sources: { Prepare: [{ json: { id: b, mode: 'test' } }] }, entree: [{ json: { id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' } }] });
  await n8n.query(t.json.sql);
  assert.equal((await n8n.query('SELECT status, sent_at FROM outreach WHERE id = $1', [b])).rows[0].status, 'teste', 'un essai n’est jamais un envoi');
  await n8n.query("UPDATE outreach SET status = 'brouillon', sent_at = NULL, erreur = NULL, resend_id = NULL WHERE id = ANY($1) AND siren <> 'envseptb'", [[a, b, c, d]]);
  await n8n.query("UPDATE outreach SET status = 'valide' WHERE siren IN ('envun')");
});

test('Note livraison : l’état annoncé par Resend revient dans chaque ligne, des deux envois ; une réponse qui ne correspond pas est ignorée', async () => {
  await n8n.query("UPDATE outreach SET resend_id = 'r-1111-aaaa', livraison = NULL WHERE siren = 'envseptb'");
  await n8n.query("INSERT INTO vitrines_envoi (id, to_email, sujet, corps, statut, envoye_le, resend_id) VALUES (9003, 'v@x.test', 's', 'c', 'envoye', now() - interval '2 hours', 'r-2222-bbbb')");
  const { rows } = await n8n.query(noeud(EXP, 'Livraison a verifier').parameters.query);
  const demandes = rows.filter((r) => ['r-1111-aaaa', 'r-2222-bbbb'].includes(r.resend_id));
  assert.equal(demandes.length, 2);
  const reponses = demandes.map((d) => ({ json: d.resend_id === 'r-1111-aaaa' ? { id: 'r-1111-aaaa', last_event: 'bounced' } : { id: 'autre', last_event: 'delivered' } }));
  const [n] = await executer(EXP, 'Note livraison', { sources: { 'Livraison a verifier': demandes.map((d) => ({ json: d })) }, entree: reponses });
  await n8n.query(n.json.sql);
  assert.equal((await n8n.query("SELECT livraison FROM outreach WHERE siren = 'envseptb'")).rows[0].livraison, 'bounced');
  assert.equal((await n8n.query('SELECT livraison FROM vitrines_envoi WHERE id = 9003')).rows[0].livraison, null, 'réponse d’un autre e-mail : ignorée');
  await n8n.query("UPDATE outreach SET livraison = 'delivered' WHERE siren = 'envseptb'; DELETE FROM vitrines_envoi WHERE id = 9003");
});

// ── La Sentinelle : composée comme par n8n/poser_envois.py, l'heure fixée par le test ──
const CLAUSE = ' ' + lire('sentinelle_clips.sql').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--')).join(' ');
const base = lire('sentinelle_diagnostic.sql').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--')).join(' ');
const SENTINELLE = base.slice(0, -') x'.length).trimEnd() + CLAUSE + ' ) x';
const sentinelle = async (quand) => (await n8n.query(SENTINELLE.replaceAll('now()', `'${quand}'::timestamptz`))).rows;
// en 2030 : jamais le jour des données du banc (datées de l'heure réelle) ; heure d'hiver, Paris = UTC + 1
const JEUDI_MIDI = '2030-01-17T11:30:00Z', JEUDI_SOIR = '2030-01-17T16:30:00Z', SAMEDI_MIDI = '2030-01-19T11:30:00Z';

test('la Sentinelle : une erreur d’un flux en service, une seule fois ; le Portier retiré n’alerte plus', async () => {
  assert.ok(SENTINELLE.includes(CLAUSE) && SENTINELLE.endsWith(' ) x'), 'la clause des clips est en place (poser_veilleurs.py reste idempotent)');
  await n8n.query(`INSERT INTO workflow_entity (id, name, "activeVersionId") VALUES ('sentinelleMon01', 'Sentinelle', 'v'), ('receptionni01', 'Réceptionniste', 'v'),
    ('portierLead0001', 'Portier · Audit gratuit (lead)', NULL), ('sherlockSrc00001', 'Sherlock', 'v'), ('expediteurEnv001', 'Expéditeur', 'v'),
    ('vitrinesEnvoi01', 'Vitrines', 'v'), ('heraut00000001', 'Héraut', 'v') ON CONFLICT (id) DO NOTHING`);
  const t = (h) => new Date(Date.parse(JEUDI_SOIR) - h * 3600000).toISOString();
  await n8n.query(`INSERT INTO execution_entity ("workflowId", status, "startedAt") VALUES ('sentinelleMon01', 'success', $1),
    ('receptionni01', 'error', $2), ('receptionni01', 'error', $3), ('portierLead0001', 'error', $2),
    ('sherlockSrc00001', 'success', $2), ('expediteurEnv001', 'success', $4), ('vitrinesEnvoi01', 'success', $4), ('heraut00000001', 'success', $4)`,
  [t(6), t(1), t(7), t(8)]);
  const lignes = (await sentinelle(JEUDI_SOIR)).map((r) => r.probleme);
  assert.deepEqual(lignes.filter((l) => /erreur/.test(l)), ['Réceptionniste : 1 exécution(s) en erreur, la dernière à 16h30 (à ouvrir dans n8n)'],
    'l’erreur d’avant le dernier passage est déjà partie ; le Portier est muet');
  assert.ok(!lignes.some((l) => /Fureteur/.test(l)), 'le Fureteur n’alerte plus (il est dans le rapport de 7 h 30)');
  assert.equal((await sentinelle(JEUDI_SOIR))[0].pour, 'essai@exemple.test', 'le destinataire vient de la base');
});

test('la Sentinelle : « aucun e-mail parti » au passage de midi d’un jour ouvré seulement, et seulement si des e-mails attendent', async () => {
  const preaudits = async (q) => (await sentinelle(q)).map((r) => r.probleme).filter((l) => /^Pré-audits/.test(l));
  assert.match((await preaudits(JEUDI_MIDI))[0], /^Pré-audits : aucun e-mail parti aujourd'hui alors que \d+ attendent/);
  assert.deepEqual(await preaudits(JEUDI_SOIR), [], 'une fois par jour : au passage de midi');
  assert.deepEqual(await preaudits(SAMEDI_MIDI), [], 'le week-end, rien ne part : rien à dire');
  await n8n.query("UPDATE outreach SET erreur = 'quota du jour atteint' WHERE siren = 'envdeux'");
  assert.match((await preaudits(JEUDI_MIDI))[0], /dernier refus de Resend : quota du jour atteint$/);
  await n8n.query("UPDATE outreach SET erreur = NULL WHERE siren = 'envdeux'");
  await n8n.query("UPDATE send_config SET mode = 'pause'");
  assert.deepEqual(await preaudits(JEUDI_MIDI), [], 'en pause, ce n’est pas une panne');
  await n8n.query("UPDATE send_config SET mode = 'live'");
  const vitrines = async () => (await sentinelle(JEUDI_MIDI)).map((r) => r.probleme).filter((l) => /^Vitrines/.test(l));
  assert.deepEqual(await vitrines(), [], 'aucune vitrine n’attend : rien à dire');
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps) VALUES (9004, 'w@x.test', 's', 'c')`);
  assert.match((await vitrines())[0], /^Vitrines : aucun e-mail parti aujourd'hui alors que 1 attendent/);
  await n8n.query('DELETE FROM vitrines_envoi WHERE id = 9004');
});

test('la Sentinelle : un flux planifié qui ne tourne plus, au passage de midi ; le Formate écrit à Basile une ligne par problème', async () => {
  const arrets = async (q) => (await sentinelle(q)).map((r) => r.probleme).filter((l) => /aucune exécution/.test(l)).sort();
  assert.deepEqual(await arrets(JEUDI_MIDI), [], 'chacun a tourné à temps');
  assert.deepEqual(await arrets(SAMEDI_MIDI), ['Expéditeur : aucune exécution depuis 28 h', 'Héraut : aucune exécution depuis 28 h',
    'Sherlock : aucune exécution depuis 8 h', 'Vitrines : aucune exécution depuis 28 h'], 'deux jours sans exécution : chacun est signalé');
  assert.deepEqual(await arrets('2030-01-19T17:30:00Z'), [], 'une fois par jour : au passage de midi');
  const rows = [{ json: { probleme: 'Réceptionniste : 1 exécution(s) en erreur <b>', pour: 'essai@exemple.test' } }, { json: { probleme: 'Vitrines : x', pour: 'essai@exemple.test' } }];
  const [m] = await executer({ nodes: [{ name: 'Formate', parameters: { jsCode: lire('sentinelle_formate.js') } }] }, 'Formate', { entree: rows });
  assert.deepEqual(m.json.email_body.to, ['essai@exemple.test']);
  assert.equal(m.json.email_body.subject, '⚠️ rAIme - à régler (2)');
  assert.ok(m.json.email_body.html.includes('en erreur &lt;b&gt;'));
  assert.match(m.json.email_body.html, /ne part qu’une fois/);
  assert.deepEqual(await executer({ nodes: [{ name: 'Formate', parameters: { jsCode: lire('sentinelle_formate.js') } }] }, 'Formate', { entree: [] }), []);
  await n8n.query("DELETE FROM execution_entity; DELETE FROM workflow_entity");
});

test('le rapport de 7 h 30 : la partie « Les envois » (partis hier, plafond, attente, livraison, Fureteur) ; une lecture en échec le dit', async () => {
  const e = require('../../jarvis/envois.cjs');
  await n8n.query(`UPDATE outreach SET status = 'envoye', sent_at = date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris' - interval '2 hours',
    livraison = 'delivered' WHERE siren = 'envun'`);
  await brain.query("INSERT INTO boucle_passages (agent, statut) VALUES ('fureteur', 'ok'), ('fureteur', 'ok')");
  await brain.query("INSERT INTO journal (acteur, changement, motif) VALUES ('fureteur', '25 fiches : 0 sites prouvés', 'banc envois. Moteur : fermé ou muet (on ne contourne pas).')");
  const s = await e.section();
  assert.equal(s.titre, 'Les envois (partis seuls, rien à faire)');
  assert.match(s.lignes[0], /^Pré-audits partis hier : 1 · plafond du jour 10 · en attente \d+ \(partent seuls à 8 h les jours ouvrés\)\.$/);
  assert.match(s.lignes[1], /^Vitrines parties hier : 0 · plafond du jour \d+ · en attente 0 \(partent seuls à 9 h les jours ouvrés\)\.$/);
  assert.match(s.lignes[2], /^Livraison sur 7 jours \(selon Resend\) : \d+ arrivés, 0 revenus, 0 plainte\(s\), \d+ pas encore relus, sur \d+ partis\.$/);
  assert.match(s.lignes[3], /^Fureteur : \d+ passage\(s\) en 24 h, 0 adresse\(s\) trouvée\(s\) ; le moteur de recherche est fermé/);
  await n8n.query('ALTER VIEW envoi_vitrines RENAME TO envoi_vitrines_cachee');
  try {
    const k = await e.section();
    assert.match(k.titre, /lecture en échec/, 'jamais « 0 » quand rien n’a pu être lu');
  } finally { await n8n.query('ALTER VIEW envoi_vitrines_cachee RENAME TO envoi_vitrines'); }
});
