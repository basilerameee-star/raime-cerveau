// LA PROSPECTION « AUTOMATISATION » (07/10/2026) — le même e-mail que celui des vitrines, pour les entreprises.
//
// Basile : « On part sur le même type d'email pour les automatisations que l'email pour les sites web ; dedans, il doit
// inclure le pré-audit. » Et : « on supprime tous les organismes de formation ; focus sur les entreprises à but lucratif,
// là où il y a de la prospection, du document ». Comme pour les vitrines : un constat court, l'exemple préparé pour lui
// (le pré-audit publié de son métier, sur raime.fr), un appel sans engagement, l'agenda. Écrit par le CODE, sans modèle :
// rien d'inventé, aucun chiffre hors du pré-audit. Seuls les métiers qui ont un pré-audit publié reçoivent un e-mail.
//
// Il ne fait que des BROUILLONS (outreach, statut « brouillon ») : Basile les voit et les valide sur /prospection ; l'envoi
// reste au workflow n8n « Expéditeur » (réglage pause / essai / réel). Remplace la rédaction de Héraut dans la boucle.
import pg from 'pg';
import { db } from './lib.js';
import { AGENDA } from './vitrines.js';

// Par métier : le pré-audit publié, le nom du métier, et trois tâches reprises MOT POUR MOT du pré-audit (section 02).
export const METIERS = {
  'Cabinets comptables': { preaudit: 'experts-comptables', pluriel: 'cabinets comptables', structure: 'cabinet',
    taches: ['la saisie des pièces et le pointage des comptes', 'les relances de pièces manquantes', 'la préparation des bilans'] },
  'Cabinets d avocats': { preaudit: 'avocats-notaires', pluriel: 'cabinets d’avocats', structure: 'cabinet',
    taches: ['la recherche dans les décisions de justice', 'la rédaction des actes qui se répètent', 'le suivi des échéances'] },
  'Notaires': { preaudit: 'avocats-notaires', pluriel: 'études notariales', structure: 'étude',
    taches: ['la rédaction des actes qui se répètent', 'la préparation des dossiers', 'le suivi des échéances'] },
  'Cabinets de conseil': { preaudit: 'cabinets-conseil', pluriel: 'cabinets de conseil', structure: 'cabinet',
    taches: ['la rédaction des livrables et des comptes rendus', 'la préparation des propositions', 'le suivi des clients et des prospects'] },
};
const lien = (m) => `https://raime.fr/dossiers/rAIme-pre-audit-${m.preaudit}.pdf`;

// Les noms du registre arrivent en capitales, avec la forme juridique : « SCP DUPONT ET ASSOCIES » → « Dupont et associés ».
const FORMES = /\b(SAS|SASU|SARL|EURL|SELARL|SELAS|SELAFA|SCP|SCM|SNC|SA|SCI|AARPI|SELURL)\b\.?/gi;
const PETITS = new Set(['et', 'de', 'du', 'des', 'la', 'le', 'les', 'à', 'en', 'au', 'aux', 'd', 'l']);
// Le registre écrit sans accents : on rend les plus courants (« ASSOCIES » → « associés »).
const ACCENTS = { associes: 'associés', etude: 'étude', societe: 'société', comptabilite: 'comptabilité', fiduciaire: 'fiduciaire',
  gerance: 'gérance', experts: 'experts', expert: 'expert', immobiliere: 'immobilière', geneve: 'Genève', strategie: 'stratégie',
  developpement: 'développement', creation: 'création', reseau: 'réseau', regie: 'régie', notariale: 'notariale' };
