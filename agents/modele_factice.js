// MODÈLE FACTICE — le fournisseur du banc d'essai (chantier 1).
//
// Les tests doivent tourner sans réseau et sans clé : un vrai modèle coûte, varie d'un
// passage à l'autre, et ne se joint pas depuis la CI. Ici, chaque réponse est tirée d'une
// fixture choisie par la tâche et par un motif lu dans la consigne système. Même entrée,
// même sortie, zéro dollar.
//
// Aucune fixture ne correspond : on lève une erreur. Un test qui appelle un modèle
// imprévu doit échouer franchement, jamais recevoir une réponse inventée au hasard.
//
// Ne s'active que par MODELE_FACTICE=1 (voir ask() dans lib.js).
import fs from 'node:fs';

const CHEMIN = process.env.MODELE_FACTICE_FIXTURES
  || new URL('../tests/fixtures/modele_factice.json', import.meta.url);

let fixtures = null;
function charger() {
  if (!fixtures) fixtures = JSON.parse(fs.readFileSync(CHEMIN, 'utf8')).reponses;
  return fixtures;
}

// Le journal des appels : les tests y lisent ce que l'agent a demandé au modèle.
export const appels = [];

export function repondre({ task, system, user }) {
  // « si_user » affine le choix quand une même consigne reçoit des demandes différentes.
  const f = charger().find((r) => r.tache === task && new RegExp(r.motif, 'i').test(system)
    && (!r.si_user || new RegExp(r.si_user, 'i').test(user)));
  if (!f) throw new Error(`Modèle factice : aucune fixture pour la tâche « ${task} » et cette consigne`);
  appels.push({ task, fixture: f.nom, system, user });
  const text = typeof f.reponse === 'string' ? f.reponse : JSON.stringify(f.reponse);
  return {
    text, model: `factice/${task}`, tokensIn: 0, tokensOut: 0, costUsd: 0, ms: 0,
  };
}
