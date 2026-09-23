// AGENT PROSPECTIVE — comprendre le marché actuel, projeter à 3 / 6 / 12 mois,
// et surtout ADAPTER notre process interne en conséquence.
//
// Il ne fait pas de la veille : il tire des CONCLUSIONS OPÉRATIONNELLES du mouvement du marché.
// Les faits (courbes de prix, capacités, densité de l'offre) sont calculés par SQL.
// Le modèle ne sert qu'à la projection et à la décision d'adaptation.
import { askJson, db, logRun, money } from './lib.js';

const PROMPT_VERSION = 'prospective-v1';

async function faitsMarche(brain) {
  const f = {};

  // Densité de l'offre par fournisseur
  const { rows: prov } = await brain.query(`
    SELECT split_part(openrouter_id,'/',1) AS fournisseur, count(*)::int AS modeles,
           round(min(price_in)::numeric,3) AS moins_cher_entree,
           round(max(context_tokens)/1000.0) AS contexte_max_k
    FROM models WHERE price_in IS NOT NULL
    GROUP BY 1 HAVING count(*) >= 3 ORDER BY 2 DESC LIMIT 12`);
  f.offre_par_fournisseur = prov;

  // La frontière du rapport capacité/prix : le moins cher par palier de contexte
  const { rows: front } = await brain.query(`
    SELECT CASE WHEN context_tokens >= 1000000 THEN 'tres long (>=1M)'
                WHEN context_tokens >= 200000 THEN 'long (200k-1M)'
                WHEN context_tokens >= 100000 THEN 'moyen (100k-200k)'
                ELSE 'court (<100k)' END AS palier_contexte,
           count(*)::int AS modeles,
           round(min(price_in)::numeric,4) AS prix_plancher_entree,
           round(avg(price_in)::numeric,3) AS prix_moyen_entree
    FROM models WHERE price_in IS NOT NULL AND price_in > 0
    GROUP BY 1 ORDER BY min(price_in)`);
  f.frontiere_capacite_prix = front;

  // Mouvements de prix observés (le radar)
  const { rows: mv } = await brain.query(`
    SELECT title, payload->'from'->>'price_in' AS avant, payload->'to'->>'price_in' AS apres, seen_at::date AS le
    FROM radar_events WHERE kind='price_change' ORDER BY seen_at DESC LIMIT 15`);
  f.mouvements_de_prix = mv;

  // Modèles gratuits / quasi gratuits (signal de commoditisation)
  const { rows: gr } = await brain.query(`
    SELECT count(*)::int AS modeles_gratuits FROM models WHERE price_in = 0 OR price_in IS NULL`);
  f.commoditisation = gr[0];

  // Notre routage actuel (ce qu'on utilise aujourd'hui)
  const { rows: usage } = await brain.query(`
    SELECT model, count(*)::int AS appels, round(sum(cost_usd)::numeric,4) AS cout
    FROM agent_runs WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`);
  f.notre_usage = usage;

  // Notre bibliothèque sectorielle (ce qu'on saurait auditer)
  const { rows: bib } = await brain.query(`
    SELECT secteur, count(*)::int AS automatisations FROM sector_automations GROUP BY 1 ORDER BY 2 DESC`);
  f.notre_bibliotheque = bib;

  return f;
}

const SYSTEM = `Tu es l'agent Prospective d'un cabinet d'audit IA indépendant.

On te remet des FAITS MESURÉS sur l'état du marché des modèles (densité de l'offre, frontière
capacité/prix, mouvements de prix observés) et sur NOTRE propre dispositif.

Ta mission en trois temps :
1. LIRE LE PRÉSENT — quelle est la structure réelle du marché aujourd'hui ?
2. PROJETER — où va-t-il à 3, 6 et 12 mois ? Appuie chaque projection sur un fait observé,
   pas sur une impression. Distingue ce qui est probable de ce qui est incertain.
3. ADAPTER — et c'est le plus important : qu'est-ce que cela change POUR NOUS ?
   Propose des adaptations concrètes de notre routage de modèles, de notre méthode d'audit,
   et de notre bibliothèque sectorielle.

Notre métier : auditer les propositions d'automatisation faites aux PME, arbitrer entre
solutions, et former. Notre doctrine : le déterministe d'abord, le modèle seulement quand il
apporte un jugement, au juste coût.

Sois précis et opérationnel. Une projection sans conséquence pour nous ne sert à rien.

Réponds UNIQUEMENT en JSON :
{
  "lecture_du_present": "l'état structurel du marché, en 3 phrases",
  "projections": [
    {"horizon":"3 mois|6 mois|12 mois", "projection":"", "fondement":"le fait observé qui l'appuie",
     "confiance":"elevee|moyenne|faible", "consequence_pour_nous":""}
  ],
  "adaptations": [
    {"cible":"routage de modeles|methode d audit|bibliotheque sectorielle|offre commerciale",
     "changement":"l'adaptation précise à opérer", "pourquoi":"", "urgence":"immediate|trimestre|semestre"}
  ],
  "signaux_a_surveiller": ["ce qui confirmerait ou infirmerait ces projections"],
  "menace_principale": "la chose qui pourrait rendre notre offre obsolète"
}`;

export async function projeter({ brain }) {
  const faits = await faitsMarche(brain);
  const user = `## FAITS MESURÉS — MARCHÉ ET DISPOSITIF INTERNE
${JSON.stringify(faits)}

Produis ta lecture, tes projections et surtout les adaptations à opérer.`;

  const res = await askJson({ task: 'raisonnement', system: SYSTEM, user, maxTokens: 12000, temperature: 0.25 });
  const r = res.meta;
  const d = res.data || { lecture_du_present: 'indisponible', projections: [], adaptations: [] };

  await brain.query(
    `INSERT INTO prospective(lecture, projections, adaptations, faits, modele, cout_usd)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [d.lecture_du_present || null, JSON.stringify(d.projections || []),
     JSON.stringify({ adaptations: d.adaptations || [], signaux: d.signaux_a_surveiller || [], menace: d.menace_principale || null }),
     JSON.stringify(faits), r.model, r.costUsd]);
  await logRun(brain, { agent: 'prospective', task: 'raisonnement', model: r.model, tokensIn: r.tokensIn,
    tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status: res.status, promptVersion: PROMPT_VERSION });

  return { faits, rapport: d, meta: { model: r.model, cout: money(r.costUsd), ms: r.ms } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = db(); await brain.connect();
  try {
    const p = await projeter({ brain });
    const d = p.rapport;
    console.log(`\n╔══ PROSPECTIVE MARCHÉ ══╗\n`);
    console.log(`LECTURE DU PRÉSENT :\n  ${d.lecture_du_present}\n`);
    console.log(`PROJECTIONS :`);
    (d.projections || []).forEach(x =>
      console.log(`  [${x.horizon} · confiance ${x.confiance}] ${x.projection}\n     fondement : ${x.fondement}\n     pour nous : ${x.consequence_pour_nous}`));
    console.log(`\nADAPTATIONS À OPÉRER :`);
    (d.adaptations || []).forEach((x, i) =>
      console.log(`  ${i + 1}. [${x.cible} · ${x.urgence}] ${x.changement}\n     pourquoi : ${x.pourquoi}`));
    console.log(`\nMENACE PRINCIPALE :\n  ${d.menace_principale}`);
    console.log(`\nÀ SURVEILLER :`);
    (d.signaux_a_surveiller || []).forEach(x => console.log(`  • ${x}`));
    console.log(`\n[prospective] ${p.meta.model} · ${p.meta.cout} · ${p.meta.ms} ms`);
  } finally { await brain.end(); }
}
