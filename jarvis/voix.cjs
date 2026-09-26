// LA VOIX DE JARVIS (26/09/2026, Basile : « une voix le plus humaine possible », « on me répond avec une voix
// Gemini »). Avec la clé Gemini du coffre, le texte est dit par un modèle vocal de Gemini (quota gratuit) ; sinon,
// ou s'il ne répond pas, par la voix du serveur (Piper), puis par celle du navigateur. Rien n'est payé.
'use strict';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const VOIX_DEFAUT = 'Charon';   // voix grave et posée ; une autre se choisit dans le coffre (JARVIS_VOIX)
let modelesTts = { t: 0, v: [] };

// Les modèles vocaux disponibles pour cette clé : lus chez Google (jamais figés dans le code), gardés six heures.
async function modeles(cle, fetch) {
  if (modelesTts.v.length && Date.now() - modelesTts.t < 6 * 3600e3) return modelesTts.v;
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': cle }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const v = ((await r.json()).models || []).map((m) => String(m.name || '')).filter((n) => /tts/i.test(n))
    .sort((a, b) => (/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0));
  if (v.length) modelesTts = { t: Date.now(), v };
  return v;
}

// Du PCM 16 bits mono (ce que rend Gemini) vers un fichier WAV que tout navigateur sait jouer.
function wav(pcm, frequence = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(frequence, 24);
  h.writeUInt32LE(frequence * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Rend un WAV, ou null si Gemini ne peut pas dire ce texte (pas de clé, quota, panne).
async function direGemini(texte, { coffre = {}, fetch = globalThis.fetch } = {}) {
  const cle = coffre.GEMINI_API_KEY;
  if (!cle || !texte) return null;
  for (const nom of (await modeles(cle, fetch)).slice(0, 2)) {
    try {
      const r = await fetch(`${BASE}/${nom}:generateContent`, { method: 'POST',
        headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ contents: [{ parts: [{ text: `Dis ceci en français, d'une voix chaleureuse, naturelle et posée, comme un ami qui parle : ${texte}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: coffre.JARVIS_VOIX || VOIX_DEFAUT } } } } }) });
      if (!r.ok) continue;
      const d = await r.json();
      const partie = ((((d.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData && p.inlineData.data);
      if (!partie) continue;
      const frequence = +((String(partie.inlineData.mimeType).match(/rate=(\d+)/) || [])[1] || 24000);
      return wav(Buffer.from(partie.inlineData.data, 'base64'), frequence);
    } catch (e) { /* modèle suivant */ }
  }
  return null;
}

module.exports = { direGemini, wav, _oublier: () => { modelesTts = { t: 0, v: [] }; } };
