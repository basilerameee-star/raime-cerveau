// AGENT SUPERVISEUR — le contrôleur général de la firme.
// Il ne rédige pas un rapport : il CONSTATE, il DÉCIDE, et il agit sur ce qui est sûr.
//
// Doctrine : les FAITS sont collectés par du code (SQL, déterministe, gratuit).
// Le modèle n'intervient que sur le JUGEMENT — quoi prioriser, quelle décision prendre.
import { askJson, db, logRun, money } from './lib.js';
import pg from 'pg';

const PROMPT_VERSION = 'superviseur-v1';

// Seuils déterministes — la règle est dans le code, pas dans le prompt.
const SEUILS = {
  source_morte_jours: 7,
  workflow_dormant_jours: 7,
  catalogue_perime_jours: 2,
  file_envoi_min: 12,        // au moins un jour de plafond d'avance
  taux_reponse_alerte: 1.0,  // % en dessous duquel on alerte
};

async function collecter(brain, n8n) {
  const f = {};

  // — Commerce
  const { rows: fun } = await n8n.query(`
    SELECT (SELECT count(*) FROM prospects) AS prospects,
           (SELECT count(*) FROM prospects WHERE contact_email <> '') AS avec_email,
           (SELECT count(*) FROM outreach WHERE sent_at IS NULL AND status='brouillon') AS en_file,
           (SELECT count(*) FROM outreach WHERE sent_at IS NOT NULL) AS envoyes,
           (SELECT count(*) FROM outreach WHERE reply_at IS NOT NULL) AS reponses,
           (SELECT count(*) FROM outreach WHERE sent_at::date = now()::date) AS envoyes_aujourdhui`);
  f.commerce = fun[0];
  f.commerce.taux_reponse = f.commerce.envoyes > 0
    ? +(100 * f.commerce.reponses / f.commerce.envoyes).toFixed(2) : null;
  const { rows: cfg } = await n8n.query('SELECT mode, from_name, daily_cap FROM send_config WHERE id=1');
  f.envoi = cfg[0] || null;

  // — Veille (santé des sources)
  const { rows: src } = await n8n.query(`
    SELECT source, count(*)::int AS items, (now()::date - max(captured_at)::date) AS silence
    FROM veille_ia GROUP BY source ORDER BY silence DESC`);
  f.sources = src;
  f.sources_mortes = src.filter(s => s.silence >= SEUILS.source_morte_jours).map(s => `${s.source} (${s.silence}j)`);
  f.sources_vivantes = src.filter(s => s.silence < SEUILS.source_morte_jours).length;

  // — Workflows
  const { rows: wf } = await n8n.query(`
    SELECT w.name, w.active,
           (SELECT max(e."startedAt") FROM execution_entity e WHERE e."workflowId" = w.id) AS derniere
    FROM workflow_entity w WHERE w.active = true`);
  f.workflows_actifs = wf.length;
  f.workflows_dormants = wf.filter(w => !w.derniere ||
    (Date.now() - new Date(w.derniere)) / 864e5 > SEUILS.workflow_dormant_jours).map(w => w.name);
  const { rows: err } = await n8n.query(
    `SELECT count(*)::int AS n FROM execution_entity WHERE status='error' AND "startedAt" > now() - interval '7 days'`);
  f.erreurs_7j = err[0].n;

  // — Cerveau
  const { rows: br } = await brain.query(`
    SELECT (SELECT count(*) FROM models) AS modeles,
           (SELECT (now()::date - max(as_of)) FROM models WHERE source='openrouter') AS catalogue_age_jours,
           (SELECT count(*) FROM kb_documents) AS documents,
           (SELECT count(*) FROM sector_automations) AS automatisations,
           (SELECT count(*) FROM audits) AS audits,
           (SELECT count(*) FROM radar_events WHERE seen_at > now() - interval '7 days') AS evenements_7j`);
  f.cerveau = br[0];

  // — Économie
  const { rows: co } = await brain.query(`
    SELECT round(coalesce(sum(cost_usd),0)::numeric,4) AS cout_7j, count(*)::int AS appels_7j,
           count(*) FILTER (WHERE status = 'parse_error')::int AS echecs_techniques_7j,
           count(*) FILTER (WHERE status = 'refuse')::int AS brouillons_refuses_par_garde_fou_7j
    FROM agent_runs WHERE created_at > now() - interval '7 days'`);
  f.economie = co[0];

  // — Mémoire des changements récents : évite de recommander de défaire ce qui vient d'être réparé.
  const { rows: jr } = await brain.query(
    `SELECT acteur, changement, motif, created_at::date AS le
     FROM journal WHERE created_at > now() - interval '10 days' ORDER BY created_at DESC LIMIT 12`);
  // — Ce que les instruments ont relevé. Sans cette lecture, mesurer ne sert a rien :
  // c'est exactement le defaut qui a laisse passer la hausse de prix de 69 %.
  const { rows: rel } = await brain.query(
    "SELECT mesures FROM releves ORDER BY created_at DESC LIMIT 1");
  f.instruments = rel.length ? rel[0].mesures : null;

  // — Le radar de mesure : ce qui sort, et surtout ce que des acheteurs paient.
  const { rows: rad } = await n8n.query(
    "SELECT source, count(*)::int AS items FROM veille_ia WHERE captured_at > now() - interval '48 hours' AND source LIKE '%.%' GROUP BY source ORDER BY 2 DESC");
  f.radar_48h = rad;
  const { rows: prix } = await n8n.query(
    "SELECT left(title, 110) AS marche, summary FROM veille_ia WHERE source = 'BOAMP . marches publics' OR source LIKE 'BOAMP%' ORDER BY published_at DESC NULLS LAST LIMIT 5");
  f.prix_marche_observes = prix;

  // — LE POINT LE PLUS CHER DE LA MAISON : une reponse reelle non traitee.
  // Un prospect qui ecrit et qu'on laisse attendre est le seul echec irrattrapable.
  const { rows: att } = await n8n.query(
    "SELECT from_email, subject, received_at, round(extract(epoch from (now() - received_at)) / 3600) AS heures FROM replies WHERE handled = false AND from_email NOT ILIKE '%noreply%' AND from_email NOT ILIKE '%no-reply%' AND from_email NOT ILIKE '%@google.com' AND from_email NOT ILIKE '%@linkedin.com' AND from_email NOT ILIKE '%notification%' ORDER BY received_at");
  f.reponses_en_attente = att;

  f.changements_recents = jr;

  return f;
}

