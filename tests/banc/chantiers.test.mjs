// L'architecte ouvre un chantier : une issue GitHub « chantier », avec constat, mesure,
// attendu. GitHub est factice ; le réseau reste coupé.
import { bases, prevoir, compter } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { ouvrirChantier, preparer, OUVERTS_MAX } = await import('../../agents/chantiers.js');
const { ACTIONS } = await import('../../agents/architecte.js');

// Faux GitHub : une liste d'issues ouvertes, et la création qui l'allonge.
const ouvertes = [];
const creations = [];
prevoir(/api\.github\.com\/repos\/basilerameee-star\/raime-cerveau\/issues\?state=open&labels=chantier/, () => ouvertes);
prevoir(/api\.github\.com\/repos\/basilerameee-star\/raime-cerveau\/issues$/, (u, o) => {
  const d = JSON.parse(o.body);
  creations.push({ ...d, auth: o.headers.Authorization });
  const i = { number: 100 + creations.length, title: d.title, html_url: `https://github.com/x/issues/${100 + creations.length}` };
  ouvertes.push(i);
  return i;
});

const BON = { titre: 'La recherche ignore les notes de veille récentes',
  constat: 'La question « agents IA » renvoie zéro passage de veille des sept derniers jours.',
  mesure: '0 passage sur 12 fichiers de veille rangés cette semaine.',
  attendu: 'Au moins un passage de veille récent parmi les quatre premiers.' };

let b;
before(async () => { b = await bases(); await b.brain.query('TRUNCATE journal'); process.env.GITHUB_CHANTIER_TOKEN = 'jeton-fictif-du-banc'; });
after(async () => b.fermer());

test('un chantier sans mesure ou sans attendu est refusé : sans chiffre, c’est une idée', () => {
  assert.match(preparer({ ...BON, mesure: '' }).refus, /mesure/);
  assert.match(preparer({ ...BON, attendu: 'mieux' }).refus, /attendu/);
  assert.match(preparer({ ...BON, mesure: 'la recherche est beaucoup trop lente' }).refus, /aucun chiffre/);
});

test('un chantier qui porte un secret est refusé', () => {
  assert.match(preparer({ ...BON, constat: 'la base postgres://raime:motdepasse@hote/raime_brain ne répond plus' }).refus, /secret/);
});

test('sans jeton, rien ne part', async () => {
  delete process.env.GITHUB_CHANTIER_TOKEN;
  const r = await ouvrirChantier(BON);
  process.env.GITHUB_CHANTIER_TOKEN = 'jeton-fictif-du-banc';
  assert.equal(r.ouvert, false);
  assert.match(r.motif, /jeton/);
  assert.equal(creations.length, 0);
});

test('l’action de l’architecte ouvre l’issue étiquetée, avec constat, mesure, attendu', async () => {
  const r = await ACTIONS.ouvrir_chantier({ brain: b.brain, args: BON });
  assert.match(r.resume, /chantier n° 101 ouvert/);
  assert.equal(creations.length, 1);
  assert.deepEqual(creations[0].labels, ['chantier']);
  assert.match(creations[0].body, /## Constat\n.*\n\n## Mesure\n0 passage.*\n\n## Attendu\n/);
  assert.equal(creations[0].auth, 'Bearer jeton-fictif-du-banc');
  assert.equal(await compter(b.brain, "SELECT count(*) n FROM journal WHERE changement LIKE 'Chantier ouvert : n° 101%'"), 1);
});

test('le même chantier ne s’ouvre pas deux fois, même écrit autrement', async () => {
  const r = await ouvrirChantier({ ...BON, titre: 'La recherche ignore les NOTES de veille récentes !' });
  assert.equal(r.ouvert, false);
  assert.equal(r.numero, 101);
  assert.equal(creations.length, 1);
});

test(`${OUVERTS_MAX} chantiers ouverts au plus : l’architecte demande, il n’inonde pas`, async () => {
  await ouvrirChantier({ ...BON, titre: 'Deuxième manque mesuré' });
  await ouvrirChantier({ ...BON, titre: 'Troisième manque mesuré' });
  const r = await ouvrirChantier({ ...BON, titre: 'Quatrième manque mesuré' });
  assert.equal(r.ouvert, false);
  assert.match(r.motif, /3 chantiers déjà ouverts/);
  assert.equal(creations.length, 3);
});

test('l’architecte connaît l’action dans son catalogue fermé', () => {
  assert.equal(typeof ACTIONS.ouvrir_chantier, 'function');
});
