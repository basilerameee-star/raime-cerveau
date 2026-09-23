// Complète les brouillons dont la signature prend une autre forme.
// Ancre robuste : on remonte au premier des marqueurs de clôture rencontrés,
// plutôt que d'exiger une formule unique. Une ancre étroite laisse des cas dehors.
import pg from 'pg';

const OFFRE = "Si une proposition d'un prestataire est actuellement sur votre bureau, "
  + "vous pouvez me l'envoyer : je vous rends un premier regard sous 48 heures, sans frais. "
  + "C'est la façon la plus simple de juger notre travail avant d'en parler.";

const ANCRES = ['Cordialement,', 'Bien cordialement,', 'Basile Ramé — rAIme', 'Basile Ramé'];

const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
await n8n.connect();
const { rows } = await n8n.query(
  `SELECT id, body FROM outreach WHERE sent_at IS NULL AND status='brouillon'
     AND body NOT LIKE '%premier regard sous 48 heures%'`);

let ok = 0, echec = 0;
for (const r of rows) {
  let i = -1;
  for (const a of ANCRES) { const j = r.body.lastIndexOf(a); if (j >= 0) { i = j; break; } }
  if (i < 0) { echec++; continue; }
  const b = (r.body.slice(0, i).replace(/\s+$/, '') + '\n\n' + OFFRE + '\n\n' + r.body.slice(i))
    .replace(/\n{3,}/g, '\n\n').trim();
  await n8n.query('UPDATE outreach SET body=$1 WHERE id=$2', [b, r.id]);
  ok++;
}
console.log(`à compléter : ${rows.length} · complétés : ${ok} · sans ancre : ${echec}`);

const { rows: f } = await n8n.query(`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE body LIKE '%premier regard sous 48 heures%')::int AS avec_offre,
         count(*) FILTER (WHERE body LIKE '%raime.fr%')::int AS avec_site,
         count(*) FILTER (WHERE body ~ 'Monsieur,\s*Monsieur')::int AS civilites_ko,
         count(*) FILTER (WHERE body ILIKE '%CPF%' OR body ILIKE '%OPCO%')::int AS financement_ko,
         count(*) FILTER (WHERE body ILIKE '%audit gratuit%')::int AS audit_gratuit_ko
  FROM outreach WHERE sent_at IS NULL AND status='brouillon'`);
console.log(`\nCONTRÔLE FINAL SUR LES ${f[0].total} BROUILLONS`);
console.log(`  avec l'offre du premier regard : ${f[0].avec_offre}/${f[0].total}`);
console.log(`  avec le site                   : ${f[0].avec_site}/${f[0].total}`);
console.log(`  civilités répétées             : ${f[0].civilites_ko}`);
console.log(`  mentions de financement        : ${f[0].financement_ko}`);
console.log(`  « audit gratuit » promis        : ${f[0].audit_gratuit_ko}`);
await n8n.end();