// Règles déterministes → anomalies certaines (pas d'interprétation nécessaire)
function anomalies(f) {
  const a = [];
  if (f.sources_mortes.length)
    a.push({ gravite: 'elevee', constat: `${f.sources_mortes.length} source(s) de veille silencieuse(s) depuis plus de ${SEUILS.source_morte_jours} jours : ${f.sources_mortes.slice(0, 6).join(', ')}` });
  if (f.sources_vivantes < 3)
    a.push({ gravite: 'elevee', constat: `Seulement ${f.sources_vivantes} source(s) de veille encore active(s) : la Vigie ne remplit plus son rôle` });
  if (f.commerce.en_file < SEUILS.file_envoi_min)
    a.push({ gravite: 'moyenne', constat: `File d'envoi à ${f.commerce.en_file} messages (moins d'un jour de plafond) : le Héraut doit reconstituer le stock` });
  const messageRecemmentChange = (f.changements_recents || []).some(c => /message|Heraut|réécrit|reecrit/i.test(c.changement));
  if (f.commerce.envoyes > 50 && (f.commerce.taux_reponse ?? 0) < SEUILS.taux_reponse_alerte)
    a.push({ gravite: messageRecemmentChange ? 'faible' : 'elevee',
      constat: `Taux de réponse à ${f.commerce.taux_reponse}% sur ${f.commerce.envoyes} envois`
        + (messageRecemmentChange ? " — mais le message vient d'être réécrit : mesurer sur les nouveaux envois avant de conclure" : " : le message ou le ciblage sont à revoir") });
  if (f.cerveau.catalogue_age_jours > SEUILS.catalogue_perime_jours)
    a.push({ gravite: 'moyenne', constat: `Catalogue de modèles vieux de ${f.cerveau.catalogue_age_jours} jours : la sync OpenRouter doit être relancée` });
  if (f.workflows_dormants.length)
    a.push({ gravite: 'moyenne', constat: `${f.workflows_dormants.length} workflow(s) actif(s) mais sans exécution récente : ${f.workflows_dormants.slice(0, 5).join(', ')}` });
  if ((f.reponses_en_attente || []).length) {
    const vieille = Math.max(...f.reponses_en_attente.map(x => Number(x.heures) || 0));
    a.push({ gravite: 'elevee',
      constat: `${f.reponses_en_attente.length} reponse(s) de prospect non traitee(s), la plus ancienne depuis ${vieille} h. C'est le seul echec irrattrapable de la maison.` });
  }
  const ins = f.instruments;
  if (ins && ins.enrichissement && ins.enrichissement.couverture_pct !== null && ins.enrichissement.couverture_pct < 20)
    a.push({ gravite: 'elevee',
      constat: `Enrichissement a ${ins.enrichissement.couverture_pct} % : ${ins.enrichissement.injoignables} prospects sans adresse. Tout le commerce est bride par ce chiffre, aucune amelioration du message ne le compense.` });
  if (ins && ins.veille && ins.veille.mortes > 5)
    a.push({ gravite: 'moyenne',
      constat: `${ins.veille.mortes} sources de veille muettes depuis plus de 7 jours sur ${ins.veille.sources}.` });
  if (ins && Array.isArray(ins.derive) && ins.derive.length)
    a.push({ gravite: 'elevee',
      constat: `Derive de prix non repercutee : ${ins.derive.map(d => `${d.modele} ${d.ecart_pct > 0 ? '+' : ''}${d.ecart_pct} %`).join(', ')}. Nos couts annonces sont faux.` });
  if (!f.radar_48h || !f.radar_48h.length)
    a.push({ gravite: 'moyenne', constat: "Le radar de mesure n'a rien capte depuis 48 h : sources a verifier." });
  if (f.erreurs_7j > 0)
    a.push({ gravite: 'faible', constat: `${f.erreurs_7j} exécution(s) en erreur sur 7 jours` });
  if (f.envoi && f.envoi.from_name && /amy/i.test(f.envoi.from_name))
    a.push({ gravite: 'elevee', constat: `L'expéditeur affiché est « ${f.envoi.from_name} » : incohérent avec la signature humaine` });
  return a;
}

