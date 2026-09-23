// CAS FIGÉS — Score rAIme v2.0 (trois axes, affiché sur 1000).
// Chaque cas fixe une propriété de la méthode : le maillon faible, la maturité qui se
// constate, l'échelle sur 1000, la v1 intacte.
import { scoreRaimeV2, depuisExtractionV2, formulerV2, scoreRaime, BAREME, BAREME_REALISME } from '../agents/score.js';

const TOUS_A = BAREME.map((b) => b.code);
const TOUS_R = BAREME_REALISME.filter((b) => b.groupe === 'demarche').map((b) => b.code);
const MATURE = { M1: true, M2: true, M3: true, M4: true };
const ECO_SOLIDE = { volumeMensuel: 400, tempsActuelMin: 12, tempsResiduelMin: 3, coutHoraire: 45,
                     miseEnRoute: 3000, abonnementMensuel: 150, partReaffectee: 0.8 };

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };

// 1. tout satisfait : 1000/1000
let r = scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: TOUS_R, maturite: MATURE } });
verifie('parfait = 1000', r.rendu && r.score === 1000 && r.sur === 1000, JSON.stringify(r.score));

// 2. maturité non constatée : le score n'est pas rendu, la donnée à obtenir est nommée
r = scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: TOUS_R } });
verifie('maturite absente = non rendu', !r.rendu && r.aObtenir.includes('M1'));

// 3. une seule clé de maturité manquante suffit
r = scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: TOUS_R, maturite: { M1: true, M2: true, M3: true } } });
verifie('M4 absente = non rendu', !r.rendu && r.aObtenir.join() === 'M4');

// 4. démarche absente (aucun pilote, aucune étape) : l'axe C devient le maillon faible
r = scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: [], maturite: MATURE } });
verifie('demarche absente : axe C faible', r.rendu && r.axeFaible === 'C' && r.score === 400, `${r.axeFaible} ${r.score}`);

// 5. client peu mature, démarche complète : 60/100 -> 600/1000
r = scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: TOUS_R, maturite: { M1: false, M2: true, M3: false, M4: true } } });
verifie('maturite partielle = 800', r.rendu && r.axeC.note === 80 && r.score === 800, `${r.axeC.note} ${r.score}`);

// 6. le plafond rédhibitoire de l'axe A reste en vigueur
r = scoreRaimeV2({ presents: TOUS_A.filter((c) => c !== 'C4'), economie: ECO_SOLIDE, realisme: { demarche: TOUS_R, maturite: MATURE } });
verifie('plafond C4 = 400', r.rendu && r.axeA.plafonne && r.score === 400 && r.axeFaible === 'A', `${r.score}`);

// 7. économie non mesurable : non rendu, les grandeurs manquantes sont listées
r = scoreRaimeV2({ presents: TOUS_A, economie: {}, realisme: { demarche: TOUS_R, maturite: MATURE } });
verifie('economie absente = non rendu', !r.rendu && r.aObtenir.includes('miseEnRoute'));

// 8. le minimum, jamais la moyenne
r = scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: ['R1'], maturite: MATURE } });
verifie('minimum des trois axes', r.score === Math.min(r.axeA.note, r.axeB.note, r.axeC.note) * 10);

// 9. un code de démarche inventé est refusé par l'axe, ignoré (et tracé) par la passerelle
let refuse = false;
try { scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: ['R9'], maturite: MATURE } }); } catch { refuse = true; }
verifie('code R9 refuse', refuse);
r = depuisExtractionV2({ criteres_satisfaits: [...TOUS_A, ...TOUS_R, 'R9', 'Z1'], economie: ECO_SOLIDE, maturite: MATURE });
verifie('passerelle : codes inventes ignores et traces', r.rendu && r.score === 1000 && /R9, Z1/.test(r.anomalie_extraction || ''));

// 10. la passerelle transmet une maturité absente comme absente (pas comme « non »)
r = depuisExtractionV2({ criteres_satisfaits: [...TOUS_A, ...TOUS_R], economie: ECO_SOLIDE });
verifie('passerelle : maturite absente = non rendu', !r.rendu);

// 11. la v1 est intacte : même entrée, score v1 sur 100
const v1 = scoreRaime({ presents: TOUS_A, economie: ECO_SOLIDE });
verifie('v1 intacte (sur 100)', v1.rendu && v1.version === '1.0' && v1.score === 100);

// 12. le rendu texte affiche /1000 et les trois axes
const t = formulerV2(scoreRaimeV2({ presents: TOUS_A, economie: ECO_SOLIDE, realisme: { demarche: TOUS_R, maturite: MATURE } }));
verifie('formulation /1000', /1000\/1000/.test(t) && /axe C realisme/.test(t));

console.log(`cas figes score v2 : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
