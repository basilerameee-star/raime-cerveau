import { derivePrix } from '/app/agents/lib.js';
const d = await derivePrix();
if (!d.length) console.log('aucune derive : les prix du code sont a jour');
else d.forEach(x => console.log(
  `  ${x.tache.padEnd(14)} ${x.modele.padEnd(34)} code ${x.code_in} -> reel ${x.reel_in}  (${x.ecart_pct > 0 ? '+' : ''}${x.ecart_pct}%)`));
process.exit(0);
