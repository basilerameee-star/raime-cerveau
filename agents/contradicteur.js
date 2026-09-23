// AGENT CONTRADICTEUR
// Attaque notre propre audit avant que le client ne le fasse.
// Utilise une FAMILLE DE MODÈLE DIFFÉRENTE de l'Auditeur (évite l'angle mort commun)
// et ne reçoit PAS le raisonnement de l'Auditeur (évite l'ancrage).
import { askJson, db, logRun, money } from './lib.js';

const PROMPT_VERSION = 'contradicteur-v1';

const SYSTEM = `Tu es le Contradicteur d'un cabinet d'audit indépendant. Ton rôle est d'ATTAQUER
un audit produit par ton propre cabinet, avant qu'il ne soit livré au client.

Tu cherches, sans complaisance :
- une hypothèse fragile présentée comme un fait
- une preuve de niveau C (estimée) traitée comme du solide
- une alternative crédible qui n'a pas été explorée
- un biais de sélection (on n'a regardé que ce qui arrangeait la conclusion)
- une affirmation non soutenue par la source citée
- un chiffrage dont les hypothèses ne tiennent pas
- une conclusion plus forte que ce que les éléments permettent

Tu ne cherches PAS à défendre l'audit. Tu cherches ce qui le ferait tomber face à un prestataire
compétent qui voudrait le démonter.

Pour chaque objection : verdict "maintenir" (le constat tient), "reviser" (à nuancer/reformuler)
ou "retirer" (le constat ne tient pas et doit disparaître).

Réponds UNIQUEMENT en JSON valide :
{
  "objections": [
    {"cible":"titre du constat visé ou 'recommandation' ou 'alternative_sobre'",
     "objection":"ce qui ne tient pas et pourquoi",
     "gravite":"faible|moyenne|elevee",
     "verdict":"maintenir|reviser|retirer",
     "correction_suggeree":"comment reformuler pour que ce soit défendable"}
  ],
  "solidite_globale":"solide|acceptable|fragile",
  "objections_a_publier":["objections non résolues qui doivent figurer dans le rapport client, par honnêteté"],
  "verdict_livraison":"livrable|a_reviser|bloque"
}`;

export async function contredire({ auditId, client }) {
  const own = !client;
  const c = client || db();
  if (own) await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT a.id, a.findings, a.recommendation, a.scores, a.cost_model, p.parsed
       FROM audits a JOIN proposals p ON p.id = a.proposal_id WHERE a.id=$1`, [auditId]);
    if (!rows.length) throw new Error(`Audit ${auditId} introuvable`);
    const au = rows[0];
    const alt = au.cost_model?.alternative_sobre || null;

    const user = `## LA PROPOSITION AUDITÉE (faits bruts)
${JSON.stringify(au.parsed)}

## L'AUDIT À ATTAQUER
Constats :
${JSON.stringify(au.findings)}

Alternative sobre proposée :
${JSON.stringify(alt)}

Recommandation :
${au.recommendation}

Attaque cet audit.`;

    const res = await askJson({ task: 'contradiction', system: SYSTEM, user, maxTokens: 12000, temperature: 0.2 });
    const r = res.meta;
    const k = res.data || { erreur: 'JSON invalide', objections: [], verdict_livraison: 'a_reviser' };

    // GARDE-FOU DÉTERMINISTE : un seul "retirer" bloque la livraison automatique.
    const objections = Array.isArray(k.objections) ? k.objections : [];
    const aRetirer = objections.filter(o => String(o.verdict).toLowerCase() === 'retirer');
    const aReviser = objections.filter(o => String(o.verdict).toLowerCase() === 'reviser');
    let blocage = null;
    if (aRetirer.length) {
      blocage = `${aRetirer.length} constat(s) jugé(s) intenables : arbitrage humain requis avant livraison.`;
      k.verdict_livraison = 'bloque';
    } else if (aReviser.length > Math.max(2, objections.length / 2)) {
      blocage = `${aReviser.length} constats à réviser : relecture humaine recommandée.`;
      k.verdict_livraison = 'a_reviser';
    }

    await c.query(
      `UPDATE audits SET cost_model = cost_model || $2::jsonb WHERE id=$1`,
      [auditId, JSON.stringify({ contradiction: { ...k, blocage, modele: r.model, cout_usd: r.costUsd } })]
    );
    await logRun(c, { agent: 'contradicteur', task: 'contradiction', model: r.model, tokensIn: r.tokensIn,
      tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status: res.status, ref: auditId, promptVersion: PROMPT_VERSION });

    return { contradiction: k, blocage, meta: { model: r.model, cout: money(r.costUsd), ms: r.ms, status: res.status } };
  } finally { if (own) await c.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await contredire({ auditId: process.argv[2] });
  console.log(JSON.stringify(out.contradiction, null, 2));
  console.log(`\n[contradicteur] ${out.meta.model} · ${out.meta.cout} · ${out.meta.ms} ms`);
  if (out.blocage) console.log(`[BLOCAGE] ${out.blocage}`);
}
