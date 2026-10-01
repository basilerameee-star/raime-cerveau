// Rentabilité d'un produit : le calcul est exact, signale l'estimation et refuse d'inventer un chiffre.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentabilite, classer, phrase } from '../../agents/rentabilite.js';

test('marge nette : TVA, achat, livraison, frais de paiement et pub sont tous retirés', () => {
  // 29,90 € TTC → 24,92 € HT ; paiement 29,90 × 1,5 % + 0,25 = 0,70 ; 24,92 − 8 − 3 − 0,70 − 6 = 7,22
  const r = rentabilite({ prix_vente: 29.9, prix_achat: 8, livraison: 3, pub_par_vente: 6 });
  assert.equal(r.calculable, true);
  assert.equal(r.ht, 24.92);
  assert.equal(r.frais_paiement, 0.7);
  assert.equal(r.marge_nette, 7.22);
  assert.equal(r.pub_max_par_vente, 13.22);
  assert.equal(r.rentable, true);
  assert.equal(r.estimation, true);
});

test('une vente qui perd de l’argent est dite telle quelle, et l’estimation est signalée', () => {
  const r = rentabilite({ prix_vente: 19.9, prix_achat: 9, livraison: 4, pub_par_vente: 8 });
  assert.equal(r.rentable, false);
  assert.match(r.phrase, /perd/);
  assert.match(r.phrase, /estimation/);
  assert.doesNotMatch(phrase({ ...r, estimation: false }), /estimation/);
});

test('un chiffre manquant ou absurde bloque le calcul au lieu d’être inventé', () => {
  const r = rentabilite({ prix_vente: 20, prix_achat: 5, livraison: 2 });
  assert.equal(r.calculable, false);
  assert.deepEqual(r.manque, ['pub_par_vente']);
  assert.equal(rentabilite({ prix_vente: -1, prix_achat: 1, livraison: 1, pub_par_vente: 1 }).calculable, false);
  assert.equal(rentabilite().calculable, false);
});

test('le classement met les produits les plus rentables d’abord, les incalculables en dernier', () => {
  const l = classer([
    { nom: 'a', prix_vente: 19.9, prix_achat: 9, livraison: 4, pub_par_vente: 8 },
    { nom: 'b', prix_vente: 39.9, prix_achat: 8, livraison: 3, pub_par_vente: 6 },
    { nom: 'c', prix_vente: 25 },
  ]);
  assert.deepEqual(l.map((p) => p.nom), ['b', 'a', 'c']);
});
