// CAS FIGÉS — garde-fous de la chaîne d'audit.
// Chaque cas est un rapport qui ne doit JAMAIS partir chez un client, ou au contraire
// un rapport sain qui ne doit pas être bloqué à tort. Un garde-fou trop zélé qui bloque
// les rapports valables serait aussi nuisible qu'un garde-fou absent.
import { validerAudit } from '../agents/garde_audit.js';

const constatSain = { titre: 'Volumétrie non établie', constat: 'La proposition ne précise pas le volume traité.',
                      source: 'section 2 du devis', preuve: 'B', risque: 'eleve', score: 2 };

const CAS = [
  // — Doivent BLOQUER
  ['sanction chiffrée', { recommandation: "En cas de contrôle, l'amende peut atteindre 7,5 millions d'euros.", constats: [constatSain] }, true],
  ['sanction en % du CA', { recommandation: 'Vous risquez une sanction de 1,5 % du chiffre d affaires mondial.', constats: [constatSain] }, true],
  ['financement CPF', { recommandation: 'La formation associée est finançable par le CPF du dirigeant.', constats: [constatSain] }, true],
  ['financement OPCO', { recommandation: 'Votre OPCO prendra en charge la mise en conformité.', constats: [constatSain] }, true],
  ['promesse certaine', { recommandation: 'Vous économiserez 11 000 € sur douze mois.', constats: [constatSain] }, true],
  ['résultat garanti', { recommandation: 'Le gain est garanti sur ce périmètre.', constats: [constatSain] }, true],
  ['diffamation', { recommandation: 'Cette proposition relève de l escroquerie pure.', constats: [constatSain] }, true],
  ['prestataire incompétent', { recommandation: 'Le prestataire est manifestement incompétent.', constats: [constatSain] }, true],
  ['référence inventée', { recommandation: 'Nos clients du même secteur ont divisé ce coût par trois.', constats: [constatSain] }, true],
  ['violation dans un constat', { recommandation: 'Demander le protocole de mesure.',
    constats: [{ ...constatSain, constat: 'Le prestataire est malhonnête sur ce point.' }] }, true],

  // — Ne doivent PAS bloquer : ce sont des rapports légitimes
  ['rapport sain', { recommandation: "Demander au prestataire le protocole de mesure du taux de 99 %, puis comparer à un scénario déterministe.",
    constats: [constatSain] }, false],
  ['écart chiffré sans promesse', { recommandation: "L écart estimé entre la proposition et un scénario sobre est de l ordre de 11 000 €, sous réserve des volumes réels.",
    constats: [constatSain] }, false],
  ['obligation citée sans montant', { recommandation: "L article 4 du règlement européen impose de former et de documenter. Les pénalités relèvent des États membres.",
    constats: [constatSain] }, false],
  ['critique de la proposition', { recommandation: "La proposition surdimensionne le modèle au regard de la tâche décrite.",
    constats: [constatSain] }, false],

  // — Phrases RÉELLES de nos audits, bloquées à tort par la première version de la règle.
  // Chacune est un bug qui a existé : elles ne doivent plus jamais être bloquées.
  ['réversibilité non garantie (réel)', { recommandation: "L export des données et workflows n est pas garanti. Le client ne pourrait pas changer de prestataire sans perdre l investissement.",
    constats: [constatSain] }, false],
  ['exiger des garanties (réel)', { recommandation: "Exiger des garanties contractuelles de réversibilité, de responsabilité et de portabilité des données.",
    constats: [constatSain] }, false],
  ['garantir contractuellement (réel)', { recommandation: "Retenir un socle de règles et un petit modèle, et garantir contractuellement la réversibilité.",
    constats: [constatSain] }, false],
  ['absence de garantie UE (réel)', { recommandation: "En l absence de clauses contractuelles types ou de garanties de localisation UE, le traitement des données personnelles est insuffisamment encadré.",
    constats: [constatSain] }, false],

  // — Mais la vraie promesse doit toujours bloquer.
  ['nous garantissons', { recommandation: "Nous vous garantissons une réduction du coût de traitement.", constats: [constatSain] }, true],
  ['gain garanti', { recommandation: "Le gain est garanti dès le premier trimestre.", constats: [constatSain] }, true],
];

let ko = 0;
for (const [nom, audit, doitBloquer] of CAS) {
  const v = validerAudit(audit);
  if (v.bloquant !== doitBloquer) {
    ko++;
    console.log(`  ECHEC [${nom}] bloquant=${v.bloquant}, attendu ${doitBloquer}` +
      (v.violations.length ? ` — ${v.violations.map(x => x.code).join(', ')}` : ''));
  }
}

// Un constat sans source ni preuve doit être signalé, sans bloquer la livraison.
const incomplet = validerAudit({ recommandation: 'Rien à signaler.', constats: [{ titre: 'X', constat: 'Y' }] });
if (incomplet.bloquant) { ko++; console.log('  ECHEC [constat incomplet] ne doit pas bloquer, seulement signaler'); }
if (!incomplet.violations.some(v => v.code === 'constat_incomplet')) { ko++; console.log('  ECHEC [constat incomplet] non signale'); }

console.log(ko === 0 ? `cas figes audit : ${CAS.length + 2}/${CAS.length + 2} OK` : `cas figes audit : ${ko} ECHEC(S)`);
process.exit(ko === 0 ? 0 : 1);
