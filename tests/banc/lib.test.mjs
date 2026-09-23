// Le socle : le modèle factice répond sans réseau ni clé, et sans MODELE_FACTICE=1
// le chemin de production reste exactement celui d'avant.
import { requetes } from './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ask, askJson } = await import('../../agents/lib.js');

test('le modèle factice rend la fixture prévue, gratuitement', async () => {
  const r = await askJson({ task: 'redaction', system: 'Tu es le radar produit de rAIme.', user: '-' });
  assert.equal(r.status, 'ok');
  assert.equal(r.data.idees.length, 2);
  assert.equal(r.meta.costUsd, 0);
  assert.equal(r.meta.model, 'factice/redaction');
});

test('même consigne, même réponse', async () => {
  const s = "Tu es l'architecte de rAIme";
  const a = await ask({ task: 'raisonnement', system: s, user: 'a' });
  const b = await ask({ task: 'raisonnement', system: s, user: 'b' });
  assert.equal(a.text, b.text);
});

test('une consigne sans fixture échoue franchement', async () => {
  await assert.rejects(ask({ task: 'extraction', system: 'consigne imprévue', user: '-' }), /aucune fixture/);
});

test('sans MODELE_FACTICE=1, le chemin de production est pris (et réclame sa clé)', async () => {
  delete process.env.MODELE_FACTICE;
  try {
    await assert.rejects(ask({ task: 'redaction', system: 'Tu es le radar produit de rAIme.', user: '-' }),
      /OPENROUTER_API_KEY manquante/);
  } finally { process.env.MODELE_FACTICE = '1'; }
  assert.equal(requetes.length, 0, 'aucune requête réseau');
});
