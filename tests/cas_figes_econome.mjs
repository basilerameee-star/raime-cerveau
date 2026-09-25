// CAS FIGÉS — l'économe : le cerveau règle sa dépense pour ne pas dépasser le plafond du mois.
import { regime, joursRestantsDuMois, PAYANTS, ESSENTIELS } from '../agents/econome.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };

// La situation du 25/09/2026 : 3,07 € dépensés, 0,13 €/jour, 2,9 € de crédits, 5,5 jours restants
let r = regime({ depenseMoisEur: 3.07, rythmeJourEur: 0.13, creditsRestantsEur: 2.9, joursRestants: 5.5 });
verifie('25/09 : rythme normal', r.mode === 'normal' && r.facteur === 1 && !r.pauses.length, JSON.stringify(r));
verifie('25/09 : fin de mois projetée ≈ 3,79 €', Math.abs(r.chiffres.fin_mois_eur - 3.79) < 0.01, r.chiffres.fin_mois_eur);
verifie('25/09 : crédits pour 22 jours, dit en clair', r.chiffres.jours_credits === 22 && /22 jours/.test(r.mesures.join(' ')));

r = regime({ depenseMoisEur: 10, rythmeJourEur: 0.6, joursRestants: 10 }); // permis 0,6/j : pile
verifie('rythme égal au permis : normal', r.mode === 'normal');
r = regime({ depenseMoisEur: 10, rythmeJourEur: 0.7, joursRestants: 10 });
verifie('rythme un peu trop fort : économe, deux fois moins souvent', r.mode === 'econome' && r.facteur === 2 && !r.pauses.length);
r = regime({ depenseMoisEur: 10, rythmeJourEur: 1, joursRestants: 10 });
verifie('rythme bien trop fort (> 1,5 × permis) : réserve', r.mode === 'reserve' && r.facteur === 4);
verifie('réserve : la surveillance et l’architecte restent, les autres attendent',
  r.pauses.every((a) => PAYANTS.has(a) && !ESSENTIELS.has(a)) && !r.pauses.includes('superviseur') && r.pauses.includes('chasseur'));
r = regime({ depenseMoisEur: 14.8, rythmeJourEur: 0.01, joursRestants: 20 });
verifie('moins de 10 % du plafond : réserve même à petit rythme', r.mode === 'reserve');
r = regime({ depenseMoisEur: 16.2, rythmeJourEur: 0.1, joursRestants: 3 });
verifie('plafond dépassé : arrêt de tout appel payant', r.mode === 'arret' && r.pauses.length === PAYANTS.size);
r = regime({ depenseMoisEur: 2, rythmeJourEur: 0.1, creditsRestantsEur: 0.1, joursRestants: 10 });
verifie('crédits épuisés : arrêt, raison dite', r.mode === 'arret' && /crédits/.test(r.mesures[0]));
r = regime({ depenseMoisEur: 2, rythmeJourEur: 0.2, creditsRestantsEur: 1, joursRestants: 20 });
verifie('crédits pour 5 jours : économe et recharge annoncée', r.mode === 'econome' && /recharge/.test(r.mesures.join(' ')));
r = regime({ depenseMoisEur: 0, rythmeJourEur: 0, joursRestants: 30 });
verifie('rien dépensé : normal, sans division par zéro', r.mode === 'normal' && r.chiffres.jours_credits === null);

verifie('jours restants au 25/09 12:00 Paris ≈ 5,5', Math.abs(joursRestantsDuMois(new Date('2026-09-25T10:00:00Z')) - 5.5) < 0.01);
verifie('dernier jour du mois à 23:00 : presque zéro', joursRestantsDuMois(new Date('2026-09-30T21:00:00Z')) < 0.05);

console.log(`cas figes econome : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
