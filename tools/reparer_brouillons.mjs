// RÉPARATION — deux dégâts introduits ce soir par mes propres scripts.
//
// ① Une substitution NON IDEMPOTENTE appliquée plusieurs fois : « Madame, » devenait
//    « Madame, Monsieur, », qui redevenait « Madame, Monsieur, Monsieur, »…
// ② Une insertion visant la PREMIÈRE occurrence de « Basile Ramé » — celle du corps
//    de texte — au lieu de la signature, coupant une phrase en deux.
//
// Leçon : tout script qui réécrit doit être rejouable sans effet cumulatif, et repérer
// une ancre par ce qui la rend UNIQUE, pas par sa première apparition.
import pg from 'pg';

const OFFRE = "Si une proposition d'un prestataire est actuellement sur votre bureau, "
  + "vous pouvez me l'envoyer : je vous rends un premier regard sous 48 heures, sans frais. "
  + "C'est la façon la plus simple de juger notre travail avant d'en parler.";

const SIGNATURE = 'Basile Ramé — rAIme';   // l'ancre unique : le tiret cadratin

const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
await n8n.connect();

const { rows } = await n8n.query(
  `SELECT id, body FROM outreach WHERE sent_at IS NULL AND status='brouillon'`);

let civilite = 0, offreDeplacee = 0, offreAjoutee = 0, sansAncre = 0, intacts = 0;

for (const r of rows) {
  let b = r.body;
  const avant = b;

  // ① Effondrer les civilités répétées, quel qu'en soit le nombre.
  const c0 = b;
  b = b.replace(/^(\s*)(Madame|Monsieur)((?:,\s*(?:Madame|Monsieur))+)\s*,/m, '$1Madame, Monsieur,');
  b = b.replace(/^(\s*)Madame,\s*(?:Monsieur,\s*)+/m, '$1Madame, Monsieur,\n');
  if (b !== c0) civilite++;

  // ② Retirer l'offre où qu'elle soit, puis la replacer au bon endroit.
  if (b.includes('premier regard sous 48 heures')) {
    const nb = b.split(OFFRE).length - 1;
    b = b.split(OFFRE).join('').replace(/\n{3,}/g, '\n\n');
    if (nb) offreDeplacee++;
  }

  const i = b.lastIndexOf(SIGNATURE);
  if (i < 0) { sansAncre++; }
  else {
    b = b.slice(0, i).replace(/\s+$/, '') + '\n\n' + OFFRE + '\n\n' + b.slice(i);
    offreAjoutee++;
  }

  b = b.replace(/\n{3,}/g, '\n\n').trim();
  if (b === avant) { intacts++; continue; }
  await n8n.query('UPDATE outreach SET body=$1 WHERE id=$2', [b, r.id]);
}

console.log(`brouillons          : ${rows.length}`);
console.log(`civilités réparées  : ${civilite}`);
console.log(`offres déplacées    : ${offreDeplacee}`);
console.log(`offres bien placées : ${offreAjoutee}`);
console.log(`sans signature      : ${sansAncre}`);
console.log(`déjà corrects       : ${intacts}`);

// Contrôle final : aucun brouillon ne doit sortir avec une anomalie visible.
const { rows: ko } = await n8n.query(`
  SELECT count(*) FILTER (WHERE body ~ 'Monsieur,\s*Monsieur')::int AS civilites_repetees,
         count(*) FILTER (WHERE body NOT LIKE '%premier regard sous 48 heures%')::int AS sans_offre,
         count(*) FILTER (WHERE body NOT LIKE '%Basile Ramé — rAIme%')::int AS sans_signature,
         count(*) FILTER (WHERE position('premier regard' in body) > position('Basile Ramé — rAIme' in body))::int AS offre_mal_placee
  FROM outreach WHERE sent_at IS NULL AND status='brouillon'`);
console.log(`\nCONTRÔLE FINAL :`, JSON.stringify(ko[0]));
await n8n.end();
