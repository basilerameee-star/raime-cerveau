// Essai ponctuel : qui fait le travail de décision typée, maintenant que JEV est fermé ?
// Trois passages de la batterie sur des modèles gratuits ou presque, puis le classement
// de la famille « decision » seule.
//
//   node tools/essai_decision.mjs
import { db } from '../agents/lib.js';
import { mesurer } from '../agents/metrologue.js';

const MODELES = [
  'minimax/minimax-m3:free',
  'deepseek/deepseek-v4-flash-0731:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'ibm-granite/granite-4.0-h-micro',
  'openai/gpt-oss-20b',
  'upstage/solar-pro4',            // le titulaire, pour comparer
];

const brain = db();
await brain.connect();

for (let passage = 1; passage <= 3; passage++) {
  console.log(`\n=== passage ${passage} sur 3 ===`);
  try { await mesurer({ brain, modeles: MODELES }); }
  catch (e) { console.error('passage interrompu :', e.message); break; }
}

const { rows } = await brain.query(`
  SELECT modele,
         count(*) FILTER (WHERE note IS NOT NULL)::int AS mesurees,
         round(avg(note) FILTER (WHERE note IS NOT NULL))::int AS note,
         round((avg(cout_usd) * 1000)::numeric, 4) AS cout_1000
  FROM metrologie
  WHERE famille = 'decision' AND releve_le > now() - interval '1 day'
  GROUP BY modele
  ORDER BY note DESC NULLS LAST, cout_1000 ASC`);

console.log('\n╔══ DÉCISION TYPÉE — qui remplace JEV ══╗\n');
for (const r of rows) {
  console.log(`  ${String(r.modele).padEnd(38)} ${String(r.note ?? '—').padStart(3)}/100 · ` +
    `${r.mesurees} mesures · ${r.cout_1000} $ / 1000 décisions`);
}
await brain.end();
