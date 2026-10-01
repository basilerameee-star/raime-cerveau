// RENTABILITÉ — ce qu'un produit rapporte vraiment, avant d'en parler à Basile. Du code, aucun modèle.
//
// Un produit « tendance » qui perd de l'argent à chaque vente n'est pas une idée : c'est une dépense.
// Le calcul est fait sur des chiffres posés par l'appelant ; ce qui n'est pas connu reste vide et le
// résultat se dit « estimation » (tant qu'AliExpress n'est pas branché, point n°20, le prix d'achat et la
// livraison sont des estimations). Rien ne s'invente : un chiffre manquant bloque le calcul.

// Frais de paiement Stripe, cartes européennes standard : 1,5 % + 0,25 € (tarif public, à confirmer à la
// création du compte). Surchargeable par l'appelant.
export const FRAIS_PAIEMENT = { pourcentage: 0.015, fixe: 0.25 };
// TVA française : le prix affiché au client est TTC, la marge se compte hors taxe.
export const TVA = 0.2;

const arrondi = (x) => Math.round(x * 100) / 100;
const nombre = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

// Entrée : prix_vente (TTC), prix_achat, livraison (ce que coûte l'envoi à Basile), pub_par_vente (coût
// d'acquisition), estimation (vrai tant que les chiffres ne viennent pas d'un fournisseur réel).
export function rentabilite({ prix_vente, prix_achat, livraison, pub_par_vente, estimation = true,
  frais = FRAIS_PAIEMENT, tva = TVA } = {}) {
  const manque = Object.entries({ prix_vente, prix_achat, livraison, pub_par_vente })
    .filter(([, v]) => !nombre(v)).map(([k]) => k);
  if (manque.length) return { calculable: false, manque, raison: `chiffre(s) à fournir : ${manque.join(', ')}` };
  if (prix_vente === 0) return { calculable: false, manque: [], raison: 'prix de vente nul' };

  const ht = prix_vente / (1 + tva);
  const paiement = prix_vente * frais.pourcentage + frais.fixe;
  const marge = ht - prix_achat - livraison - paiement - pub_par_vente;
  // Plafond de pub par vente pour ne pas perdre d'argent : ce que la campagne a le droit de coûter.
  const pub_max = ht - prix_achat - livraison - paiement;
  const r = {
    calculable: true,
    estimation: Boolean(estimation),
    prix_vente: arrondi(prix_vente), ht: arrondi(ht), tva: arrondi(prix_vente - ht),
    prix_achat: arrondi(prix_achat), livraison: arrondi(livraison),
    frais_paiement: arrondi(paiement), pub_par_vente: arrondi(pub_par_vente),
    marge_nette: arrondi(marge), marge_pct: arrondi((marge / ht) * 100),
    pub_max_par_vente: arrondi(Math.max(0, pub_max)),
    rentable: marge > 0,
  };
  r.phrase = phrase(r);
  return r;
}

// Une phrase courte, en français, avec la mention « estimation » quand elle s'impose.
export function phrase(r) {
  if (!r.calculable) return `Calcul impossible : ${r.raison}.`;
  const e = r.estimation ? ' (estimation, fournisseur non confirmé)' : '';
  const sens = r.rentable ? `gagne ${r.marge_nette} €` : `perd ${-r.marge_nette} €`;
  return `Chaque vente à ${r.prix_vente} € TTC ${sens} (${r.marge_pct} % du prix hors taxe)${e} ; `
    + `la pub ne doit pas dépasser ${r.pub_max_par_vente} € par vente.`;
}

// Une liste de produits proposés : chacun reçoit son calcul ; ceux qui perdent de l'argent passent en bas.
export function classer(produits = []) {
  return produits.map((p) => ({ ...p, rentabilite: rentabilite(p) }))
    .sort((a, b) => (b.rentabilite.marge_nette ?? -Infinity) - (a.rentabilite.marge_nette ?? -Infinity));
}
