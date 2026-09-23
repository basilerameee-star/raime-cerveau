// Applique le routage destinataire aux brouillons en file, avec LE MEME code que
// celui des prochains envois. Idempotent : peut etre relance sans empiler d'en-tetes.
import pg from 'pg';
import { enteteRoutage, nomExploitable } from '/app/agents/heraut.js';

const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
await n8n.connect();

const { rows } = await n8n.query(`
  SELECT o.id, o.to_email, o.body, o.prospect_name, p.dirigeant
  FROM outreach o LEFT JOIN prospects p ON p.siren = o.siren
  WHERE o.sent_at IS NULL AND o.status = 'brouillon'`);

let nomme = 0, escalade = 0, direct = 0, civilite = 0;
const exemples = [];

for (const r of rows) {
  let corps = String(r.body);

  // On retire un en-tete pose lors d'un passage precedent : le script reste rejouable.
  corps = corps.replace(/^À l'attention de [^\n]*\n+/, '');

  // On ne devine jamais le genre d'un destinataire inconnu.
  const avant = corps;
  corps = corps.replace(/^\s*(Madame|Monsieur)\s*,/i, 'Madame, Monsieur,');
  if (corps !== avant) civilite++;

  const nom = nomExploitable(r.dirigeant, r.prospect_name);
  const entete = enteteRoutage(r.to_email, r.dirigeant, r.prospect_name);
  if (entete) {
    corps = entete + '\n\n' + corps;
    if (nom) { nomme++; if (exemples.length < 4) exemples.push(`${r.prospect_name} -> ${nom}`); }
    else escalade++;
  } else direct++;

  if (corps !== r.body) await n8n.query('UPDATE outreach SET body=$1 WHERE id=$2', [corps, r.id]);
}

console.log(`brouillons traites : ${rows.length}`);
console.log(`  adresse nominative, aucun en-tete    : ${direct}`);
console.log(`  en-tete nominatif « transmettre a X » : ${nomme}`);
console.log(`  demande d'escalade (nom inexploitable): ${escalade}`);
console.log(`  civilites genrees corrigees           : ${civilite}`);
exemples.forEach(e => console.log(`     ex. ${e}`));
await n8n.end();