const SYSTEM = `Tu es le Superviseur d'un cabinet d'audit IA opéré par des agents.
On te remet des FAITS mesurés et des ANOMALIES détectées par des règles déterministes.

Ton rôle n'est PAS de résumer : c'est de DÉCIDER. Pour chaque sujet qui compte, tu produis
une décision actionnable, avec un responsable (agent ou humain) et une échéance.

Tu prends de l'INITIATIVE : si un signal indique une opportunité ou un risque que personne
n'a demandé d'examiner, tu le soulèves.

Tu hiérarchises impitoyablement : 3 à 6 décisions maximum, celles qui changent réellement
la trajectoire. Tu ignores le bruit.

IMPORTANT — les FAITS incluent un journal des CHANGEMENTS RÉCENTS. Un indicateur dégradé dont
la cause vient d'être corrigée ne doit PAS déclencher une décision corrective : il doit être mis
sous observation, le temps que la correction produise ses effets. Ne recommande jamais de défaire
une correction récente.

PRIORITE ABSOLUE — si des reponses de prospects sont en attente, c'est le premier sujet
de ton rapport, avant tout le reste. Une machine qui tourne parfaitement pendant qu'un
client potentiel attend une reponse a echoue.

Objectif de la firme : vendre du conseil et de l'audit IA indépendant à des PME, avec des
agents surperformants, et une capitalisation continue de la connaissance.

Réponds UNIQUEMENT en JSON :
{
  "etat_general": "sain|vigilance|critique",
  "resume": "2 phrases pour un dirigeant pressé",
  "decisions": [
    {"sujet":"", "constat":"", "decision":"l'action précise à mener", "responsable":"agent:<nom>|humain",
     "echeance":"immediate|24h|semaine", "gravite":"faible|moyenne|elevee", "gain_attendu":""}
  ],
  "initiatives": ["ce que personne n'a demandé mais qui mérite d'être lancé"],
  "a_surveiller": ["signaux faibles à confirmer"]
}`;

