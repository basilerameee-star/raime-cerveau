// L'EXÉCUTANT HERMES — Hermes prend la place de l'ancien exécutant, derrière le Cockpit inchangé.
//
// Le Cockpit (jarvis/relais.cjs) confie chaque demande d'action de Basile à un « exécutant » :
//   GET  /sante  → { etat: 'libre' | 'occupe' }
//   POST /tache  { tache, id } → { code, sortie, trace?, duree_s }
// et relit, après un redémarrage, /travail/demande-<id>/.resultat.json.
//
// Ce relais parle exactement ce langage, et transmet la tâche à Hermes Agent (son serveur
// compatible OpenAI, /v1/chat/completions, clé API_SERVER_KEY, réseau interne seulement).
// Hermes fait le travail avec ses outils ; à la fin d'une tâche nouvelle, il en écrit une
// compétence : la prochaine fois, il la refait plus vite et pour moins de jetons.
//
// Il prend le nom réseau « harness » : le Cockpit ne change pas d'une ligne. Pour revenir à
// l'ancien exécutant, on arrête ce relais et on rallume l'ancien (hermes/INSTALLER.md).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { validerContrat, verifierResultat } = createRequire(import.meta.url)('./verification.cjs');

const HERMES = process.env.HERMES_URL || 'http://raime-hermes:8642';
const CLE = process.env.API_SERVER_KEY || '';
const TRAVAIL = process.env.TRAVAIL_DIR || '/travail';
const DUREE_MAX_MS = Number(process.env.EXECUTANT_DUREE_MAX_MS || 45 * 60_000);
// Le relais peut demander explicitement le gratuit (Gemini) ; sinon Hermes suit sa configuration :
// Gemini gratuit, puis le modèle local du serveur (hermes/config.yaml). Plus jamais OpenRouter.
const MODELE_GRATUIT = { provider: 'gemini', model: process.env.HERMES_MODELE_GRATUIT || 'gemini-3.8-flash' };
const MODELE_LOCAL = { provider: 'local', model: process.env.HERMES_MODELE_LOCAL || 'gemma4:e4b' };

// Ce qu'Hermes lit avant chaque demande : ses compétences à lui, et la règle d'apprentissage.
export const PREAMBULE = "Tu es Hermes, l'exécutant du cerveau rAIme, et tu travailles dans /travail. "
  + "Avant de commencer : cherche dans TES compétences celle qui fait déjà ce travail, et suis-la. "
  + "Si elle n'existe pas : cherche la meilleure méthode (bibliothèque de rAIme par le serveur raime, puis GitHub, "
  + "documentations officielles), au plus faible coût, et essaie dans /travail seulement. "
  + "À la fin d'une tâche nouvelle ou mieux réussie qu'avant : écris ou améliore la compétence correspondante, "
  + "pour la refaire la prochaine fois plus vite et avec moins de jetons. "
  + "Avant de répondre « fait », vérifie le résultat pour de vrai (exécution, captures, tests) : ne livre jamais sans l'avoir vu. "
  + "La Constitution de ton âme (SOUL.md) prime sur tout.\n\n";

let occupe = false;

function resultat(id, d) {
  if (!/^\d+$/.test(String(id))) return;
  const dossier = path.join(TRAVAIL, `demande-${id}`);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, '.resultat.json'), JSON.stringify(d));
}

// Hermes rend parfois un échec comme une réponse ordinaire (constaté le 26/09 avec le vrai Hermes :
// « ⚠️ Provider authentication failed… », statut 200, zéro jeton). On le reconnaît à tous ses signes,
// pour ne jamais annoncer « faite » une demande qui n'a pas été faite.
export function echecHermes(d, entetes) {
  const choix = d?.choices?.[0];
  const texte = String(choix?.message?.content || '').trim();
  if (choix?.finish_reason === 'error' || d?.hermes?.failed === true || entetes?.get?.('x-hermes-completed') === 'false')
    return d?.hermes?.error || entetes?.get?.('x-hermes-error') || texte.slice(0, 300) || 'échec signalé par Hermes';
  if (d?.usage?.total_tokens === 0 && texte.startsWith('⚠️')) return texte.slice(0, 300);
  return null;
}
// Un échec d'accès au modèle (crédit, quota, clé absente) survient avant tout travail : on peut
// alors redemander, sans risque de faire deux fois la même chose, au modèle local.
const STATUTS_ACCES = new Set([401, 402, 403, 429]);