export function joliNom(brut) {
  // « FIMECO (FIMECO) » : le sigle répété entre parenthèses est retiré
  const s = String(brut || '').replace(/\s*\(([^)]*)\)/g, (m, x) => (String(brut).toLowerCase().includes(x.toLowerCase().trim() + ' ') || String(brut).toLowerCase().startsWith(x.toLowerCase().trim()) ? '' : m))
    .replace(FORMES, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(' ').map((w) => ACCENTS[w] || w).map((w, i) => (i > 0 && PETITS.has(w) ? w
    : w.replace(/(^|[-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()))).join(' ');
}
export const joliVille = (v) => joliNom(String(v || '').replace(/\s+\d+(E|ER|EME)?\s+ARRONDISSEMENT$/i, ''));

// Le métier d'un prospect : celui de sa fiche, ou « Notaires » quand le nom le dit (le registre les range en juridique).
export function metierDe(p) {
  if (/notaire|notarial/i.test(p.name || '')) return 'Notaires';
  return METIERS[p.sector] ? p.sector : null;
}

export function brouillon(p) {
  const cle = metierDe(p);
  const m = METIERS[cle];
  if (!m) return null;
  const nom = joliNom(p.name), ville = joliVille(p.city);
  return {
    segment: cle,
    sujet: `${nom} : j'ai préparé votre pré-audit`,
    corps: `Bonjour,\n\nEn regardant les ${m.pluriel}${ville ? ` à ${ville}` : ''}, je suis tombé sur ${nom}.\n\n`
      + `Dans un${m.structure === 'étude' ? 'e' : ''} ${m.structure}, une bonne part de la semaine part dans des tâches qui reviennent : `
      + `${m.taches[0]}, ${m.taches[1]}, ${m.taches[2]}. Une partie peut aujourd'hui être prise par des outils d'IA, avec vos logiciels actuels.\n\n`
      + `Alors je vous ai préparé un pré-audit pour votre métier : les tâches concernées, le temps qu'elles prennent, ce qu'un outil peut en prendre. Le voici :\n${lien(m)}\n\n`
      + `S'il vous parle, on prend vingt minutes pour l'appliquer à votre ${m.structure}. Sinon, vous n'avez rien à faire.\n\n`
      + `Pour choisir votre créneau d'appel :\n${AGENDA}\n\n`
      + `Basile Ramé — rAIme · raime.fr\n\nVos coordonnées viennent de votre fiche publique. Pour ne plus recevoir de message, répondez « stop ».`,
  };
}

// L'adresse doit être CELLE de l'entreprise (07/10/2026 : l'enrichissement avait attaché contact@buttondown.email à trois
// cabinets, no-reply@infomaniak.com à un autre…). Acceptée si son domaine est celui du site de l'entreprise, ou s'il porte
// un mot de son nom (4 lettres au moins) ; jamais une boîte « no-reply » ni celle d'une plateforme.
const SANS_ACCENTS = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PLATEFORMES = /(buttondown|infomaniak|wix|wixpress|sentry|mailchimp|sendinblue|brevo|hubspot|example|domain|sitew|jimdo|squarespace|godaddy|ovh|o2switch|gandi|myu\.fr|encheres-publiques|pagesjaunes|societe\.com|linkedin|facebook)\./i;
export function adresseFiable(p) {
  const e = SANS_ACCENTS(p.contact_email).trim();
  const m = e.match(/^([^@\s]+)@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m || /^(no-?reply|ne-?pas-?repondre|mailer-daemon|postmaster|bounce)/.test(m[1]) || PLATEFORMES.test(m[2] + '.')) return false;
  const domaine = m[2];
  const site = SANS_ACCENTS(p.website).replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (site && (domaine === site || domaine.endsWith('.' + site) || site.endsWith('.' + domaine))) return true;
  const label = domaine.replace(/\.[a-z]{2,}$/, '').replace(/[^a-z0-9]/g, '');
  return SANS_ACCENTS(joliNom(p.name)).split(/[^a-z0-9]+/).some((mot) => mot.length >= 4 && label.includes(mot));
}

// Prépare `combien` brouillons : prospects à but lucratif d'un métier qui a son pré-audit, avec une adresse, jamais écrits
// (ou seulement par l'ancien envoi jamais reçu), et que Basile n'a pas classés « pas intéressé » au téléphone.
export async function preparer({ n8n, brain, combien = 14 } = {}) {
  const exclus = new Set((await brain.query(`SELECT siren FROM appels WHERE etat = 'pas_interesse'`).catch(() => ({ rows: [] }))).rows.map((r) => r.siren));
  const { rows } = await n8n.query(`SELECT p.siren, p.name, p.sector, p.city, p.contact_email, p.website FROM prospects p
    WHERE p.status = 'nouveau' AND coalesce(p.contact_email, '') LIKE '%@%'
      AND (p.sector = ANY($1::text[]) OR p.name ~* 'notaire|notarial')
      -- à but lucratif seulement (Basile, 07/10) : ni associations (AGC, Cerfrance…), ni ordres, chambres ou syndicats
      AND p.name !~* '(^|[^a-z])(assoc|association|agc|cerfrance|syndicat|f[ée]d[ée]ration|chambre|ordre des|union|mutuelle|coop[ée]rative)([^a-z]|$)'
      AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.siren = p.siren AND o.status NOT IN ('non_recu', 'annule'))
      AND NOT EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(p.contact_email))
    ORDER BY p.score DESC NULLS LAST, p.found_at DESC NULLS LAST LIMIT $2`, [Object.keys(METIERS), combien * 10]);
  let faits = 0;
  for (const p of rows) {
    if (faits >= combien || exclus.has(p.siren) || !adresseFiable(p)) continue;
    const b = brouillon(p);
    if (!b) continue;
    // Une ligne par entreprise (outreach.siren est unique) : l'ancien e-mail annulé ou jamais reçu est remplacé.
    const r = await n8n.query(`INSERT INTO outreach (siren, prospect_name, segment, to_email, subject, body, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'brouillon', now())
      ON CONFLICT (siren) DO UPDATE SET prospect_name = EXCLUDED.prospect_name, segment = EXCLUDED.segment, to_email = EXCLUDED.to_email,
        subject = EXCLUDED.subject, body = EXCLUDED.body, status = 'brouillon', created_at = now(), sent_at = NULL, validated_at = NULL, reply_at = NULL
      WHERE outreach.status IN ('non_recu', 'annule') RETURNING id`, [p.siren, joliNom(p.name), b.segment, p.contact_email, b.sujet, b.corps]);
    faits += r.rowCount;
  }
  return { faits, candidats: rows.length };
}

// CLI : node agents/prospection_auto.js [nombre]
if (import.meta.url === `file://${process.argv[1]}`) {
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); const brain = db();
  await n8n.connect(); await brain.connect();
  const r = await preparer({ n8n, brain, combien: Number(process.argv[2]) || 14 });
  console.log(`prospection : ${r.faits} brouillon(s) préparé(s) sur ${r.candidats} candidat(s)`);
  await n8n.end(); await brain.end();
}
