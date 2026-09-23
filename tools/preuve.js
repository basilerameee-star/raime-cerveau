// RAPPORT DE PREUVE — le registre qu'on pose sur la table du client.
//
// Ce que rAIme vend n'est pas « ça coûte 28 centimes ». Notre volume n'est pas le sien.
// Ce que rAIme vend, c'est : NOUS SAVONS AU CENTIME CE QUE CHAQUE EXÉCUTION COÛTE,
// ET SON PRESTATAIRE NE LE SAIT PAS. La méthode est le produit, pas le montant.
//
// Un dirigeant à qui l'on montre ce registre comprend en trente secondes la différence
// entre un cabinet qui mesure et un intégrateur qui facture au forfait.
import pg from 'pg';

const eur = (usd) => (usd * 0.92).toFixed(4);

export async function rapport({ brain }) {
  const { rows: par } = await brain.query(`
    SELECT agent, count(*)::int AS executions,
           sum(tokens_in)::int AS entree, sum(tokens_out)::int AS sortie,
           round(sum(cost_usd)::numeric, 5) AS cout,
           round(avg(duration_ms) / 1000.0, 1) AS duree_moy,
           count(*) FILTER (WHERE status = 'refuse')::int AS refus_qualite,
           count(*) FILTER (WHERE status = 'parse_error')::int AS echecs
    FROM agent_runs GROUP BY agent ORDER BY sum(cost_usd) DESC`);

  const { rows: g } = await brain.query(`
    SELECT count(*)::int AS executions,
           sum(tokens_in + tokens_out)::int AS tokens,
           round(sum(cost_usd)::numeric, 4) AS cout,
           min(created_at)::date AS depuis,
           count(DISTINCT model)::int AS modeles,
           count(*) FILTER (WHERE status = 'refuse')::int AS refus
    FROM agent_runs`);

  // La traçabilité n'est pas une promesse : ce sont des tables qu'on peut ouvrir.
  const compte = async (t) => {
    try { const { rows } = await brain.query(`SELECT count(*)::int n FROM ${t}`); return rows[0].n; }
    catch { return null; }
  };
  const registres = {
    'exécutions tracées (agent_runs)': await compte('agent_runs'),
    'décisions journalisées (journal)': await compte('journal'),
    'rapports de supervision': await compte('supervision'),
    'relevés d’instruments': await compte('releves'),
    'points d’historique de prix': await compte('model_prices_history'),
    'candidats passés au sas': await compte('candidats'),
    'versions de prompts': await compte('prompt_versions'),
  };

  const t = g[0];
  return {
    periode_depuis: t.depuis ? new Date(t.depuis).toISOString().slice(0, 10) : null,
    executions: t.executions,
    tokens: t.tokens,
    cout_usd: Number(t.cout),
    cout_eur: eur(Number(t.cout)),
    modeles_utilises: t.modeles,
    refus_controle_qualite: t.refus,
    taux_refus_pct: t.executions ? +(100 * t.refus / t.executions).toFixed(1) : 0,
    par_agent: par,
    registres,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js').catch(() => import('../agents/lib.js'));
  const brain = db(); await brain.connect();
  try {
    const r = await rapport({ brain });
    const L = (s = '') => console.log(s);
    L('');
    L('╔════════════════════════════════════════════════════════════════════╗');
    L('║  rAIme — REGISTRE D\'EXPLOITATION                                   ║');
    L('║  Ce que coûte réellement un cabinet opéré par des agents           ║');
    L('╚════════════════════════════════════════════════════════════════════╝');
    L('');
    L(`  Période observée      : depuis le ${r.periode_depuis}`);
    L(`  Exécutions d'agents   : ${r.executions}`);
    L(`  Jetons consommés      : ${(r.tokens / 1000).toFixed(0)} k`);
    L(`  Coût total            : ${r.cout_usd} USD  (≈ ${r.cout_eur} €)`);
    L(`  Modèles mobilisés     : ${r.modeles_utilises}`);
    L(`  Refus du contrôle     : ${r.refus_controle_qualite} (${r.taux_refus_pct} % des exécutions)`);
    L('');
    L('  ── DÉTAIL PAR AGENT ─────────────────────────────────────────────');
    L('  agent            exéc.   entrée   sortie      coût $   durée   refus');
    r.par_agent.forEach((a) => L(
      `  ${a.agent.padEnd(16)}${String(a.executions).padStart(5)}`
      + `${String(a.entree).padStart(9)}${String(a.sortie).padStart(9)}`
      + `${String(a.cout).padStart(12)}${String(a.duree_moy + 's').padStart(8)}`
      + `${String(a.refus_qualite).padStart(8)}`));
    L('');
    L('  ── REGISTRES OUVRABLES ──────────────────────────────────────────');
    Object.entries(r.registres).forEach(([k, v]) =>
      L(`  ${k.padEnd(38)} ${v === null ? '—' : v}`));
    L('');
    L('  ── CE QUE CE REGISTRE DÉMONTRE ──────────────────────────────────');
    L('  Notre volume n\'est pas le vôtre : ce montant ne préjuge pas de votre coût.');
    L('  Ce qu\'il prouve, c\'est la METHODE — chaque exécution est datée, attribuée à');
    L('  un agent, à un modèle, et chiffrée au cent. Demandez le même registre à');
    L('  votre prestataire : s\'il ne peut pas le produire, il ne sait pas ce qu\'il');
    L('  vous vend, et vous ne saurez jamais si son prix est juste.');
    L('');
  } finally { await brain.end(); }
}
