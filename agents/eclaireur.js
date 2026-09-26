// L'ÉCLAIREUR DES MODÈLES GRATUITS (26/09/2026, demande de Basile : « qu'il voie les nouveaux modèles, qu'il
// les incrémente »). Le chasseur et le métrologue mesuraient des modèles payants d'OpenRouter ; tout tourne
// désormais sans frais. Chaque jour :
//   ① il liste les modèles gratuits que le cerveau peut appeler : Gemini (clé Google), Groq, Mistral, Cerebras
//      (si leur clé existe), et les modèles installés sur le serveur (Ollama) ;
//   ② il en mesure au plus trois, nouveaux ou vieux de plus de 14 jours, avec la batterie de métrologie
//      (dix tâches figées, notées par du code, aucun juge) ;
//   ③ le classement (score, puis vitesse ; seuls les modèles mesurés à 100 % et notés 70 ou plus) est adopté
//      par la parole de Jarvis et des agents : le meilleur modèle gratuit passe devant, sans geste de Basile.
// Coût : zéro. Aucun modèle n'est téléchargé sur le serveur sans Basile : il ne mesure que ce qui y est déjà.
import { createRequire } from 'node:module';
import { TACHES } from '../metrologie/taches.js';
const { FOURNISSEURS, LOCAL_URL, adopter } = createRequire(import.meta.url)('../jarvis/parole.cjs');

const ECARTES = /embed|image|imagen|tts|audio|live|vision-only|guard|whisper|veo|aqa|learnlm|robotics|-exp-\d{4}/i;

export async function preparer(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS modeles_gratuits (fournisseur text NOT NULL, modele text NOT NULL,
    vu_le timestamptz NOT NULL DEFAULT now(), mesure_le timestamptz, score int, couverture int, duree_ms int,
    PRIMARY KEY (fournisseur, modele))`);
}

// ① Ce qui existe aujourd'hui, gratuitement.
export async function lister({ env = process.env, fetch = globalThis.fetch } = {}) {
  const trouves = [];
  for (const [nom, f] of Object.entries(FOURNISSEURS)) {
    const cle = env[f.cle];
    if (!cle) continue;
    try {
      const r = await fetch(`${f.base}/models`, { headers: { Authorization: 'Bearer ' + cle }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      for (const m of (await r.json()).data || []) {
        const id = String(m.id || '').replace(/^models\//, '');
        if (id && !ECARTES.test(id) && (nom !== 'Gemini' || /^gemini/.test(id))) trouves.push({ fournisseur: nom, modele: id });
      }
    } catch (e) { /* fournisseur injoignable : on passe */ }
  }
  try {
    const r = await fetch((env.MODELE_LOCAL_URL || LOCAL_URL) + '/api/tags', { signal: AbortSignal.timeout(5000) });
    if (r.ok) for (const m of (await r.json()).models || []) trouves.push({ fournisseur: 'local', modele: m.name });
  } catch (e) { /* pas de modèle local joignable */ }
  return trouves;
}

// ② Une tâche de la batterie, sur un modèle gratuit.
async function executer({ fournisseur, modele }, tache, { env, fetch }) {
  const messages = [{ role: 'system', content: tache.systeme }, { role: 'user', content: tache.invite }];
  const t0 = Date.now();
  let texte = '';
  if (fournisseur === 'local') {
    const r = await fetch((env.MODELE_LOCAL_URL || LOCAL_URL) + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modele, messages, stream: false, think: false, options: { temperature: 0 } }), signal: AbortSignal.timeout(240000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    texte = ((await r.json()).message || {}).content || '';
  } else {
    const f = FOURNISSEURS[fournisseur];
    const r = await fetch(`${f.base}/chat/completions`, { method: 'POST',
      headers: { Authorization: 'Bearer ' + env[f.cle], 'Content-Type': 'application/json' },
      // Un modèle qui réfléchit avant d'écrire a besoin de place : la note porte sur la réponse, pas sur la longueur.
      body: JSON.stringify({ model: modele, messages, max_tokens: Math.max(tache.maxTokens, 1024), temperature: 0 }), signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    texte = (((await r.json()).choices || [])[0] || {}).message?.content || '';
  }
  return { texte: String(texte).replace(/<think>[\s\S]*?<\/think>/g, '').trim(), ms: Date.now() - t0 };
}

export async function mesurer(m, { env = process.env, fetch = globalThis.fetch, taches = TACHES } = {}) {
  const notes = [];
  let ms = 0;
  for (const t of taches) {
    try { const r = await executer(m, t, { env, fetch }); notes.push(t.verifier(r.texte)); ms += r.ms; }
    catch (e) { notes.push(null); }   // un 429 ne dit rien de la qualité : non mesuré, pas zéro
  }
  const faites = notes.filter((n) => n !== null);
  return { score: faites.length ? Math.round(faites.reduce((a, b) => a + b, 0) / faites.length) : null,
    couverture: Math.round(100 * faites.length / taches.length), duree_ms: faites.length ? Math.round(ms / faites.length) : null };
}

// ③ Le classement adopté par la parole : par fournisseur, les meilleurs d'abord.
export async function classement(brain) {
  const { rows } = await brain.query(`SELECT fournisseur, modele FROM modeles_gratuits
    WHERE couverture = 100 AND score >= 70 AND vu_le > now() - interval '7 days' ORDER BY score DESC, duree_ms ASC`);
  const c = {};
  for (const r of rows) (c[r.fournisseur] = c[r.fournisseur] || []).push(r.modele);
  return c;
}

export async function eclairer({ brain, env = process.env, fetch = globalThis.fetch, parJour = 3, taches = TACHES } = {}) {
  await preparer(brain);
  const trouves = await lister({ env, fetch });
  const nouveaux = [];
  for (const m of trouves) {
    const r = await brain.query(`INSERT INTO modeles_gratuits (fournisseur, modele) VALUES ($1, $2)
      ON CONFLICT (fournisseur, modele) DO UPDATE SET vu_le = now() RETURNING (xmax = 0) AS neuf`, [m.fournisseur, m.modele]);
    if (r.rows[0] && r.rows[0].neuf) nouveaux.push(`${m.fournisseur} · ${m.modele}`);
  }
  const { rows: aMesurer } = await brain.query(`SELECT fournisseur, modele FROM modeles_gratuits
    WHERE vu_le > now() - interval '1 day' AND (mesure_le IS NULL OR mesure_le < now() - interval '14 days')
    ORDER BY mesure_le NULLS FIRST, (fournisseur = 'local') LIMIT $1`, [parJour]);
  const mesures = [];
  for (const m of aMesurer) {
    const r = await mesurer(m, { env, fetch, taches });
    await brain.query(`UPDATE modeles_gratuits SET mesure_le = now(), score = $3, couverture = $4, duree_ms = $5 WHERE fournisseur = $1 AND modele = $2`,
      [m.fournisseur, m.modele, r.score, r.couverture, r.duree_ms]);
    mesures.push(`${m.fournisseur} · ${m.modele} : ${r.score ?? 'n.m.'}/100 (${r.couverture} % mesuré)`);
  }
  const c = await classement(brain);
  adopter(c);
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES('eclaireur', $1, $2)`,
    [`${trouves.length} modèles gratuits vus, ${nouveaux.length} nouveaux, ${mesures.length} mesurés`,
      [...nouveaux.map((n) => 'nouveau : ' + n), ...mesures, 'en tête : ' + (Object.entries(c).map(([f, l]) => `${f} ${l[0]}`).join(', ') || 'ordre par défaut')].join(' | ').slice(0, 900)]);
  return { vus: trouves.length, nouveaux, mesures, classement: c };
}
