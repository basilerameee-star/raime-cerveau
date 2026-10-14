// LE VEILLEUR DES ORDRES, côté boucle (08/10/2026, toutes les heures, sans modèle, sans frais).
// Le 03/10, l'ordre n°40 (la campagne Michael Sartain) est resté « à faire » des jours sans que rien ne le dise.
// La liste rouge du cockpit et de l'e-mail de 7 h 30 se lit en direct (jarvis/ordres_retard.cjs) ; ce passage écrit en
// plus au journal, UNE fois par ordre, le moment où il dépasse 24 h : « ce qui a changé » du cockpit et le Directeur le voient.
import { createRequire } from 'node:module';
const { enRetard, ligne } = createRequire(import.meta.url)('../jarvis/ordres_retard.cjs');

const MARQUE = (id) => `Ordre n°${id} en retard`;

export async function veiller({ brain }) {
  const liste = await enRetard(async (sql, params) => (await brain.query(sql, params)).rows);
  let nouveaux = 0;
  for (const o of liste) {
    // Une fois par ordre : la ligne déjà écrite se reconnaît à son début (« Ordre n°40 en retard »).
    const { rows } = await brain.query(`SELECT 1 FROM journal WHERE acteur = 'veilleur_ordres' AND changement LIKE $1 LIMIT 1`, [MARQUE(o.id) + ' %']);
    if (rows.length) continue;
    await brain.query(`INSERT INTO journal (acteur, changement, motif) VALUES ('veilleur_ordres', $1, $2)`,
      [`${MARQUE(o.id)} : ${o.etat === 'en_cours' ? 'en cours' : 'à faire'} depuis plus de 24 h`, ligne(o)]);
    nouveaux++;
  }
  console.log(`[veilleur_ordres] ${liste.length} ordre(s) en retard, ${nouveaux} nouveau(x) au journal`);
  return { en_retard: liste.length, nouveaux };
}

// CLI : node agents/veilleur_ordres.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try { console.log(await veiller({ brain })); } finally { await brain.end(); }
}
