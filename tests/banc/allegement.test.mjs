// 04/11/2026 — allègement voulu par Basile : plus aucun e-mail d'alerte (il lit le cockpit), plus de vente externe.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const racine = new URL('../../', import.meta.url);
const lire = (f) => fs.readFileSync(new URL(f, racine), 'utf8');
const actives = (texte) => texte.split('\n').filter((l) => !/^\s*(#|\/\/)/.test(l)).join('\n');

test('les rythmes ne gardent que le travail interne : cordon, bibliothèque, ordres, Directeur', async () => {
  const { RYTHMES } = await import('../../agents/rythmes.js');
  assert.deepEqual(RYTHMES.map((r) => r.nom).sort(), ['bibliothecaire', 'cordon', 'directeur', 'veilleur_ordres']);
});

// file.py importe fcntl (Linux seulement) : ce test tourne sur la CI et le serveur, pas sous Windows.
test('prevenir() n’envoie aucun e-mail sans le fichier EMAILS_ACTIFS : il note l’alerte dans alertes.log', { skip: process.platform === 'win32' }, () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'allegement-'));
  fs.writeFileSync(path.join(dossier, 'file.py'), lire('clippeur/file.py'));
  // Un coffre absent ferait échouer l'envoi : si prevenir() tentait d'envoyer, rien ne serait noté.
  const code = 'import file; file.COFFRE = "/inexistant"; file.prevenir("essai", "texte du banc")';
  try {
    execFileSync('python3', ['-c', code], { cwd: dossier, stdio: 'pipe' });
  } catch (e) {
    if (e.code === 'ENOENT') return;   // pas de Python sur ce poste : la CI le fait
    throw e;
  }
  const journal = fs.readFileSync(path.join(dossier, 'alertes.log'), 'utf8');
  assert.match(journal, /\[Clips\] essai \| texte du banc/);
  assert.ok(/EMAILS_ACTIFS/.test(actives(lire('clippeur/file.py'))));
});
