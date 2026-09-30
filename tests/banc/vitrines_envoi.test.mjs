// L'envoi des vitrines : seul un brouillon validé par Basile entre dans la file ; en pause rien ne part, en test tout
// part vers l'adresse de test et n'est jamais compté comme un envoi ; chaque e-mail est marqué selon SA réponse de Resend ;
// les réponses, les « stop » et les désinscriptions reviennent dans la fiche. Le workflow n8n est lu tel qu'il est livré.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { createRequire } from 'node:module';
import { db } from '../../agents/lib.js';
import { preparer, preparerEnvoi, synchroniser, lireReponse } from '../../agents/vitrines.js';

// La liste d'appels du Cockpit lit les mêmes bases de test.
Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime' });
const require = createRequire(import.meta.url);
const brain = db(); await brain.connect();
const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
const existe = async (t) => (await n8n.query('SELECT to_regclass($1) AS r', [`public.${t}`])).rows[0].r !== null;
const crees = [];
for (const [t, ddl] of [['suppression', 'email text PRIMARY KEY, reason text'],
  ['replies', 'id serial PRIMARY KEY, from_email text, prospect_siren text, subject text, body text, received_at timestamptz DEFAULT now(), handled boolean DEFAULT false'],
  ['send_config', "id int PRIMARY KEY DEFAULT 1, mode text DEFAULT 'test', test_to text"]]) {
  if (!(await existe(t))) { await n8n.query(`CREATE TABLE ${t} (${ddl})`); crees.push(t); }
}
await n8n.query("INSERT INTO send_config (id, test_to) VALUES (1, 'essai@exemple.test') ON CONFLICT (id) DO NOTHING");
after(async () => {
  for (const t of ['vitrines_envoi', 'vitrines_envoi_config', ...crees]) await n8n.query(`DROP TABLE IF EXISTS ${t}`);
  for (const t of ['vitrines', 'vitrines_recherches', 'vitrines_villes']) await brain.query(`DROP TABLE IF EXISTS ${t}`);
  await n8n.end(); await brain.end();
  const b = require('../../jarvis/bases.cjs'); await b.cerveau.end(); await b.n8n.end();
});

const FLUX = JSON.parse(fs.readFileSync(new URL('../../n8n/vitrines_envoi.json', import.meta.url), 'utf8'));
const noeud = (nom) => FLUX.nodes.find((n) => n.name === nom);
// Un nœud Code de n8n, exécuté hors de n8n : $('Nœud').all()/first(), $input.all(), et une horloge réglable.
function executer(nom, { sources = {}, entree = [], maintenant = new Date('2026-10-06T08:00:00Z') } = {}) {
  const $ = (n) => ({ all: () => sources[n] || [], first: () => (sources[n] || [])[0] });
  class Horloge extends Date { constructor(...a) { super(...(a.length ? a : [maintenant])); } }
  return new Function('$', '$input', 'Date', noeud(nom).parameters.jsCode)($, { all: () => entree }, Horloge);
}
const config = (mode, plus = {}) => [{ json: { mode, from_email: 'contact@raime.fr', from_name: 'Basile Ramé · rAIme', test_to: 'essai@exemple.test', ...plus } }];
const aEnvoyer = [{ json: { id: 7, to_email: 'boulangerie@exemple.test', sujet: 'Chez <b>Lulu</b> : j’ai préparé votre site',
  corps: 'Bonjour <script>x</script>,\n\nLe voici :\nhttps://cockpit.raime.fr/demo/chez-lulu-abc\n\nS\'il ne vous plaît pas, vous ne payez rien.' } }];

test('le workflow livré : les bons nœuds, reliés dans l’ordre, les identifiants par référence seulement', () => {
  assert.equal(FLUX.id, 'vitrinesEnvoi01');
  const chaine = ['Lire config', 'A envoyer', 'Prepare', 'Resend envoie', 'Marque', 'Ecrit statut'];
  for (let i = 0; i < chaine.length - 1; i++) assert.equal(FLUX.connections[chaine[i]].main[0][0].node, chaine[i + 1]);
  assert.equal(noeud('Resend envoie').onError, 'continueRegularOutput', 'un refus n’arrête pas le lot');
  assert.equal(noeud('Resend envoie').parameters.options.response.response.neverError, true);
  const texte = JSON.stringify(FLUX);
  assert.ok(!/re_[A-Za-z0-9]{10,}|Bearer\s+\w/.test(texte), 'aucune clé dans le fichier');
  assert.ok(!/@gmail\.com/i.test(texte), 'aucune adresse personnelle écrite dans le workflow');
});

