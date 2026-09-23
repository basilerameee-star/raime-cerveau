// CAS FIGÉS — la mémoire des erreurs déjà commises.
// Chaque cas ici est un bug qui a existé pour de vrai. Un bug corrigé sans cas figé
// revient toujours. C'est ce fichier qui empêche la machine de régresser en silence.
import { nomExploitable, enteteRoutage, estBoiteGenerique } from '../agents/heraut.js';

const CAS = [
  // — Personnes morales prises pour des dirigeants (bug reel du 2026-09-03)
  ['nom', ['COGERA EXPERTISE', 'DOMINO PRESTATIONS'], null],
  ['nom', ['BAKER TILLY STREGO', 'NOVETUDE SANTE'], null],
  ['nom', ['ANDERLAINE AUDIT', 'ENDRIX LYO'], null],
  ['nom', ['BATMAX UNIVERSE', 'GAME SUP'], null],
  ['nom', ['EUREX COMPAGNIE FIDUCIAIRE EUROPEENNE', 'X'], null],
  ['nom', ['SCP MARTIN ET ASSOCIES', 'X'], null],
  // — Le dirigeant porte le nom de sa societe : on renonce plutot que se tromper
  ['nom', ['ALPES FORMATION', 'ALPES FORMATION CONSEIL'], null],
  // — Vraies personnes : elles doivent passer
  ['nom', ['PATRICK MAURICE', 'DOUGS'], 'Patrick Maurice'],
  ['nom', ['FLORENCE MARIE MARTIN', 'ACCOMPAGNEMENT RH'], 'Florence Martin'],
  ['nom', ['JEAN-MARC DUSSOLLIET-BERTHOD', 'MG PARMELAN'], 'Jean-Marc Dussolliet-Berthod'],
  ['nom', ['AGNES BAUD', 'CFA 74'], 'Agnes Baud'],
  // — Boites generiques vs nominatives
  ['generique', ['contact@x.fr'], true],
  ['generique', ['secretariat@x.fr'], true],
  ['generique', ['j.dupont@x.fr'], false],
  ['generique', ['florence.martin@x.fr'], false],
  // — En-tete : une adresse nominative ne recoit jamais d'en-tete de routage
  ['entete_nul', ['j.dupont@x.fr', 'JEAN DUPONT', 'X'], true],
  ['entete_escalade', ['contact@x.fr', 'COGERA EXPERTISE', 'DOMINO'], true],
  ['entete_nominatif', ['contact@x.fr', 'PATRICK MAURICE', 'DOUGS'], true],
];

let ko = 0;
for (const [type, args, attendu] of CAS) {
  let obtenu, ok;
  if (type === 'nom')                { obtenu = nomExploitable(...args);   ok = obtenu === attendu; }
  else if (type === 'generique')     { obtenu = estBoiteGenerique(...args); ok = obtenu === attendu; }
  else if (type === 'entete_nul')    { obtenu = enteteRoutage(...args);    ok = obtenu === null; }
  else if (type === 'entete_escalade'){ obtenu = enteteRoutage(...args);   ok = /de la direction/.test(obtenu || ''); }
  else if (type === 'entete_nominatif'){ obtenu = enteteRoutage(...args);  ok = /Patrick Maurice, direction/.test(obtenu || ''); }
  if (!ok) { ko++; console.log(`  ECHEC [${type}] ${JSON.stringify(args)} -> ${JSON.stringify(obtenu)} (attendu ${JSON.stringify(attendu)})`); }
}
console.log(ko === 0 ? `cas figes : ${CAS.length}/${CAS.length} OK` : `cas figes : ${ko} ECHEC(S) sur ${CAS.length}`);
process.exit(ko === 0 ? 0 : 1);
