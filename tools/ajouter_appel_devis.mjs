// Ajoute l'offre du PREMIER REGARD GRATUIT aux brouillons en file.
//
// Idée de Basile, et c'est la meilleure de la soirée : le courriel ne doit pas seulement
// demander un rendez-vous, il doit demander LE DOCUMENT. Un devis reçu, c'est à la fois
// une conversation qui s'ouvre et la donnée qui manque à toute la chaîne d'audit.
//
// L'offre reste honnête : un PREMIER REGARD, pas un audit complet. C'est exactement la
// distinction posée dans le modèle de prix — l'abonnement couvre le regard, la mission
// couvre le dossier.
import pg from 'pg';

const OFFRE = "Si une proposition d'un prestataire est actuellement sur votre bureau, "
  + "vous pouvez me l'envoyer : je vous rends un premier regard sous 48 heures, sans frais. "
  + "C'est la façon la plus simple de juger notre travail avant d'en parler.";

const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
await n8n.connect();

const { rows } = await n8n.query(
  `SELECT id, body FROM outreach WHERE sent_at IS NULL AND status='brouillon'`);

let modifies = 0, deja = 0, sansSignature = 0;
for (const r of rows) {
  if (r.body.includes('premier regard sous 48 heures')) { deja++; continue; }
  const i = r.body.indexOf('Basile Ramé');
  if (i < 0) { sansSignature++; continue; }
  // Insertion AVANT la signature : additive, elle ne peut pas corrompre le texte existant.
  const nouveau = r.body.slice(0, i).replace(/\s+$/, '') + '\n\n' + OFFRE + '\n\n' + r.body.slice(i);
  await n8n.query('UPDATE outreach SET body=$1 WHERE id=$2', [nouveau, r.id]);
  modifies++;
}
console.log(`brouillons en file      : ${rows.length}`);
console.log(`offre ajoutée           : ${modifies}`);
console.log(`déjà présente           : ${deja}`);
console.log(`signature introuvable   : ${sansSignature}`);
await n8n.end();