test('pause : rien ne part ; test sans adresse de test : rien ne part', () => {
  assert.deepEqual(executer('Prepare', { sources: { 'Lire config': config('pause'), 'A envoyer': aEnvoyer } }), []);
  assert.deepEqual(executer('Prepare', { sources: { 'Lire config': config('test', { test_to: null }), 'A envoyer': aEnvoyer } }), []);
  assert.deepEqual(executer('Prepare', { sources: { 'Lire config': [], 'A envoyer': aEnvoyer } }), [], 'sans réglage : pause');
});

test('test : l’e-mail part vers l’adresse de test, marqué « ESSAI », texte échappé et liens cliquables', () => {
  const [e] = executer('Prepare', { sources: { 'Lire config': config('test'), 'A envoyer': aEnvoyer } });
  assert.deepEqual(e.json.email_body.to, ['essai@exemple.test']);
  assert.match(e.json.email_body.subject, /^\[ESSAI\] Chez <b>Lulu<\/b>/);
  assert.match(e.json.email_body.html, /destinataire réel boulangerie@exemple\.test/);
  assert.match(e.json.email_body.html, /<a href="https:\/\/cockpit\.raime\.fr\/demo\/chez-lulu-abc">/);
  assert.match(e.json.email_body.html, /S'il ne vous plaît pas/);
  assert.ok(!e.json.email_body.html.includes('<script>') && e.json.email_body.html.includes('&lt;script&gt;'), 'rien d’injecté dans le corps');
  assert.match(e.json.email_body.html, /unsub\?e=boulangerie%40exemple\.test/);
  assert.equal(e.json.email_body.from, 'Basile Ramé · rAIme <contact@raime.fr>');
  assert.match(e.json.email_body.text, /Se désinscrire : https:\/\/cockpit\.raime\.fr\/unsub/);
  assert.equal(e.json.mode, 'test');
});

test('live : vers le commerçant en semaine, jamais le week-end', () => {
  const [e] = executer('Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': aEnvoyer } });
  assert.deepEqual(e.json.email_body.to, ['boulangerie@exemple.test']);
  assert.ok(!/ESSAI/.test(e.json.email_body.subject + e.json.email_body.html));
  const samedi = new Date('2026-10-03T08:00:00Z');
  assert.deepEqual(executer('Prepare', { sources: { 'Lire config': config('live'), 'A envoyer': aEnvoyer }, maintenant: samedi }), []);
});

