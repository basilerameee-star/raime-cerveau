// BOUCLE PERMANENTE — le cœur battant de la firme.
// Un conteneur qui ne s'arrête jamais (--restart unless-stopped) : plus besoin de cron système.
// Chaque agent a son rythme ; la boucle survit aux redémarrages du serveur.
import { db, sansFrais } from './lib.js';
import pg from 'pg';
import * as experience from './experience.js';
import * as econome from './econome.js';
import * as eclaireur from './eclaireur.js';
import { createRequire } from 'node:module';
const parole = createRequire(import.meta.url)('../jarvis/parole.cjs');

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
  // EN PAUSE depuis le 2026-09-23, sur la parole de Basile : « on ne s'est pas mis d'accord
  // sur l'e-mail ». Le Heraut ne redige plus de brouillons tant que le nouveau message n'est
  // pas valide. Pour le relancer : retirer les deux barres de commentaire ci-dessous.
  // REPRIS le 2026-09-25 : Basile a dicté le message (heraut v3). Il ne rédige que des BROUILLONS ;
  // rien ne part sans la validation de Basile dans le cockpit.
  { nom: 'heraut',       module: './heraut.js',      fn: null,          toutes: 24 * H, besoinN8n: true,  cmd: 'heraut' },
  // Le reflexif passe chaque jour : il mesure les agents, designe le maillon faible et propose
  // une version de prompt INACTIVE, jamais activee par lui-meme. Mesure du 2026-09-23 : 0,0028 $.
  { nom: 'reflexif',     module: './reflexif.js',    fn: 'reflechir',   toutes: 24 * H, besoinN8n: true },
  // Le chasseur ferme la chaine de la veille : il mesure les candidats que le sas a reperes,
  // puis rouvre le sas. Deux modeles neufs par jour, trois passages chacun.
  { nom: 'chasseur',     module: './chasseur.js',    fn: 'chasser',     toutes: 24 * H, besoinN8n: false },
  // L'éclaireur : les modèles GRATUITS, repérés, mesurés par la batterie de métrologie, et les meilleurs
  // adoptés par la parole (jarvis/parole.cjs). Il remplace le chasseur tant que tout tourne sans frais.
  { nom: 'eclaireur',    module: './eclaireur.js',   fn: 'eclairer',    toutes: 24 * H, besoinN8n: false },
  // La bibliotheque avale ce qu on depose dans bibliotheque/ : notes, offres, sources.
  // Recherche en francais dans Postgres, sans appeler personne et sans depenser un centime.
  { nom: 'bibliothecaire', module: './bibliothecaire.js', fn: 'ranger', toutes: 12 * H, besoinN8n: false },
  // L'agent reflexif : il tient les buts, choisit ses sous-taches, s'evalue, corrige ses
  // croyances et pose ses questions a Basile. Premier cycle v2 mesure : 0,0062 $.
  { nom: 'architecte',   module: './architecte.js',  fn: 'architecte',  toutes: 6 * H, besoinN8n: true },
  // Le savoir general : 23 domaines voulus par Basile (finance, droit, sante, sciences,
  // quantique, philosophie, metaphysique, spiritualite, esoterisme...). 30 articles par
  // domaine et par jour, source Wikipedia (CC BY-SA), sans cle ni depense.
  // 60 par domaine depuis le 2026-09-24 : environ 1 400 articles par jour, 2 Go par mois au
  // plus, pour 131 Go libres. Le disque tient plus de cinq ans a ce rythme.
  // EN PAUSE depuis le 2026-09-25, sur la parole de Basile : « on évite les sources comme
  // Wikipédia, c'est un peu du slop ». Le savoir viendra de la recherche Internet classique
  // (moteur souverain + Gemini) et des sources premières (FEUILLE_DE_ROUTE.md).
  // { nom: 'encyclopediste', module: './encyclopediste.js', fn: 'nourrir', toutes: 24 * H, besoinN8n: false, args: { combien: 60 } },
  // Ce que Basile demande a Cortex et que la bibliotheque ignorait y entre dans l'heure.
  { nom: 'curieux',      module: './encyclopediste.js', fn: 'apprendreDemandes', toutes: 1 * H, besoinN8n: false },
  // Les yeux dehors : forums, depots de code, nouveaux modeles, travaux de recherche.
  // Quatre API publiques, tri par du code, rangement dans la bibliotheque. Cout : zero.
  { nom: 'veilleur',     module: './veilleur.js',    fn: 'veiller',     toutes: 24 * H, besoinN8n: false },
  { nom: 'prospective',  module: './prospective.js', fn: 'projeter',    toutes: 7 * 24 * H, besoinN8n: false },
  // Les portes d'entrée (CCI, organismes de formation) : 40 sites lus par jour, robots.txt
  // respecté ; un lot de 30 portes présenté à Basile quand il est prêt. RIEN n'est envoyé ici.
  { nom: 'portes',       module: './portes.js',      fn: 'portes',      toutes: 24 * H, besoinN8n: true },
  // La publicité de la semaine suivante : neuf BROUILLONS (LinkedIn, Facebook, Instagram,
  // TikTok), texte et image fixe, relus par le code. Rien n'est publié : aucun compte n'existe.
  { nom: 'publiciste',   module: './publiciste.js',  fn: 'preparerSemaine', toutes: 7 * 24 * H, besoinN8n: false },
  // La courbe de prix se construit un releve a la fois. C'est le temps l'ingredient.
  // Le penseur : la pensée de la nuit (au plus trois idées sourcées, sans conseil de placement),
  // relue par Jarvis au matin. Entre 2 h et 5 h, heure de Paris, une fois par nuit.
  { nom: 'penseur',      module: './penseur.js',     fn: 'penser',      toutes: 12 * H, besoinN8n: false, args: { garder: true }, heures: [2, 5] },
  { nom: 'metrologue', module: './metrologue.js', fn: 'mesurer', toutes: 7 * 24 * H, besoinN8n: false,
    args: { modeles: ['upstage/solar-pro4', 'deepseek/deepseek-v4-flash-0731', 'nex-agi/nex-n2-mini'] } },
];

