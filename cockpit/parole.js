// LA PAROLE NE S'ARRÊTE JAMAIS (26/09/2026, demande de Basile : « que ça ne se reproduise plus jamais,
// qu'il soit tout le temps disponible, sans aucun frais »). Le 25/09, le crédit OpenRouter épuisé avait
// coupé Cortex. Désormais la conversation passe par des modèles GRATUITS seulement, dans l'ordre :
//   1. Gemini, sur le quota gratuit de la clé Google rangée au coffre ;
//   2. Groq, Mistral, Cerebras : chacun seulement si sa clé gratuite est au coffre ;
//   3. OpenRouter, ses seuls modèles à prix zéro (la liste est relue chez OpenRouter, jamais figée) ;
//   4. le modèle local du serveur (Ollama, Gemma 4 E4B, licence Apache 2.0 lue sur le serveur le 26/09) : ni compte, ni quota, ni
//      crédit ; toujours là, même si tout le reste tombe.
// Aucun modèle payant ici : le budget ne peut plus faire taire Jarvis.
'use strict';

const LOCAL_URL = process.env.MODELE_LOCAL_URL || 'http://raime-ollama:11434';
const LOCAL_MODELE = process.env.MODELE_LOCAL || 'gemma4:e4b';
const GEMINI_RAPIDE = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
const GEMINI_PROFOND = ['gemini-3.1-pro-preview', 'gemini-3.8-flash'];

// Les listes de modèles lues chez un fournisseur sont gardées six heures.
const memoire = new Map();
async function enMemoire(cle, lire) {
  const m = memoire.get(cle);
  if (m && Date.now() - m.t < 6 * 3600e3) return m.v;
  const v = await lire().catch(() => []);
  if (v.length) memoire.set(cle, { t: Date.now(), v });
  return v;
}

// Parmi des identifiants, ceux qui correspondent aux préférences, dans l'ordre des préférences.
function preferer(ids, preferences, combien) {
  const retenus = [];
  for (const p of preferences) for (const id of ids) if (p.test(id) && !retenus.includes(id)) retenus.push(id);
  return retenus.slice(0, combien);
}

// Les modèles d'OpenRouter dont le prix est exactement zéro, en entrée comme en sortie.
function gratuitsOpenRouter(donnees) {
  return (donnees || []).filter((m) => m && typeof m.id === 'string' && m.id.endsWith(':free')
    && m.pricing && String(m.pricing.prompt) === '0' && String(m.pricing.completion) === '0').map((m) => m.id);
}

function fournisseurs({ coffre, env, profond, fetch }) {
  const lireModeles = (url, cle) => async () => {
    const r = await fetch(url, { headers: cle ? { Authorization: 'Bearer ' + cle } : {}, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map((m) => m.id).filter(Boolean);
  };
  return [
    { nom: 'Gemini', cle: coffre.GEMINI_API_KEY, url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      modeles: async () => (profond ? GEMINI_PROFOND : GEMINI_RAPIDE) },
    { nom: 'Groq', cle: coffre.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions',
      modeles: async () => preferer(await enMemoire('groq', lireModeles('https://api.groq.com/openai/v1/models', coffre.GROQ_API_KEY)),
        [/llama-3\.3-70b/, /gpt-oss-120b/, /qwen/, /kimi/, /llama/], 2) },
    { nom: 'Mistral', cle: coffre.MISTRAL_API_KEY, url: 'https://api.mistral.ai/v1/chat/completions',
      modeles: async () => ['mistral-small-latest'] },
    { nom: 'Cerebras', cle: coffre.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1/chat/completions',
      modeles: async () => preferer(await enMemoire('cerebras', lireModeles('https://api.cerebras.ai/v1/models', coffre.CEREBRAS_API_KEY)),
        [/qwen/, /gpt-oss/, /llama/], 2) },
    { nom: 'OpenRouter gratuit', cle: env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions',
      modeles: async () => preferer(await enMemoire('openrouter', async () => {
        const r = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(8000) });
        return r.ok ? gratuitsOpenRouter((await r.json()).data) : [];
      }), [/deepseek/, /qwen/, /llama-3\.3-70b/, /gemma/, /mistral/, /./], 3) },
  ];
}

const texteDe = (d) => String((d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '')
  .replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Le modèle local tourne sur le processeur du serveur : on lui donne l'essentiel (la consigne et les
// derniers échanges) pour qu'il réponde en quelques secondes.
function resserrer(messages) {
  const systeme = messages.filter((m) => m.role === 'system').map((m) => String(m.content).slice(0, 6000));
  const suite = messages.filter((m) => m.role !== 'system').slice(-6);
  return [...systeme.map((content) => ({ role: 'system', content })), ...suite];
}

async function repondreLocal({ messages, fetch, env, delai }) {
  const r = await fetch((env.MODELE_LOCAL_URL || LOCAL_URL) + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.MODELE_LOCAL || LOCAL_MODELE, messages: resserrer(messages), stream: false, think: false,
      options: { num_ctx: 8192 } }), signal: AbortSignal.timeout(delai) });
  if (!r.ok) return '';
  const d = await r.json();
  return String((d && d.message && d.message.content) || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Rend { texte, source } ; texte vide seulement si le modèle local lui-même est hors service.
async function repondreSansFrais({ messages, profond = false, coffre = {}, env = process.env, fetch = globalThis.fetch,
  delai = 90000, delaiLocal = 180000 }) {
  for (const f of fournisseurs({ coffre, env, profond, fetch })) {
    if (!f.cle) continue;
    let modeles = [];
    try { modeles = await f.modeles(); } catch (e) { modeles = []; }
    for (const modele of modeles) {
      try {
        const r = await fetch(f.url, { method: 'POST', headers: { Authorization: 'Bearer ' + f.cle, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modele, messages, max_tokens: 4000 }), signal: AbortSignal.timeout(delai) });
        if (!r.ok) continue; // quota du jour épuisé (429), crédit (402), modèle retiré (404) : le suivant
        const texte = texteDe(await r.json());
        if (texte) return { texte, source: `${f.nom} · ${modele}` };
      } catch (e) { /* injoignable ou trop long : le suivant */ }
    }
  }
  try {
    const texte = await repondreLocal({ messages, fetch, env, delai: delaiLocal });
    if (texte) return { texte, source: `local · ${env.MODELE_LOCAL || LOCAL_MODELE}` };
  } catch (e) { /* le local aussi : rien */ }
  return { texte: '', source: null };
}

module.exports = { repondreSansFrais, gratuitsOpenRouter, preferer, resserrer, LOCAL_MODELE, _oublier: () => memoire.clear() };
