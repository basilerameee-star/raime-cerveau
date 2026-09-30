// LA FEUILLE DE ROUTE (jarvis/feuille_de_route.json, décidée avec Basile le 30/09/2026) : lue par Jarvis (l'état,
// ses réponses), par les agents (le cap : les prochaines étapes) et par Hermes (outil MCP). Elle se met à jour par
// une livraison, quand un point est prouvé fini ; ici, on la lit seulement.
'use strict';

const F = require('./feuille_de_route.json');

const parRang = () => [...F.points].sort((a, b) => a.rang - b.rang);
const court = (p) => `n°${p.n} ${p.titre}`;

function resume() {
  const pts = parRang();
  const faits = pts.filter((p) => p.etat === 'fait');
  const restants = pts.filter((p) => p.etat !== 'fait');
  return {
    titre: F.titre, mise_a_jour: F.mise_a_jour, total: pts.length, faits: faits.length,
    en_cours: restants.filter((p) => p.etat === 'en_cours').map((p) => ({ n: p.n, titre: p.titre })),
    prochains: restants.filter((p) => p.groupe === 'seul' && p.etat !== 'en_cours').slice(0, 3).map((p) => ({ n: p.n, titre: p.titre, fini_quand: p.fini_quand })),
    a_basile: restants.filter((p) => p.groupe === 'basile').slice(0, 4).map((p) => ({ n: p.n, titre: p.titre, il_faut: p.il_faut })),
  };
}

// Pour l'état de Jarvis : une ligne, les faits d'abord.
function phrase() {
  const r = resume();
  return `\nFeuille de route : ${r.faits} point(s) fait(s) sur ${r.total}.`
    + (r.en_cours.length ? ` En cours : ${r.en_cours.map(court).join(' ; ')}.` : '')
    + (r.prochains.length ? ` Prochains pour Claude : ${r.prochains.map(court).join(' ; ')}.` : '')
    + (r.a_basile.length ? ` Ce qu'il faut de Basile : ${r.a_basile.map((p) => `${court(p)} (${p.il_faut})`).join(' ; ')}.` : '');
}

module.exports = { F, resume, phrase, parRang };
