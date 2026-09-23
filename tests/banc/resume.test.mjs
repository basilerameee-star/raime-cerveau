// Le résumé pour Basile en tête de chaque pull request, vérifié par le code.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { verifierResume } = await import('../../porte/verifier_resume.mjs');

const BON = `## Pour Basile
- Ce qui change en ligne : une nouvelle page.
- Ce que vous pourrez vendre : le livre.
- Revenir en arrière : bouton « Revert ».

## Détails
du texte technique, aussi long qu'il le faut`;

test('un résumé conforme passe', () => assert.deepEqual(verifierResume(BON), []));

test('le résumé doit venir en tête', () => {
  assert.match(verifierResume(`## Détails\nx\n\n${BON}`)[0], /première/);
  assert.match(verifierResume('')[0], /première/);
});

test('cinq lignes au plus', () => {
  const long = BON.replace('## Détails', '- a\n- b\n- c\n\n## Détails');
  assert.ok(verifierResume(long).some((e) => /6 lignes/.test(e)));
});

test('les trois questions de Basile ont chacune leur réponse', () => {
  const e = verifierResume('## Pour Basile\n- Rien de spécial.\n');
  assert.equal(e.length, 3);
});

test('le modèle de pull request du dépôt est lui-même conforme', async () => {
  const fs = await import('node:fs');
  const modele = fs.readFileSync(new URL('../../.github/pull_request_template.md', import.meta.url), 'utf8');
  assert.deepEqual(verifierResume(modele), []);
});
