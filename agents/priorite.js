// LA PRIORITÉ DES BUTS et LA JUSTESSE DES PRÉDICTIONS de l'architecte (25/09/2026).
//
// Basile : « comment le but est choisi, comment il est sélectionné, comment il agit, comment il
// évolue, comment il corrige : ça va être le principal de l'architecte ». Jusqu'ici, le modèle
// choisissait le but seul, sans calcul. Désormais le CODE classe les buts, et le modèle travaille
// le premier ; il ne peut s'en écarter que vers un des trois premiers, avec sa raison écrite.
//
// priorité = urgence de l'horizon × négligence × (1 / (1 + ½ × échecs récents))
//   urgence     : court 1, moyen 0,7, long 0,4 (le long terme compte, il presse moins) ;
//   négligence  : 1 + jours sans travail sur ce but ÷ 7, plafonnée à 2 (un but oublié remonte) ;
//   échecs      : ratés des 7 derniers jours sur ce but (un but qui bute descend, la méta-réflexion
//                 cherche pourquoi et pose la question à Basile au lieu d'insister).
// Un but dont une question attend Basile est mis de côté (il attend sa réponse).
//
// Justesse : chaque sous-tâche porte une probabilité d'échec annoncée AVANT d'agir. Le score de
// Brier (0 = parfait, 0,25 = hasard) mesure si ces annonces valent quelque chose.
export const URGENCE = { court: 1, moyen: 0.7, long: 0.4 };
export const JOUR = 86_400_000;

/**
 * @param buts      [{ id, horizon, enonce }]
 * @param travaux   [{ but_id, dernier }]  dernier cycle ayant travaillé ce but
 * @param echecs    [{ but_id, n }]        ratés des 7 derniers jours
 * @param enAttente Set des but_id qui attendent une réponse de Basile
 */
export function prioriser(buts, travaux = [], echecs = [], enAttente = new Set(), maintenant = Date.now()) {
  const dernier = new Map(travaux.map((t) => [t.but_id, new Date(t.dernier).getTime()]));
  const rates = new Map(echecs.map((e) => [e.but_id, Number(e.n) || 0]));
  return buts
    .map((b) => {
      const jours = dernier.has(b.id) ? (maintenant - dernier.get(b.id)) / JOUR : 14;
      const negligence = Math.min(2, 1 + Math.max(0, jours) / 7);
      const urgence = URGENCE[b.horizon] ?? 0.5;
      const freins = 1 / (1 + 0.5 * (rates.get(b.id) || 0));
      const attend = enAttente.has(b.id);
      const priorite = attend ? 0 : Math.round(1000 * urgence * negligence * freins) / 1000;
      return { ...b, priorite, detail: { urgence, negligence: Math.round(negligence * 100) / 100, echecs: rates.get(b.id) || 0, attend } };
    })
    .sort((a, b) => b.priorite - a.priorite || String(a.enonce).localeCompare(String(b.enonce)));
}

/** Le but travaillé : le premier, ou un des trois premiers si le modèle écrit pourquoi. */
export function retenir(classement, choixModele, raison) {
  const tete = classement.filter((b) => b.priorite > 0).slice(0, 3);
  if (!tete.length) return { but: null, ecart: 'aucun but disponible' };
  const choisi = tete.find((b) => b.enonce === choixModele);
  if (choisi && (choisi === tete[0] || (raison && String(raison).trim().length >= 20))) return { but: choisi, ecart: null };
  return { but: tete[0], ecart: choisi ? 'écart sans raison écrite : premier but repris' : `« ${choixModele || '—'} » hors des trois premiers : premier but repris` };
}

/** Score de Brier des probabilités d'échec annoncées : [{ p, echec }] → { brier, n, lecture }. */
export function justesse(predictions) {
  const v = predictions.filter((x) => Number.isFinite(+x.p) && typeof x.echec === 'boolean');
  if (!v.length) return { brier: null, n: 0, lecture: 'aucune prédiction notée encore' };
  const brier = v.reduce((s, x) => s + (Math.min(1, Math.max(0, +x.p)) - (x.echec ? 1 : 0)) ** 2, 0) / v.length;
  const r = Math.round(brier * 1000) / 1000;
  const lecture = r <= 0.1 ? 'bonne : ses annonces valent quelque chose' : r <= 0.2 ? 'moyenne' : r < 0.25 ? 'faible : à peine mieux que le hasard' : 'nulle : pas mieux que le hasard';
  return { brier: r, n: v.length, lecture };
}