test('la file et le plafond : la requête « A envoyer » écarte les désinscrits et respecte le plafond du jour', async () => {
  await preparerEnvoi(n8n);
  assert.equal((await n8n.query('SELECT mode, test_to FROM vitrines_envoi_config')).rows[0].mode, 'test', 'mode test par défaut');
  assert.equal((await n8n.query('SELECT test_to FROM vitrines_envoi_config')).rows[0].test_to, 'essai@exemple.test', 'adresse reprise de l’Expéditeur');
  await n8n.query("UPDATE vitrines_envoi_config SET plafond_jour = 2");
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps) VALUES (101, 'a@x.test', 's', 'c'), (102, 'B@x.test', 's', 'c'),
    (103, 'c@x.test', 's', 'c'), (104, 'd@x.test', 's', 'c')`);
  await n8n.query("INSERT INTO suppression (email, reason) VALUES ('b@x.test', 'opt-out')");
  const q = noeud('A envoyer').parameters.query;
  assert.deepEqual((await n8n.query(q)).rows.map((r) => r.id), [101, 103], 'le désinscrit (casse comprise) sauté, deux au plus');
  await n8n.query("UPDATE vitrines_envoi SET statut = 'envoye', envoye_le = now() WHERE id = 101");
  assert.deepEqual((await n8n.query(q)).rows.map((r) => r.id), [103], 'un envoi du jour compte dans le plafond');
  await n8n.query("DELETE FROM vitrines_envoi; DELETE FROM suppression; UPDATE vitrines_envoi_config SET plafond_jour = 10");
});

test('le marquage : chacun selon sa réponse ; un essai n’est jamais un envoi ; le SQL produit tourne vraiment', async () => {
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps) VALUES (201, 'a@x.test', 's', 'c'), (202, 'b@x.test', 's', 'c'), (203, 'c@x.test', 's', 'c')`);
  const envois = [201, 202, 203].map((id) => ({ json: { id, mode: 'live' } }));
  const reponses = [{ json: { id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' } },
    { json: { statusCode: 422, name: 'validation_error', message: "L'adresse n'est pas valide" } },
    { json: { error: { message: 'timeout' } } }];
  const [m] = executer('Marque', { sources: { Prepare: envois }, entree: reponses });
  await n8n.query(m.json.sql);
  const etat = Object.fromEntries((await n8n.query('SELECT id, statut, erreur, envoye_le FROM vitrines_envoi ORDER BY id')).rows.map((r) => [r.id, r]));
  assert.equal(etat[201].statut, 'envoye'); assert.ok(etat[201].envoye_le);
  assert.equal(etat[202].statut, 'erreur'); assert.equal(etat[202].erreur, "L'adresse n'est pas valide"); assert.equal(etat[202].envoye_le, null);
  assert.equal(etat[203].statut, 'erreur'); assert.equal(etat[203].erreur, 'timeout');
  await n8n.query("UPDATE vitrines_envoi SET statut = 'a_envoyer', erreur = NULL, envoye_le = NULL");
  const [t] = executer('Marque', { sources: { Prepare: envois.map((e) => ({ json: { ...e.json, mode: 'test' } })) },
    entree: reponses.map(() => ({ json: { id: '4ef9a417-02e9-4d39-ad75-9611e0fcc33c' } })) });
  await n8n.query(t.json.sql);
  assert.deepEqual((await n8n.query('SELECT DISTINCT statut FROM vitrines_envoi')).rows.map((r) => r.statut), ['teste']);
  await n8n.query('DELETE FROM vitrines_envoi');
});

test('la lecture d’une réponse : « stop », pas intéressé, rebond, absence, vraie réponse', () => {
  assert.equal(lireReponse('[desabonnement] Demande de retrait || stop').statut, 'pas_interesse');
  assert.equal(lireReponse('[desabonnement] x || y').stop, true);
  assert.equal(lireReponse('[pas_interesse] Pas besoin de site || non merci').statut, 'pas_interesse');
  assert.equal(lireReponse('[rebond_erreur] Adresse inconnue || ...').statut, 'a_appeler');
  assert.equal(lireReponse('[absence_bureau] En congés || ...'), null);
  assert.deepEqual(lireReponse('[interesse] Veut en parler jeudi || Bonjour, oui'), { statut: 'repondu', motif: 'a répondu : Veut en parler jeudi' });
  assert.equal(lireReponse('texte sans catégorie').statut, 'repondu');
});

