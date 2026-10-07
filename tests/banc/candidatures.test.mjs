// Le Bureau des candidatures (01/10/2026) : la fiche écrite par un modèle gratuit ne passe que si elle est
// complète ; une offre écartée n'a pas de lettre ; la lettre reprend l'accroche et la bonne adresse ;
// l'Envoyeur n'entre qu'avec le jeton du coffre ; la file ne rend que les fiches validées.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const coffre = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banc-coffre-')), 'coffre.env');
const JETON = 'j'.repeat(48);
fs.writeFileSync(coffre, `ENVOYEUR_JETON=${JETON}\n`);
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-candidatures-'));
fs.writeFileSync(path.join(dossier, 'profil.json'), JSON.stringify({ profil: 'Profil de test.', signature: 'Signature de test' }));
Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime', COFFRE_FICHIER: coffre, CANDIDATURES_DIR: dossier });
const require = createRequire(import.meta.url);
const c = require('../../jarvis/candidatures.cjs');
const { lire } = require('../../jarvis/bases.cjs');

after(async () => { await lire("DELETE FROM candidatures WHERE id LIKE 'banc-%'"); });

const OFFRE = { id: 'banc-1', titre: 'Vendeur 80 %', entreprise: 'Boutique Test', lieu: 'Genève', taux: [80, 80], source: 'jobup',
  methode: 'APPLICATION_METHOD.FORMULAR', description: 'Nous cherchons un vendeur.' };
const repondant = (obj) => async () => ({ texte: JSON.stringify(obj), source: 'faux' });

test('une fiche complète donne une lettre avec l’accroche et la signature du profil', async () => {
  const f = await c.ecrireFiche(OFFRE, { repondre: repondant({ avis: 'postuler', cv: 'Vente', langue: 'Français', poste: 'Vendeur',
    chez: 'chez Boutique Test', accroche: 'J’aime conseiller chaque client.', pourquoi: 'Ça colle.' }) });
  assert.equal(f.avis, 'postuler');
  assert.match(f.lettre, /J’aime conseiller chaque client\./);
  assert.match(f.lettre, /Signature de test/);
  assert.match(f.lettre, /au taux de 80 %/);
});

test('une offre écartée n’a pas de lettre ; une réponse incomplète ou illisible ne donne rien', async () => {
  const e = await c.ecrireFiche(OFFRE, { repondre: repondant({ avis: 'ecarte', pourquoi: 'Allemand exigé.' }) });
  assert.equal(e.avis, 'ecarte'); assert.equal(e.lettre, undefined);
  assert.equal(await c.ecrireFiche(OFFRE, { repondre: repondant({ avis: 'postuler', cv: 'Vente' }) }), null);
  assert.equal(await c.ecrireFiche(OFFRE, { repondre: async () => ({ texte: 'pas du JSON' }) }), null);
  assert.equal(await c.ecrireFiche(OFFRE, { repondre: repondant({ avis: 'peut-être' }) }), null);
  // sans profil sur le serveur, aucune fiche n'est écrite
  assert.equal(await c.ecrireFiche(OFFRE, { prof: null, repondre: repondant({ avis: 'ecarte', pourquoi: 'x' }) }), null);
});

test('l’Envoyeur n’entre qu’avec le jeton exact du coffre', () => {
  assert.ok(c.envoyeurAutorise({ headers: { 'x-envoyeur-jeton': JETON } }));
  assert.ok(!c.envoyeurAutorise({ headers: { 'x-envoyeur-jeton': 'x'.repeat(48) } }));
  assert.ok(!c.envoyeurAutorise({ headers: {} }));
});

test('la file ne rend que les fiches validées ; le résultat les fait passer en envoyée ou « à toi »', async () => {
  await c.preparer();
  await c.importer([
    { id: 'banc-v', offre: OFFRE, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'valide' },
    { id: 'banc-a', offre: OFFRE, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'a_valider' },
  ]);
  const f = (await c.file(100)).map((x) => x.id);
  assert.ok(f.includes('banc-v')); assert.ok(!f.includes('banc-a'));
  assert.equal((await c.resultat({ id: 'banc-v', statut: 'envoye' })).statut, 'envoye');
  assert.equal((await c.resultat({ id: 'banc-a', statut: 'question', detail: 'CFC ?' })).statut, 'a_toi');
  assert.ok(!(await c.file(100)).map((x) => x.id).includes('banc-v'));
});

