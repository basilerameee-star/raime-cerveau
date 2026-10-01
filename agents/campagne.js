// STRATÉGIE DE CAMPAGNE — le plan d'une campagne publicitaire, prêt à lancer. PLAN SEULEMENT.
//
// Pour un produit ou une offre : les publics, les questions de ciblage, deux variantes A/B (une seule
// chose change entre elles), la règle d'arrêt des perdants et le modèle du rapport. Du code, sans
// modèle : rien ne s'invente, un chiffre absent reste vide. Aucun appel à Meta, aucune dépense :
// la campagne ne part qu'avec l'accord de Basile (Constitution), dans les 300 € par mois du cap.
//
//   import { planifier } from './campagne.js';  planifier({ nom, promesse, cible, prix_eur, marge_nette_eur })
import { createRequire } from 'node:module';
const { OBJECTIFS } = createRequire(import.meta.url)('../jarvis/cap.cjs');

// Le plafond écrit dans le cap (« 300 € par mois au plus ») : on le lit, on ne le recopie pas.
export const PLAFOND_MOIS = Number(/(\d+)\s*€ par mois au plus/.exec(OBJECTIFS)?.[1]);

// Ce que chaque cible achète (cap : les jeunes du rêve, les plus âgés de la sécurité, les dirigeants du temps).
const ANGLES = {
  jeunes: { achete: 'du rêve', accroche: 'ce que ça change pour soi', preuve: 'un résultat montré, pas promis' },
  seniors: { achete: 'de la sécurité', accroche: 'ce qui est garanti et comment', preuve: 'des faits, un engagement clair' },
  dirigeants: { achete: 'du temps', accroche: 'les heures gagnées', preuve: 'une démonstration ou un pré-audit chiffré' },
};

// Ce que le code ne peut pas savoir : on le demande, avant de lancer (le plan reste « à compléter »).
const QUESTIONS = [
  'Qui achète vraiment : âge, métier, zone (pays ou départements) ?',
  'Quel problème précis a-t-il, dans ses mots à lui ?',
  'Où est-il déjà : Instagram, Facebook, TikTok ?',
  'Qu\'a-t-il déjà essayé, et pourquoi n\'a-t-il pas acheté ?',
  'Quelle preuve peut-on lui montrer sans rien promettre qu\'on ne tient pas ?',
  'Quelle action mesure l\'intérêt : clic, message, achat ?',
];

export function planifier({ nom, promesse, cible, prix_eur, marge_nette_eur, budget_eur, duree_jours = 7 } = {}) {
  const manque = [];
  if (!nom) manque.push('le nom du produit ou de l\'offre');
  if (!promesse) manque.push('la promesse (une phrase vraie)');
  if (!ANGLES[cible]) manque.push(`la cible (${Object.keys(ANGLES).join(', ')})`);
  if (manque.length) return { prete: false, manque };

  const budget = Math.min(budget_eur ?? PLAFOND_MOIS, PLAFOND_MOIS);
  const angle = ANGLES[cible];
  // Une vente ne vaut la dépense que si la pub par vente reste sous la marge : sans marge connue, pas de seuil inventé.
  const cout_max_vente = marge_nette_eur > 0 ? marge_nette_eur : null;
  const parVariante = Math.floor(budget / 2);

  const publics = [
    { nom: 'large', definition: `${cible} de la zone choisie, sans centre d'intérêt`, role: 'mesure de base, laisse la plateforme chercher' },
    { nom: 'intérêts', definition: `${cible} de la zone choisie, avec les centres d'intérêt liés au problème`, role: 'teste la précision du ciblage' },
    { nom: 'déjà venus', definition: 'visiteurs du site et abonnés des comptes, 30 derniers jours', role: 'rappel : le moins cher, tant qu\'il y a assez de monde' },
  ];

  // Une seule différence entre A et B : l'accroche. Le public, le visuel, le budget et la durée sont communs.
  const variantes = [
    { cle: 'A', accroche: `${angle.accroche} : ${promesse}`, change: 'accroche' },
    { cle: 'B', accroche: `${angle.preuve} : ${promesse}`, change: 'accroche' },
  ].map((v) => ({ ...v, budget_eur: parVariante, duree_jours }));

  const regle_arret = {
    // Chaque seuil est un réglage de méthode, à confirmer par Basile avant le lancement.
    quand: `une variante a dépensé ${cout_max_vente ? `2 fois ${cout_max_vente} €` : '20 % du budget'} sans vente`
      + ' ou, après 1 000 affichages, son taux de clic est moitié moindre que celui de l\'autre',
    alors: 'elle est coupée ; son budget n\'est pas reporté sur l\'autre sans nouvel accord de Basile',
    jamais: `le total dépensé ne dépasse pas ${budget} € (plafond du cap : ${PLAFOND_MOIS} € par mois)`,
  };

  const rapport = {
    quand: `à la fin des ${duree_jours} jours, ou dès qu'une variante est coupée`,
    champs: ['dépensé (€)', 'affichages', 'clics', 'taux de clic', 'ventes ou messages', 'coût par vente (€)', 'marge nette restante (€)', 'décision : couper, garder ou changer l\'accroche'],
    regle: 'un champ non mesuré reste vide, il n\'est jamais estimé',
  };

  return {
    prete: true,
    produit: { nom, promesse, prix_eur: prix_eur ?? null, marge_nette_eur: marge_nette_eur ?? null },
    cible: { type: cible, achete: angle.achete },
    budget_eur: budget,
    publics, questions_ciblage: QUESTIONS, variantes, regle_arret, rapport,
    lancement: 'attend l\'accord de Basile : rien n\'est dépensé ni publié par ce plan',
  };
}
