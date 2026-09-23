// CAS FIGÉS — SCORE rAIme
//
// Un score publié comme référence doit être reproductible par un tiers, y compris
// contre nous. Ce fichier est la preuve que l'implémentation applique la méthode
// publiée, et le garde-fou qui empêche un « petit ajustement » de la déplacer en
// silence. Toucher un poids sans toucher ce fichier fait échouer le déploiement.
import { scoreRaime, axeA, axeB, depuisExtraction, BAREME, VERSION, REDHIBITOIRES } from '../agents/score.js';

const TOUS = BAREME.map((b) => b.code);
const SAUF = (...codes) => TOUS.filter((c) => !codes.includes(c));

// Économie de référence : elle vient du cas type de la formation dirigeant.
// 400 dossiers/mois, 6 min l'un, 26 €/h, 1,5 min résiduel, 60 % réaffecté,
// 12 000 € de mise en route, 390 €/mois, 8 jours internes à 280 €.
// Gain net 5 616 € — récurrent 4 680 € — unique 14 240 € — retour 183 mois.
const ECO_TYPE = {
  volumeMensuel: 400, tempsActuelMin: 6, tempsResiduelMin: 1.5, coutHoraire: 26,
  partReaffectee: 0.6, miseEnRoute: 12000, abonnementMensuel: 390,
  joursInternes: 8, coutJour: 280,
};
// Même dossier, mise en route et abonnement ramenés au raisonnable :
// retour 13 mois — le palier « défendable », 75.
const ECO_MOYENNE = { ...ECO_TYPE, miseEnRoute: 2000, abonnementMensuel: 120 };
// Et le même encore, avec deux fois moins de jours internes : retour 9 mois,
// dernier mois du palier maximum. Verrouille la borne haute de l'échelle.
const ECO_BONNE = { ...ECO_MOYENNE, joursInternes: 4 };

const CAS = [];
const cas = (nom, fn) => CAS.push([nom, fn]);

// ── La méthode elle-même ───────────────────────────────────────────────────
cas('le bareme totalise exactement 100', () =>
  BAREME.reduce((s, b) => s + b.poids, 0) === 100);

cas('le bareme compte 22 criteres', () => BAREME.length === 22);

cas('aucun code de critere en double', () =>
  new Set(TOUS).size === TOUS.length);

cas('les trois redhibitoires existent au bareme', () =>
  REDHIBITOIRES.every((c) => TOUS.includes(c)));

// ── Axe A ──────────────────────────────────────────────────────────────────
cas('proposition complete : axe A = 100', () => axeA(TOUS).note === 100);

cas('proposition vide : axe A = 0', () => axeA([]).note === 0);

cas('un code inconnu leve une erreur plutot que de l ignorer', () => {
  try { axeA(['A1', 'Z9']); return false; } catch { return true; }
});

// Le plafond rédhibitoire — la règle la plus facile à casser par inadvertance.
cas('C2 absent : axe A plafonne a 40 malgre 93 points bruts', () => {
  const a = axeA(SAUF('C2'));
  return a.brut === 93 && a.note === 40 && a.plafonne === true;
});
cas('C3 absent : plafonne', () => axeA(SAUF('C3')).note === 40);
cas('C4 absent : plafonne', () => axeA(SAUF('C4')).note === 40);
cas('les trois redhibitoires presents : aucun plafond', () =>
  axeA(SAUF('D5')).plafonne === false);
cas('sous le plafond, le plafond ne remonte jamais la note', () =>
  axeA(['A1', 'A2']).note === 9);

// ── Axe B ──────────────────────────────────────────────────────────────────
cas('cas type : retour 183 mois, note 0', () => {
  const b = axeB(ECO_TYPE);
  return b.mesurable && b.roiMois === 183 && b.note === 0
    && b.gainNet === 5616 && b.coutRecurrent === 4680 && b.coutUnique === 14240;
});

cas('mise en route plus basse : 13 mois, palier defendable a 75', () => {
  const b = axeB(ECO_MOYENNE);
  return b.mesurable && b.roiMois === 13 && b.note === 75;
});

cas('borne haute de l echelle : 9 mois donne encore 100', () => {
  const b = axeB(ECO_BONNE);
  return b.roiMois === 9 && b.note === 100;
});

cas('un mois de plus fait tomber du palier maximum', () => {
  // 10 mois n'est plus « a l'interieur d'un exercice » : l'echelle doit basculer.
  const b = axeB({ ...ECO_BONNE, miseEnRoute: 2200 });
  return b.roiMois === 10 && b.note === 90;
});

cas('marge nulle ou negative : retour jamais, note 0', () => {
  const b = axeB({ ...ECO_TYPE, abonnementMensuel: 900 });
  return b.roiMois === null && b.note === 0;
});

cas('une grandeur manquante rend l axe B non mesurable', () => {
  const b = axeB({ ...ECO_TYPE, coutHoraire: undefined });
  return b.mesurable === false && b.manquantes.includes('coutHoraire') && b.note === null;
});

cas('zero est une valeur, pas une absence', () => {
  // Une mise en route offerte est une information, pas une donnee manquante.
  const b = axeB({ ...ECO_TYPE, miseEnRoute: 0 });
  return b.mesurable === true && b.coutUnique === 2240;
});

cas('reaffectation absente : convention 0,5 appliquee et signalee', () => {
  const b = axeB({ ...ECO_TYPE, partReaffectee: undefined });
  return b.partReaffectee === 0.5 && b.reaffectationDocumentee === false
    && b.gainNet === Math.round(b.gainBrut * 0.5);
});

cas('temps residuel superieur au temps actuel : gain nul, jamais negatif', () => {
  const b = axeB({ ...ECO_TYPE, tempsResiduelMin: 99 });
  return b.gainBrut === 0 && b.gainNet === 0 && b.roiMois === null;
});

