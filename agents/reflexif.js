// AGENT RÉFLEXIF — l'agent qui améliore les autres agents.
//
// C'est la pièce qui rend la firme capable de se corriger seule : il mesure la performance
// réelle de chaque agent, diagnostique le maillon faible, et RÉÉCRIT son prompt en proposant
// une nouvelle version.
//
// AUTONOMIE BORNÉE (pilier ⑤) : il ne peut jamais activer sa propre proposition.
// Une version est créée INACTIVE. L'activation exige soit un test de non-régression réussi,
// soit une validation humaine. Toute version est réversible en une requête.
import { askJson, db, logRun, money } from './lib.js';
import pg from 'pg';

const PROMPT_VERSION = 'reflexif-v1';

async function performances(brain, n8n) {
  const p = {};

  // Performance par agent : fiabilité, coût, vitesse
  const { rows: ag } = await brain.query(`
    SELECT agent,
           count(*)::int AS appels,
           count(*) FILTER (WHERE status IN ('ok','brouillon'))::int AS produits,
           count(*) FILTER (WHERE status='parse_error')::int AS echecs_techniques,
           count(*) FILTER (WHERE status='refuse')::int AS refus_garde_fou,
           round(avg(duration_ms)/1000.0,1) AS duree_moy_s,
           round(sum(cost_usd)::numeric,4) AS cout_total,
           round(avg(cost_usd)::numeric,5) AS cout_moyen
    FROM agent_runs WHERE created_at > now() - interval '30 days'
    GROUP BY agent ORDER BY appels DESC`);
  // PRODUIRE n'est pas RÉUSSIR. Un agent peut produire 100% de livrables sans aucun effet réel.
  // On sépare donc explicitement les deux, sinon le Réflexif optimise du vide.
  p.agents = ag.map(a => ({ ...a,
    taux_production: a.appels ? +(100 * a.produits / a.appels).toFixed(1) : null }));

  // Qualité des audits : ce que le Contradicteur reproche à l'Auditeur
  const { rows: q } = await brain.query(`
    SELECT count(*)::int AS audits,
           round(avg((scores->>'global')::numeric),2) AS score_moyen,
           avg(jsonb_array_length(coalesce(cost_model->'contradiction'->'objections','[]'::jsonb)))::numeric(4,1) AS objections_moy
    FROM audits WHERE jsonb_array_length(findings) > 0`);
  p.qualite_audits = q[0];

  // Efficacité commerciale réelle
  const { rows: c } = await n8n.query(`
    SELECT count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS envoyes,
           count(*) FILTER (WHERE reply_at IS NOT NULL)::int AS reponses,
           count(*) FILTER (WHERE status='brouillon')::int AS en_file
    FROM outreach`);
  p.commercial = c[0];
  // LE SEUL VRAI RÉSULTAT du Héraut : des réponses, pas des brouillons.
  p.commercial.taux_reponse_pct = c[0].envoyes ? +(100 * c[0].reponses / c[0].envoyes).toFixed(2) : null;
  p.resultats_observables = {
    heraut: `${c[0].reponses} réponse(s) sur ${c[0].envoyes} envoi(s) — c'est LA mesure de succès du Héraut`,
    auditeur: `${(await brain.query("SELECT count(*)::int n FROM audits")).rows[0].n} audit(s) produits, aucune mesure de satisfaction client encore disponible`,
    note: "Aucun agent ne dispose encore d'une boucle de retour client. Toute conclusion sur la QUALITÉ est donc une hypothèse, pas une mesure."
  };

  // L'etat du marche, repris du flux « Athena » qui tournait chaque soir : sans lui, le
  // Reflexif juge les agents sans savoir si la reserve de prospects se vide ou se remplit.
  try {
    const { rows: m } = await n8n.query(`
      SELECT (SELECT count(*) FROM prospects)::int AS prospects,
             (SELECT count(*) FROM prospects WHERE status = 'nouveau')::int AS reserve,
             (SELECT count(*) FROM prospects WHERE contact_email IS NOT NULL)::int AS avec_email,
             (SELECT count(*) FROM prospects WHERE status = 'client')::int AS clients,
             (SELECT count(*) FROM veille_ia WHERE captured_at > now() - interval '7 days')::int AS veille_7j,
             (SELECT count(*) FROM system_learnings WHERE resolved = false)::int AS decouvertes_ouvertes,
             (SELECT string_agg(segment || ' (' || c || ')', ', ')
                FROM (SELECT segment, count(*) c FROM prospects GROUP BY segment ORDER BY c DESC LIMIT 6) t) AS segments`);
    p.marche = m[0];
  } catch (e) {
    p.marche = { indisponible: e.message.slice(0, 120) };
  }

  // Versions de prompts en circulation
  const { rows: v } = await brain.query(`
    SELECT agent, version, active, created_at::date AS le, motif
    FROM prompt_versions ORDER BY agent, created_at DESC`);
  p.versions = v;

  // Mémoire des corrections déjà appliquées : sans elle, le Réflexif corrige ce qui vient
  // d'être corrigé et détruit le travail en cours. Même leçon que pour le Superviseur.
  const { rows: j } = await brain.query(
    `SELECT acteur, changement, motif, created_at::date AS le
     FROM journal WHERE created_at > now() - interval '14 days' ORDER BY created_at DESC LIMIT 15`);
  p.changements_recents = j;

  return p;
}

