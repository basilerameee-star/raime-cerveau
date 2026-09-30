// Le socle : le modèle factice répond sans réseau ni clé ; sans MODELE_FACTICE=1, la production parle
// sans frais (Gemini gratuit, puis le modèle local), jamais par OpenRouter.
import { requetes } from './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ask, askJson, chargerClesGratuites } = await import('../../agents/lib.js');
const { writeFileSync, mkdtempSync } = await import('node:fs');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');

test('la boucle lit les clés gratuites absentes du .env, sans rien remplacer ni lire d’autre', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'cles-')), '.env');
  writeFileSync(f, ['OPENROUTER_API_KEY=payante', 'GEMINI_API_KEY="g-fichier"', 'export GROQ_API_KEY=q-fichier',
    'MISTRAL_API_KEY=', '# CEREBRAS_API_KEY=commentee', 'DATABASE_URL=postgres://secret'].join('\n'));
  const env = { GROQ_API_KEY: 'q-deja-la' };
  assert.deepEqual(chargerClesGratuites(f, env), ['GEMINI_API_KEY']);
  assert.equal(env.GEMINI_API_KEY, 'g-fichier', 'les guillemets sont retirés');
  assert.equal(env.GROQ_API_KEY, 'q-deja-la', 'une clé déjà présente n’est jamais remplacée');
  assert.equal(env.OPENROUTER_API_KEY, undefined, 'la clé payante n’est pas lue');
  assert.equal(env.DATABASE_URL, undefined, 'rien d’autre n’est lu');
  assert.equal(env.MISTRAL_API_KEY, undefined, 'une valeur vide n’est pas une clé');
  assert.deepEqual(chargerClesGratuites(join(tmpdir(), 'absent-' + Date.now(), '.env'), {}), [], 'sans fichier : rien');
});

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
