// L'éclaireur : il repère les modèles gratuits, les mesure par du code, et la parole adopte le meilleur.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { db } from '../../agents/lib.js';
import { eclairer, lister } from '../../agents/eclaireur.js';

const require = createRequire(import.meta.url);
const parole = require('../../jarvis/parole.cjs');
const brain = db(); await brain.connect();
after(async () => { await brain.query('DROP TABLE IF EXISTS modeles_gratuits'); await brain.end(); parole.adopter({}); });

// Un faux Internet : Gemini liste deux modèles (dont un d'images, écarté) ; « gemini-9-flash » répond juste.
function reseau() {
  const appels = [];
  const fetch = async (url, o = {}) => {
    const corps = o.body ? JSON.parse(o.body) : null;
    appels.push({ url: String(url), modele: corps?.model });
    const rep = (statut, c) => ({ ok: statut === 200, status: statut, json: async () => c });
    if (/generativelanguage.*\/models$/.test(url)) return rep(200, { data: [{ id: 'models/gemini-9-flash' }, { id: 'models/imagen-5' }, { id: 'models/gemini-3.1-flash-lite' }] });
    if (/generativelanguage.*chat/.test(url)) return rep(200, { choices: [{ message: { content: corps.model === 'gemini-9-flash' ? 'juste' : 'faux' } }] });
    if (/api\/tags$/.test(url)) return rep(200, { models: [{ name: 'gemma4:e4b' }] });
    if (/api\/chat$/.test(url)) return rep(200, { message: { content: 'faux' } });
    throw new Error('réseau coupé : ' + url);
  };
  return { fetch, appels };
}
const env = { GEMINI_API_KEY: 'g', MODELE_LOCAL_URL: 'http://local' };
const TACHES = [{ systeme: 's', invite: 'i', maxTokens: 5, verifier: (t) => (t === 'juste' ? 100 : 0) }];

test('lister : les modèles gratuits de Gemini et du serveur, sans les modèles d’images', async () => {
  const l = await lister({ env, fetch: reseau().fetch });
  assert.deepEqual(l.map((m) => `${m.fournisseur}:${m.modele}`), ['Gemini:gemini-9-flash', 'Gemini:gemini-3.1-flash-lite', 'local:gemma4:e4b']);
});

test('mesurés par du code, le meilleur est adopté : la parole de Jarvis l’appelle en premier', async () => {
  const { fetch } = reseau();
  const m = await import('../../agents/eclaireur.js');
  // la batterie réelle est remplacée par une tâche au verdict certain
  const r = await m.eclairer({ brain, env, fetch, parJour: 3, taches: TACHES });
  assert.equal(r.vus, 3);
  assert.equal(r.nouveaux.length, 3);
  assert.deepEqual(r.classement, { Gemini: ['gemini-9-flash'] }, 'seul le modèle noté 100 est adopté');
  const net = reseau();
  await parole.repondreSansFrais({ messages: [{ role: 'user', content: 'Bonjour' }], coffre: { GEMINI_API_KEY: 'g' }, env: {}, fetch: net.fetch });
  assert.equal(net.appels.find((a) => /chat/.test(a.url)).modele, 'gemini-9-flash');
  const j = await brain.query("SELECT changement, motif FROM journal WHERE acteur = 'eclaireur' ORDER BY created_at DESC LIMIT 1");
  assert.match(j.rows[0].changement, /3 modèles gratuits vus, 3 nouveaux, 3 mesurés/);
  assert.match(j.rows[0].motif, /en tête : Gemini gemini-9-flash/);
});

test('le lendemain : rien n’est remesuré avant 14 jours, rien d’OpenRouter n’est appelé', async () => {
  const { fetch, appels } = reseau();
  const r = await eclairer({ brain, env, fetch, taches: TACHES });
  assert.equal(r.nouveaux.length, 0);
  assert.equal(r.mesures.length, 0);
  assert.ok(!appels.some((a) => /openrouter/.test(a.url)));
});
