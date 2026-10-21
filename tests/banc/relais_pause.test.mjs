// Le gouverneur des jetons (21/10/2026) : quand les ordres ont dépassé leur plafond du jour, l'hôte pose
// <travail>/gouverneur/ordres-en-pause et le relais du Cockpit n'appelle plus Hermes (ni même sa santé) jusqu'au retrait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('ordres en pause : le relais ne contacte pas Hermes ; sans le fichier, il le contacte', async () => {
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'relais-pause-'));
  process.env.LIVRABLES_DIR = travail;
  const relais = require('../../jarvis/relais.cjs');
  let appels = 0;
  const fetch = async () => { appels++; throw new Error('Hermes coupé pour le banc'); };
  try {
    fs.mkdirSync(path.join(travail, 'gouverneur'));
    fs.writeFileSync(path.join(travail, 'gouverneur', 'ordres-en-pause'), 'plafond des ordres atteint');
    await relais.relayer({ fetch });
    assert.equal(appels, 0, 'plafond atteint : aucun appel');
    fs.rmSync(path.join(travail, 'gouverneur', 'ordres-en-pause'));
    await relais.relayer({ fetch });
    assert.equal(appels, 1, 'pause levée : le relais demande la santé d’Hermes');
  } finally {
    fs.rmSync(travail, { recursive: true, force: true });
  }
});
