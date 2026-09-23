// Socle commun des agents rAIme : routage de modèle, appel OpenRouter, DB, traçabilité.
// Souverain : aucun appel à Anthropic. Tout passe par OpenRouter (DeepSeek / Qwen).
import pg from 'pg';

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
  redaction:     { model: 'deepseek/deepseek-v4-flash-0731', in: 0.065, out: 0.180 },
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

export async function ask({ task, system, user, json = true, maxTokens = 6000, temperature = 0.1 }) {
  const cfg = ROUTER[task];
  if (!cfg) throw new Error(`Tâche inconnue: ${task}`);
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY manquante');

  const body = {
    model: cfg.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
    temperature,
  };
  if (json) body.response_format = { type: 'json_object' };

  const t0 = Date.now();
  const r = await fetch(OR_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
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
