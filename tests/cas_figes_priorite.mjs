// CAS FIGÉS — la priorité des buts et la justesse des prédictions de l'architecte.
import { prioriser, retenir, justesse } from '../agents/priorite.js';

let ok = 0, ko = 0;
const verifie = (nom, cond, info = '') => { if (cond) ok++; else { ko++; console.log('  ÉCHEC :', nom, info); } };
const M = new Date('2026-09-25T12:00:00Z').getTime();
const J = 86_400_000;
const buts = [
  { id: 1, horizon: 'long', enonce: 'Devenir une intelligence utile' },
  { id: 2, horizon: 'moyen', enonce: 'Premier client payant' },
  { id: 3, horizon: 'court', enonce: 'Pages légales exactes' },
  { id: 4, horizon: 'court', enonce: 'Taux de réponse au-dessus de 5 %' },
];

// travaillés hier : 1, 2, 3 ; le 4 oublié depuis 10 jours
let c = prioriser(buts, [{ but_id: 1, dernier: M - J }, { but_id: 2, dernier: M - J }, { but_id: 3, dernier: M - J }, { but_id: 4, dernier: M - 10 * J }], [], new Set(), M);
verifie('un but court oublié passe en tête', c[0].id === 4, c.map((x) => `${x.id}:${x.priorite}`).join(' '));
verifie('à négligence égale, le court passe avant le moyen, le moyen avant le long', c.findIndex((x) => x.id === 3) < c.findIndex((x) => x.id === 2) && c.findIndex((x) => x.id === 2) < c.findIndex((x) => x.id === 1));
c = prioriser(buts, [{ but_id: 4, dernier: M - 10 * J }], [{ but_id: 4, n: 4 }], new Set(), M);
verifie('un but qui bute (4 échecs) descend', c[0].id !== 4 && c.find((x) => x.id === 4).detail.echecs === 4);
c = prioriser(buts, [], [], new Set([3]), M);
verifie('un but qui attend Basile est mis de côté', c.find((x) => x.id === 3).priorite === 0 && c[c.length - 1].id === 3);
verifie('négligence plafonnée à 2', prioriser(buts, [], [], new Set(), M).every((x) => x.detail.negligence <= 2));

// retenir : le modèle ne peut s'écarter que vers le top 3, avec une raison
c = prioriser(buts, [{ but_id: 4, dernier: M - 10 * J }], [], new Set(), M);
verifie('choix du premier : accepté', retenir(c, c[0].enonce).but.id === c[0].id);
verifie('deuxième avec raison : accepté', retenir(c, c[1].enonce, 'une réponse de Basile arrive et débloque ce but').but.id === c[1].id);
verifie('deuxième sans raison : premier repris', retenir(c, c[1].enonce, '').but.id === c[0].id);
verifie('hors top 3 : premier repris', retenir(c, c[3].enonce, 'une très bonne raison écrite ici').but.id === c[0].id);
verifie('but inventé : premier repris', /hors des trois/.test(retenir(c, 'Conquérir le monde').ecart));

// justesse (Brier)
verifie('aucune prédiction : dit', justesse([]).brier === null);
verifie('prédictions parfaites : 0', justesse([{ p: 0, echec: false }, { p: 1, echec: true }]).brier === 0);
verifie('toujours 50 % : 0,25 (hasard)', justesse([{ p: 0.5, echec: false }, { p: 0.5, echec: true }]).brier === 0.25);
verifie('confiance mal placée : nulle', /nulle/.test(justesse([{ p: 0.05, echec: true }, { p: 0.1, echec: true }]).lecture));

console.log(`cas figes priorite : ${ok}/${ok + ko} ${ko ? 'KO' : 'OK'}`);
process.exit(ko ? 1 : 0);
