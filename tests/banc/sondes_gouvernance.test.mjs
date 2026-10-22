// Les gouverneurs et les analystes relevés en direct (22/10/2026) : leur état vient de la date de leurs sorties dans le dossier
// de travail partagé, plus d'un texte écrit à la main (« en construction », « à faire ») resté figé alors qu'ils tournaient.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'travail-'));
process.env.LIVRABLES_DIR = dossier;
const v6 = require('../../jarvis/v6.cjs');
const ecrire = (rel, texte) => { fs.mkdirSync(path.dirname(path.join(dossier, rel)), { recursive: true }); fs.writeFileSync(path.join(dossier, rel), texte); };
const A = (decalH = 0) => ({ maintenant: new Date(Date.now() + decalH * 3600e3), auj: '2026-10-22' });

test('les fiches des gouverneurs ne sont plus figées : chacune a sa sonde', () => {
  const ag = Object.fromEntries(v6.TEXTES.agents.map((a) => [a.id, a]));
  for (const id of ['gouv_jetons', 'analystes', 'gouv_agents', 'gouv_matin']) {
    assert.ok(ag[id], id);
    assert.equal(ag[id].etat, undefined, `${id} : aucun état écrit à la main`);
    assert.equal(ag[id].mesure, id); assert.ok(v6.MESURES[id], `${id} : sonde présente`);
  }
});

test('sortie absente : en panne, jamais « fonctionne » par défaut', () => {
  assert.equal(v6.MESURES.gouv_matin({}, A()).etat, 'panne');
  assert.equal(v6.MESURES.gouv_jetons({}, A()).etat, 'panne');
});

test('sortie fraîche : le chiffre du jour ; sortie trop vieille : en panne', () => {
  ecrire('gouverneur/aujourdhui.txt', 'Gouverneur des jetons — 2026-10-22 (UTC)\nTotal du jour : 1314910 jetons sur 3000000 (43 %)\n');
  ecrire('analyse/matin.json', JSON.stringify({ jugement: [{ tenu: true }, { tenu: false }, { tenu: true }] }));
  ecrire('analyse/prospection.json', JSON.stringify({ preaudits: [{}, {}] }));
  ecrire('clips/analyse.json', JSON.stringify({ clips_suivis: 85 }));
  const j = v6.MESURES.gouv_jetons({}, A());
  assert.equal(j.etat, undefined); assert.match(j.texte, /1 314 910 jetons sur 3 000 000 \(43 %\)/);
  assert.match(v6.MESURES.gouv_matin({}, A()).texte, /2 tenus sur 3/);
  assert.match(v6.MESURES.analystes({}, A()).texte, /85 clips suivis ; prospection : 2 métiers jugés/);
  assert.equal(v6.MESURES.gouv_jetons({}, A(1)).etat, 'panne', 'le gouverneur des jetons passe toutes les 10 min : 1 h sans sortie = panne');
  assert.equal(v6.MESURES.gouv_matin({}, A(31)).etat, 'panne', 'plus de 30 h sans bilan du matin = panne');
});
