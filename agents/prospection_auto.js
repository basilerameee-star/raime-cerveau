// LA PROSPECTION « AUTOMATISATION » (07/10/2026) — le même e-mail que celui des vitrines, pour les entreprises.
//
// Basile : « On part sur le même type d'email pour les automatisations que l'email pour les sites web ; dedans, il doit
// inclure le pré-audit. » Et : « on supprime tous les organismes de formation ; focus sur les entreprises à but lucratif,
// là où il y a de la prospection, du document ». Comme pour les vitrines : un constat court, l'exemple préparé pour lui
// (le pré-audit publié de son métier, sur raime.fr), un appel sans engagement, l'agenda. Écrit par le CODE, sans modèle :
// rien d'inventé, aucun chiffre hors du pré-audit. Seuls les métiers qui ont un pré-audit publié reçoivent un e-mail.
//
// Il ne fait que des BROUILLONS (outreach, statut « brouillon ») ; depuis le 14/10/2026 (accord de Basile), ils partent seuls
// par le workflow n8n « Expéditeur » (n8n/expediteur_envoi.json, vue envoi_preaudits de n8n/envois.sql) s'ils portent le lien
// du pré-audit et que ce PDF répond. Basile peut encore les voir sur /prospection. Remplace la rédaction de Héraut dans la boucle.
import fs from 'node:fs';
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
  // 07/10/2026 : pré-audit publié (moteur de ROI, 492 h, 18 700 €, retour ≈ 6 mois pour une agence de 10 personnes)
  'Immobilier': { preaudit: 'immobilier', pluriel: 'agences immobilières', structure: 'agence',
    taches: ['la rédaction des annonces', 'les réponses aux demandes des acquéreurs et des locataires', 'la constitution et le contrôle des dossiers'] },
  // 07/10/2026 : niches choisies avec Basile (prospection et documents) ; pré-audits publiés le même jour
  'RH / recrutement': { preaudit: 'recrutement', pluriel: 'cabinets de recrutement', structure: 'cabinet',
    taches: ['le tri des candidatures', 'la rédaction des annonces', 'la prospection des entreprises clientes'] },
  'Courtiers en assurance': { preaudit: 'assurance', pluriel: 'cabinets de courtage', structure: 'cabinet',
    taches: ['la constitution des dossiers clients', 'la comparaison des offres des compagnies', 'les devis et les propositions'] },
  'Architectes': { preaudit: 'batiment-architecture', pluriel: 'agences d’architecture', structure: 'agence',
    taches: ['le chiffrage et les métrés', 'les réponses aux appels d’offres', 'les comptes rendus de chantier'] },
};
// Codes d'activité jamais prospectés (07/10/2026) : groupements d'employeurs, assureurs et mutuelles, banques mutualistes.
// 08/10/2026 : la liste et le motif des noms « à but non lucratif » vivent dans jarvis/naf_exclus.json, lu aussi par la liste
// À appeler du Cockpit (un téléphone d'association ne doit plus y apparaître sous une fausse catégorie).
const REGLES = JSON.parse(fs.readFileSync(new URL('../jarvis/naf_exclus.json', import.meta.url), 'utf8'));
export const NAF_EXCLUS = REGLES.naf;
export const NOM_NON_LUCRATIF = REGLES.nom_non_lucratif;
// le même motif, sous le nom qu'emploie agents/sans_site.js (expression PostgreSQL, ~*)
export const NON_LUCRATIF = NOM_NON_LUCRATIF;
const lien = (m) => `https://raime.fr/dossiers/rAIme-pre-audit-${m.preaudit}.pdf`;

// Les noms du registre arrivent en capitales, avec la forme juridique : « SCP DUPONT ET ASSOCIES » → « Dupont et associés ».
const FORMES = /\b(SAS|SASU|SARL|EURL|SELARL|SELAS|SELAFA|SCP|SCM|SNC|SA|SCI|AARPI|SELURL)\b\.?/gi;
const PETITS = new Set(['et', 'de', 'du', 'des', 'la', 'le', 'les', 'à', 'en', 'au', 'aux', 'd', 'l']);
// Le registre écrit sans accents : on rend les plus courants (« ASSOCIES » → « associés »).
const ACCENTS = { associes: 'associés', etude: 'étude', societe: 'société', comptabilite: 'comptabilité', fiduciaire: 'fiduciaire',
  gerance: 'gérance', experts: 'experts', expert: 'expert', immobiliere: 'immobilière', geneve: 'Genève', strategie: 'stratégie',
  developpement: 'développement', creation: 'création', reseau: 'réseau', regie: 'régie', notariale: 'notariale',
  // abréviations du registre (« CAB WIRION STE FIDUC RHONE ALPES ») et régions
  cab: 'cabinet', ste: 'société', fiduc: 'fiduciaire', rhone: 'Rhône', isere: 'Isère', leman: 'Léman' };
