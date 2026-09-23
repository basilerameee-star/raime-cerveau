// LE PAIEMENT — un produit, un prix, un lien de paiement Stripe. Rien d'autre.
//
// Permis par la mission : créer un produit, un prix ou un lien de paiement, avec la clé
// RESTREINTE prévue et un prix fourni. Jamais : rembourser, virer, payer, placer. Le code
// le garantit : seules trois adresses de l'API sont appelables, et seulement en création.
//
// Pendant la construction : mode test (clé rk_test_…, variable STRIPE_CLE_TEST).
// En réel (STRIPE_CLE, rk_live_…) : seulement après la confirmation de Basile.
const API = 'https://api.stripe.com/v1/';
const PERMIS = new Set(['products', 'prices', 'payment_links']);

function cle(mode) {
  const k = mode === 'reel' ? process.env.STRIPE_CLE : process.env.STRIPE_CLE_TEST;
  const attendu = mode === 'reel' ? 'rk_live_' : 'rk_test_';
  if (!k) throw new Error(`clé Stripe ${mode === 'reel' ? 'STRIPE_CLE' : 'STRIPE_CLE_TEST'} absente`);
  if (!k.startsWith(attendu)) throw new Error(`clé Stripe refusée : une clé restreinte ${attendu}… est exigée`);
  return k;
}

async function creer(k, ressource, champs) {
  if (!PERMIS.has(ressource)) throw new Error(`appel Stripe interdit : ${ressource}`);
  const corps = new URLSearchParams();
  for (const [c, v] of Object.entries(champs)) corps.append(c, String(v));
  const r = await fetch(API + ressource, {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Stripe ${ressource} : ${d?.error?.message || r.status}`);
  return d;
}

// Crée le produit, son prix et son lien de paiement ; le client revient sur /merci/ après l'achat.
export async function creerPaiement({ produit, montant, nom, domaine = 'raime.fr', mode = 'test' }) {
  if (!(Number(montant) > 0)) throw new Error('aucun prix fourni : aucun paiement créé');
  const k = cle(mode);
  const p = await creer(k, 'products', { name: produit, 'metadata[service]': nom, 'metadata[source]': 'atelier-raime' });
  const prix = await creer(k, 'prices', { product: p.id, currency: 'eur', unit_amount: Math.round(Number(montant) * 100) });
  const lien = await creer(k, 'payment_links', {
    'line_items[0][price]': prix.id, 'line_items[0][quantity]': 1,
    'after_completion[type]': 'redirect',
    'after_completion[redirect][url]': `https://${nom}.${domaine}/merci/`,
    'metadata[service]': nom,
  });
  if (mode === 'test' && lien.livemode === true) throw new Error('Stripe a répondu en mode réel à une clé de test');
  return { url: lien.url, produit: p.id, prix: prix.id, lien: lien.id, mode };
}
