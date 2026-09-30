// La parole ne s'arrête jamais : Jarvis et les agents répondent par des modèles gratuits seulement, le local en
// dernier ; OpenRouter (supprimé par Basile le 26/09/2026) n'est plus jamais appelé.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { repondreSansFrais, preferer, resserrer, _oublier } = require('../../jarvis/parole.cjs');

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
beforeEach(() => _oublier());

test('Gemini gratuit répond : rien d’autre n’est appelé', async () => {
  const { fetch, appels } = reseau([[/generativelanguage/, ok('Réponse Gemini')]]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: {}, fetch });
  assert.equal(r.texte, 'Réponse Gemini');
  assert.match(r.source, /^Gemini/);
  assert.equal(appels.length, 1);
});

test('quota Gemini épuisé (429) : le modèle local répond ; OpenRouter n’est jamais appelé, même avec une clé', async () => {
  const { fetch, appels } = reseau([[/generativelanguage/, refus(429)], [/openrouter/, ok('payant')], [LOCAL, localOk('Réponse locale')]]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: { OPENROUTER_API_KEY: 'o' }, fetch });
  assert.equal(r.texte, 'Réponse locale');
  assert.match(r.source, /^local · gemma4:e4b$/);
  assert.ok(!appels.some((a) => /openrouter/.test(a.url)), 'OpenRouter a été appelé');
});

test('aucun modèle payant n’est jamais demandé, quel que soit le scénario', async () => {
  const { fetch, appels } = reseau([[/generativelanguage/, refus(500)], [/openrouter/, ok('payant')], [LOCAL, refus(500)]]);
  const r = await repondreSansFrais({ messages, coffre: { GEMINI_API_KEY: 'g' }, env: { OPENROUTER_API_KEY: 'o' }, fetch });
  assert.equal(r.texte, '');
  const permis = new Set(['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemma4:e4b']);
  for (const a of appels.filter((x) => x.modele)) assert.ok(permis.has(a.modele), `modèle payant demandé : ${a.modele}`);
});

test('réflexion profonde : Pro refusé et Flash saturé, un autre Gemini gratuit répond avant le local', async () => {
  const { fetch, appels } = reseau([[/generativelanguage/, (c) => (/3\.5-flash/.test(c.model) ? ok('Réponse Gemini') : refus(c.model.includes('pro') ? 429 : 503))],
    [LOCAL, localOk('ne doit pas servir')]]);
  const r = await repondreSansFrais({ messages, profond: true, env: { GEMINI_API_KEY: 'g' }, fetch });
  assert.equal(r.texte, 'Réponse Gemini');
  assert.equal(r.source, 'Gemini · gemini-3.5-flash');
  assert.ok(!appels.some((a) => a.modele === 'gemma4:e4b'), 'le local a été appelé alors qu’un Gemini répondait');
  assert.ok(appels.every((a) => !a.modele || /^gemini-/.test(a.modele)), 'seuls des Gemini gratuits sont demandés');
});

test('pour les agents : la clé vient de l’environnement, le JSON est demandé à Gemini comme au local', async () => {
  const corps = [];
  const { fetch } = reseau([[/generativelanguage/, (c) => { corps.push(c); return refus(429); }], [LOCAL, (c) => { corps.push(c); return localOk('{"ok":true}'); }]]);
  const r = await repondreSansFrais({ messages, env: { GEMINI_API_KEY: 'g' }, json: true, fetch });
  assert.equal(r.texte, '{"ok":true}');
  assert.deepEqual(corps[0].response_format, { type: 'json_object' });
  assert.equal(corps.at(-1).format, 'json');
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

test('outils : préférences dans l’ordre, contexte resserré pour le local', () => {
  assert.deepEqual(preferer(['a-qwen', 'b-deepseek', 'c'], [/deepseek/, /qwen/], 5), ['b-deepseek', 'a-qwen']);
  const long = [{ role: 'system', content: 'x'.repeat(15000) }, ...Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: String(i) }))];
  const r = resserrer(long);
  assert.equal(r[0].content.length, 12000);
  assert.deepEqual(r.slice(1).map((m) => m.content), ['4', '5', '6', '7', '8', '9']);
});
