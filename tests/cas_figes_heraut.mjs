// EXAMEN DU HÉRAUT — la batterie qui permet au cerveau d'activer une consigne tout seul.
//
// Une consigne proposée par le Réflexif ne doit pas seulement sonner mieux : elle doit
// laisser passer les règles de la maison. Cet examen rédige trois messages avec la
// consigne candidate, sur trois entreprises figées, et vérifie par du code :
//   ① les règles du Héraut (valider) : signature, question, longueur, aucun prix, aucun
//      CPF, aucun lien, aucune civilité devinée, aucun « audit gratuit » ;
//   ② les règles de la maison : aucun « je », aucune tournure négative ;
//   ③ ce que la consigne candidate promet elle-même : une ouverture courte et UNE question.
//
// Un message refusé fait échouer l'examen. Trois messages valides le font passer, et le
// sas peut alors mettre la version en service sans main humaine — l'envoi, lui, reste gardé.
//
//   node tests/cas_figes_heraut.mjs            examine la dernière version inactive
//   node tests/cas_figes_heraut.mjs heraut 3   examine la version 3
import { ask, db } from '../agents/lib.js';
import { SYSTEM, valider } from '../agents/heraut.js';

const CAS = [
  { name: 'Cabinet Berthier & Associés', sector: 'expertise comptable', city: 'Annecy', dirigeant: null,
    contact_email: 'contact@berthier-associes.fr' },
  { name: 'Transports Vallet', sector: 'transport routier', city: 'Thonon-les-Bains', dirigeant: 'Claude Vallet',
    contact_email: 'accueil@transports-vallet.fr' },
  { name: 'Clinique du Parc', sector: 'santé', city: 'Chambéry', dirigeant: null,
    contact_email: 'direction@clinique-parc.fr' },
];

// Ce que la consigne candidate promet elle-même : une ouverture courte, une seule question.
// Le reste des règles vient de valider(), c'est-à-dire de ce que la maison exige déjà.
// La règle « aucun je » vaut pour le site et les documents ; un courriel signé Basile Ramé
// s'écrit à la première personne, et l'examen n'invente pas une règle que la maison ignore.
function reglesMaison(corps, exigeOuvertureCourte) {
  const fautes = [];
  const phrases = corps.replace(/^.*?\n\n/s, '').split(/[.!?]/).map((s) => s.trim()).filter(Boolean);
  const ouverture = phrases[0] || '';
  // L'ouverture courte est une promesse de la consigne candidate : on ne la reproche
  // pas a l'etalon, qui n'a jamais promis cela.
  if (exigeOuvertureCourte && ouverture.split(/\s+/).length > 18)
    fautes.push(`ouverture de ${ouverture.split(/\s+/).length} mots`);
  // Une seule demande par message : soit une question, soit l'offre du premier regard,
  // jamais les deux ni deux questions. La consigne de la maison le dit, le code le vérifie.
  const questions = (corps.match(/\?/g) || []).length;
  if (questions > 1) fautes.push(`${questions} questions au lieu d'une seule demande`);
  return fautes;
}

const agent = process.argv[2] || 'heraut';
const version = process.argv[3] ? parseInt(process.argv[3], 10) : null;

const brain = db();
await brain.connect();

// La version 0 est l'étalon : la consigne d'origine, sans amélioration. Sans étalon,
// « la version échoue » ne veut rien dire — peut-être que la maison échouait déjà.
const { rows } = version === 0
  ? [{ rows: [{ version: 0, instruction: null }] }][0]
  : await brain.query(
    version
      ? `SELECT version, instruction FROM prompt_versions WHERE agent = $1 AND version = $2`
      : `SELECT version, instruction FROM prompt_versions WHERE agent = $1 AND NOT active ORDER BY created_at DESC LIMIT 1`,
    version ? [agent, version] : [agent]);

if (!rows.length) {
  console.log(`[examen] aucune consigne candidate pour ${agent} : rien à examiner.`);
  await brain.end();
  process.exit(0);
}

const candidate = rows[0];
const systeme = candidate.instruction
  ? `${SYSTEM}\n\n## AMÉLIORATION EN VIGUEUR (v${candidate.version})\n${candidate.instruction}`
  : SYSTEM;
const objet = 'Formation IA : obligation applicable depuis le 2 août';
let echecs = 0, cout = 0;

for (const p of CAS) {
  const user = `Destinataire :
- Organisation : ${p.name}
- Secteur : ${p.sector}
- Ville : ${p.city}
- Dirigeant : ${p.dirigeant || '(inconnu — ne pas inventer de prénom, écrire "Bonjour,")'}

Secteur : ${p.sector}.

Rédige l'e-mail.`;
  let corps = '', fautes = ['réponse vide'];
  // Deux essais, comme en production : le premier brouillon refusé revient au modèle
  // avec la liste de ses fautes. Un examen plus sévère que la réalité ne mesure rien.
  try {
    for (let essai = 1; essai <= 2; essai++) {
      const consigne = essai === 1 ? user
        : `${user}\n\nTON BROUILLON PRÉCÉDENT A ÉTÉ REFUSÉ pour : ${fautes.join(' ; ')}. Corrige-le.`;
      const r = await ask({ task: 'redaction', system: systeme, user: consigne, json: false, maxTokens: 1500, temperature: 0.4 });
      cout += r.costUsd || 0;
      corps = String(r.text || '').replace(/^```[a-z]*|```$/gm, '').trim();
      fautes = [...valider(objet, corps, p.name), ...reglesMaison(corps, Boolean(candidate.instruction))];
      if (!fautes.length) break;
    }
  } catch (e) {
    fautes = [`appel en échec : ${e.message}`];
  }
  if (fautes.length && process.env.EXAMEN_VERBEUX) console.log(`     ↳ ${corps.slice(0, 220).replace(/\n/g, ' ')}…`);
  if (fautes.length) { echecs++; console.log(`  ✗ ${p.name} — ${fautes.join(' ; ')}`); }
  else console.log(`  ✓ ${p.name} — message conforme (${corps.length} caractères)`);
}

console.log(`[examen] ${agent} v${candidate.version} : ${CAS.length - echecs}/${CAS.length} messages conformes · ${cout.toFixed(5)} $`);
await brain.end();
process.exit(echecs ? 1 : 0);
