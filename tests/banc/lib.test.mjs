// Le socle : le modèle factice répond sans réseau ni clé ; sans MODELE_FACTICE=1, la production parle
// sans frais (Gemini gratuit, puis le modèle local), jamais par OpenRouter.
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

test('sans MODELE_FACTICE=1, la production parle SANS FRAIS : jamais OpenRouter, même avec une clé', async () => {
  delete process.env.MODELE_FACTICE;
  const avant = requetes.length;
  process.env.OPENROUTER_API_KEY = 'ne-doit-pas-servir';
  try {
    await assert.rejects(ask({ task: 'redaction', system: 'Tu es le radar produit de rAIme.', user: '-' }),
      /aucun modèle gratuit ne répond/);
  } finally { process.env.MODELE_FACTICE = '1'; delete process.env.OPENROUTER_API_KEY; }
  const faites = requetes.slice(avant);
  assert.ok(faites.some((u) => /raime-ollama:11434\/api\/chat$/.test(u)), 'le modèle local est essayé');
  assert.ok(!faites.some((u) => /openrouter/.test(u)), 'OpenRouter a été appelé');
});
