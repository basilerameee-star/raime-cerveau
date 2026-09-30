// Le goût : les règles tranchent ce qui est interdit ; JEV pèse le reste ; chaque jugement est gardé.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../agents/lib.js';
import { regles, verdict, verdictQuestion, juger, jugerQuestion, noterSuite, QUESTIONS } from '../../agents/gout.js';

const brain = db(); await brain.connect();
after(async () => { await brain.query('DROP TABLE IF EXISTS jugements'); await brain.end(); });

// Un faux JEV : il rend les probabilités voulues et garde la situation qu'on lui montre.
function fauxJev(p) {
  const vus = [];
  const decide = async ({ etat, questions }) => {
    vus.push({ etat, questions });
    const reponses = {};
    for (const [k, q] of Object.entries(questions)) {
      reponses[k] = q.type === 'choice' ? { valeur: p.goal || 'business', confiance: 0.9 } : { probabilite: p[k] ?? 0.9 };
    }
    return { modele: 'jev-1.13.0', reponses, costUsd: 0.00002 };
  };
  return { decide, vus };
}
const avecCle = async (f) => { process.env.JEV = 'cle-de-test'; try { return await f(); } finally { delete process.env.JEV; } };

test('les règles tranchent sans modèle : l’argent est bloqué, un envoi va à Basile, le reste passe au jugement', () => {
  assert.equal(regles('Faire un virement de 200 € au prestataire').verdict, 'BLOQUE');
  assert.equal(regles('Saisir le mot de passe du compte Meta').verdict, 'BLOQUE');
  assert.equal(regles('Publier le post sur Instagram').verdict, 'BASILE');
  assert.equal(regles('Envoyer le devis au prospect').verdict, 'BASILE');
  assert.equal(regles('Mesurer le taux de réponse des messages'), null);
});

test('des probabilités à l’état, par des seuils écrits', () => {
  assert.equal(verdict({ aligned: 0.8, within_rules: 0.9, simplest: 0.7, goal: 'media' }).verdict, 'AUTO');
  assert.equal(verdict({ aligned: 0.2, within_rules: 0.9, simplest: 0.7, goal: 'none' }).verdict, 'REVUE');
  assert.equal(verdict({ aligned: 0.9, within_rules: 0.2, simplest: 0.9, goal: 'business' }).verdict, 'BASILE');
  assert.equal(verdict({ aligned: 0.5, within_rules: 0.9, simplest: 0.4, goal: 'upkeep' }).verdict, 'REVUE');
  assert.equal(verdictQuestion({ only_basile: 0.9, unblocks: 0.8, clear: 0.9 }).verdict, 'AUTO');
  assert.equal(verdictQuestion({ only_basile: 0.2, unblocks: 0.8, clear: 0.9 }).verdict, 'REVUE');
});

test('JEV reçoit la boussole et des questions en anglais ; le jugement est gardé avec son coût', async () => {
  const { decide, vus } = fauxJev({ aligned: 0.8, within_rules: 0.95, simplest: 0.7, goal: 'business' });
  const r = await avecCle(() => juger({ brain, source: 'architecte', action: 'Relancer les cabinets comptables qui ont ouvert le message', contexte: 'Taux de réponse 1,2 %', decide }));
  assert.equal(r.verdict, 'AUTO');
  assert.match(vus[0].etat, /^COMPASS[\s\S]*SITUATION: Taux de réponse[\s\S]*PROPOSED ACTION \(architecte\)/);
  assert.deepEqual(Object.keys(vus[0].questions), Object.keys(QUESTIONS));
  const { rows } = await brain.query('SELECT source, verdict, modele, cout_usd::float AS c FROM jugements WHERE id = $1', [r.id]);
  assert.deepEqual(rows[0], { source: 'architecte', verdict: 'AUTO', modele: 'jev-1.13.0', c: 0.00002 });
  await noterSuite({ brain, id: r.id, suite: 'réussie' });
  assert.equal((await brain.query('SELECT suite FROM jugements WHERE id = $1', [r.id])).rows[0].suite, 'réussie');
});

test('une action interdite n’atteint jamais JEV', async () => {
  const { decide, vus } = fauxJev({});
  const r = await avecCle(() => juger({ brain, source: 'penseur', action: 'Acheter une licence', decide }));
  assert.equal(r.verdict, 'BLOQUE');
  assert.equal(vus.length, 0);
});

test('sans clé JEV, ou si JEV tombe : les règles seules, et le doute va à la revue', async () => {
  const sans = await juger({ brain, source: 'architecte', action: 'Mesurer les agents', decide: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.equal(sans.verdict, 'REVUE');
  assert.match(sans.motif, /JEV absent/);
  const panne = await avecCle(() => juger({ brain, source: 'architecte', action: 'Mesurer les agents', decide: async () => { throw new Error('TypeSafe 529'); } }));
  assert.equal(panne.verdict, 'REVUE');
  assert.match(panne.motif, /JEV indisponible/);
});

test('une question pour Basile : retenue si elle ne lui revient pas, posée sinon ; sans JEV, rien ne change', async () => {
  const inutile = fauxJev({ only_basile: 0.1, unblocks: 0.7, clear: 0.9 });
  const r1 = await avecCle(() => jugerQuestion({ brain, source: 'architecte', question: 'Où sont les pages légales ?', decide: inutile.decide }));
  assert.equal(r1.verdict, 'REVUE');
  assert.match(r1.motif, /only_basile 0\.10/);
  const utile = fauxJev({ only_basile: 0.9, unblocks: 0.8, clear: 0.9 });
  assert.equal((await avecCle(() => jugerQuestion({ brain, source: 'architecte', question: 'Quel est le prix de la journée Codir ?', decide: utile.decide }))).verdict, 'AUTO');
  assert.equal((await jugerQuestion({ brain, source: 'architecte', question: 'Une question' })).verdict, 'AUTO');
});