test('un échec de formulaire ne range jamais une candidature validée : 3 essais, puis elle revient à Basile', async () => {
  await c.importer([{ id: 'banc-e', offre: OFFRE, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'valide' }]);
  assert.equal((await c.resultat({ id: 'banc-e', statut: 'formulaire', detail: 'x' })).statut, 'valide');
  assert.equal((await c.resultat({ id: 'banc-e', statut: 'erreur', detail: 'x' })).statut, 'valide');
  const r = await c.resultat({ id: 'banc-e', statut: 'reconnexion', detail: 'x' });
  assert.deepEqual([r.statut, r.essais], ['a_toi', 3]);
  await c.agir('banc-e', { statut: 'valide' });                       // revalidée : de nouveaux essais
  assert.equal((await c.resultat({ id: 'banc-e', statut: 'formulaire' })).statut, 'valide');
  assert.equal((await c.resultat({ id: 'banc-e', statut: 'expiree' })).statut, 'ecartee');
});

test('seules les offres d’un canal automatique sont proposées ; les autres sont rangées et comptées', async () => {
  await c.importer([
    { id: 'banc-li', offre: { ...OFFRE, id: 'banc-li', source: 'LinkedIn', methode: '' }, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'a_valider' },
    { id: 'banc-ext', offre: { ...OFFRE, id: 'banc-ext', methode: 'APPLICATION_METHOD.EXTERNAL' }, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'a_valider' },
    { id: 'banc-ok', offre: { ...OFFRE, id: 'banc-ok' }, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'a_valider' },
  ]);
  await c.reclasser();
  const l = await c.liste();
  const ids = l.offres.map((o) => o.id);
  assert.ok(ids.includes('banc-ok')); assert.ok(!ids.includes('banc-li')); assert.ok(!ids.includes('banc-ext'));
  assert.ok(l.compte.hors_auto >= 2);
  assert.equal(c.canal({ source: 'HelloWork' }), 'hellowork');
  // une offre nouvelle d'un canal manuel est rangée sans passer par un modèle
  await c.recevoirOffres([{ id: 'banc-n', titre: 'Vendeur', source: 'LinkedIn' }]);
  await c.traiterNouvelles({ max: 0 });
  const [n] = await lire("SELECT statut FROM candidatures WHERE id = 'banc-n'");
  assert.equal(n.statut, 'hors_auto');
});

test('candidature par e-mail : une vraie consigne de l’annonce est retenue, une adresse de contact jamais', async () => {
  const consigne = c.adresseCandidature({ description: 'Pour postuler, envoyez votre CV et votre lettre de motivation par e-mail à recrutement@exemple.ch. Merci.' });
  assert.equal(consigne.email, 'recrutement@exemple.ch');
  assert.match(consigne.phrase, /envoyez votre CV/);
  assert.equal(c.adresseCandidature({ description: 'Pour toute question sur cette candidature : info@exemple.ch' }), null);
  assert.equal(c.adresseCandidature({ description: 'Contact : jean@exemple.ch. Nous recherchons un vendeur. Postulez via notre site.' }), null);
  assert.equal(c.adresseCandidature({ description: 'Aucune candidature par e-mail ne sera traitée (rh@exemple.ch).' }), null);
  const offre = { id: 'banc-mail', titre: 'Vendeur', source: 'LinkedIn', pays: 'CH', description: 'Envoyez votre dossier de candidature à rh@boutique.ch' };
  assert.equal(c.canal(offre), 'email');
  await c.importer([{ id: 'banc-mail', offre, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'valide' }]);
  const f = (await c.file(300)).find((x) => x.id === 'banc-mail');
  assert.deepEqual([f.canal, f.email], ['email', 'rh@boutique.ch']);
});

test('une offre sans canal automatique ne se « valide » pas ; Basile note « J’ai postulé moi-même »', async () => {
  const li = { ...OFFRE, id: 'banc-man', source: 'LinkedIn', methode: '' };
  await c.importer([{ id: 'banc-man', offre: li, fiche: { cv: 'Vente', lettre: 'L' }, statut: 'a_toi' }]);
  const v = await c.agir('banc-man', { statut: 'valide' });
  assert.equal(v.ok, false);
  assert.match(v.erreur, /postule depuis l’annonce/);
  assert.equal((await c.agir('banc-man', { statut: 'postule_main' })).ok, true);
  const [r] = await lire("SELECT statut, envoi->>'manuel' AS manuel FROM candidatures WHERE id = 'banc-man'");
  assert.deepEqual([r.statut, r.manuel], ['envoye', 'true']);
});
