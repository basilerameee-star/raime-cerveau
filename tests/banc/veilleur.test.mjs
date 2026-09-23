// Le tri du veilleur : une source fictive, le réseau coupé, le tri fait par le code.
import { BIBLIO, bases, prevoir, requetes, compter } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { veiller } = await import('../../agents/veilleur.js');
const { appels } = await import('../../agents/modele_factice.js');

// Réponse fictive de Hacker News : un sujet utile à la maison, un sujet hors sujet,
// un sujet utile sans adresse (écarté faute de lien), et le sujet utile en double.
const utile = { objectID: '1', title: 'Open-source agent benchmark cuts pricing', url: 'https://exemple.invalid/agent-benchmark', points: 120, num_comments: 40 };
prevoir(/hn\.algolia\.com/, { hits: [
  utile,
  { objectID: '2', title: 'A new recipe for sourdough bread', url: 'https://exemple.invalid/pain', points: 300 },
  { objectID: '3', title: 'Self-host your RAG evaluation', url: 'https://exemple.invalid/rag', points: 90 },
  utile,
] });

let b, r1;
before(async () => {
  b = await bases();
  await b.brain.query('TRUNCATE veille, idees_offres, journal');
  // Cinq sujets de la semaine, pour que la veille propose ses idées d'offres.
  for (let i = 1; i <= 5; i++)
    await b.brain.query(`INSERT INTO veille(source, titre, lien, score) VALUES('github', $1, $2, 6)`,
      [`Sujet fictif ${i} sur les agents`, `https://exemple.invalid/sujet-${i}`]);
  r1 = await veiller({ brain: b.brain, sources: ['hackernews'] });
});
after(async () => b.fermer());

test('le tri garde ce qui sert la maison et laisse le bruit dehors', () => {
  assert.deepEqual(r1.retenus.map((x) => x.lien).sort(),
    ['https://exemple.invalid/agent-benchmark', 'https://exemple.invalid/rag']);
  assert.ok(r1.retenus.every((x) => x.score >= 4));
  assert.deepEqual(r1.pannes, []);
});

test('le réseau n’a servi qu’à la source fictive', () => {
  assert.ok(requetes.length >= 1 && requetes.every((u) => /hn\.algolia\.com/.test(u)));
});

test('les trouvailles entrent dans la bibliothèque, un fichier par source', async () => {
  const fichiers = fs.readdirSync(path.join(BIBLIO, 'veille'));
  assert.equal(fichiers.length, 1);
  assert.match(fs.readFileSync(path.join(BIBLIO, 'veille', fichiers[0]), 'utf8'), /agent benchmark/);
  assert.ok(await compter(b.brain, "SELECT count(*) n FROM kb_chunks WHERE domaine = 'veille'") >= 1);
});

test('la veille propose ses idées d’offres une fois par semaine, pas plus', async () => {
  assert.equal(await compter(b.brain, 'SELECT count(*) n FROM idees_offres'), 2);
  const avant = appels.length;
  const r2 = await veiller({ brain: b.brain, sources: ['hackernews'] });
  assert.equal(r2.retenus.length, 0, 'un lien déjà vu ne revient pas');
  assert.equal(appels.length, avant, 'aucun second appel de modèle dans la semaine');
  assert.equal(await compter(b.brain, 'SELECT count(*) n FROM idees_offres'), 2);
});

test('une source muette est notée, la veille continue', async () => {
  const r = await veiller({ brain: b.brain, sources: ['arxiv'] });
  assert.equal(r.pannes.length, 1);
  assert.match(r.pannes[0], /^arxiv : réseau coupé/);
});
