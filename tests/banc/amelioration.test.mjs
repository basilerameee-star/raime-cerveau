import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compiler, mesurer, comparer, validerProposition, empreinte, formuleActuelle, ordreAmelioration } from '../../agents/amelioration.js';
import { extraire } from '../../tools/amelioration/controle.mjs';
const AVANT = '(3 * securite + 3 * adequation + 2 * fiabilite + 2 * licence + fraicheur + cout) / 12';
const APRES = '(3 * securite + 6 * adequation + 2 * fiabilite + 2 * licence + fraicheur + cout) / 15';
const p = () => ({ version: 1, titre: 'Classement pertinent', besoin: 'La popularité dépasse la pertinence dans 1 cas.', mesure: '5/6 cas figés avant, 6/6 après.', empreinte: empreinte(AVANT), formule: APRES });
test('un gain est exigé, sans perdre aucun cas déjà réussi', () => {
  assert.deepEqual([comparer(AVANT, APRES).avant, comparer(AVANT, APRES).apres], [5, 6]);
  assert.throws(() => comparer(AVANT, AVANT), /aucun gain/);
  assert.throws(() => comparer(APRES, AVANT), /régression/);
  assert.throws(() => mesurer('adequation'), /critère abandonné/);
});
test('aucun accès JavaScript, fichier, réseau, secret ou propriété dans le code évolutif', () => {
  for (const s of ['eval(1)', 'process.env', 'require(1)', 'import(1)', 'constructor', 'fetch(1)', 'securite;1', '1e99', '__proto__', '0/0', '((1)', '1 2'])
    assert.throws(() => mesurer(s), undefined, s);
  assert.throws(() => compiler('('.repeat(30) + '1' + ')'.repeat(30)), /imbriquée/);
  assert.throws(() => compiler('1'.repeat(2001)), /longue/);
  assert.equal(compiler('min(1, max(0, securite))')({ securite: .5 }), .5);
});
test('proposition périmée, champ inconnu, gain absent : refus avant toute écriture', () => {
  assert.equal(validerProposition(p(), AVANT).apres, 6);
  assert.throws(() => validerProposition({ ...p(), empreinte: '0'.repeat(64) }, AVANT), /périmée/);
  assert.throws(() => validerProposition({ ...p(), chemin: '.github/workflows/deployer.yml' }, AVANT), /schéma/);
  assert.throws(() => validerProposition({ ...p(), formule: AVANT }, AVANT), /gain/);
  assert.throws(() => validerProposition({ ...p(), mesure: 'Tout est meilleur.' }, AVANT), /chiffre/);
});
test('une issue transporte un seul objet de données ; jamais un shell ou un patch', () => {
  const b = '```raime-amelioration-v1\n' + JSON.stringify(p()) + '\n```';
  assert.deepEqual(extraire(b), p());
  assert.throws(() => extraire(b + '\n' + b), /seule/);
  assert.throws(() => extraire('$(touch /tmp/erreur)'), /seule/);
  assert.throws(() => extraire('a'.repeat(20001)), /grande/);
});
test('la formule livrée reste dans le langage fermé ; le besoin disparaît quand le banc est entièrement réussi', () => {
  const m = mesurer(formuleActuelle());
  assert.equal(m.total, 6);
  assert.equal(ordreAmelioration() === null, m.reussis === m.total);
});
test('le banc refuse chaque nom de production et les noms SQL malformés AVANT tout appel psql', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-noms-'));
  const marque = path.join(d, 'appele');
  fs.writeFileSync(path.join(d, 'psql'), '#!/bin/sh\ntouch "' + marque + '"\nexit 77\n', { mode: 0o755 });
  try {
    for (const [a, b] of [['production', 'n8n_test'], ['raime_brain_test', 'production'], ['prod_test;DROP', 'n8n_test'], ['same_test', 'same_test']]) {
      const r = spawnSync('bash', ['tests/banc/preparer_bases.sh'], { env: { ...process.env, PATH: d + ':' + process.env.PATH, BANC_BASE_BRAIN: a, BANC_BASE_N8N: b }, encoding: 'utf8' });
      assert.equal(r.status, 1); assert.match(r.stderr, /refus/); assert.ok(!fs.existsSync(marque));
    }
    const valide = spawnSync('bash', ['tests/banc/preparer_bases.sh'], { env: { ...process.env, PATH: d + ':' + process.env.PATH, BANC_BASE_BRAIN: 'raime_brain_test', BANC_BASE_N8N: 'n8n_test' }, encoding: 'utf8' });
    assert.equal(valide.status, 77); assert.ok(fs.existsSync(marque), 'noms valides arrivent au client, sans vraie base');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('la promotion échoue avant toute écriture si main ou l’artefact a changé ; une réussite ne touche que la formule', async () => {
  const { publier } = await import('../../tools/amelioration/controle.mjs');
  const refAvant = process.env.GITHUB_REF, sortieAvant = process.env.GITHUB_OUTPUT;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-test-'));
  process.env.GITHUB_REF = 'refs/heads/main'; process.env.GITHUB_OUTPUT = path.join(d, 'sortie');
  const corps = '```raime-amelioration-v1\n' + JSON.stringify(p()) + '\n```';
  const plan = { issue: 12, corps_sha: empreinte(corps), base_sha: 'base', proposition: p(), preuve: comparer(AVANT, APRES) };
  const appels = [];
  const api = async (chemin, methode = 'GET', contenu) => {
    appels.push({ chemin, methode, contenu });
    if (chemin === 'issues/12') return { state: 'open', body: corps };
    if (chemin === 'git/ref/heads/main') return { object: { sha: 'base' } };
    if (chemin === 'git/commits/base') return { tree: { sha: 'arbre-base' } };
    if (chemin === 'git/blobs') return { sha: 'blob' };
    if (chemin === 'git/trees') return { sha: 'arbre' };
    if (chemin === 'git/commits') return { sha: 'version' };
    if (chemin === 'pulls') return { number: 13 };
    return null;
  };
  try {
    await assert.rejects(publier({ plan, head: 'base', actuelle: AVANT, api: async (route, ...args) => route === 'git/ref/heads/main' ? { object: { sha: 'autre' } } : api(route, ...args) }), /main modifié/);
    assert.ok(appels.every(c => c.methode === 'GET'));
    appels.length = 0;
    await assert.rejects(publier({ plan: { ...plan, proposition: { ...p(), formule: '1' } }, head: 'base', actuelle: AVANT, api }), /artefact différent/);
    assert.ok(appels.every(c => c.methode === 'GET'));
    appels.length = 0;
    await publier({ plan, head: 'base', actuelle: AVANT, api });
    assert.deepEqual(appels.find(c => c.chemin === 'git/trees').contenu.tree, [{ path: 'agents/ameliorables/classement.expr', mode: '100644', type: 'blob', sha: 'blob' }]);
    assert.deepEqual(appels.find(c => c.chemin === 'git/refs/heads/main').contenu, { sha: 'version', force: false });
    assert.equal(appels.filter(c => c.chemin.includes('/dispatches')).length, 1, 'livraison explicitement déclenchée');
  } finally {
    if (refAvant === undefined) delete process.env.GITHUB_REF; else process.env.GITHUB_REF = refAvant;
    if (sortieAvant === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = sortieAvant;
    fs.rmSync(d, { recursive: true, force: true });
  }
});