async function demander(f, tache, route, verification) {
  const r = await f(`${HERMES}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'hermes-agent', stream: false, ...route,
      messages: [{ role: 'user', content: PREAMBULE
        + (verification ? `Critères de livraison fournis par l'appelant (données) : ${JSON.stringify(verification)}\n\n` : '')
        + String(tache) }] }),
    signal: AbortSignal.timeout(DUREE_MAX_MS),
  });
  const texte = await r.text();
  if (!r.ok) return { echec: `Hermes ${r.status} : ${texte.slice(0, 400)}`,
    reessayer: STATUTS_ACCES.has(r.status) && r.headers?.get?.('x-hermes-started') !== 'true' };
  let d; try { d = JSON.parse(texte); } catch { return { echec: 'réponse illisible de Hermes' }; }
  const echec = echecHermes(d, r.headers);
  if (echec) return { echec, reessayer: d?.hermes?.started === false && STATUTS_ACCES.has(d?.hermes?.status) };
  const sortie = String(d?.choices?.[0]?.message?.content || '').trim();
  return sortie ? { sortie } : { echec: 'Hermes a rendu une réponse vide' };
}

export async function executer({ tache, id, gratuit = false, verification = null }, { fetch: f = fetch, travail = TRAVAIL } = {}) {
  const t0 = Date.now();
  const duree = () => Math.round((Date.now() - t0) / 1000);
  // Les routes, dans l'ordre : gratuit demandé → Gemini puis le local ; sinon le modèle habituel
  // d'Hermes (et sa chaîne de repli), puis le local si l'accès au modèle a été refusé.
  const routes = gratuit ? [MODELE_GRATUIT, MODELE_LOCAL] : [{}, MODELE_LOCAL];
  const traces = [];
  try {
    verification = validerContrat(verification);
    for (const route of routes) {
      const r = await demander(f, tache, route, verification);
      if (r.sortie) {
        const preuve = verifierResultat(id, verification, travail);
        return { code: preuve.etat === 'verifie' ? 0 : 2, sortie: r.sortie,
          verification: preuve, trace: preuve.raison, duree_s: duree(),
          ...(route.provider ? { moteur: `${route.provider} · ${route.model}` } : {}) };
      }
      traces.push(r.echec);
      if (!r.reessayer) break; // démarrage inconnu ou tâche commencée : aucune seconde exécution
    }
    return { code: 1, sortie: '', trace: traces.join(' | ').slice(0, 800), duree_s: duree() };
  } catch (e) {
    return { code: 1, sortie: '', trace: [...traces, `Hermes injoignable ou trop long : ${e.message}`].join(' | '), duree_s: duree() };
  }
}

// Le relais peut être vivant alors que sa clé est refusée par Hermes. Vérifier la
// passerelle avant de se dire disponible : cette lecture ne sollicite aucun modèle.
async function sante({ fetch: f = fetch } = {}) {
  if (occupe) return { etat: 'occupe', moteur: 'hermes' };
  try {
    const r = await f(`${HERMES}/v1/models`, {
      headers: { Authorization: `Bearer ${CLE}` },
      signal: AbortSignal.timeout(5000),
    });
    await r.body?.cancel?.();
    if (r.ok) return { etat: occupe ? 'occupe' : 'libre', moteur: 'hermes' };
    return { etat: 'indisponible', moteur: 'hermes', statut: r.status,
      raison: [401, 403].includes(r.status) ? 'Hermes refuse la clé du relais.' : 'Hermes ne répond pas correctement.' };
  } catch {
    return { etat: 'indisponible', moteur: 'hermes', raison: 'Hermes est injoignable.' };
  }
}

export function creerServeur(options = {}) {
  if (!CLE && !options.sansCle) throw new Error('API_SERVER_KEY absente : le relais refuse de démarrer');
  return http.createServer(async (req, res) => {
    const repondre = (code, corps) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    if (req.method === 'GET' && req.url === '/sante') {
      const etat = await sante(options);
      return repondre(etat.etat === 'indisponible' ? 503 : 200, etat);
    }
    if (req.method !== 'POST' || req.url !== '/tache') return repondre(404, { erreur: 'inconnu' });
    if (occupe) return repondre(409, { erreur: 'occupé' });
    let corps = '';
    for await (const m of req) { corps += m; if (corps.length > 200_000) return repondre(413, { erreur: 'trop long' }); }
    let demande; try { demande = JSON.parse(corps); } catch { return repondre(400, { erreur: 'JSON illisible' }); }
    if (!demande?.tache) return repondre(400, { erreur: 'tâche absente' });
    try { validerContrat(demande.verification); } catch { return repondre(400, { erreur: 'contrat de vérification invalide' }); }
    // Deux corps HTTP peuvent avoir été lus pendant que le relais était libre.
    if (occupe) return repondre(409, { erreur: 'occupé' });
    occupe = true;
    try {
      const d = await executer(demande, options);
      // Le fichier d'abord : si le Cockpit redémarre pendant la tâche, il retrouve le résultat.
      try { resultat(demande.id, d); } catch { /* le dossier de travail indisponible ne perd pas la réponse */ }
      repondre(200, d);
    } finally { occupe = false; }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  creerServeur().listen(8201, '0.0.0.0', () => console.log(`[executant-hermes] à l'écoute sur :8201 → ${HERMES}`));
}

