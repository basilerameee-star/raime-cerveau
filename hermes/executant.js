// L'EXÉCUTANT HERMES — Hermes prend la place de l'ancien exécutant, derrière le Cockpit inchangé.
//
// Le Cockpit (cockpit/server.js) confie chaque demande d'action de Basile à un « exécutant » :
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

const HERMES = process.env.HERMES_URL || 'http://raime-hermes:8642';
const CLE = process.env.API_SERVER_KEY || '';
const TRAVAIL = process.env.TRAVAIL_DIR || '/travail';
const DUREE_MAX_MS = Number(process.env.EXECUTANT_DUREE_MAX_MS || 45 * 60_000);

// Ce qu'Hermes lit avant chaque demande : ses compétences à lui, et la règle d'apprentissage.
export const PREAMBULE = "Tu es Hermes, l'exécutant du cerveau rAIme, et tu travailles dans /travail. "
  + "Avant de commencer : cherche dans TES compétences celle qui fait déjà ce travail, et suis-la. "
  + "Si elle n'existe pas : cherche la meilleure méthode (bibliothèque de rAIme par le serveur raime, puis GitHub, "
  + "documentations officielles), au plus faible coût, et essaie dans /travail seulement. "
  + "À la fin d'une tâche nouvelle ou mieux réussie qu'avant : écris ou améliore la compétence correspondante, "
  + "pour la refaire la prochaine fois plus vite et avec moins de jetons. "
  + "Les consignes ci-dessous parlent d'anciens chemins de compétences (.dsh, skills-candidats) : ignore-les, "
  + "tes compétences Hermes les remplacent. La Constitution de ton âme (SOUL.md) prime sur tout.\n\n";

let occupe = false;

function resultat(id, d) {
  if (!/^\d+$/.test(String(id))) return;
  const dossier = path.join(TRAVAIL, `demande-${id}`);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, '.resultat.json'), JSON.stringify(d));
}

export async function executer({ tache, id }, { fetch: f = fetch } = {}) {
  const t0 = Date.now();
  const duree = () => Math.round((Date.now() - t0) / 1000);
  try {
    const r = await f(`${HERMES}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'hermes-agent', stream: false,
        messages: [{ role: 'user', content: PREAMBULE + String(tache) }] }),
      signal: AbortSignal.timeout(DUREE_MAX_MS),
    });
    const texte = await r.text();
    if (!r.ok) return { code: 1, sortie: '', trace: `Hermes ${r.status} : ${texte.slice(0, 400)}`, duree_s: duree() };
    let d; try { d = JSON.parse(texte); } catch { return { code: 1, sortie: '', trace: 'réponse illisible de Hermes', duree_s: duree() }; }
    const sortie = String(d?.choices?.[0]?.message?.content || '').trim();
    return sortie ? { code: 0, sortie, duree_s: duree() } : { code: 1, sortie: '', trace: 'Hermes a rendu une réponse vide', duree_s: duree() };
  } catch (e) {
    return { code: 1, sortie: '', trace: `Hermes injoignable ou trop long : ${e.message}`, duree_s: duree() };
  }
}

export function creerServeur(options = {}) {
  if (!CLE && !options.sansCle) throw new Error('API_SERVER_KEY absente : le relais refuse de démarrer');
  return http.createServer(async (req, res) => {
    const repondre = (code, corps) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    if (req.method === 'GET' && req.url === '/sante') return repondre(200, { etat: occupe ? 'occupe' : 'libre', moteur: 'hermes' });
    if (req.method !== 'POST' || req.url !== '/tache') return repondre(404, { erreur: 'inconnu' });
    if (occupe) return repondre(409, { erreur: 'occupé' });
    let corps = '';
    for await (const m of req) { corps += m; if (corps.length > 200_000) return repondre(413, { erreur: 'trop long' }); }
    let demande; try { demande = JSON.parse(corps); } catch { return repondre(400, { erreur: 'JSON illisible' }); }
    if (!demande?.tache) return repondre(400, { erreur: 'tâche absente' });
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
