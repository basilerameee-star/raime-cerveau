// Retire toute phrase promettant un financement public dans les brouillons en file.
// Les brouillons antérieurs au garde-fou n'ont jamais été contrôlés : on les repasse.
// On retire la PHRASE, pas le mot — une phrase amputée se voit et décrédibilise.
import pg from 'pg';

const INTERDIT = /\b(CPF|OPCO|compte personnel de formation|France Travail|Qualiopi)\b/i;

const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
await n8n.connect();
const { rows } = await n8n.query(
  `SELECT id, prospect_name, body FROM outreach WHERE sent_at IS NULL AND status='brouillon'
     AND (body ~* '(CPF|OPCO|compte personnel de formation|France Travail|Qualiopi)')`);

for (const r of rows) {
  const propre = r.body
    .split('\n')
    .map((para) => para
      .split(/(?<=[.!?])\s+/)
      .filter((ph) => !INTERDIT.test(ph))
      .join(' ')
      .trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  await n8n.query('UPDATE outreach SET body=$1 WHERE id=$2', [propre, r.id]);
  console.log(`  nettoyé : ${r.prospect_name}`);
}

const { rows: f } = await n8n.query(`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE body ~* '(CPF|OPCO|France Travail|Qualiopi)')::int AS financement,
         count(*) FILTER (WHERE body LIKE '%premier regard sous 48 heures%')::int AS offre,
         count(*) FILTER (WHERE body LIKE '%raime.fr%')::int AS site,
         count(*) FILTER (WHERE length(body) < 400)::int AS trop_courts
  FROM outreach WHERE sent_at IS NULL AND status='brouillon'`);
console.log(`\nFILE PRÊTE POUR 8 H — ${f[0].total} brouillons`);
console.log(`  offre du premier regard : ${f[0].offre}/${f[0].total}`);
console.log(`  site raime.fr           : ${f[0].site}/${f[0].total}`);
console.log(`  promesse de financement : ${f[0].financement}`);
console.log(`  messages trop courts    : ${f[0].trop_courts}`);
await n8n.end();
