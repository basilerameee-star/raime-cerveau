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
prevoir(/raime-hermes:8642\/v1\/chat\/completions$/, (u, o) => {
  const d = JSON.parse(o.body);
  recus.push({ auth: o.headers.Authorization, contenu: d.messages[0].content });
  if (/panne/.test(d.messages[0].content)) return { choices: [{ message: { content: '' } }] };
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
