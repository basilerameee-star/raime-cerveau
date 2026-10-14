import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executer } from '../../hermes/executant.js';

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
