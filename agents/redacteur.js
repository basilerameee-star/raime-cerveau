// AGENT RÉDACTEUR — 100 % DÉTERMINISTE, aucun appel de modèle.
// Un rapport est une tâche de mise en forme : du code ne peut pas halluciner,
// coûte zéro, et reste parfaitement fidèle à l'audit. C'est notre doctrine appliquée à nous-mêmes.
import { db } from './lib.js';
import { aObtenirParEcrit, coutTroisAns, mentionAffichee, reservesAffichees, enClair } from './arbitrage.js';

const EUR = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n) + ' €');
const PREUVE = { A: 'A — mesuré', B: 'B — documenté', C: 'C — estimé' };
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').trim();

export async function rediger({ auditId, client }) {
  const own = !client;
  const c = client || db();
  if (own) await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT a.id, a.scores, a.findings, a.recommendation, a.cost_model, a.created_at,
              p.vendor, p.parsed, co.name AS client_nom, co.sector, co.size, co.profile
       FROM audits a
       JOIN proposals p ON p.id = a.proposal_id
       LEFT JOIN companies co ON co.id = a.company_id
       WHERE a.id = $1`, [auditId]);
    if (!rows.length) throw new Error(`Audit ${auditId} introuvable`);
    const a = rows[0];
    const cm = a.cost_model || {};
    const alt = cm.alternative_sobre || {};
    const contra = cm.contradiction || {};
    const constats = Array.isArray(a.findings) ? a.findings : [];
    // Le Score rAIme v2 est la seule note publiee : le plus bas des trois axes, x 10.
    // La moyenne des regards (a.scores.global) reste en base, pour l'analyse interne,
    // mais ne figure pas au rapport : une moyenne masquerait le maillon faible.
    const sr = cm.score_raime || null;
    const p = a.parsed || {};
    const date = new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

    // Coût total de la proposition, calculé (déterministe)
    const initial = Number(p.couts?.initial) || 0;
    const mensuel = Number(p.couts?.recurrent_mensuel) || 0;
    const total24 = initial + mensuel * 24;

    const L = [];
    L.push(`---`);
    L.push(`title: Audit indépendant — proposition ${esc(a.vendor || 'fournisseur')}`);
    L.push(`ref: ARB-02 · ${a.id.slice(0, 8)}`);
    L.push(`---`);
    L.push(``);
    L.push(`# *Analyse* d'une proposition`);
    L.push(``);
    L.push(`**Client :** ${esc(a.client_nom || '—')}${a.sector ? ` · ${esc(a.sector)}` : ''}${a.size ? ` · ${esc(a.size)}` : ''}`);
    L.push(``);
    L.push(`**Proposition analysée :** ${esc(a.vendor || '—')} — ${esc(p.objet || '')}`);
    L.push(``);
    L.push(`**Date :** ${date} · **Référence :** ${a.id.slice(0, 8)}`);
    L.push(``);

    // 1. Synthèse
    L.push(`## 1. Synthèse pour la direction`);
    L.push(``);
    if (sr?.rendu) {
      const ma = mentionAffichee(sr);
      L.push(`> **Score rAIme : ${sr.score} / 1000 — ${esc(ma.mention)}.** ${esc(ma.suite)}`);
      L.push(``);
    } else if (sr) {
      L.push(`> **Score rAIme non rendu en l'état.** À obtenir, ${esc(enClair(sr.aObtenir || []))}.`);
      L.push(``);
    }
    if (total24 > 0) {
      L.push(`**Engagement financier examiné :** ${EUR(initial)} de mise en œuvre + ${EUR(mensuel)}/mois, soit **${EUR(total24)} sur 24 mois**.`);
      L.push(``);
    }
    if (alt.ecart_estime) {
      L.push(`**Écart identifié avec une architecture plus sobre :** ${esc(alt.ecart_estime)}`);
      L.push(``);
    }
    L.push(`${esc(a.recommendation || '')}`);
    L.push(``);

    // 2. Méthode
    L.push(`## 2. Méthode`);
    L.push(``);
    L.push(`Cet audit applique la grille rAIme en **sept regards** (adéquation métier, architecture, performance, économie, données & sécurité, souveraineté, exploitabilité), puis le **Score rAIme v2.0** : trois axes (sincérité, rentabilité, réalisme), le plus bas des trois × 10, sur 1000. Méthode publique et recalculable.`);
    L.push(``);
    L.push(`Chaque constat porte un **niveau de preuve** :`);
    L.push(``);
    L.push(`| Niveau | Signification |`);
    L.push(`|---|---|`);
    L.push(`| **A** | Mesuré — test réalisé sur vos données réelles |`);
    L.push(`| **B** | Documenté — source vérifiable et datée |`);
    L.push(`| **C** | Estimé — modélisation avec hypothèses explicites |`);
    L.push(``);
    L.push(`**Règle du cabinet :** aucune recommandation engageante ne repose uniquement sur du niveau C.`);
    L.push(``);

    // 3. Constats
    L.push(`## 3. Constats`);
    L.push(``);
    L.push(`| Regard | Constat | Preuve | Risque |`);
    L.push(`|---|---|---|---|`);
    for (const x of constats) {
      L.push(`| **${esc(x.regard)}** | ${esc(x.titre)} | ${esc(PREUVE[String(x.preuve).toUpperCase()] || x.preuve)} | ${esc(x.risque)} |`);
    }
    L.push(``);
    for (const x of constats) {
      L.push(`### ${esc(x.titre)}`);
      L.push(``);
      L.push(`${esc(x.constat)}`);
      L.push(``);
      if (x.source) { L.push(`*Source : ${esc(x.source)}*`); L.push(``); }
    }

    // 3 bis. Le detail du Score, et ce qu'il faut obtenir par ecrit
    if (sr) {
      const axe = (x, plafond) => (!x ? '—' : x.mesurable === false ? 'non mesurable' : `${x.note} / 100${plafond ? ' (plafonné)' : ''}`);
      L.push(`## Le Score rAIme, axe par axe`);
      L.push(``);
      L.push(`| Axe | Note |`);
      L.push(`|---|---|`);
      L.push(`| A · Sincérité (22 critères) | ${axe(sr.axeA, sr.axeA?.plafonne)} |`);
      L.push(`| B · Rentabilité | ${axe(sr.axeB)}${sr.axeB?.mesurable ? ` · remboursement ${sr.axeB.roiMois == null ? 'jamais' : sr.axeB.roiMois + ' mois'}` : ''} |`);
      L.push(`| C · Réalisme (démarche et maturité) | ${axe(sr.axeC)} |`);
      L.push(`| **Score = le plus bas × 10** | ${sr.rendu ? `**${sr.score} / 1000**` : 'non rendu'} |`);
      L.push(``);
      const reserves = reservesAffichees(sr);
      for (const x of reserves) L.push(`- Réserve : ${esc(x)}`);
      if (reserves.length) L.push(``);
      const manques = aObtenirParEcrit(sr);
      if (manques.length) {
        L.push(`**À obtenir par écrit avant de signer** (les clauses C2, C3 et C4 d'abord) :`);
        L.push(``);
        L.push(`| Code | Ce qui manque | La question à poser |`);
        L.push(`|---|---|---|`);
        for (const m of manques) L.push(`| ${m.code} | ${esc(m.libelle)} | ${esc(m.question)} |`);
        L.push(``);
      }
      const cout = coutTroisAns(cm.entrees_score?.economie || {});
      if (cout.total != null) {
        L.push(`**Coût complet sur 3 ans :** ${cout.complet ? '' : 'au moins '}${EUR(cout.total)}${cout.complet ? '' : ` (non chiffré : ${cout.nonChiffre.join(', ')})`}.`);
        L.push(``);
      }
    }

    // 4. Non-dits
    if (Array.isArray(p.non_dits) && p.non_dits.length) {
      L.push(`## 4. Ce que la proposition ne dit pas`);
      L.push(``);
      L.push(`Les absences suivantes sont, en elles-mêmes, des constats :`);
      L.push(``);
      for (const nd of p.non_dits) L.push(`- ${esc(nd)}`);
      L.push(``);
    }

    // 5. Alternative
    if (alt.description) {
      L.push(`## 5. Alternative plus sobre`);
      L.push(``);
      L.push(`> Un audit sans alternative chiffrée n'est pas un audit. Voici la version la plus simple qui atteindrait le même résultat métier.`);
      L.push(``);
      L.push(`${esc(alt.description)}`);
      L.push(``);
      if (alt.pourquoi) { L.push(`**Pourquoi elle tient :** ${esc(alt.pourquoi)}`); L.push(``); }
      if (alt.ordre_de_grandeur_cout) { L.push(`**Ordre de grandeur :** ${esc(alt.ordre_de_grandeur_cout)}`); L.push(``); }
      if (alt.ecart_estime) { L.push(`**Écart estimé :** ${esc(alt.ecart_estime)}`); L.push(``); }
    }

    // 6. Questions
    const qs = cm.questions_au_prestataire || [];
    if (qs.length) {
      L.push(`## 6. Questions à poser au prestataire`);
      L.push(``);
      qs.forEach((q, i) => L.push(`${i + 1}. ${esc(q)}`));
      L.push(``);
    }

    // 7. Informations manquantes
    const im = cm.informations_manquantes || [];
    if (im.length) {
      L.push(`## 7. Informations à obtenir avant de décider`);
      L.push(``);
      for (const x of im) L.push(`- ${esc(x)}`);
      L.push(``);
    }

    // 8. Réserves du contrôle qualité
    const pub = contra.objections_a_publier || [];
    L.push(`## 8. Réserves et contrôle qualité`);
    L.push(``);
    L.push(`Cet audit a été soumis à une **revue contradictoire interne** (un second système, de famille différente, chargé d'attaquer nos propres conclusions).`);
    L.push(``);
    if (contra.solidite_globale) L.push(`**Solidité de l'audit :** ${esc(contra.solidite_globale)}.`);
    if (pub.length) {
      L.push(``);
      L.push(`Par honnêteté méthodologique, les réserves suivantes sont publiées :`);
      L.push(``);
      for (const o of pub) L.push(`- ${esc(o)}`);
    }
    L.push(``);

    // 9. Indépendance
    L.push(`## 9. Indépendance`);
    L.push(``);
    L.push(`rAIme ne vend aucune technologie et ne perçoit **aucune commission** d'un fournisseur. La rémunération est au forfait ou au jour, sur des critères transparents. Tout conflit d'intérêt serait déclaré en tête de ce rapport.`);
    L.push(``);
    L.push(`**La décision finale appartient au client.** Ce rapport fournit les éléments pour la prendre en connaissance de cause.`);
    L.push(``);

    const md = L.join('\n');
    await c.query(`UPDATE audits SET cost_model = cost_model || $2::jsonb WHERE id=$1`,
      [auditId, JSON.stringify({ rapport: { genere_le: new Date().toISOString(), deterministe: true, taille: md.length } })]);
    return { markdown: md, audit: a, meta: { deterministe: true, cout: '0.0000 $' } };
  } finally { if (own) await c.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await rediger({ auditId: process.argv[2] });
  process.stdout.write(out.markdown);
}