cas('une part reaffectee hors bornes est ramenee dans [0,1]', () =>
  axeB({ ...ECO_TYPE, partReaffectee: 4 }).partReaffectee === 1);

// ── La règle centrale : le minimum, jamais la moyenne ──────────────────────
cas('axe A 100 et axe B 0 donnent 0, surtout pas 50', () => {
  const r = scoreRaime({ presents: TOUS, economie: ECO_TYPE });
  return r.rendu && r.axeA.note === 100 && r.axeB.note === 0
    && r.score === 0 && r.axeFaible === 'B';
});

cas('axe B excellent et axe A plafonne donnent le plafond', () => {
  const r = scoreRaime({ presents: SAUF('C4'), economie: ECO_BONNE });
  return r.score === 40 && r.axeFaible === 'A' && r.mention === 'A renegocier';
});

cas('proposition irreprochable : 100, signable', () => {
  const r = scoreRaime({ presents: TOUS, economie: ECO_BONNE });
  return r.score >= 90 && r.mention === 'Signable';
});

// ── Ce qui n'est pas mesurable n'est pas rendu ─────────────────────────────
cas('axe B non mesurable : aucun score rendu, meme avec un axe A parfait', () => {
  const r = scoreRaime({ presents: TOUS, economie: { volumeMensuel: 400 } });
  return r.rendu === false && r.score === undefined
    && Array.isArray(r.donneesManquantes) && r.donneesManquantes.length > 0;
});

// ── Le cas NOVAFLUX ────────────────────────────────────────────────────────
// Sujet de l'epreuve d'evaluation de la formation dirigeant (EVAL-02). Les
// chiffres du corrige sont imprimes et remis a des clients : ils ne peuvent
// plus bouger sans que ce test le signale.
cas('cas NOVAFLUX : 17 280 € de gain net, 32 mois, score 21 a refaire', () => {
  const r = scoreRaime({
    presents: ['A1', 'A2', 'B1', 'B2', 'C1', 'D2'],
    economie: {
      volumeMensuel: 1500, tempsActuelMin: 4, tempsResiduelMin: 0.8, coutHoraire: 30,
      partReaffectee: 0.6, miseEnRoute: 24000, abonnementMensuel: 690,
    },
  });
  return r.axeB.gainNet === 17280 && r.axeB.coutRecurrent === 8280
    && r.axeB.roiMois === 32 && r.axeB.note === 35
    && r.axeA.note === 21 && r.axeA.plafonne === true
    && r.score === 21 && r.mention === 'A refaire';
});

cas('un plafond abaisse, il ne releve jamais', () => {
  // Piege reel : croire que « plafonne a 40 » veut dire « vaut 40 ».
  const a = axeA(['A1', 'A2']);
  return a.plafonne === true && a.note === 9;
});

// ── Passerelle d'extraction : ce que le modele rend n'est jamais pris tel quel ─
cas('un code invente par le modele est ignore, et trace', () => {
  const r = depuisExtraction({ criteres_satisfaits: ['A1', 'E9', 'Z1'], economie: ECO_BONNE });
  return r.axeA.note === 4 && /E9, Z1/.test(r.anomalie_extraction || '');
});

cas('un critere reporte deux fois ne compte qu une fois', () => {
  const r = depuisExtraction({ criteres_satisfaits: ['A2', 'A2', 'A2'], economie: ECO_BONNE });
  return r.axeA.note === 5;
});

cas('null n est pas zero : une grandeur nulle rend l axe B non mesurable', () => {
  // Le piege exact : lire « mise en route inconnue » comme « mise en route gratuite »
  // rendrait rentable une proposition dont on ignore le prix.
  const r = depuisExtraction({
    criteres_satisfaits: TOUS,
    economie: { ...ECO_BONNE, miseEnRoute: null },
  });
  return r.rendu === false && r.donneesManquantes.includes('miseEnRoute');
});

cas('une mise en route reellement offerte, elle, se calcule', () => {
  const r = depuisExtraction({ criteres_satisfaits: TOUS, economie: { ...ECO_BONNE, miseEnRoute: 0 } });
  return r.rendu === true && r.axeB.coutUnique === 1120;
});

cas('une extraction vide ne fait pas tomber la chaine', () => {
  const r = depuisExtraction({});
  return r.rendu === false && r.axeA.note === 0;
});

// ── Déterminisme ───────────────────────────────────────────────────────────
cas('deux appels identiques donnent un resultat identique', () => {
  const a = JSON.stringify(scoreRaime({ presents: SAUF('B3', 'D1'), economie: ECO_TYPE }));
  const b = JSON.stringify(scoreRaime({ presents: SAUF('B3', 'D1'), economie: ECO_TYPE }));
  return a === b;
});

cas('l ordre des criteres fournis ne change rien', () => {
  const a = axeA(['A1', 'B7', 'C2']).note;
  const b = axeA(['C2', 'A1', 'B7']).note;
  return a === b;
});

cas('la version est portee par tout resultat', () => {
  const r = scoreRaime({ presents: TOUS, economie: ECO_BONNE });
  return r.version === VERSION && VERSION === '1.0';
});

// ── Exécution ──────────────────────────────────────────────────────────────
let ko = 0;
for (const [nom, fn] of CAS) {
  let ok = false;
  try { ok = fn() === true; } catch (e) { ok = false; nom.length; }
  if (!ok) { ko++; console.log(`  ECHEC  ${nom}`); }
}
console.log(ko === 0
  ? `cas figes score : ${CAS.length}/${CAS.length} OK`
  : `cas figes score : ${ko} ECHEC(S) sur ${CAS.length}`);
process.exit(ko === 0 ? 0 : 1);