test('la synchronisation : validé → file ; essai et envoi reviennent ; réponse et « stop » ; désinscrit écarté ; écarté annulé', async () => {
  await preparer(brain); await preparerEnvoi(n8n);
  const ajouter = async (id, statut, email) => brain.query(`INSERT INTO vitrines (id, source, source_id, nom, email, sujet, corps, statut, telephone)
    VALUES ($1, 'osm', $2, $3, $4, 'Sujet', 'Corps', $5, '04 50 00 00 00')`, [id, `osm:${id}`, `Commerce ${id}`, email, statut]);
  await ajouter(1, 'valide', 'un@x.test'); await ajouter(2, 'brouillon', 'deux@x.test'); await ajouter(3, 'valide', 'trois@x.test');
  await ajouter(4, 'valide', 'quatre@x.test'); await ajouter(5, 'valide', 'cinq@x.test'); await ajouter(6, 'brouillon', 'six@x.test');
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps) VALUES (-1, 'essai@x.test', 'Essai de la chaîne', 'c')`);

  let b = await synchroniser({ brain, n8n });
  assert.equal(b.en_file, 4, 'les quatre validés, pas les brouillons');
  assert.deepEqual((await n8n.query('SELECT id FROM vitrines_envoi ORDER BY id')).rows.map((r) => r.id), [-1, 1, 3, 4, 5]);
  assert.equal((await synchroniser({ brain, n8n })).en_file, 0, 'une seule fois');
  assert.equal((await n8n.query('SELECT statut FROM vitrines_envoi WHERE id = -1')).rows[0].statut, 'a_envoyer', 'l’essai de la chaîne n’est pas annulé');
  await n8n.query('DELETE FROM vitrines_envoi WHERE id = -1');

  // Le workflow a tourné : 1 envoyé, 3 essayé, 4 refusé ; 5 est écarté par Basile avant son départ.
  await n8n.query(`UPDATE vitrines_envoi SET statut = 'envoye', envoye_le = now() - interval '1 day' WHERE id = 1;
    UPDATE vitrines_envoi SET statut = 'teste', envoye_le = now() WHERE id = 3;
    UPDATE vitrines_envoi SET statut = 'erreur', erreur = 'adresse refusée' WHERE id = 4`);
  await brain.query("UPDATE vitrines SET statut = 'ecarte' WHERE id = 5");
  b = await synchroniser({ brain, n8n });
  assert.equal(b.envoyes, 1); assert.equal(b.essais, 1); assert.equal(b.erreurs, 1); assert.equal(b.annules, 1);
  const fiche = async (id) => (await brain.query('SELECT statut, motif, envoye_le FROM vitrines WHERE id = $1', [id])).rows[0];
  assert.equal((await fiche(1)).statut, 'envoye'); assert.ok((await fiche(1)).envoye_le);
  assert.equal((await fiche(3)).statut, 'valide', 'un essai ne vaut pas envoi'); assert.match((await fiche(3)).motif, /^essai reçu par Basile le/);
  assert.match((await fiche(4)).motif, /^envoi refusé : adresse refusée/);
  assert.equal((await n8n.query('SELECT statut FROM vitrines_envoi WHERE id = 5')).rows[0].statut, 'annule');
  await brain.query("UPDATE vitrines SET statut = 'valide' WHERE id = 5");
  assert.equal((await synchroniser({ brain, n8n })).en_file, 1, 'revalidé : il revient dans la file');

  // Une réponse d'avant l'envoi ne compte pas ; celle d'après, oui.
  await n8n.query(`INSERT INTO replies (from_email, body, received_at) VALUES ('UN@x.test', '[interesse] Veut un appel || Oui', now() - interval '2 days'),
    ('un@x.test', '[interesse] Veut un appel jeudi || Oui', now())`);
  b = await synchroniser({ brain, n8n });
  assert.equal(b.reponses, 1);
  assert.equal((await fiche(1)).statut, 'repondu'); assert.match((await fiche(1)).motif, /^a répondu : Veut un appel jeudi/);
  const appels = require('../../jarvis/appels.cjs');
  const liste = await appels.aFaire(50);
  assert.equal(liste.liste[0].siren, 'v1', 'qui a répondu passe en tête des appels');
  assert.match(liste.liste[0].raison, /a répondu/);

  // Un « stop » : pas intéressé, et l'adresse rejoint la liste de suppression.
  await ajouter(7, 'envoye', 'sept@x.test');
  await n8n.query(`INSERT INTO vitrines_envoi (id, to_email, sujet, corps, statut, envoye_le) VALUES (7, 'sept@x.test', 's', 'c', 'envoye', now() - interval '1 hour')`);
  await n8n.query(`INSERT INTO replies (from_email, body) VALUES ('sept@x.test', '[desabonnement] Retrait || stop')`);
  await synchroniser({ brain, n8n });
  assert.equal((await fiche(7)).statut, 'pas_interesse');
  assert.equal((await n8n.query("SELECT count(*)::int AS n FROM suppression WHERE email = 'sept@x.test'")).rows[0].n, 1);

  // Le lien « se désinscrire » : un brouillon à cette adresse est écarté.
  await n8n.query("INSERT INTO suppression (email, reason) VALUES ('six@x.test', 'opt-out')");
  assert.equal((await synchroniser({ brain, n8n })).desinscrits, 1);
  assert.deepEqual(await fiche(6), { statut: 'ecarte', motif: 'désinscrit', envoye_le: null });
  assert.equal((await fiche(2)).statut, 'brouillon', 'les autres brouillons ne bougent pas');
  await brain.query('DROP TABLE IF EXISTS appels');
});
