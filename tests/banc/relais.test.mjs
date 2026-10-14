// La conclusion d'un ordre rendu par Hermes (07/10/2026) : réussite = faite ; un ordre de Basile qui échoue remonte à
// Claude avec sa raison ; une séance d'apprentissage de la nuit qui échoue est refusée chez Hermes, jamais chez Claude.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime', RELAIS: '0',
  LIVRABLES_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'relais-preuves-')) });
const require = createRequire(import.meta.url);
const b = require('../../jarvis/bases.cjs');
const { conclure, resultatReprise, verifierOrdre, relancer } = require('../../jarvis/relais.cjs');

const ids = [];
after(async () => { if (ids.length) await b.lire('DELETE FROM commandes WHERE id = ANY($1::int[])', [ids]); await b.cerveau.end(); await b.n8n.end(); fs.rmSync(process.env.LIVRABLES_DIR, { recursive: true, force: true }); });

async function ordre(texte, avecPreuve = true) {
  await b.preparer();
  const [r] = await b.lire("INSERT INTO commandes (texte, pour, etat) VALUES ($1, 'harness', 'en_cours') RETURNING id", [texte]);
  ids.push(r.id);
  if (avecPreuve) {
    const dossier = path.join(process.env.LIVRABLES_DIR, `demande-${r.id}`);
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, 'verification.txt'), 'page livrée');
    await b.lire('UPDATE commandes SET verification=$2 WHERE id=$1', [r.id, JSON.stringify({ version: 1, fichiers: [{ chemin: 'verification.txt', contient: 'page livrée' }] })]);
  }
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

test('une reprise ne transforme jamais des brouillons ou un reçu invalide en réussite', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-reprise-'));
  try {
    fs.writeFileSync(path.join(dossier, 'brouillon.txt'), 'travail inachevé');
    const id = await ordre('Diagnostic interrompu');
    await conclure(id, resultatReprise(dossier));
    assert.deepEqual(await etat(id), { etat: 'a_faire', pour: 'claude' });
    assert.match((await b.lire('SELECT reponse FROM commandes WHERE id = $1', [id]))[0].reponse, /non vérifié/);
    for (const recu of ['{', '{"code":0}', '{"code":0,"sortie":" "}', 'null']) {
      fs.writeFileSync(path.join(dossier, '.resultat.json'), recu);
      assert.equal(resultatReprise(dossier).code, 1);
    }
    fs.writeFileSync(path.join(dossier, '.resultat.json'), JSON.stringify({ code: 0, sortie: 'livré et vérifié' }));
    assert.equal(resultatReprise(dossier).code, 2, 'un reçu historique sans critères ne prouve pas le livrable');
    const contrat = { version: 1, fichiers: [{ chemin: 'livrable.txt', contient: 'vérifié' }] };
    fs.writeFileSync(path.join(dossier, 'livrable.txt'), 'vérifié');
    assert.equal(resultatReprise(dossier, contrat).code, 0);
    fs.writeFileSync(path.join(dossier, 'livrable.txt'), 'corrompu');
    assert.equal(resultatReprise(dossier, contrat).code, 2, 'la reprise relit le fichier actuel');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
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

test('un faux succès attend la vérification et ne peut pas être relancé', async () => {
  const id = await ordre('Prépare un fichier vérifiable', false);
  await conclure(id, { code: 0, sortie: 'Fait : verification.txt est prêt.' });
  assert.deepEqual(await etat(id), { etat: 'a_faire', pour: 'verification' });
  assert.equal(await relancer(id), false);
  const contrat = { version: 1, fichiers: [{ chemin: 'verification.txt', contient: 'CONTENU_EXACT' }] };
  assert.equal((await verifierOrdre(id, contrat)).ok, false);
  const dossier = path.join(process.env.LIVRABLES_DIR, `demande-${id}`);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, 'verification.txt'), 'CONTENU_EXACT');
  assert.equal((await verifierOrdre(id, contrat)).ok, true);
  assert.deepEqual(await etat(id), { etat: 'faite', pour: 'harness' });
});

test('une attente d’outil reste une attente, jamais une réussite ni une relance', async () => {
  const id = await ordre('Réparation asynchrone', false);
  await conclure(id, { code: 2, sortie: 'EN_ATTENTE_OUTIL:7' });
  assert.deepEqual(await etat(id), { etat: 'a_faire', pour: 'outil' });
  assert.equal(await relancer(id), false);
});


