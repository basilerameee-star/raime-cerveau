// Le sas sur des candidats fictifs : un fait s'applique, un jugement passe par la mesure,
// et ce qui ne se mesure pas n'est jamais promu.
import { bases, compter } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { soumettre } = await import('../../agents/sas.js');
let b;
before(async () => { b = await bases(); await b.brain.query('TRUNCATE candidats, journal'); });
after(async () => b.fermer());

const modele = (identifiant) => soumettre(b.brain, {
  domaine: 'modele_routage', identifiant, source: 'banc', donnees: { titulaire: 'fictif/titulaire' } });

test('un modèle meilleur et moins cher, mesuré trois fois, est promu', async () => {
  const r = await modele('fictif/candidat-bon');
  assert.equal(r.verdict, 'promu');
  assert.equal(r.mesure.gain_pct, 60);
});

test('un modèle moins bon est refusé, même moins cher', async () => {
  const r = await modele('fictif/candidat-faible');
  assert.equal(r.verdict, 'refuse');
  assert.match(r.motif, /Qualité inférieure au titulaire : 50\/100 contre 70\/100/);
});

test('un modèle mesuré une seule fois reste non évaluable, même brillant', async () => {
  const r = await modele('fictif/candidat-neuf');
  assert.equal(r.verdict, 'non_evaluable');
  assert.match(r.motif, /Échantillon insuffisant : 1 passage/);
});

test('un fait (un prix) s’applique seul', async () => {
  const r = await soumettre(b.brain, { domaine: 'prix', identifiant: 'fictif/titulaire-2026-09-24', donnees: { price_in: 0.07 } });
  assert.equal(r.nature, 'fait');
  assert.equal(r.verdict, 'applique');
});

test('un jugement sans batterie de mesure n’est jamais promu', async () => {
  const r = await soumettre(b.brain, { domaine: 'source_veille', identifiant: 'https://exemple.invalid/flux' });
  assert.equal(r.verdict, 'non_evaluable');
});

test('un domaine inconnu est refusé', async () => {
  const r = await soumettre(b.brain, { domaine: 'virement', identifiant: 'fictif' });
  assert.equal(r.nature, 'hors_perimetre');
  assert.equal(r.verdict, 'refuse');
});

test('chaque verdict est tracé, et un candidat soumis deux fois n’occupe qu’une ligne', async () => {
  await modele('fictif/candidat-bon');
  assert.equal(await compter(b.brain, "SELECT count(*) n FROM candidats WHERE identifiant = 'fictif/candidat-bon'"), 1);
  assert.equal(await compter(b.brain, "SELECT count(*) n FROM journal WHERE acteur = 'sas'"), 7);
});
