// Les garde-fous sont-ils trop zélés ? Un contrôle qui bloque les rapports valables
// est pire que pas de contrôle : il rend le produit inlivrable et on finit par le retirer.
// On les rejoue donc contre les 6 audits réels déjà produits.
import pg from 'pg';
import { validerAudit } from '/app/agents/garde_audit.js';

const brain = new pg.Client({ connectionString: process.env.DATABASE_URL }); await brain.connect();
const { rows } = await brain.query(
  `SELECT id, findings, recommendation FROM audits ORDER BY created_at`);

let bloques = 0, signales = 0;
for (const a of rows) {
  const audit = { constats: a.findings || [], recommandation: a.recommendation || '' };
  const v = validerAudit(audit);
  const bloq = v.violations.filter(x => x.bloquant);
  const sig = v.violations.filter(x => !x.bloquant);
  if (bloq.length) bloques++;
  if (sig.length) signales++;
  console.log(`audit ${String(a.id).slice(0, 8)} · ${(a.findings || []).length} constats`
    + ` → ${bloq.length ? 'BLOQUÉ : ' + bloq.map(x => x.code).join(', ') : 'livrable'}`
    + (sig.length ? ` · ${sig.length} signalement(s)` : ''));
  bloq.forEach(x => console.log(`      extrait : « ${x.extrait} »`));
  sig.slice(0, 2).forEach(x => console.log(`      note : ${x.message}`));
}
console.log(`\n${rows.length} audits réels · ${bloques} bloqués · ${signales} avec signalements`);
await brain.end();
