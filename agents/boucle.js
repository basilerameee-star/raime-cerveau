// BOUCLE PERMANENTE — le cœur battant de la firme.
// Un conteneur qui ne s'arrête jamais (--restart unless-stopped) : plus besoin de cron système.
// Chaque agent a son rythme ; la boucle survit aux redémarrages du serveur.
import { db } from './lib.js';
import pg from 'pg';

const MIN = 60_000, H = 60 * MIN;

// Rythmes : intervalle minimal entre deux exécutions d'un même agent.
const RYTHMES = [
  // Le cordon passe AVANT tout le reste : un message fautif annulé tard est un message parti.
  { nom: 'cordon', module: './cordon.js', fn: 'cordon', toutes: 1 * H, besoinN8n: true },
  // Les instruments passent en premier : les agents de jugement lisent ce qu'ils posent.
  { nom: 'instruments', module: './instruments.js', fn: 'relever', toutes: 1 * H, besoinN8n: true },
  // Le sas : ce que le radar rapporte passe par la porte avant d'entrer.
  { nom: 'sas', module: './sas.js', fn: 'balayer', toutes: 12 * H, besoinN8n: false },
  // Le radar de mesure : ce qui sort, à quel prix, et ce que des acheteurs paient.
  { nom: 'radar', module: './radar.js', fn: 'scruter', toutes: 6 * H, besoinN8n: true },
  // Le plus fréquent : une réponse non réconciliée est une réponse invisible.
  { nom: 'reconciliateur', module: './reconciliateur.js', fn: 'reconcilier', toutes: 2 * H, besoinN8n: true },
  { nom: 'superviseur',  module: './superviseur.js', fn: 'superviser', toutes: 4 * H,   besoinN8n: true },
  { nom: 'sync',         module: null,               fn: null,          toutes: 12 * H, besoinN8n: false, cmd: 'sync' },
  { nom: 'heraut',       module: './heraut.js',      fn: null,          toutes: 24 * H, besoinN8n: true,  cmd: 'heraut' },
  // Le reflexif passe chaque jour : il mesure les agents, designe le maillon faible et propose
  // une version de prompt INACTIVE, jamais activee par lui-meme. Mesure du 2026-09-23 : 0,0028 $.
  { nom: 'reflexif',     module: './reflexif.js',    fn: 'reflechir',   toutes: 24 * H, besoinN8n: true },
  // Le chasseur ferme la chaine de la veille : il mesure les candidats que le sas a reperes,
  // puis rouvre le sas. Deux modeles neufs par jour, trois passages chacun.
  { nom: 'chasseur',     module: './chasseur.js',    fn: 'chasser',     toutes: 24 * H, besoinN8n: false },
  // La bibliotheque avale ce qu on depose dans bibliotheque/ : notes, offres, sources.
  // Recherche en francais dans Postgres, sans appeler personne et sans depenser un centime.
  { nom: 'bibliothecaire', module: './bibliothecaire.js', fn: 'ranger', toutes: 12 * H, besoinN8n: false },
  { nom: 'prospective',  module: './prospective.js', fn: 'projeter',    toutes: 7 * 24 * H, besoinN8n: false },
  // La courbe de prix se construit un releve a la fois. C'est le temps l'ingredient.
  { nom: 'metrologue', module: './metrologue.js', fn: 'mesurer', toutes: 7 * 24 * H, besoinN8n: false,
    args: { modeles: ['upstage/solar-pro4', 'deepseek/deepseek-v4-flash-0731', 'nex-agi/nex-n2-mini'] } },
];

const dernier = {};   // mémoire en RAM ; au démarrage on lit la base pour ne pas tout relancer

async function derniereExecution(brain, agent) {
  const { rows } = await brain.query(
    `SELECT max(created_at) AS le FROM agent_runs WHERE agent = $1`, [agent]);
  return rows[0]?.le ? new Date(rows[0].le).getTime() : 0;
}

async function executer(tache, brain, n8n) {
  const t0 = Date.now();
  try {
    if (tache.cmd === 'sync') {
      const { execSync } = await import('node:child_process');
      execSync('node sync/openrouter_sync.js', { stdio: 'inherit', cwd: '/app' });
    } else if (tache.cmd === 'heraut') {
      const { execSync } = await import('node:child_process');
      execSync('node agents/heraut.js 14', { stdio: 'inherit', cwd: '/app' });
    } else {
      const mod = await import(tache.module);
      await mod[tache.fn]({ brain, n8n, ...(tache.args || {}) });
    }
    console.log(`[${new Date().toISOString()}] ✓ ${tache.nom} terminé en ${Math.round((Date.now() - t0) / 1000)}s`);
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ ${tache.nom} en échec : ${e.message}`);
    try {
      await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
        ['boucle', `Échec de l'agent ${tache.nom}`, e.message.slice(0, 400)]);
    } catch { /* la boucle ne meurt jamais d'une erreur de journalisation */ }
  }
}

async function main() {
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();

  for (const t of RYTHMES) dernier[t.nom] = await derniereExecution(brain, t.nom);
  console.log(`[boucle] démarrée — ${RYTHMES.length} agents sous rythme`);
  for (const t of RYTHMES) {
    const dans = Math.max(0, t.toutes - (Date.now() - dernier[t.nom]));
    console.log(`  ${t.nom.padEnd(13)} toutes les ${(t.toutes / H).toFixed(0)}h — prochaine dans ${(dans / H).toFixed(1)}h`);
  }

  // Boucle infinie : on vérifie toutes les 5 minutes qui doit tourner.
  for (;;) {
    for (const t of RYTHMES) {
      if (Date.now() - (dernier[t.nom] || 0) >= t.toutes) {
        dernier[t.nom] = Date.now();
        await executer(t, brain, n8n);
      }
    }
    await new Promise(r => setTimeout(r, 5 * MIN));
  }
}

main().catch(e => { console.error('[boucle] arrêt fatal :', e); process.exit(1); });