const dernier = {};
// en-GB : l'heure seule s'écrit « 13 » ; en fr-FR elle s'écrit « 13 h », illisible comme nombre (erreur du 25/09).
const heureParis = () => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(new Date());   // mémoire en RAM ; au démarrage on lit la base pour ne pas tout relancer

// Chaque passage est noté par la boucle elle-même. Avant le 2026-09-24, seuls les agents qui
// écrivaient dans agent_runs laissaient une trace : les autres (chasseur, veilleur, sas,
// bibliothécaire...) repartaient à CHAQUE redémarrage — et le chasseur dépense. Avec la
// livraison automatique, un redémarrage par fusion aurait multiplié la facture.
async function preparer(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS boucle_passages (
      agent     text        NOT NULL,
      fin_le    timestamptz NOT NULL DEFAULT now(),
      statut    text        NOT NULL,
      duree_ms  int
    )`);
  await brain.query(`CREATE INDEX IF NOT EXISTS boucle_passages_agent ON boucle_passages(agent, fin_le DESC)`);
}

async function derniereExecution(brain, agent) {
  const { rows } = await brain.query(
    `SELECT greatest((SELECT max(created_at) FROM agent_runs WHERE agent = $1),
                     (SELECT max(fin_le) FROM boucle_passages WHERE agent = $1)) AS le`, [agent]);
  return rows[0]?.le ? new Date(rows[0].le).getTime() : 0;
}

async function noterPassage(brain, agent, statut, ms) {
  try {
    await brain.query(`INSERT INTO boucle_passages(agent, statut, duree_ms) VALUES($1,$2,$3)`, [agent, statut, ms]);
  } catch { /* la boucle ne meurt jamais d'une erreur de journalisation */ }
}

async function executer(tache, brain, n8n) {
  const t0 = Date.now();
  // La mémoire d'expérience : la situation avant, l'action, la situation après (JEPA.md).
  const avant = await experience.photographier(brain);
  const noterExperience = async (succes, resultat) => experience.noter(brain, {
    agent: tache.nom, action: tache.fn || tache.cmd || tache.nom, arguments: tache.args || {},
    avant, apres: await experience.photographier(brain), succes, resultat, duree_ms: Date.now() - t0 });
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
    await noterPassage(brain, tache.nom, 'ok', Date.now() - t0);
    await noterExperience(true, 'terminé');
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ ${tache.nom} en échec : ${e.message}`);
    await noterPassage(brain, tache.nom, 'echec', Date.now() - t0);
    await noterExperience(false, e.message);
    try {
      await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
        ['boucle', `Échec de l'agent ${tache.nom}`, e.message.slice(0, 400)]);
    } catch { /* la boucle ne meurt jamais d'une erreur de journalisation */ }
  }
}

async function main() {
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();

  await preparer(brain);
  await experience.preparer(brain);
  for (const t of RYTHMES) dernier[t.nom] = await derniereExecution(brain, t.nom);
  console.log(`[boucle] démarrée — ${RYTHMES.length} agents sous rythme`);
  for (const t of RYTHMES) {
    const dans = Math.max(0, t.toutes - (Date.now() - dernier[t.nom]));
    console.log(`  ${t.nom.padEnd(13)} toutes les ${(t.toutes / H).toFixed(0)}h — prochaine dans ${(dans / H).toFixed(1)}h`);
  }

  // Boucle infinie : on vérifie toutes les 5 minutes qui doit tourner. L'économe fixe d'abord
  // le régime de dépense : les agents payants ralentissent ou attendent si le mois dérape.
  for (;;) {
    let r = { mode: 'normal', facteur: 1, pauses: [] };
    try { r = await econome.evaluer({ brain }); } catch (e) { console.error(`[econome] lecture impossible : ${e.message}`); }
    // Sans frais (modèles gratuits), le budget ne ralentit ni n'arrête plus aucun agent.
    if (sansFrais()) r = { ...r, facteur: 1, pauses: [] };
    // Le classement des modèles gratuits mesurés par l'éclaireur : la parole des agents prend les meilleurs.
    try { await eclaireur.preparer(brain); parole.adopter(await eclaireur.classement(brain)); } catch (e) { /* ordre par défaut */ }
    for (const t of RYTHMES) {
      if (r.pauses.includes(t.nom)) continue;
      // Mesurer les prix des modèles payants n'a plus d'objet tant que tout tourne sans frais.
      if (sansFrais() && (t.nom === 'metrologue' || t.nom === 'chasseur')) continue;
      if (t.heures && (heureParis() < t.heures[0] || heureParis() >= t.heures[1])) continue;
      const toutes = t.toutes * (econome.PAYANTS.has(t.nom) ? r.facteur : 1);
      if (Date.now() - (dernier[t.nom] || 0) >= toutes) {
        dernier[t.nom] = Date.now();
        await executer(t, brain, n8n);
      }
    }
    await new Promise(r => setTimeout(r, 5 * MIN));
  }
}

main().catch(e => { console.error('[boucle] arrêt fatal :', e); process.exit(1); });
