// CAS FIGÉS — Arbitrage (plusieurs offres, Score rAIme v2.0, rapport ARB-01).
// Chaque cas fixe une règle que le rapport ne doit jamais trahir : le classement suit le
// score, un coût absent n'est jamais un zéro, la maturité ne se devine pas, les clauses
// C2, C3 et C4 passent en premier, et le même dossier donne le même rapport.
import { scoreRaimeV2, depuisExtractionV2, BAREME, BAREME_REALISME } from '../agents/score.js';
import { lireMaturite, coutTroisAns, aObtenirParEcrit, classer, recommander, rapportArbitrage, QUESTIONS, LIBELLES,
         lireCoutHoraire, renoter, nomPropre } from '../agents/arbitrage.js';
import { maturiteConstatee, coutHoraireConstate } from '../agents/auditeur.js';

const TOUS_A = BAREME.map((b) => b.code);
const TOUS_R = BAREME_REALISME.filter((b) => b.groupe === 'demarche').map((b) => b.code);
const MATURE = { M1: true, M2: true, M3: true, M4: true };
const ECO = { volumeMensuel: 400, tempsActuelMin: 12, tempsResiduelMin: 3, coutHoraire: 45,
              miseEnRoute: 3000, abonnementMensuel: 150, partReaffectee: 0.8,
              licencesMensuelles: 20, maintenanceAnnuelle: 600, joursInternes: 4, coutJour: 400 };

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };
const offre = (nom, presents, demarche, economie = ECO, maturite = MATURE) =>
  ({ nom, economie, constats: [], score: scoreRaimeV2({ presents, economie, realisme: { demarche, maturite } }) });

// 1. lecture de la maturité saisie
verifie('maturite lue', JSON.stringify(lireMaturite('M1=oui,M2=non,M3=Oui,M4=0')) === '{"M1":true,"M2":false,"M3":true,"M4":false}');
verifie('maturite vide = null', lireMaturite('') === null && lireMaturite(null) === null);
let refuse = false; try { lireMaturite('M5=oui'); } catch { refuse = true; }
verifie('code M5 refuse', refuse);
refuse = false; try { lireMaturite('M1=peut-etre'); } catch { refuse = true; }
verifie('valeur floue refusee', refuse);

// 2. la maturité vient du constat, jamais d'une valeur floue
verifie('constat : argument prioritaire', JSON.stringify(maturiteConstatee({ M1: true }, { profile: { maturite: { M1: false } } })) === '{"M1":true}');
verifie('constat : fiche client en secours', maturiteConstatee(null, { profile: { maturite: MATURE } })?.M4 === true);
verifie('constat : non booleen ecarte', maturiteConstatee({ M1: 'oui', M2: 1 }, null) === null);

// 3. coût sur 3 ans : complet, puis partiel (jamais un zéro silencieux)
let c = coutTroisAns(ECO);
verifie('cout complet', c.complet && c.total === 3000 + 170 * 36 + 1800 + 1600, JSON.stringify(c));
c = coutTroisAns({ miseEnRoute: 5000, abonnementMensuel: 100 });
verifie('cout partiel = au moins', !c.complet && c.total === 5000 + 3600 && c.nonChiffre.includes('maintenance') && c.nonChiffre.includes('licences'));
c = coutTroisAns({});
verifie('aucun chiffre = total null', c.total === null && !c.complet);

// 4. à obtenir par écrit : C2, C3, C4 d'abord, puis par poids ; la maturité n'y est jamais
let s = scoreRaimeV2({ presents: TOUS_A.filter((x) => !['C2', 'B7', 'D3'].includes(x)), economie: ECO,
                      realisme: { demarche: ['R1'], maturite: MATURE } });
let m = aObtenirParEcrit(s).map((x) => x.code);
verifie('C2 en tete', m[0] === 'C2', m.join());
verifie('ordre des poids', m.indexOf('B7') < m.indexOf('D3') && m.indexOf('R2') < m.indexOf('R3'), m.join());
verifie('pas de code M', !m.some((x) => x.startsWith('M')));
verifie('chaque manque a sa question', aObtenirParEcrit(s).every((x) => x.question && x.question === QUESTIONS[x.code]));

// 5. maturité non constatée : la démarche manquante se demande quand même au prestataire
s = scoreRaimeV2({ presents: TOUS_A, economie: ECO, realisme: { demarche: ['R1', 'R2'] } });
m = aObtenirParEcrit(s).map((x) => x.code);
verifie('demarche lue sans maturite', !s.rendu && m.join() === 'R3,R4,R5', m.join());

// 6. classement : le score d'abord, puis le coût complet le plus bas
const A = offre('Alpha', TOUS_A, TOUS_R);                                           // 1000
const B = offre('Beta', TOUS_A, ['R1', 'R2', 'R3', 'R4']);                          // C = 90 -> 900
const B2 = offre('Bravo', TOUS_A, ['R1', 'R2', 'R3', 'R4'], { ...ECO, miseEnRoute: 2000 }); // 900, moins chere
const Z = { nom: 'Zeta', economie: {}, constats: [], score: scoreRaimeV2({ presents: TOUS_A, economie: {}, realisme: { demarche: TOUS_R, maturite: MATURE } }) };
let cl = classer([Z, B, A, B2]);
verifie('ordre par score', cl.notees.map((o) => o.nom).join() === 'Alpha,Bravo,Beta', cl.notees.map((o) => o.nom).join());
verifie('non notee a part', cl.nonNotees.length === 1 && cl.nonNotees[0].nom === 'Zeta');

