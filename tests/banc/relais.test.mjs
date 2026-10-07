// La conclusion d'un ordre rendu par Hermes (07/10/2026) : réussite = faite ; un ordre de Basile qui échoue remonte à
// Claude avec sa raison ; une séance d'apprentissage de la nuit qui échoue est refusée chez Hermes, jamais chez Claude.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime', RELAIS: '0' });
const require = createRequire(import.meta.url);
const b = require('../../jarvis/bases.cjs');
const { conclure } = require('../../jarvis/relais.cjs');

const ids = [];
after(async () => { if (ids.length) await b.lire('DELETE FROM commandes WHERE id = ANY($1::int[])', [ids]); await b.cerveau.end(); await b.n8n.end(); });

async function ordre(texte) {
  await b.preparer();
  const [r] = await b.lire("INSERT INTO commandes (texte, pour, etat) VALUES ($1, 'harness', 'en_cours') RETURNING id", [texte]);
  ids.push(r.id);
  return r.id;
}
const etat = async (id) => (await b.lire('SELECT etat, pour FROM commandes WHERE id = $1', [id]))[0];

test('un ordre de Basile : réussi = fait ; échoué = remonte à Claude avec sa raison', async () => {
  const a = await ordre('Prépare la page de qualification');
  await conclure(a, { code: 0, sortie: 'page livrée' });
  assert.deepEqual(await etat(a), { etat: 'faite', pour: 'harness' });
  const e = await ordre('Prépare la page de qualification');
  await conclure(e, { code: 1, trace: 'fetch failed' });
  assert.deepEqual(await etat(e), { etat: 'a_faire', pour: 'claude' });
});

test('une séance d’apprentissage qui échoue est refusée chez Hermes, jamais envoyée à Claude', async () => {
  const s = await ordre('Apprentissage (séance automatique de la nuit) : 1) relis tes compétences');
  await conclure(s, { code: 1, trace: 'fetch failed' });
  assert.deepEqual(await etat(s), { etat: 'refusee', pour: 'harness' });
  const t = await ordre('Apprentissage (séance automatique de la nuit) : 1) relis tes compétences');
  await conclure(t, null);                                                  // compte rendu perdu : une relance
  assert.deepEqual(await etat(t), { etat: 'a_faire', pour: 'harness' });
  await b.lire("UPDATE commandes SET etat = 'en_cours' WHERE id = $1", [t]);
  await conclure(t, null);                                                  // perdu deux fois : refusée, pas chez Claude
  assert.deepEqual(await etat(t), { etat: 'refusee', pour: 'harness' });
});