const SYSTEM = `Tu es l'agent Réflexif d'un cabinet d'audit IA opéré par des agents.
Ta mission unique : rendre les autres agents meilleurs.

On te remet leurs PERFORMANCES MESURÉES.

DISTINCTION FONDAMENTALE — ne la confonds jamais :
- taux_production = l'agent a produit un livrable. Cela ne prouve RIEN sur son efficacité.
- resultats_observables = l'effet réel dans le monde (réponses obtenues, missions vendues).
Un agent à 100% de production et 0% de résultat n'a pas un problème technique : il a un
problème de CONTENU ou de CIBLAGE. Ne propose jamais de corriger sa fiabilité dans ce cas.

Quand aucun résultat n'est encore observable (échantillon trop faible, changement récent),
dis-le et REFUSE de conclure : réclamer une mesure est une réponse valable et souvent la bonne.

RÈGLE ABSOLUE — les faits contiennent un journal des CHANGEMENTS RÉCENTS. Si la cause d'un
mauvais chiffre vient d'être corrigée, tu ne proposes AUCUNE nouvelle modification sur cet
agent : tu demandes de laisser la correction produire ses effets et tu fixes le volume
nécessaire pour conclure. Empiler deux corrections rend les deux inévaluables.

Méthode :
1. Identifie LE maillon faible — un seul, le plus coûteux pour la firme. Ne disperse pas.
2. Diagnostique la CAUSE probable, en t'appuyant sur les chiffres, pas sur une impression.
3. Propose une AMÉLIORATION PRÉCISE de son instruction : ce qu'il faut ajouter, retirer ou
   reformuler dans son prompt, et pourquoi cela corrigera la cause.
4. Définis le CRITÈRE DE SUCCÈS mesurable qui permettra de dire, dans 30 exécutions, si
   l'amélioration a fonctionné — et le seuil en dessous duquel il faut revenir en arrière.

Règles :
- Un taux de refus par garde-fou n'est PAS un échec : c'est le contrôle qualité qui fonctionne.
- Tu ne diagnostiques jamais une cause que les chiffres ne permettent pas de distinguer.
  Si deux causes expliquent le même chiffre, nomme les deux et dis quelle mesure les départagerait.
  Il ne devient un problème que s'il est massif (le prompt produit trop de rebuts).
- Un coût élevé sur un agent de jugement est normal ; sur un agent d'extraction, c'est une anomalie.
- Tu ne proposes jamais d'affaiblir un garde-fou pour améliorer un taux de réussite.
- Si aucun agent ne mérite d'être modifié, dis-le franchement : la stabilité a de la valeur.

Réponds UNIQUEMENT en JSON :
{
  "diagnostic_general": "l'état de la troupe en 2 phrases",
  "maillon_faible": {"agent":"", "constat_chiffre":"", "cause_probable":""},
  "amelioration": {
    "agent":"", "nature":"ajout|retrait|reformulation|seuil",
    "instruction_a_ajouter":"le texte exact à intégrer dans son prompt",
    "pourquoi":"",
    "critere_de_succes":"la mesure qui prouvera que ça marche",
    "seuil_de_retour_arriere":"quand annuler"
  },
  "agents_a_laisser_tranquilles": ["ceux qui fonctionnent bien : ne pas toucher"],
  "mesure_manquante": "l'instrument qu'il faudrait poser pour décider correctement la prochaine fois",
  "risque_de_la_modification": ""
}`;