// 7. recommandation lue sur l'échelle publique
verifie('signable', recommander(classer([A, B])).type === 'signer');
verifie('egalite : la moins chere devant, et dite', /moins|coût sur trois ans/.test(recommander(classer([B, B2])).texte) && recommander(classer([B, B2])).offre === 'Bravo');
const C6 = offre('Gamma', TOUS_A, ['R1', 'R2', 'R3'], ECO, { M1: true, M2: true, M3: false, M4: false }); // C = 60
verifie('sous conditions a 600', recommander(classer([C6])).type === 'conditions', recommander(classer([C6])).texte);
const D = offre('Delta', TOUS_A.filter((x) => x !== 'C4'), TOUS_R);                   // plafond 40 -> 400
verifie('renegocier a 400', recommander(classer([D])).type === 'renegocier' && /sincérité/.test(recommander(classer([D])).texte));
const E = offre('Epsilon', TOUS_A, [], ECO, { M1: false, M2: false, M3: false, M4: false }); // C = 0
verifie('redemander sous 400', recommander(classer([E])).type === 'redemander');
verifie('aucune notee : obtenir, en mots', recommander(classer([Z])).type === 'obtenir' && /prix de mise en route/.test(recommander(classer([Z])).texte) && !/miseEnRoute/.test(recommander(classer([Z])).texte));

// 8. le rapport : complet, déterministe, fidèle aux chiffres
const dossier = { client: 'Cabinet Essai', date: '24 septembre 2026', offres: [A, B, Z], maturite: MATURE };
const r1 = rapportArbitrage(dossier).markdown;
const r2 = rapportArbitrage(dossier).markdown;
verifie('rapport deterministe', r1 === r2);
verifie('cinq parties', ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.'].every((x) => r1.includes(x)));
verifie('scores sur 1000', r1.includes('1000 / 1000') && r1.includes('900 / 1000'));
verifie('offre non notee visible', /Zeta.*non noté/.test(r1));
verifie('cout complet affiche', /12\s520 €/.test(r1), 'total Alpha attendu : 12 520 €');
verifie('ref ARB-01', r1.includes('ref: ARB-01'));
verifie('sans maturite : dit', rapportArbitrage({ ...dossier, maturite: null }).markdown.includes('Maturité non constatée'));

// 9. passerelle v2 + rapport : un code M renvoyé par le modèle est ignoré et tracé
const viaModele = depuisExtractionV2({ criteres_satisfaits: [...TOUS_A, ...TOUS_R, 'M1'], economie: ECO, maturite: MATURE });
verifie('code M du modele trace', /M1/.test(viaModele.anomalie_extraction || ''));

// 10. tout code du barème a son libellé affiché (et sa question, sauf la maturité) ; aucun texte ASCII ne fuit
verifie('libelles complets', [...BAREME, ...BAREME_REALISME].every((b) => LIBELLES[b.code]));
verifie('questions completes', [...BAREME, ...BAREME_REALISME.filter((b) => b.groupe === 'demarche')].every((b) => QUESTIONS[b.code]));
const rD = rapportArbitrage({ ...dossier, offres: [D, offre('Sigma', TOUS_A.filter((x) => x !== 'D1'), TOUS_R, { ...ECO, partReaffectee: undefined })] }).markdown;
verifie('accents au rapport', rD.includes('À renégocier') && rD.includes('Une référence vérifiable') && !/renegocier|reference verifiable|plafonne a/.test(rD));
verifie('reserve de reaffectation', rD.includes('valeur conventionnelle de 50 %'));

// 11. le coût horaire est un fait du client : saisi une fois, il prime, et renote sans modèle
verifie('cout horaire lu', lireCoutHoraire('38') === 38 && lireCoutHoraire('38,5') === 38.5 && lireCoutHoraire('-') === null && lireCoutHoraire('') === null);
refuse = false; try { lireCoutHoraire('beaucoup'); } catch { refuse = true; }
verifie('cout horaire illisible refuse', refuse);
verifie('cout horaire : fiche client en secours', coutHoraireConstate(null, { profile: { cout_horaire: 42 } }) === 42 && coutHoraireConstate(null, null) === null);
const releve = { criteres_satisfaits: [...TOUS_A, ...TOUS_R], economie: { ...ECO, coutHoraire: undefined } };
verifie('sans cout horaire : non note', !renoter(releve, { maturite: MATURE }).rendu && renoter(releve, { maturite: MATURE }).aObtenir.includes('coutHoraire'));
verifie('avec cout horaire client : note', renoter(releve, { maturite: MATURE, coutHoraire: 45 }).rendu);
const vendeur = { criteres_satisfaits: [...TOUS_A, ...TOUS_R], economie: { ...ECO, coutHoraire: 90 } };
verifie('le client prime sur le vendeur', renoter(vendeur, { maturite: MATURE, coutHoraire: 20 }).axeB.gainBrut < renoter(vendeur, { maturite: MATURE }).axeB.gainBrut);
const rH = rapportArbitrage({ ...dossier, coutHoraire: 38 }).markdown;
verifie('cout horaire affiche', /Coût horaire chargé de vos équipes : 38 €/.test(rH));

// 12. le nom du prestataire au rapport, sans la précision ajoutée à la lecture
verifie('nom propre', nomPropre('Atelier Sobre (Claire Martin, fondatrice)') === 'Atelier Sobre' && nomPropre('NexaFlow SAS') === 'NexaFlow SAS' && nomPropre('(inconnu)') === '(inconnu)');

console.log(`cas figes arbitrage : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
