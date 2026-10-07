// Les pré-audits publiés sur raime.fr (un PDF par secteur, 2 pages, chiffrés par le ROI Engine). Un secteur sans
// pré-audit n'en reçoit aucun : rien d'inventé. Partagé par la page de validation (prospection.cjs) et par Héraut, qui
// ajoute ce lien — le seul permis — à l'e-mail d'automatisation (décision de Basile, 06/10/2026).
'use strict';

const PREAUDITS = [
  [/formation/i, 'organismes-formation'], [/comptab/i, 'experts-comptables'], [/avocat|notaire/i, 'avocats-notaires'],
  [/conseil/i, 'cabinets-conseil'], [/archi|b[âa]timent|construction/i, 'batiment-architecture'],
  [/CCI|OPCO|f[ée]d[ée]ration|syndicat|chambre/i, 'federations-chambres'], [/immobili/i, 'immobilier'],
  [/recrut|^RH /i, 'recrutement'], [/courti|courtage/i, 'assurance'],
];

function preaudit(secteur) {
  const p = PREAUDITS.find(([re]) => re.test(String(secteur || '')));
  return p ? `https://raime.fr/dossiers/rAIme-pre-audit-${p[1]}.pdf` : null;
}

// La phrase et le lien, posés juste avant la signature ; sans signature reconnue, l'e-mail reste tel quel.
const PHRASE = 'Pour vous donner une idée concrète, j\'ai préparé un pré-audit propre à votre secteur : ';
function ajouterPreaudit(corps, secteur) {
  const lien = preaudit(secteur);
  if (!lien || !/\nBien cordialement,/.test(corps) || corps.includes(lien)) return corps;
  return corps.replace(/\n(Bien cordialement,)/, `\n${PHRASE}${lien}\n\n$1`);
}

module.exports = { preaudit, ajouterPreaudit, PHRASE };