export async function reflechir({ brain, n8n }) {
  const perf = await performances(brain, n8n);
  const user = `## PERFORMANCES MESURÉES (30 derniers jours)
${JSON.stringify(perf)}

Identifie le maillon faible et propose une amélioration.`;

  const res = await askJson({ task: 'raisonnement', system: SYSTEM, user, maxTokens: 9000, temperature: 0.2 });
  const r = res.meta;
  const d = res.data || {};

  // La proposition est enregistrée INACTIVE. Aucune auto-activation possible.
  let versionCree = null;
  const am = d.amelioration;
  // Une recommandation d'INACTION ne doit produire aucun artefact : sinon la table se remplit
  // de fausses versions et l'historique devient illisible.
  const estUneVraieModification = am && ['ajout','retrait','reformulation'].includes(am.nature)
    && am.instruction_a_ajouter && !/aucune modification|ne rien changer|laisser/i.test(am.instruction_a_ajouter);
  if (estUneVraieModification) {
    const { rows } = await brain.query(
      `SELECT coalesce(max(version),0)+1 AS v FROM prompt_versions WHERE agent=$1`, [am.agent]);
    const v = rows[0].v;
    await brain.query(
      `INSERT INTO prompt_versions(agent, version, active, instruction, motif, critere_succes, seuil_retour, propose_par)
       VALUES($1,$2,false,$3,$4,$5,$6,'reflexif')`,
      [am.agent, v, am.instruction_a_ajouter, `${am.nature} — ${am.pourquoi}`,
       am.critere_de_succes || null, am.seuil_de_retour_arriere || null]);
    versionCree = { agent: am.agent, version: v };
    await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['reflexif', `Proposition d'amélioration v${v} pour l'agent ${am.agent} (INACTIVE, en attente de validation)`,
       (am.pourquoi || '').slice(0, 400)]);
  }

  await logRun(brain, { agent: 'reflexif', task: 'raisonnement', model: r.model, tokensIn: r.tokensIn,
    tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status: res.status, promptVersion: PROMPT_VERSION });

  return { performances: perf, rapport: d, versionCree, meta: { model: r.model, cout: money(r.costUsd), ms: r.ms } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const x = await reflechir({ brain, n8n });
    const d = x.rapport;
    console.log(`\n╔══ AGENT RÉFLEXIF ══╗\n`);
    console.log(`DIAGNOSTIC :\n  ${d.diagnostic_general}\n`);
    console.log(`PERFORMANCE PAR AGENT :`);
    x.performances.agents.forEach(a =>
      console.log(`  ${String(a.agent).padEnd(14)} ${String(a.appels).padStart(3)} appels · ${String(a.taux_production).padStart(5)}% production · ${a.duree_moy_s}s · ${a.cout_total}$`));
    if (d.maillon_faible) {
      console.log(`\nMAILLON FAIBLE : ${d.maillon_faible.agent}`);
      console.log(`  constat : ${d.maillon_faible.constat_chiffre}`);
      console.log(`  cause   : ${d.maillon_faible.cause_probable}`);
    }
    if (d.amelioration) {
      console.log(`\nAMÉLIORATION PROPOSÉE (${d.amelioration.nature}) sur ${d.amelioration.agent} :`);
      console.log(`  « ${d.amelioration.instruction_a_ajouter} »`);
      console.log(`  pourquoi : ${d.amelioration.pourquoi}`);
      console.log(`  succès si : ${d.amelioration.critere_de_succes}`);
      console.log(`  annuler si : ${d.amelioration.seuil_de_retour_arriere}`);
    }
    console.log(`\nÀ NE PAS TOUCHER : ${(d.agents_a_laisser_tranquilles || []).join(', ') || '—'}`);
    console.log(`RISQUE : ${d.risque_de_la_modification || '—'}`);
    if (x.versionCree) console.log(`\n→ Version ${x.versionCree.version} créée pour « ${x.versionCree.agent} » — INACTIVE, en attente de validation.`);
    console.log(`\n[reflexif] ${x.meta.model} · ${x.meta.cout} · ${x.meta.ms} ms`);
  } finally { await brain.end(); await n8n.end(); }
}
