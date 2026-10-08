// LES NUMÉROS DE TÉLÉPHONE (08/10/2026) — une seule règle pour les agents (annuaire, Fureteur, sans site) et pour le
// Cockpit (le numéro que Basile saisit dans une fiche). Rangée dans jarvis/ : le Cockpit ne voit que ce dossier, et les
// agents la reprennent d'ici, sans copie.
//
// Précautions, reprises de l'agent annuaire (agents/annuaire.js) :
//   ① seul un format français valide est retenu, jamais une suite de chiffres quelconque ;
//   ② ni numéro surtaxé (08), ni numéro de gabarit (06 12 34 56 78, 01 11 11 11 11…) ;
//   ③ l'indicatif doit aller avec le département de l'entreprise, quand il est connu : un cabinet d'Annecy ne répond
//     pas sur un numéro de Pau (le standard du siège national, un partenaire, le pied de page d'un prestataire…).
'use strict';

// Normalise vers 0XXXXXXXXX, ou null si ce n'est pas un numéro français plausible.
function normaliser(brut) {
  let c = String(brut ?? '').replace(/[^\d+]/g, '');
  if (c.startsWith('0033')) c = '+33' + c.slice(4);
  if (c.startsWith('+33')) c = '0' + c.slice(3);
  if (!/^0[1-9]\d{8}$/.test(c)) return null;
  if (c.startsWith('08')) return null;                 // surtaxé
  if (/^(\d)\1{8}$/.test(c.slice(1))) return null;     // 0111111111 : gabarit de démonstration
  if (/^0[1-9]0{8}$/.test(c)) return null;
  // Numeros de demonstration sequentiels : 06 12 34 56 78, 01 23 45 67 89.
  if ('0123456789'.includes(c.slice(1)) || '9876543210'.includes(c.slice(1))) return null;
  if (/12345678|23456789|98765432|87654321/.test(c)) return null;   // 06 12 34 56 78 : le numéro des gabarits de site (07/10/2026)
  return c;
}

// La zone de numérotation (01 à 05) des départements où Sherlock cherche, et de leurs voisins. Un département absent
// de la liste n'est pas vérifié : rien n'est affirmé sans savoir.
const ZONES = {
  '74': '04', '73': '04', '01': '04', '38': '04', '69': '04', '26': '04', '07': '04', '42': '04', '39': '03',
  '75': '01', '77': '01', '78': '01', '91': '01', '92': '01', '93': '01', '94': '01', '95': '01',
};

// Un numéro va avec le département : un mobile (06, 07) ou un 09 partout ; sinon l'indicatif de sa zone. En
// Haute-Savoie, la règle de l'annuaire (04 5x ou 04 7x seulement), mesurée sur ses cabinets.
function coherent(numero, departement) {
  const n = normaliser(numero);
  if (!n) return false;
  if (/^0[679]/.test(n)) return true;
  const d = String(departement || '').trim().toUpperCase();
  if (d === '74') return ['045', '047'].includes(n.slice(0, 3));
  return ZONES[d] ? n.slice(0, 2) === ZONES[d] : true;
}

// Le numéro retenu, ou null : normalisé, et cohérent avec le département quand il est connu.
const verifier = (brut, departement) => {
  const n = normaliser(brut);
  return n && coherent(n, departement) ? n : null;
};

// « 0450123456 » → « 04 50 12 34 56 », la forme des fiches des vitrines.
const lisible = (n) => (normaliser(n) || '').replace(/(\d{2})(?=\d)/g, '$1 ');

// Deux écritures du même numéro (« +33 4 50 … », « 04.50… ») : comparées une fois normalisées.
const memeNumero = (a, b) => {
  const x = normaliser(a), y = normaliser(b);
  return !!x && x === y;
};

module.exports = { normaliser, coherent, verifier, lisible, memeNumero, ZONES };
