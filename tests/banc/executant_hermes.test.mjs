// Le relais Cockpit → Hermes : il parle le langage de l'ancien exécutant, Hermes fait le travail.
import { prevoir } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.API_SERVER_KEY = 'cle-fictive-du-banc';
process.env.TRAVAIL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-travail-'));
const { creerServeur, PREAMBULE } = await import('../../hermes/executant.js');

// Faux Hermes : répond, sauf pour une tâche qui contient « panne ».
const recus = [];
let lent = null;
prevoir(/raime-hermes:8642\/v1\/models$/, {});
prevoir(/raime-hermes:8642\/v1\/chat\/completions$/, (u, o) => {
  const d = JSON.parse(o.body);
  recus.push({ auth: o.headers.Authorization, contenu: d.messages[0].content, provider: d.provider, model: d.model });
  const c = d.messages[0].content;
  if (/panne/.test(c)) return { choices: [{ message: { content: '' } }] };
  // Les échecs tels que le vrai Hermes les rend (relevés le 26/09/2026).
  if (/deguise/.test(c)) return { choices: [{ message: { content: "⚠️ Provider authentication failed: No usable credentials found for provider 'gemini'." }, finish_reason: 'stop' }], usage: { total_tokens: 0 } };
  if (d.provider === 'local') return { choices: [{ message: { content: 'Fait par le modèle local.' }, finish_reason: 'stop' }], usage: { total_tokens: 40 } };
  if (/credit-epuise/.test(c)) return { choices: [{ message: { content: 'Billing or credits exhausted' }, finish_reason: 'error' }], hermes: { failed: true, error: 'HTTP 402: Insufficient credits' } };
  if (/bug-tache/.test(c)) return { choices: [{ message: { content: 'Le script a planté' }, finish_reason: 'error' }], hermes: { failed: true, error: 'tool execution crashed' } };
  return { choices: [{ message: { content: 'Fait : le site est dans demande-7/app/index.html.' } }] };
});

let serveur, port;
const appeler = (methode, chemin, corps) => new Promise((ok, ko) => {
  const req = http.request({ host: '127.0.0.1', port, path: chemin, method: methode, headers: { 'Content-Type': 'application/json' } }, (res) => {
    let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => ok({ statut: res.statusCode, corps: JSON.parse(t) }));
  });
  req.on('error', ko); if (corps) req.write(JSON.stringify(corps)); req.end();
});

before(async () => { serveur = creerServeur(); await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok)); port = serveur.address().port; });
after(() => serveur.close());

test('/sante répond « libre », comme l’ancien exécutant', async () => {
  const r = await appeler('GET', '/sante');
  assert.deepEqual(r.corps, { etat: 'libre', moteur: 'hermes' });
});

test('une tâche part à Hermes, avec sa clé et la règle d’apprentissage, et revient au format du Cockpit', async () => {
  const r = await appeler('POST', '/tache', { tache: 'Crée un site pour la boulangerie', id: 7 });
  assert.equal(r.statut, 200);
  assert.equal(r.corps.code, 0);
  assert.match(r.corps.sortie, /demande-7\/app\/index\.html/);
  assert.equal(typeof r.corps.duree_s, 'number');
  assert.equal(recus[0].auth, 'Bearer cle-fictive-du-banc');
  assert.ok(recus[0].contenu.startsWith(PREAMBULE));
  assert.match(recus[0].contenu, /écris ou améliore la compétence/);
  assert.match(recus[0].contenu, /Crée un site pour la boulangerie$/);
});

test('le résultat est aussi écrit dans /travail/demande-<id>/.resultat.json (reprise après redémarrage)', () => {
  const f = path.join(process.env.TRAVAIL_DIR, 'demande-7', '.resultat.json');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).code, 0);
});

test('une réponse vide devient un échec, que le Cockpit renvoie à Claude', async () => {
  const r = await appeler('POST', '/tache', { tache: 'tâche en panne', id: 8 });
  assert.equal(r.corps.code, 1);
  assert.match(r.corps.trace, /vide/);
});

test('Hermes injoignable : un échec propre, jamais un plantage', async () => {
  process.env.HERMES_URL = 'http://ailleurs:1';
  const { executer } = await import('../../hermes/executant.js?injoignable');
  const r = await executer({ tache: 'x', id: 9 });
  assert.equal(r.code, 1);
  assert.match(r.trace, /injoignable/);
});

test('un identifiant qui n’est pas un nombre n’écrit rien hors de /travail', async () => {
  await appeler('POST', '/tache', { tache: 'x', id: '../../etc' });
  assert.ok(!fs.existsSync(path.join(process.env.TRAVAIL_DIR, '..', '..', 'etc', '.resultat.json')));
});

test('requêtes invalides refusées ; sans clé, le relais ne démarre pas', async () => {
  assert.equal((await appeler('POST', '/tache', { id: 1 })).statut, 400);
  assert.equal((await appeler('GET', '/ailleurs')).statut, 404);
  delete process.env.API_SERVER_KEY;
  const m = await import('../../hermes/executant.js?sanscle');
  assert.throws(() => m.creerServeur(), /API_SERVER_KEY/);
});

test('en régime « arrêt », le Cockpit demande le gratuit : Hermes reçoit Gemini ; sinon, son modèle habituel', async () => {
  recus.length = 0;
  await appeler('POST', '/tache', { tache: 'un ordre en régime arrêt', id: 31, gratuit: true });
  await appeler('POST', '/tache', { tache: 'un ordre en régime normal', id: 32 });
  assert.deepEqual([recus[0].provider, recus[0].model], ['gemini', 'gemini-3.8-flash']);
  assert.deepEqual([recus[1].provider, recus[1].model], [undefined, 'hermes-agent']);
});

test('un échec déguisé en réponse (⚠️, zéro jeton) n’est jamais annoncé « fait »', async () => {
  const r = await appeler('POST', '/tache', { tache: 'deguise', id: 41 });
  assert.equal(r.corps.code, 1);
  assert.match(r.corps.trace, /Provider authentication failed/);
});

test('crédit épuisé (402) : le relais redemande au modèle local, et la demande est faite', async () => {
  recus.length = 0;
  const r = await appeler('POST', '/tache', { tache: 'credit-epuise', id: 42 });
  assert.equal(r.corps.code, 0);
  assert.equal(r.corps.sortie, 'Fait par le modèle local.');
  assert.equal(r.corps.moteur, 'local · gemma4:e4b');
  assert.deepEqual(recus.map((x) => x.provider), [undefined, 'local']);
});

test('un vrai échec de la tâche n’est pas refait (pas de double exécution)', async () => {
  recus.length = 0;
  const r = await appeler('POST', '/tache', { tache: 'bug-tache', id: 43 });
  assert.equal(r.corps.code, 1);
  assert.equal(recus.length, 1);
  assert.match(r.corps.trace, /tool execution crashed/);
});
