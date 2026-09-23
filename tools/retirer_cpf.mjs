// Retrait de toute mention du CPF dans la prospection a froid.
// Loi du 19 decembre 2022 : la prospection commerciale visant a promouvoir des formations
// eligibles au CPF aupres des titulaires d'un compte est interdite. Le financement se
// mentionne UNIQUEMENT en reponse a une demande du prospect, jamais a l'initiative.
import pg from 'pg';
const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
await n8n.connect();

const { rows } = await n8n.query(
  `SELECT id, body FROM outreach WHERE sent_at IS NULL AND status='brouillon' AND body ILIKE '%CPF%'`);

let n = 0;
for (const r of rows) {
  // On retire la phrase entiere qui porte la mention, pas seulement le sigle :
  // une phrase amputee se voit et decredibilise.
  const nettoye = r.body
    .split('\n')
    .map((para) => para
      .split(/(?<=[.!?])\s+/)
      .filter((ph) => !/\bCPF\b/i.test(ph))
      .join(' ')
      .trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (nettoye !== r.body) {
    await n8n.query('UPDATE outreach SET body=$1 WHERE id=$2', [nettoye, r.id]);
    n++;
  }
}
const { rows: reste } = await n8n.query(
  `SELECT count(*)::int AS n FROM outreach WHERE sent_at IS NULL AND status='brouillon' AND body ILIKE '%CPF%'`);
console.log(`brouillons nettoyes : ${n}`);
console.log(`mentions CPF restantes en file : ${reste[0].n}`);
await n8n.end();
