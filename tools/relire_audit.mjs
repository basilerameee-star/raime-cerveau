// Relit des audits DEJA faits (seconde lecture des criteres juges absents), sans refaire
// l'analyse ni l'audit : un appel de modele court par audit, citations verifiees par le code.
// Le score est ensuite recalcule avec les faits du client gardes sur sa fiche.
//
//   node tools/relire_audit.mjs <auditId> [auditId ...]
import { db } from '../agents/lib.js';
import { relire } from '../agents/relecture.js';
import { renoter } from '../agents/arbitrage.js';
import { maturiteConstatee, coutHoraireConstate } from '../agents/auditeur.js';

const ids = process.argv.slice(2);
if (!ids.length) { console.error('Usage: node tools/relire_audit.mjs <auditId> [auditId ...]'); process.exit(1); }

const c = db();
await c.connect();
try {
  for (const id of ids) {
    const { rows } = await c.query(
      `SELECT a.id, a.cost_model, a.proposal_id, p.raw, co.profile
       FROM audits a JOIN proposals p ON p.id = a.proposal_id
       LEFT JOIN companies co ON co.id = a.company_id WHERE a.id = $1`, [id]);
    if (!rows.length) { console.log(`${id} : introuvable`); continue; }
    const r = rows[0];
    const entrees = r.cost_model?.entrees_score;
    if (!entrees) { console.log(`${id} : audit antérieur au Score v2 (pas de relevé stocké), à refaire`); continue; }
    const rl = await relire({ texte: r.raw, entrees, client: c, ref: r.proposal_id });
    const profil = { profile: r.profile || {} };
    const score = renoter(rl.entrees, { maturite: maturiteConstatee(null, profil), coutHoraire: coutHoraireConstate(null, profil) });
    await c.query(`UPDATE audits SET cost_model = cost_model || $2::jsonb WHERE id = $1`,
      [id, JSON.stringify({ entrees_score: rl.entrees, relecture: rl.journal, score_raime: score })]);
    const j = rl.journal;
    console.log(`${id.slice(0, 8)} : +${j.ajoutes.join(',') || '—'} · rejetés ${j.rejetes.join(',') || '—'} · grandeurs +${j.grandeurs.join(',') || '—'}`
      + ` · ${score.rendu ? `${score.score}/1000 ${score.mention}` : `non noté (${score.aObtenir.join(', ')})`}`);
  }
} finally { await c.end(); }
