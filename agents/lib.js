// Socle commun des agents rAIme : routage de modèle, appel de modèle, DB, traçabilité.
// Souverain : aucun appel à Anthropic. Depuis le 26/09/2026 (Basile : OpenRouter est supprimé), les agents
// parlent SANS FRAIS : Gemini gratuit, puis le modèle local du serveur (jarvis/parole.cjs, la même parole
// que Jarvis). OpenRouter ne sert plus que si Basile le rallume (OPENROUTER_PAYANT=1 et une clé).
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { repondreSansFrais } = createRequire(import.meta.url)('../jarvis/parole.cjs');

// Les clés GRATUITES absentes de l'environnement sont lues dans le .env du cerveau. La boucle a été
// créée avant que la clé Gemini n'y entre : sans elle, architecte, superviseur, penseur et réflexif
// tombaient sur le modèle local, trop lent pour leurs consignes (coupés à 3 minutes, constaté du 26 au
// 30/09/2026). Seuls les noms listés ici sont lus ; une valeur déjà présente n'est jamais remplacée ;
// rien n'est affiché.
export const CLES_GRATUITES = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'CEREBRAS_API_KEY'];
// Et la clé de JEV (TypeSafe), payante mais donnée par Basile le 30/09/2026 pour le goût (agents/gout.js),
// plafonnée à GOUT_PLAFOND_JOUR appels par jour (≈ 0,01 $).
// 08/10/2026 : la clé Google Places de Basile (vitrines : découverte, téléphone et site des commerces), quota gratuit plafonné.
// 15/10/2026 : la clé Tavily de Basile (recherche web du Fureteur, offre gratuite sans carte, 30 recherches par jour au plus).
export const CLES_AUTORISEES = ['TYPESAFE_API_KEY', 'JEV', 'GOOGLE_PLACES_API_KEY', 'TAVILY_API_KEY'];
export function chargerClesGratuites(chemin = new URL('../.env', import.meta.url), env = process.env) {
  let texte = '';
  try { texte = readFileSync(chemin, 'utf8'); } catch { return []; }
  const chargees = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(ligne);
    if (!m || ![...CLES_GRATUITES, ...CLES_AUTORISEES].includes(m[1]) || env[m[1]]) continue;
    const valeur = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (valeur) { env[m[1]] = valeur; chargees.push(m[1]); }
  }
  return chargees;
}
chargerClesGratuites();

// Vrai tant que Basile n'a pas rallumé le payant : la boucle ne met alors aucun agent en pause pour le budget.
export const sansFrais = () => !(process.env.OPENROUTER_PAYANT === '1' && process.env.OPENROUTER_API_KEY);

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Routage par tâche — le bon modèle au juste coût (notre propre doctrine).
// Prix en USD / 1M tokens, relevés depuis le catalogue du cerveau (table models).
export const ROUTER = {
  // Promu par le sas le 2026-09-03 : 88/100 contre 69 pour deepseek-v4-flash, sur
  // 4 passages de la batterie, pour 65 % de moins. Retour arriere : remettre
  // deepseek/deepseek-v4-flash-0731 ci-dessous et redeployer.
  extraction:    { model: 'upstage/solar-pro4', in: 0.030, out: 0.120 },
  raisonnement:  { model: 'deepseek/deepseek-v4-pro-0813',   in: 0.660, out: 1.980 },
  contradiction: { model: 'qwen/qwen3-max-thinking',          in: 0.780, out: 3.900 },
  // raisonne: false — ce modèle réfléchit avant d'écrire et vidait la moitié de ses
  // réponses. Coupé, il rend le texte tout de suite, pour trois fois moins cher.
  redaction:     { model: 'deepseek/deepseek-v4-flash-0731', in: 0.065, out: 0.180, raisonne: false },
  // DÉCISION TYPÉE — le travail que ferait JEV, dont l'acces est ferme. Mesure du
  // 2026-09-23, famille « decision », 3 passages : granite 75/100 pour 0,0037 $ les
  // mille decisions, contre 83/100 pour 0,0189 $ au titulaire. Cinq fois moins cher
  // pour huit points de moins : reserve au tri, jamais au cordon ni a l argent, ou
  // une erreur se paie. Retour arriere : remettre upstage/solar-pro4 ci-dessous.
  decision:      { model: 'ibm-granite/granite-4.0-h-micro', in: 0.017, out: 0.112 },
};