export function joliNom(brut) {
  // « FIMECO (FIMECO) », « SURPERFORMANCE (ZONEBOURSE - SURPERFORMANCE) » : la parenthèse qui répète le nom est retirée
  const b = String(brut || ''), dehors = b.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim();
  const s = b.replace(/\s*\(([^)]*)\)/g, (m, x) => {
    const y = x.toLowerCase().trim();
    return b.toLowerCase().includes(y + ' ') || b.toLowerCase().startsWith(y) || (dehors.length >= 3 && y.includes(dehors)) ? '' : m;
  })
    .replace(FORMES, ' ').replace(/\s+/g, ' ').trim();
  // « FIDUCIAIRE ET CONSEIL RHONE-ALPES (FIDURALP) » : le nom d'usage, court, est celui que l'entreprise se donne
  const usage = s.match(/^(.{26,}?)\s*\(([^(),]{2,25})\)$/);
  if (usage && !/notaire|associ/i.test(usage[2])) return joliNom(usage[2]);
  if (!s || s !== s.toUpperCase()) return court(s);
  return court(s.toLowerCase().split(' ').map((w) => ACCENTS[w] || w).map((w, i) => (i > 0 && PETITS.has(w) ? w
    : w.replace(/(^|[-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()))).join(' '));
}
// Les études de notaires portent des noms à rallonge (« Société civile professionnelle Naz & associés, notaires, associés
// d'une société… », « Xavier Brunet, Vincent Morati… (la Manufacture, Notaires) ») : on garde le nom d'usage.
function court(nom) {
  let n = nom.replace(/^(soci[ée]t[ée] civile professionnelle|soci[ée]t[ée] d.exercice lib[ée]ral\S*( [aà] responsabilit[ée] limit[ée]e)?|scp|selarl)\s+/i, '').trim();
  const usage = n.match(/\(([^)]+)\)/);
  if (n.length > 45 && usage) {
    const u = usage[1].split(',')[0].trim();
    if (u.length >= 3) return u.charAt(0).toUpperCase() + u.slice(1);
  }
  if (n.length > 45) n = n.split(',')[0].trim();
  return n.replace(/\b([Aa])ssocies\b/g, '$1ssociés');   // le registre écrit sans accents, même en minuscules
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
      + `Dans un${['étude', 'agence'].includes(m.structure) ? 'e' : ''} ${m.structure}, une bonne part de la semaine part dans des tâches qui reviennent : `
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
export const SANS_ACCENTS = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const PLATEFORMES = /(buttondown|infomaniak|wix|wixpress|sentry|mailchimp|sendinblue|brevo|hubspot|example|domain|sitew|jimdo|squarespace|godaddy|ovh|o2switch|gandi|myu\.fr|encheres-publiques|pagesjaunes|societe\.com|linkedin|facebook|lesentreprises|rubypayeur|pappers|infogreffe|verif|manageo|kompass|corporama|annuaire|societeinfo|bodacc|french-business|score3)\./i;
export const GENERIQUES = new Set(['cabinet', 'cabinets', 'conseil', 'conseils', 'expertise', 'expert', 'experts', 'comptable', 'comptables',
  'audit', 'associes', 'associe', 'avocat', 'avocats', 'notaire', 'notaires', 'notarial', 'notariale', 'societe', 'groupe', 'france', 'gestion',
  'services', 'service', 'consulting', 'partners', 'partenaires', 'etude', 'office', 'juridique', 'fiduciaire', 'international', 'compagnie',
  'agence', 'immobilier', 'immobiliere', 'nouvelle', 'les', 'des', 'et', 'and', 'the', 'sas', 'sarl', 'scp', 'selarl', 'professionnelle', 'civile']);
export function adresseFiable(p) {
  const e = SANS_ACCENTS(p.contact_email).trim();
  const m = e.match(/^([^@\s]+)@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m || /^(no-?reply|ne-?pas-?repondre|mailer-daemon|postmaster|bounce|webmestre|webmaster)/.test(m[1]) || PLATEFORMES.test(m[2] + '.')) return false;
  if (m[2] === 'notaires.fr') return false;            // le site national des notaires, jamais celui d'une étude (*.notaires.fr l'est)
  const domaine = m[2];
  // une messagerie grand public (orange.fr, gmail.com…) : acceptée seulement si l'adresse elle-même porte le nom
  if (MESSAGERIES.test(domaine)) return motsDuNom(p.name).some((mot) => m[1].replace(/[^a-z0-9]/g, '').includes(mot));
  const site = SANS_ACCENTS(p.website).replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  if (site && (domaine === site || domaine.endsWith('.' + site) || site.endsWith('.' + domaine))) return true;
  const label = domaine.replace(/\.[a-z]{2,}$/, '').replace(/[^a-z0-9]/g, '');
  // les mots du métier (« cabinet », « associés », « conseil »…) ne prouvent rien : seuls les mots propres au nom comptent
  return motsDuNom(p.name).some((mot) => label.includes(mot));
}
const MESSAGERIES = /^(gmail|googlemail|orange|wanadoo|free|sfr|neuf|laposte|hotmail|outlook|live|yahoo|icloud|aliceadsl|bbox|numericable)\.(fr|com|net)$/;
export const motsDuNom = (nom) => SANS_ACCENTS(joliNom(nom)).split(/[^a-z0-9]+/).filter((mot) => mot.length >= 3 && !GENERIQUES.has(mot));

// Prépare `combien` brouillons : prospects à but lucratif d'un métier qui a son pré-audit, avec une adresse, jamais écrits
// (ou seulement par l'ancien envoi jamais reçu), et que Basile n'a pas classés « pas intéressé » au téléphone.
export async function preparer({ n8n, brain, combien = 14 } = {}) {
  const exclus = new Set((await brain.query(`SELECT siren FROM appels WHERE etat = 'pas_interesse'`).catch(() => ({ rows: [] }))).rows.map((r) => r.siren));
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_preuve text');
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS furete_note text');
  // le site ne fait foi que si le Fureteur l'a prouvé (SIREN ou nom et ville sur ses pages) : l'ancien prenait le 1er lien d'un moteur
  const { rows } = await n8n.query(`SELECT p.siren, p.name, p.sector, p.city, p.contact_email,
      CASE WHEN p.site_preuve IS NOT NULL THEN p.website END AS website FROM prospects p
    WHERE p.status = 'nouveau' AND coalesce(p.contact_email, '') LIKE '%@%'
      -- 07/10/2026 : seulement une adresse LUE sur le site prouvé de l'entreprise (Fureteur) ; l'ancien en devinait (contact@domaine)
      AND p.site_preuve IS NOT NULL AND p.furete_note LIKE 'adresse sur le site%'
      AND (p.sector = ANY($1::text[]) OR p.name ~* 'notaire|notarial')
      -- à but lucratif seulement (Basile, 07/10) : ni associations (AGC, Cerfrance…), ni ordres, chambres ou syndicats
      AND p.name !~* $4
      AND coalesce(p.naf, '') <> ALL($3::text[])
      AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.siren = p.siren AND o.status NOT IN ('non_recu', 'annule'))
      AND NOT EXISTS (SELECT 1 FROM suppression s WHERE lower(s.email) = lower(p.contact_email))
      AND NOT EXISTS (SELECT 1 FROM outreach o2 WHERE lower(o2.to_email) = lower(p.contact_email) AND o2.status NOT IN ('non_recu', 'annule'))
    ORDER BY p.score DESC NULLS LAST, p.found_at DESC NULLS LAST LIMIT $2`, [Object.keys(METIERS), combien * 10, NAF_EXCLUS, NOM_NON_LUCRATIF]);
  let faits = 0;
  const vues = new Set();
  for (const p of rows) {
    const adresse = String(p.contact_email).trim().toLowerCase();
    if (faits >= combien || exclus.has(p.siren) || !adresseFiable(p) || vues.has(adresse)) continue;   // une boîte = un e-mail
    vues.add(adresse);
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
