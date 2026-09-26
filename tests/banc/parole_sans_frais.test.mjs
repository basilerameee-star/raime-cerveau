// La parole ne s'arrête jamais : Cortex répond par des modèles gratuits seulement, le local en dernier.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { repondreSansFrais, gratuitsOpenRouter, preferer, resserrer, _oublier } = require('../../cockpit/parole.js');

// Un faux Internet : chaque adresse répond selon le scénario ; tout appel est noté.
function reseau(scenario) {
  const appels = [];
  const fetch = async (url, o = {}) => {
    const corps = o.body ? JSON.parse(o.body) : null;
    appels.push({ url, modele: corps?.model || null });
    for (const [motif, reponse] of scenario) if (motif.test(url)) {
      const r = typeof reponse === 'function' ? reponse(corps) : reponse;
      if (r instanceof Error) throw r;
      return { ok: r.statut === 200, status: r.statut, json: async () => r.corps };
    }
    throw new Error('réseau coupé : ' + url);
  };
  return { fetch, appels };
}
const ok = (texte) => ({ statut: 200, corps: { choices: [{ message: { content: texte } }] } });
const refus = (statut) => ({ statut, corps: { error: { message: 'Insufficient credits', code: statut } } });
const LOCAL = /raime-ollama:11434\/api\/chat$/;
const localOk = (texte) => ({ statut: 200, corps: { message: { role: 'assistant', content: texte } } });
const messages = [{ role: 'system', content: 'consigne' }, { role: 'user', content: 'Bonjour' }];
const MODELES_OR = { statut: 200, corps: { data: [
  { id: 'deepseek/deepseek-v4-flash-0731', pricing: { prompt: '0.0000001', completion: '0.0000004' } },
  { id: 'qwen/qwen3-coder:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'deepseek/deepseek-r2:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'piege/payant:free', pricing: { prompt: '0.001', completion: '0' } },
] } };
beforeEach(() => _oublier());

test('Gemini gratuit répond : rien d’autre n’est appelé', async () => {
  const { fetch, appels } = reseau([[/generativelanguage/, ok('Réponse Gemini')]]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: {}, fetch });
  assert.equal(r.texte, 'Réponse Gemini');
  assert.match(r.source, /^Gemini/);
  assert.equal(appels.length, 1);
});

test('crédit OpenRouter épuisé (402) et quota Gemini épuisé (429) : le modèle local répond, sans payant', async () => {
  const { fetch, appels } = reseau([
    [/generativelanguage/, refus(429)],
    [/openrouter\.ai\/api\/v1\/models$/, MODELES_OR],
    [/openrouter\.ai\/api\/v1\/chat/, refus(402)],
    [LOCAL, localOk('Réponse locale')],
  ]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: { OPENROUTER_API_KEY: 'o' }, fetch });
  assert.equal(r.texte, 'Réponse locale');
  assert.match(r.source, /^local · gemma4:e4b$/);
  const essayes = appels.filter((a) => /openrouter\.ai\/api\/v1\/chat/.test(a.url)).map((a) => a.modele);
  assert.deepEqual(essayes, ['deepseek/deepseek-r2:free', 'qwen/qwen3-coder:free'], 'seuls les modèles à prix zéro sont essayés');
});

test('aucun modèle payant n’est jamais demandé, quel que soit le scénario', async () => {
  const { fetch, appels } = reseau([
    [/generativelanguage/, refus(500)], [/openrouter\.ai\/api\/v1\/models$/, MODELES_OR],
    [/openrouter\.ai\/api\/v1\/chat/, refus(402)], [LOCAL, refus(500)],
  ]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: { OPENROUTER_API_KEY: 'o' }, fetch });
  assert.equal(r.texte, '');
  const permis = new Set(['qwen/qwen3-coder:free', 'deepseek/deepseek-r2:free', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemma4:e4b']);
  for (const a of appels.filter((x) => x.modele)) assert.ok(permis.has(a.modele), `modèle payant demandé : ${a.modele}`);
});

test('sans aucune clé ni Internet : le modèle local seul suffit', async () => {
  const { fetch } = reseau([[LOCAL, localOk('Toujours là')]]);
  const r = await repondreSansFrais({ messages, coffre: {}, env: {}, fetch });
  assert.equal(r.texte, 'Toujours là');
});

test('Groq, Mistral, Cerebras ne sont appelés que si leur clé est au coffre', async () => {
  const { fetch, appels } = reseau([
    [/api\.groq\.com\/openai\/v1\/models$/, { statut: 200, corps: { data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.3-70b-versatile' }] } }],
    [/api\.groq\.com\/openai\/v1\/chat/, ok('Réponse Groq')],
  ]);
  const r = await repondreSansFrais({ messages, coffre: { GROQ_API_KEY: 'q' }, env: {}, fetch });
  assert.equal(r.texte, 'Réponse Groq');
  assert.ok(!appels.some((a) => /mistral|cerebras|generativelanguage/.test(a.url)));
  assert.equal(appels.find((a) => /chat/.test(a.url)).modele, 'llama-3.3-70b-versatile');
});

test('un fournisseur injoignable ne bloque pas la chaîne ; la réflexion <think> est retirée', async () => {
  const { fetch } = reseau([[/generativelanguage/, new Error('ECONNRESET')], [LOCAL, localOk('<think>brouillon</think>Réponse nette')]]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: {}, fetch });
  assert.equal(r.texte, 'Réponse nette');
});

test('outils : prix zéro strict, préférences dans l’ordre, contexte resserré pour le local', () => {
  assert.deepEqual(gratuitsOpenRouter(MODELES_OR.corps.data), ['qwen/qwen3-coder:free', 'deepseek/deepseek-r2:free']);
  assert.deepEqual(preferer(['a-qwen', 'b-deepseek', 'c'], [/deepseek/, /qwen/], 5), ['b-deepseek', 'a-qwen']);
  const long = [{ role: 'system', content: 'x'.repeat(9000) }, ...Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: String(i) }))];
  const r = resserrer(long);
  assert.equal(r[0].content.length, 6000);
  assert.deepEqual(r.slice(1).map((m) => m.content), ['4', '5', '6', '7', '8', '9']);
});