// Les prix sont des FAITS, pas des choix : ils viennent du catalogue synchronise,
// jamais d'une copie figee dans le code. Une copie figee derive en silence — c'est
// exactement ce qui s'est produit : deepseek-v4-pro etait passe de 0.66 a 1.1154,
// et tous nos couts etaient sous-estimes de 40% sans que rien ne le signale.
//
// En revanche le CHOIX du modele reste fixe ici. Automatiser un fait est sur ;
// automatiser un jugement sans mesure de qualite ne l'est pas.
let cachePrix = null, cachePrixLe = 0;

async function prixReels() {
  if (cachePrix && Date.now() - cachePrixLe < 3600_000) return cachePrix;
  const client = db();
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT openrouter_id, price_in, price_out FROM models WHERE openrouter_id = ANY($1::text[])`,
      [Object.values(ROUTER).map((c) => c.model)]);
    cachePrix = Object.fromEntries(rows.map((r) => [r.openrouter_id,
      { in: Number(r.price_in), out: Number(r.price_out) }]));
    cachePrixLe = Date.now();
  } catch { cachePrix = cachePrix || {}; }   // le catalogue indisponible ne doit jamais bloquer un agent
  finally { try { await client.end(); } catch {} }
  return cachePrix;
}

// Ecart entre le prix du code et le prix reel : un signal, pas une correction silencieuse.
export async function derivePrix() {
  const reels = await prixReels();
  return Object.entries(ROUTER).map(([tache, cfg]) => {
    const r = reels[cfg.model];
    if (!r) return { tache, modele: cfg.model, etat: 'absent du catalogue' };
    const ecart = cfg.in ? Math.round(100 * (r.in - cfg.in) / cfg.in) : null;
    return { tache, modele: cfg.model, code_in: cfg.in, reel_in: r.in, ecart_pct: ecart };
  }).filter((x) => x.etat || Math.abs(x.ecart_pct ?? 0) >= 5);
}

// LE CAP (voulu par Basile le 30/09/2026) : chaque consigne d'agent commence par la boussole commune
// (objectifs, règles, goût, bonne réponse, règles commerciales, passé, futur : agents/cap.js).
// CAP_DANS_CONSIGNES=0 le retire sans livraison. Un cap indisponible ne bloque jamais un agent.
export async function avecCap(system) {
  if (process.env.CAP_DANS_CONSIGNES === '0') return system;
  try {
    const cap = await import('./cap.js');
    let c = cap.enMemoire();
    if (!c) {
      const client = db(); await client.connect();
      try { c = await cap.capActuel({ brain: client }); } finally { await client.end().catch(() => {}); }
    }
    return `${c.texte}\n\n---\n\n${system}`;
  } catch { return system; }
}

export async function ask({ task, system, user, json = true, maxTokens = 6000, temperature = 0.1 }) {
  const cfg = ROUTER[task];
  if (!cfg) throw new Error(`Tâche inconnue: ${task}`);
  // Banc d'essai : avec MODELE_FACTICE=1, aucune requête ne part. La réponse vient des
  // fixtures, toujours la même pour la même consigne, et ne coûte rien. Sans cette
  // variable, rien ne change : la production ne la pose jamais.
  if (process.env.MODELE_FACTICE === '1') {
    const { repondre } = await import('./modele_factice.js');
    return repondre({ task, system, user });
  }
  system = await avecCap(system);
  if (sansFrais()) {
    const t0 = Date.now();
    const r = await repondreSansFrais({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      profond: task === 'raisonnement' || task === 'contradiction', json, maxTokens, temperature });
    if (!r.texte) throw new Error('aucun modèle gratuit ne répond (ni Gemini, ni le modèle local)');
    const u = r.usage || {};
    return { text: r.texte, model: r.source, tokensIn: u.prompt_tokens || 0, tokensOut: u.completion_tokens || 0, costUsd: 0, ms: Date.now() - t0 };
  }
  const key = process.env.OPENROUTER_API_KEY;

  const body = {
    model: cfg.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };
  // Certains modèles raisonnent avant d'écrire. Quand le budget part entièrement dans le
  // raisonnement, la réponse revient VIDE avec finish_reason « length » : la maison paie
  // et ne reçoit rien. Mesure du 2026-09-23 sur deepseek-v4-flash : raisonnement coupé,
  // 960 caractères pour 0,000043 $ ; budget élargi à 4000, toujours vide pour 0,001142 $.
  if (cfg.raisonne === false) body.reasoning = { enabled: false };

  const t0 = Date.now();
  const appel = async (corps) => {
    const rep = await fetch(OR_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    if (!rep.ok) throw new Error(`OpenRouter ${rep.status}: ${(await rep.text()).slice(0, 300)}`);
    return rep.json();
  };

  let d = await appel(body);
  // Le filet : réponse vide parce que le raisonnement a mangé le budget → on rejoue
  // une fois sans raisonnement. Mieux vaut un texte que zéro caractère déjà payé.
  if (!d.choices?.[0]?.message?.content && d.choices?.[0]?.finish_reason === 'length') {
    d = await appel({ ...body, reasoning: { enabled: false } });
  }
  const text = d.choices?.[0]?.message?.content ?? '';
  const u = d.usage || {};
  const tokensIn = u.prompt_tokens || 0, tokensOut = u.completion_tokens || 0;
  // Prix reel du catalogue ; la valeur du code ne sert que de filet si la base est injoignable.
  const p = (await prixReels())[cfg.model] || { in: cfg.in, out: cfg.out };
  return {
    text, model: cfg.model, tokensIn, tokensOut,
    costUsd: (tokensIn * p.in + tokensOut * p.out) / 1e6,
    ms: Date.now() - t0,
  };
}

// Parsing défensif : les modèles enrobent parfois le JSON.
export function parseJson(text) {
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}


// JSON avec reprise : si la sortie est tronquee ou invalide, on rejoue avec un budget plus large.
export async function askJson({ task, system, user, maxTokens = 16000, temperature = 0.1 }) {
  let last = null;
  for (const budget of [maxTokens, Math.round(maxTokens * 1.8)]) {
    const r = await ask({ task, system, user, json: true, maxTokens: budget, temperature });
    last = r;
    try { return { data: parseJson(r.text), meta: r, status: 'ok' }; }
    catch { /* on retente avec plus de budget */ }
  }
  return { data: null, meta: last, status: 'parse_error', raw: (last?.text || '').slice(0, 2000) };
}

export function db() {
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}

// Pilier ④ — traçabilité : chaque appel d'agent est journalisé et rejouable.
export async function logRun(client, { agent, task, model, tokensIn, tokensOut, costUsd, ms, status, ref, promptVersion }) {
  await client.query(
    `INSERT INTO agent_runs(agent,task,model,prompt_version,ref,tokens_in,tokens_out,cost_usd,duration_ms,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [agent, task, model, promptVersion || 'v1', ref || null, tokensIn, tokensOut, costUsd, ms, status]
  );
}

export const money = (n) => `${n.toFixed(4)} $`;

// Charge l'instruction ACTIVE d'un agent depuis la base : c'est ce qui permet a un agent
// d'etre reecrit par le Reflexif sans redeploiement, et annule en une requete.
// Si aucune version active n'existe, l'agent tourne avec son prompt d'origine : jamais de panne.
export async function instructionActive(client, agent) {
  try {
    const { rows } = await client.query(
      `SELECT version, instruction FROM prompt_versions WHERE agent = $1 AND active LIMIT 1`, [agent]);
    return rows[0] || null;
  } catch { return null; }
}
