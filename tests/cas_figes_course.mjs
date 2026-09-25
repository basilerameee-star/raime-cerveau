// CAS FIGÉS — LA COURSE (atelier/course.js) : d'une note vocale, une séance de sport saisie.
//
// L'atelier doit lire une phrase dictée (« j'ai couru 10 km en 54 minutes ce matin ») et en
// tirer une course structurée : distance, durée, allure, type, date, ressenti, note. LE code
// juge, jamais le modèle ; rien ne s'invente. Ce fichier verrouille la règle : une quantité ne
// vaut que si la phrase porte son unité, la date est celle que dit la phrase (sinon « maintenant »),
// l'allure ne se calcule que si distance ET durée sont portées. Tout réglage doit re-tomber ici.

import { extraireCourse, formaterDuree } from '../atelier/course.js';

// Jour « maintenant » figé : samedi 10 janvier 2026, midi, pour des tests déterministes.
const MAINTENANT = new Date(2026, 0, 10, 12, 0, 0);
const ISO = (d) => d.toISOString().slice(0, 10);

// Format d'un cas : [type, phrase, champ, attendu]
const CAS = [
  // — Distance : km porté, unité reconnue, valeur numérique
  ['distance', 'j\'ai couru 10 km en 54 minutes ce matin', 'km', 10],
  ['distance', 'vélo 45 km en 1 h 12 hier soir', 'km', 45],
  ['distance', '8,5 km en 40 min', 'km', 8.5],
  ['distance', 'course à pied 5 km en 30 min', 'km', 5],
  ['distance', 'parcours de 12 kilomètres', 'km', 12],
  // — Mètres convertis en km, seulement si km absent
  ['distance', 'natation 1500 m en 40 minutes', 'km', 1.5],
  ['distance', '500 m en 3 minutes', 'km', 0.5],
  // — Pas de distance si aucune unité
  ['distance', 'j\'ai couru ce matin, super', 'km', null],
  // — Durée en minutes
  ['duree', 'course à pied 5 km en 30 min', 'min', 30],
  ['duree', 'j\'ai couru 10 km en 54 minutes', 'min', 54],
  ['duree', 'marche 3 km en 45 minutes', 'min', 45],
  // — Durée en heures + minutes (prime sur les minutes seules)
  ['duree', 'vélo 45 km en 1 h 12', 'min', 72],
  ['duree', '90 km en 2 heures 30', 'min', 150],
  ['duree', '8 km en 1h05', 'min', 65],
  // — Pas de durée si aucune unité de temps
  ['duree', 'course à pied 10 km ce matin', 'min', null],
  // — Allure : calculée seulement si distance ET durée sont portées
  ['allure', 'course à pied 5 km en 30 min', 'minKm', 6.0],
  ['allure', 'j\'ai couru 10 km en 54 minutes', 'minKm', 5.4],
  ['allure', 'course à pied 10 km ce matin', 'minKm', null],   // durée absente → pas d'allure
  ['allure', 'j\'ai couru ce matin, super', 'minKm', null],    // distance absente → pas d'allure
  // — Type : porté par la phrase, sinon la règle sûre par défaut
  ['type', 'j\'ai couru 10 km en 54 minutes', 'type', 'course a pied'],
  ['type', 'vélo 45 km en 1 h 12', 'type', 'velo'],
  ['type', 'natation 1500 m en 40 minutes', 'type', 'natation'],
  ['type', 'marche 3 km, fatigué', 'type', 'marche'],
  ['type', 'footing de 8 km ce matin', 'type', 'course a pied'],
  ['type', 'jusqu\'à la mer et retour en vélo', 'type', 'velo'],
  // — Date : celle que dit la phrase, sinon « maintenant »
  ['date', 'j\'ai couru 10 km ce matin', 'jour', '2026-01-10'],       // rien de dit → maintenant
  ['date', 'vélo 45 km hier soir', 'jour', '2026-01-09'],             // hier → la veille
  ['date', 'avant-hier, 12 km en 1 h', 'jour', '2026-01-08'],         // avant-hier → deux jours
  ['date', 'le 12 juin, 8 km en 50 min', 'jour', '2025-06-12'],       // daté, rolling au passé
  ['sort', 'j\'ai couru 10 km ce matin', 'moment', 'matin'],
  ['sort', 'vélo 45 km hier soir', 'moment', 'soir'],
  // — Note sur 10, seulement si portée
  ['note', 'j\'ai couru 10 km en 54 minutes, note 8', 'note', 8],
  ['note', 'j\'ai couru 5 km, 9/10 super', 'note', 9],
  ['note', 'j\'ai couru 10 km ce matin', 'note', null],
  // — Ressenti : premier adjectif dit
  ['ressenti', 'j\'ai couru 10 km ce matin, super ressenti', 'ressenti', 'super'],
  ['ressenti', 'marche 3 km, fatigué', 'ressenti', 'epuise'],
  ['ressenti', 'vélo 45 km ce matin', 'ressenti', null],
  // — formaterDuree : durée humaine lisible
  ['format', 54, 'dureeT', '54 min'],
  ['format', 74, 'dureeT', '1 h 14'],
  ['format', 60, 'dureeT', '1 h'],
  ['format', 150, 'dureeT', '2 h 30'],
];

let ko = 0;
for (const cas of CAS) {
  const [type, phrase, champ, attendu] = cas;
  let obtenu, ok;
  if (type === 'distance' || type === 'duree' || type === 'type' || type === 'note' || type === 'ressenti') {
    const r = extraireCourse(phrase, { maintenant: MAINTENANT });
    if (champ === 'km')          obtenu = r.distanceKm;
    else if (champ === 'min')    obtenu = r.dureeMin;
    else if (champ === 'type')   obtenu = r.type;
    else if (champ === 'note')   obtenu = r.note;
    else                         obtenu = r.ressenti;
    ok = obtainedEq(obtenu, attendu);
  } else if (type === 'allure') {
    const r = extraireCourse(phrase, { maintenant: MAINTENANT });
    ok = obtainedEq(r.allureMinKm, attendu);
    obtenu = r.allureMinKm;
  } else if (type === 'date') {
    const r = extraireCourse(phrase, { maintenant: MAINTENANT });
    ok = ISO(r.jour) === attendu;
    obtenu = ISO(r.jour);
  } else if (type === 'sort') {
    const r = extraireCourse(phrase, { maintenant: MAINTENANT });
    ok = r.moment === attendu;
    obtenu = r.moment;
  } else { // format
    ok = formaterDuree(phrase) === attendu;
    obtenu = formaterDuree(phrase);
  }
  if (!ok) { ko++; console.log(`  ECHEC ${JSON.stringify({ phrase, champ, obtenu, attendu })}`); }
}

function obtainedEq(a, b) {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (a === null || b === null) return a === b;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

console.log(ko === 0 ? `cas figes atelier course : ${CAS.length}/${CAS.length} OK` : `cas figes atelier course : ${ko} ECHEC(S) sur ${CAS.length}`);
process.exit(ko === 0 ? 0 : 1);