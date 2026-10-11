// BOUCLE PERMANENTE — le cœur battant de la firme.
// Un conteneur qui ne s'arrête jamais (--restart unless-stopped) : plus besoin de cron système.
// Chaque agent a son rythme ; la boucle survit aux redémarrages du serveur.
import { db, sansFrais } from './lib.js';
import pg from 'pg';
import * as experience from './experience.js';
import * as econome from './econome.js';
import * as eclaireur from './eclaireur.js';
import * as reflexivite from './reflexivite.js';
import { RYTHMES } from './rythmes.js';
import { createRequire } from 'node:module';
const parole = createRequire(import.meta.url)('../jarvis/parole.cjs');

const MIN = 60_000, H = 60 * MIN;

// Les rythmes de chaque agent : agents/rythmes.js (lus aussi par le Directeur).


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
  const avant = await experience.photographier(brain).catch(() => ({}));
  const noterExperience = async (succes, resultat) => {
    try { await experience.noter(brain, {
      agent: tache.nom, action: tache.fn || tache.cmd || tache.nom, arguments: tache.args || {},
      avant, apres: await experience.photographier(brain), succes, resultat, duree_ms: Date.now() - t0 }); }
    catch (e) { console.error(`[experience] ${e.message}`); }
  };
  try {
    if (tache.cmd === 'prospection') {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const r = await promisify(execFile)('node', ['agents/prospection_auto.js','14'],
        {cwd:'/app',timeout:15*60_000,killSignal:'SIGKILL',maxBuffer:1024*1024});
      if (r.stdout) process.stdout.write(r.stdout); if (r.stderr) process.stderr.write(r.stderr);
    } else {
      const mod = await import(tache.module);
      await mod[tache.fn]({ brain, n8n, rythmes: RYTHMES, ...(tache.args || {}) });   // les rythmes : pour le Directeur
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
  await reflexivite.preparer(brain);
  // Connexion dédiée : NOTIFY réveille immédiatement sans concurrencer les requêtes
  // des agents sur brain. Le rattrapage toutes les cinq minutes couvre les signaux perdus.
  const reaction = db(); await reaction.connect();
  let reactionOccupee = false;
  const reagir = async () => {
    if (reactionOccupee) return;
    reactionOccupee = true;
    try {
      const { suivreOutil } = await import('./outils_autonomes.js');
      await reflexivite.suivre({ brain: reaction, lireOutil: suivreOutil });
      await reflexivite.traiter({ brain: reaction });
    } catch(e) { console.error(`[reflexivite] ${e.message}`); }
    finally { reactionOccupee = false; }
  };
  reaction.on('notification', () => { void reagir(); });
  reaction.on('error', e => { console.error(`[reflexivite] connexion perdue : ${e.message}`); process.exit(1); });
  await reaction.query('LISTEN raime_reflexivite');
  for (const t of RYTHMES) dernier[t.nom] = await derniereExecution(brain, t.nom);
  console.log(`[boucle] démarrée — ${RYTHMES.length} agents sous rythme`);
  for (const t of RYTHMES) {
    const dans = Math.max(0, t.toutes - (Date.now() - dernier[t.nom]));
    console.log(`  ${t.nom.padEnd(13)} toutes les ${(t.toutes / H).toFixed(0)}h — prochaine dans ${(dans / H).toFixed(1)}h`);
  }

  // Boucle infinie : on vérifie toutes les 5 minutes qui doit tourner. L'économe fixe d'abord
  // le régime de dépense : les agents payants ralentissent ou attendent si le mois dérape.
  for (;;) {
    await reagir();
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

