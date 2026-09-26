// LA PAROLE SANS FRAIS — partagée par Jarvis (le Cockpit) et par les agents du cerveau.
// Basile, le 26/09/2026 : « que ça ne se reproduise plus jamais… sans aucun frais », puis : OpenRouter
// est supprimé. Aucun modèle payant ici, et plus aucun appel à OpenRouter. L'ordre :
//   1. Gemini, sur le quota gratuit de la clé Google (coffre ou variable GEMINI_API_KEY) ;
//   2. Groq, Mistral, Cerebras : chacun seulement si sa clé gratuite est présente ;
//   3. le modèle local du serveur (Ollama, Gemma 4 E4B, Apache 2.0) : ni compte, ni quota, ni crédit.
'use strict';

const LOCAL_URL = 'http://raime-ollama:11434';
const LOCAL_MODELE = 'gemma4:e4b';
const GEMINI_RAPIDE = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
const GEMINI_PROFOND = ['gemini-3.1-pro-preview', 'gemini-3.8-flash'];

// LE CLASSEMENT ADOPTÉ — l'éclaireur (agents/eclaireur.js) mesure les modèles gratuits avec la batterie de
// métrologie ; les meilleurs passent devant, par fournisseur. Sans classement : l'ordre par défaut ci-dessous.
let classement = {};
function adopter(c) { classement = c && typeof c === 'object' ? c : {}; }
const enTete = (nom, defaut) => [...new Set([...(classement[nom] || []).slice(0, 2), ...defaut])];

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

function fournisseurs({ cles, profond, fetch }) {
  const lireModeles = (url, cle) => async () => {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + cle }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map((m) => m.id).filter(Boolean);
  };
  return [
    { nom: 'Gemini', cle: cles.GEMINI_API_KEY, url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      modeles: async () => (profond ? GEMINI_PROFOND : enTete('Gemini', GEMINI_RAPIDE)) },
    { nom: 'Groq', cle: cles.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions',
      modeles: async () => enTete('Groq', preferer(await enMemoire('groq', lireModeles('https://api.groq.com/openai/v1/models', cles.GROQ_API_KEY)),
        [/llama-3\.3-70b/, /gpt-oss-120b/, /qwen/, /kimi/, /llama/], 2)) },
    { nom: 'Mistral', cle: cles.MISTRAL_API_KEY, url: 'https://api.mistral.ai/v1/chat/completions',
      modeles: async () => enTete('Mistral', ['mistral-small-latest']) },
    { nom: 'Cerebras', cle: cles.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1/chat/completions',
      modeles: async () => enTete('Cerebras', preferer(await enMemoire('cerebras', lireModeles('https://api.cerebras.ai/v1/models', cles.CEREBRAS_API_KEY)),
        [/qwen/, /gpt-oss/, /llama/], 2)) },
  ];
}

const sansPensee = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Le modèle local tourne sur le processeur du serveur : on lui donne l'essentiel (la consigne et les
// derniers échanges) pour qu'il réponde en quelques secondes.
function resserrer(messages) {
  const systeme = messages.filter((m) => m.role === 'system').map((m) => String(m.content).slice(0, 6000));
  const suite = messages.filter((m) => m.role !== 'system').slice(-6);
  return [...systeme.map((content) => ({ role: 'system', content })), ...suite];
}

// Les clés gratuites présentes dans l'environnement (jamais affichées).
function clesDe(env) {
  const c = {};
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'CEREBRAS_API_KEY']) if (env[k]) c[k] = env[k];
  return c;
}

// Rend { texte, source, usage } ; texte vide seulement si le modèle local lui-même est hors service.
// coffre : les clés rangées par Basile (elles priment sur l'environnement).
// json : la réponse doit être un objet JSON (agents).
async function repondreSansFrais({ messages, profond = false, coffre = {}, env = process.env, fetch = globalThis.fetch,
  json = false, maxTokens = 4000, temperature, delai = 90000, delaiLocal = 180000 }) {
  const cles = { ...clesDe(env), ...coffre };
  for (const f of fournisseurs({ cles, profond, fetch })) {
    if (!f.cle) continue;
    let modeles = [];
    try { modeles = await f.modeles(); } catch (e) { modeles = []; }
    for (const modele of modeles) {
      try {
        const corps = { model: modele, messages, max_tokens: maxTokens };
        if (temperature != null) corps.temperature = temperature;
        if (json) corps.response_format = { type: 'json_object' };
        const r = await fetch(f.url, { method: 'POST', headers: { Authorization: 'Bearer ' + f.cle, 'Content-Type': 'application/json' },
          body: JSON.stringify(corps), signal: AbortSignal.timeout(delai) });
        if (!r.ok) continue; // quota du jour épuisé (429), modèle retiré (404) : le suivant
        const d = await r.json();
        const texte = sansPensee(d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
        if (texte) return { texte, source: `${f.nom} · ${modele}`, usage: d.usage || {} };
      } catch (e) { /* injoignable ou trop long : le suivant */ }
    }
  }
  try {
    const r = await fetch((env.MODELE_LOCAL_URL || LOCAL_URL) + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.MODELE_LOCAL || LOCAL_MODELE, messages: resserrer(messages), stream: false, think: false,
        ...(json ? { format: 'json' } : {}), options: { num_ctx: 8192, ...(temperature != null ? { temperature } : {}) } }),
      signal: AbortSignal.timeout(delaiLocal) });
    if (r.ok) {
      const d = await r.json();
      const texte = sansPensee(d && d.message && d.message.content);
      if (texte) return { texte, source: `local · ${env.MODELE_LOCAL || LOCAL_MODELE}`,
        usage: { prompt_tokens: d.prompt_eval_count || 0, completion_tokens: d.eval_count || 0 } };
    }
  } catch (e) { /* le local aussi : rien */ }
  return { texte: '', source: null, usage: {} };
}

// Les fournisseurs gratuits et leurs adresses, pour l'éclaireur (liste des modèles, mesure).
const FOURNISSEURS = {
  Gemini: { cle: 'GEMINI_API_KEY', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  Groq: { cle: 'GROQ_API_KEY', base: 'https://api.groq.com/openai/v1' },
  Mistral: { cle: 'MISTRAL_API_KEY', base: 'https://api.mistral.ai/v1' },
  Cerebras: { cle: 'CEREBRAS_API_KEY', base: 'https://api.cerebras.ai/v1' },
};

module.exports = { repondreSansFrais, preferer, resserrer, adopter, FOURNISSEURS, LOCAL_URL, LOCAL_MODELE, _oublier: () => memoire.clear() };
