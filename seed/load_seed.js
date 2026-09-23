// Charge la méthodologie d'audit + l'amorce du catalogue de modèles dans Postgres.
//   DATABASE_URL=... node seed/load_seed.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const meth = JSON.parse(readFileSync(here('./audit_methodology.json'), 'utf8'));
const cat  = JSON.parse(readFileSync(here('./models.seed.json'), 'utf8'));

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  // 7 regards
  for (const c of meth.criteria) {
    await db.query(
      `INSERT INTO audit_criteria(rank,code,label,description,checks)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(code) DO UPDATE SET rank=$1,label=$3,description=$4,checks=$5`,
      [c.rank, c.code, c.label, c.description, JSON.stringify(c.checks || [])]);
  }
  // 8 questions (on réécrit proprement)
  await db.query('DELETE FROM audit_questions');
  for (const q of meth.questions) {
    await db.query(
      `INSERT INTO audit_questions(rank,question,method,criterion) VALUES($1,$2,$3,$4)`,
      [q.rank, q.question, q.method, q.criterion]);
  }
  // amorce catalogue modèles
  for (const m of cat.models) {
    await db.query(
      `INSERT INTO models(provider,name,openrouter_id,strengths,params,deterministic_friendly,source,verify,as_of)
       VALUES($1,$2,$3,$4,$5,$6,'manual',$7,$8)
       ON CONFLICT(provider,name) DO UPDATE SET
         openrouter_id=$3, strengths=$4, params=$5, deterministic_friendly=$6, verify=$7, as_of=$8, updated_at=now()`,
      [m.provider, m.name, m.openrouter_id || null,
       JSON.stringify(m.strengths || {}), JSON.stringify(m.params || {}),
       m.deterministic_friendly ?? null, m.verify ?? true, cat.as_of]);
  }
  console.log(`Seed OK — ${meth.criteria.length} regards, ${meth.questions.length} questions, ${cat.models.length} modèles amorcés.`);
} finally {
  await db.end();
}