export async function superviser({ brain, n8n }) {
  const faits = await collecter(brain, n8n);
  const anos = anomalies(faits);

  const user = `## FAITS MESURÉS
${JSON.stringify(faits)}

## CHANGEMENTS RÉCENTS (déjà appliqués — à prendre en compte avant toute décision)
${(faits.changements_recents || []).map(c => `- [${c.le}] ${c.changement} (motif : ${c.motif})`).join(String.fromCharCode(10)) || '- aucun'}

## ANOMALIES DÉTECTÉES (règles déterministes)
${anos.length ? anos.map(a => `- [${a.gravite}] ${a.constat}`).join('\n') : '- aucune'}

Décide.`;

  const res = await askJson({ task: 'raisonnement', system: SYSTEM, user, maxTokens: 9000, temperature: 0.2 });
  const r = res.meta;
  const d = res.data || { etat_general: 'vigilance', resume: 'Analyse indisponible', decisions: [], initiatives: [] };

  // Trace : l'état est historisé pour suivre l'évolution dans le temps.
  await brain.query(
    `INSERT INTO supervision(etat, resume, faits, anomalies, decisions, modele, cout_usd)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [d.etat_general || 'vigilance', d.resume || null, JSON.stringify(faits), JSON.stringify(anos),
     JSON.stringify({ decisions: d.decisions || [], initiatives: d.initiatives || [], a_surveiller: d.a_surveiller || [] }),
     r.model, r.costUsd]);
  await logRun(brain, { agent: 'superviseur', task: 'raisonnement', model: r.model, tokensIn: r.tokensIn,
    tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status: res.status, promptVersion: PROMPT_VERSION });

  return { faits, anomalies: anos, rapport: d, meta: { model: r.model, cout: money(r.costUsd), ms: r.ms } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const s = await superviser({ brain, n8n });
    const d = s.rapport;
    console.log(`\n╔══ SUPERVISION — état : ${String(d.etat_general).toUpperCase()} ══╗\n`);
    console.log(`${d.resume}\n`);
    console.log(`ANOMALIES DÉTECTÉES (${s.anomalies.length}) :`);
    s.anomalies.forEach(a => console.log(`  [${a.gravite}] ${a.constat}`));
    console.log(`\nDÉCISIONS :`);
    (d.decisions || []).forEach((x, i) =>
      console.log(`  ${i + 1}. [${x.gravite}·${x.echeance}] ${x.sujet}\n     → ${x.decision}\n     responsable : ${x.responsable} | gain : ${x.gain_attendu}`));
    console.log(`\nINITIATIVES :`);
    (d.initiatives || []).forEach(x => console.log(`  • ${x}`));
    console.log(`\n[superviseur] ${s.meta.model} · ${s.meta.cout} · ${s.meta.ms} ms`);
  } finally { await brain.end(); await n8n.end(); }
}
