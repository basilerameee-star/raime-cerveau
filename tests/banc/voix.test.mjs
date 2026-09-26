// La voix de Jarvis : Gemini d'abord (la plus humaine), rien si pas de clé ; le son rendu est un vrai WAV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { direGemini, _oublier } = createRequire(import.meta.url)('../../jarvis/voix.cjs');

test('avec la clé Gemini : le modèle vocal est trouvé chez Google et le son revient en WAV', async () => {
  _oublier();
  const appels = [];
  const fetch = async (url, o = {}) => {
    appels.push({ url, corps: o.body ? JSON.parse(o.body) : null, cle: o.headers && o.headers['x-goog-api-key'] });
    if (/\/models\?/.test(url)) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-9-pro' }, { name: 'models/gemini-9-flash-tts' }] }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(4800).toString('base64') } }] } }] }) };
  };
  const wav = await direGemini('Bonjour Basile.', { coffre: { GEMINI_API_KEY: 'g', JARVIS_VOIX: 'Kore' }, fetch });
  assert.equal(wav.slice(0, 4).toString(), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.length, 44 + 4800);
  const dire = appels.find((a) => /generateContent/.test(a.url));
  assert.match(dire.url, /models\/gemini-9-flash-tts:generateContent$/);
  assert.equal(dire.corps.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.ok(!/key=/.test(dire.url), 'la clé passe dans un en-tête, jamais dans l’adresse');
});

test('sans clé, ou Gemini en panne : rien (la voix du serveur prend le relais)', async () => {
  _oublier();
  assert.equal(await direGemini('Bonjour', { coffre: {}, fetch: async () => { throw new Error('ne doit pas appeler'); } }), null);
  const panne = async (url) => (/\/models\?/.test(url) ? { ok: true, json: async () => ({ models: [{ name: 'models/x-tts' }] }) } : { ok: false, status: 429 });
  assert.equal(await direGemini('Bonjour', { coffre: { GEMINI_API_KEY: 'g' }, fetch: panne }), null);
});
