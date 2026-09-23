// La mémoire longue : ranger des textes, puis les retrouver en français.
import { BIBLIO, bases, copierBibliotheque, compter } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { ranger, chercher } = await import('../../agents/bibliothecaire.js');
let b;
before(async () => { b = await bases(); await b.brain.query('TRUNCATE kb_chunks'); copierBibliotheque(); });
after(async () => b.fermer());

test('ranger avale les trois notes fictives, et une seconde fois rien de neuf', async () => {
  const r1 = await ranger({ brain: b.brain, racine: BIBLIO });
  assert.equal(r1.total.sources, 3);
  assert.ok(r1.ajoutes >= 3);
  const r2 = await ranger({ brain: b.brain, racine: BIBLIO });
  assert.equal(r2.ajoutes, 0, 'le même passage ne doit occuper qu’une place');
});

test('une question en français trouve la note de la maison', async () => {
  const r = await chercher({ brain: b.brain, question: 'formation des dirigeants' });
  assert.ok(r.length >= 1);
  assert.equal(r[0].source, 'offre/formation-dirigeants.md');
});

test('exclure le harnais écarte la documentation technique', async () => {
  const r = await chercher({ brain: b.brain, question: 'formation dirigeants', exclure: ['harness'] });
  assert.ok(r.every((p) => p.domaine !== 'harness'));
  const tout = await chercher({ brain: b.brain, question: 'formation dirigeants' });
  assert.ok(tout.some((p) => p.domaine === 'harness'), 'sans exclusion, le harnais répond aussi');
});

test('le titre compte : « carte commerciale » trouve la carte (leçon de la migration 018)', async () => {
  const r = await chercher({ brain: b.brain, question: 'carte commerciale' });
  assert.equal(r[0].titre, 'Carte commerciale');
});

test('le domaine filtre, et une question sans rapport ne rend rien', async () => {
  const r = await chercher({ brain: b.brain, question: 'formation', domaine: 'offre' });
  assert.ok(r.length >= 1 && r.every((p) => p.domaine === 'offre'));
  assert.deepEqual(await chercher({ brain: b.brain, question: 'hélicoptère sous-marin' }), []);
  assert.ok(await compter(b.brain, 'SELECT count(*) n FROM journal WHERE acteur = $1', ['bibliothecaire']) >= 2);
});
