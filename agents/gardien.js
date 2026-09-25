// LE GARDIEN — le sas avant le coupe-circuit (version voulue par Basile, 25/09/2026).
//
// « Plutôt qu'un gardien qui coupe le circuit, un gardien qui redirige vers la sandbox pour faire
//   le test, avant de lancer le coupe-circuit si c'est vraiment trop dangereux. Et si le test
//   apporte du positif quand même, on essaie d'extraire uniquement le positif. »
//
// Trois temps, tout par le code (aucun modèle ne juge ici) :
//   ① aiguiller  une action proposée part : à exécuter (sain), au bac à sable (risqué),
//                ou au coupe-circuit (interdit par la Constitution, rien à essayer) ;
//   ② essayer    le bac à sable (tools/bac_a_sable.py pour du code) rend, partie par partie,
//                ce qui passe, ce qui casse, ce qui est dangereux ;
//   ③ trancher   dangereux → coupe-circuit (bloqué, état d'avant, Basile prévenu) ;
//                mitigé → on garde SEULEMENT les parties saines qui apportent un gain ;
//                sain → l'action suit sa zone de la Constitution.
//
// LE GARDIEN A DEUX FACES. La vigie existe et tourne sur l'hôte toutes les 30 minutes
// (/opt/raime/scripts/gardien.py) : elle compare l'état du système aux limites (budget, etc.) et
// alerte. Ce module est le SAS : il juge une action AVANT qu'elle parte. Les deux se complètent.
//
// PAS ENCORE EN SERVICE : module pur, essayé par tests/cas_figes_gardien.mjs. Il se branche sur la
// porte et sur la boucle après l'accord de Basile.

// Zone 3 de la Constitution : interdit, quoi qu'il arrive. Rien à essayer, coupe-circuit direct.
export const INTERDITS = [
  { code: 'argent', motif: 'déplacer de l’argent ou passer un ordre', test: (a) => /\b(virement|paiement|transfert|ordre|achat|vente|placement|withdraw|transfer|payout|trade)\b/i.test(`${a.type} ${a.cible}`) && a.domaine === 'argent' },
  { code: 'constitution', motif: 'changer la Constitution', test: (a) => /CONSTITUTION(\.md)?$/i.test(a.cible || '') && a.type === 'ecrire' },
  { code: 'pouvoir', motif: 'se donner plus de pouvoir', test: (a) => a.type === 'elargir_droits' || /\b(limites|zones)\b/.test(a.cible || '') && a.type === 'ecrire' },
  { code: 'verification', motif: 'contourner une vérification humaine', test: (a) => /\b(captcha|verification d'identite|2fa)\b/i.test(`${a.type} ${a.cible}`) },
  { code: 'secret', motif: 'exposer un secret', test: (a) => (a.contenu || '').match(/\b(sk-[A-Za-z0-9]{16,}|(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{16,})\b/) !== null },
];

// Ce qui passe par le bac à sable avant d'aller plus loin.
export const RISQUES = [
  { code: 'code_exterieur', motif: 'code venu de l’extérieur', test: (a) => a.origine === 'exterieur' },
  { code: 'dependance', motif: 'nouvelle dépendance', test: (a) => a.type === 'installer' },
  { code: 'effacement', motif: 'effacement de données', test: (a) => a.type === 'effacer' },
  { code: 'publication', motif: 'publication vers l’extérieur', test: (a) => ['publier', 'envoyer'].includes(a.type) },
  { code: 'configuration', motif: 'changement de configuration du serveur', test: (a) => a.type === 'configurer' },
  { code: 'code_propre', motif: 'changement de son propre code', test: (a) => a.type === 'modifier_code' },
];

/** ① Où va l'action ? */
export function aiguiller(action) {
  const interdits = INTERDITS.filter((r) => r.test(action)).map((r) => r.motif);
  if (interdits.length) return { voie: 'coupe_circuit', motifs: interdits };
  const risques = RISQUES.filter((r) => r.test(action)).map((r) => r.motif);
  if (risques.length) return { voie: 'bac_a_sable', motifs: risques };
  return { voie: 'executer', motifs: [] };
}

/**
 * ③ Après l'essai. `essai.parties` : [{ nom, reussi, dangereux, gain }], une par morceau séparable
 * (un fichier, un commit, un candidat). Renvoie la décision et, si mitigé, ce qu'on garde.
 */
export function trancher(action, essai) {
  const parties = essai?.parties || [];
  if (!parties.length) return { decision: 'rejet', garder: [], motif: 'rien à juger : l’essai n’a rendu aucune partie' };
  const dangereuses = parties.filter((p) => p.dangereux);
  if (dangereuses.length) {
    return { decision: 'coupe_circuit', garder: [], motif: `danger constaté à l’essai : ${dangereuses.map((p) => p.nom).join(', ')}`,
      prevenir: true, revenir: true };
  }
  const positives = parties.filter((p) => p.reussi && (p.gain ?? 0) > 0);
  if (positives.length === parties.length) return { decision: 'suivre_zone', garder: positives.map((p) => p.nom), motif: 'tout passe' };
  if (positives.length) {
    return { decision: 'extraire_positif', garder: positives.map((p) => p.nom),
      ecartees: parties.filter((p) => !positives.includes(p)).map((p) => p.nom),
      motif: `${positives.length} partie(s) sur ${parties.length} passent et apportent un gain : seules elles continuent` };
  }
  return { decision: 'rejet', garder: [], motif: 'aucune partie ne passe avec un gain' };
}

/** La ligne de journal, telle que la Constitution l'exige (acteur, changement, motif, retour arrière). */
export function ligneJournal(action, aiguillage, decision = null) {
  return {
    acteur: 'gardien',
    changement: `${action.agent || '?'} · ${action.type} ${action.cible || ''} → ${decision ? decision.decision : aiguillage.voie}`.slice(0, 300),
    motif: [...aiguillage.motifs, decision?.motif].filter(Boolean).join(' ; ').slice(0, 500),
    retour_arriere: decision?.revenir ? 'état d’avant restauré' : 'aucun changement appliqué avant décision',
  };
}
