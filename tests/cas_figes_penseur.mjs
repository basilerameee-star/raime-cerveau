// CAS FIGÉS — le penseur (la pensée de la nuit). Le code retire toute idée sans source vue, tout
// conseil de placement, toute certitude déguisée en prédiction.
import { verifier, formuler, consigne, MAX_PENSEES } from '../agents/penseur.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };
const J = '2026-09-25';
const faits = [
  { id: 'V1', texte: '[veille arxiv] Agents d’achat automatisés et heuristiques humaines', lien: 'https://arxiv.org/abs/1' },
  { id: 'V2', texte: '[veille github] langgenius/dify', lien: 'https://github.com/langgenius/dify' },
  { id: 'J1', texte: '[journal essayeur] slugify retenu, 25 tests réussis', lien: null },
];
const idee = (x = {}) => ({ titre: 'Idée', type: 'vente', vu: 'vu', conclusion: 'conclu', proposition: 'faire une page', sources: ['V1'], confiance: 0.6, prediction: null, ...x });

let r = verifier({ pensees: [idee()] }, faits, J);
verifie('idée sourcée gardée', r.gardees.length === 1 && r.gardees[0].sources[0].lien === 'https://arxiv.org/abs/1');
r = verifier({ pensees: [idee({ sources: ['X9'] })] }, faits, J);
verifie('source inventée : idée retirée', !r.gardees.length && /source/.test(r.retirees[0].motif));
r = verifier({ pensees: [idee({ sources: [] })] }, faits, J);
verifie('sans source : retirée', !r.gardees.length);
r = verifier({ pensees: [idee({ proposition: 'Achète des actions Nvidia avant la publication' })] }, faits, J);
verifie('conseil de placement : retiré', !r.gardees.length && /placement/.test(r.retirees[0].motif));
r = verifier({ pensees: [idee({ proposition: 'Proposer un audit aux agences qui vendent des voyages' })] }, faits, J);
verifie('proposition commerciale normale : gardée', r.gardees.length === 1);
r = verifier({ pensees: [idee({ prediction: { enonce: 'X arrive', echeance: '2026-12-31', probabilite: 0.4, domaine: 'ia' } })] }, faits, J);
verifie('prédiction datée et probable : gardée', r.gardees[0].prediction?.probabilite === 0.4);
r = verifier({ pensees: [idee({ prediction: { enonce: 'X arrive', echeance: '2026-12-31', probabilite: 1 } })] }, faits, J);
verifie('certitude (100 %) : prédiction retirée, idée gardée', r.gardees.length === 1 && r.gardees[0].prediction === null);
r = verifier({ pensees: [idee({ prediction: { enonce: 'X', echeance: '2026-09-27', probabilite: 0.5 } })] }, faits, J);
verifie('échéance trop proche (< 7 jours) : prédiction retirée', r.gardees[0].prediction === null);
r = verifier({ pensees: [idee({ prediction: { enonce: 'X', echeance: '2031-01-01', probabilite: 0.5 } })] }, faits, J);
verifie('échéance trop lointaine (> 1 an) : prédiction retirée', r.gardees[0].prediction === null);
r = verifier({ pensees: [idee(), idee(), idee(), idee(), idee()] }, faits, J);
verifie(`au plus ${MAX_PENSEES} idées`, r.gardees.length === MAX_PENSEES);
r = verifier({ pensees: [idee({ confiance: 7 })] }, faits, J);
verifie('confiance bornée à 1', r.gardees[0].confiance === 1);

const t = formuler(verifier({ pensees: [idee({ prediction: { enonce: 'X arrive', echeance: '2026-12-31', probabilite: 0.4 } })] }, faits, J).gardees, J);
verifie('texte du matin : j’ai vu, j’en conclus, je te propose, confiance, prédiction, sources',
  ['J\'ai vu', 'J\'en conclus', 'Je te propose', 'Ma confiance : 60 %', 'probabilité 40 %', 'Mes sources'].every((x) => t.includes(x)), t);
verifie('nuit sans idée : message sobre', /rien ne m'a paru assez solide/.test(formuler([], J)));
const c = consigne({ faits, buts: [{ horizon: 'moyen', enonce: 'Premier client payant' }], croyances: [], questions: [] }, J);
verifie('consigne : sources numérotées et interdiction de placement', c.user.includes('V1.') && /placement/.test(c.system));

console.log(`cas figes penseur : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
