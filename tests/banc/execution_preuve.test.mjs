import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executer } from '../../hermes/executant.js';
import { createRequire } from 'node:module';
const { verifierDossier } = createRequire(import.meta.url)('../../jarvis/verification.cjs');

const reponse = texte => new Response(JSON.stringify({ choices: [{ message: { content: texte } }], usage: { total_tokens: 20 } }));

test('un compte rendu seul ne prouve jamais le fichier demandé', async () => {
  const r = await executer({ id: 701, tache: 'Crée verification.txt contenant RAIME_OK' }, {
    fetch: async () => reponse('Fait : verification.txt contient RAIME_OK.'),
  });
  assert.notEqual(r.code, 0, 'une déclaration du modèle ne constitue pas une preuve');
  assert.equal(r.code, 2, 'le résultat inconnu reste à vérifier, sans rejouer le travail');
});

test('une erreur de tâche contenant provider ne rejoue pas les effets partiels', async () => {
  let appels = 0;
  const r = await executer({ id: 702, tache: 'Travail commencé' }, { fetch: async () => {
    appels++;
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'error', message: { content: '' } }],
      hermes: { failed: true, error: 'provider tool execution crashed after a partial write' } }));
  } });
  assert.equal(appels, 1);
  assert.equal(r.code, 1);
});

test('le fichier et son contenu sont contrôlés indépendamment du compte rendu', async () => {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'preuve-hermes-'));
  try {
    const verification = { version: 1, fichiers: [{ chemin: 'verification.txt', contient: 'RAIME_OK' }] };
    const demande = { id: 703, tache: 'Crée verification.txt', verification };
    const options = { travail, fetch: async () => reponse('Fait.') };
    assert.equal((await executer(demande, options)).code, 2);
    fs.mkdirSync(path.join(travail, 'demande-703'));
    fs.writeFileSync(path.join(travail, 'demande-703', 'verification.txt'), 'FAUX');
    assert.equal((await executer(demande, options)).code, 2);
    fs.writeFileSync(path.join(travail, 'demande-703', 'verification.txt'), 'RAIME_OK');
    const r = await executer(demande, options);
    assert.equal(r.code, 0);
    assert.equal(r.verification.etat, 'verifie');
    assert.equal(r.verification.fichiers.length, 1);
  } finally { fs.rmSync(travail, { recursive: true, force: true }); }
});

test('une panne réseau ne rejoue pas une tâche dont le démarrage est inconnu', async () => {
  let appels = 0;
  const r = await executer({ id: 704, tache: 'Travail' }, { fetch: async () => { appels++; throw new Error('fil coupé'); } });
  assert.equal(appels, 1);
  assert.equal(r.code, 1);
});

test('un contrat invalide est refusé avant le premier appel à Hermes', async () => {
  let appels = 0;
  const r = await executer({ id: 705, tache: 'travail', verification: { version: 1, fichiers: [{ chemin: '../secret', contient: 'x' }] } }, {
    fetch: async () => { appels++; return reponse('Fait'); },
  });
  assert.equal(appels, 0);
  assert.equal(r.code, 1);
});

test('un lien symbolique ou un fichier changé ne satisfait pas les critères', () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'preuve-liens-'));
  const contrat = { version: 1, fichiers: [{ chemin: 'livrable.txt', contient: 'ATTENDU' }] };
  try {
    fs.writeFileSync(path.join(dossier, 'autre.txt'), 'ATTENDU');
    fs.symlinkSync('autre.txt', path.join(dossier, 'livrable.txt'));
    assert.equal(verifierDossier(dossier, contrat).etat, 'a_verifier');
    fs.unlinkSync(path.join(dossier, 'livrable.txt'));
    fs.writeFileSync(path.join(dossier, 'livrable.txt'), 'ATTENDU');
    assert.equal(verifierDossier(dossier, contrat).etat, 'verifie');
    fs.writeFileSync(path.join(dossier, 'livrable.txt'), 'CHANGÉ');
    assert.equal(verifierDossier(dossier, contrat).etat, 'a_verifier');
  } finally { fs.rmSync(dossier, { recursive: true, force: true }); }
});

test('une réponse 200 avec refus d’accès ambigu ne déclenche pas de repli', async () => {
  let appels = 0;
  const r = await executer({ id: 706, tache: 'travail' }, { fetch: async () => {
    appels++;
    return new Response(JSON.stringify({ hermes: { failed: true, error: 'HTTP 402: Insufficient credits' } }));
  } });
  assert.equal(appels, 1);
  assert.equal(r.code, 1);
});

test('un refus HTTP avant démarrage autorise le repli local sans prétendre vérifier le résultat', async () => {
  let appels = 0;
  const r = await executer({ id: 707, tache: 'travail' }, { fetch: async () => {
    appels++;
    return appels === 1 ? new Response('quota', { status: 429 }) : reponse('Travail rendu');
  } });
  assert.equal(appels, 2);
  assert.equal(r.code, 2, 'absence de critère : résultat à vérifier même après le repli');
});
