// La stratégie de campagne : un plan complet, borné par le cap, qui ne lance et n'invente rien.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planifier, PLAFOND_MOIS } from '../../agents/campagne.js';

const base = { nom: 'Lampe nuage', promesse: 'une lumière douce pour dormir', cible: 'jeunes', prix_eur: 29, marge_nette_eur: 8 };

test('le plafond vient du cap : 300 € par mois', () => assert.equal(PLAFOND_MOIS, 300));

test('un plan complet : publics, questions, deux variantes, règle d\'arrêt, rapport', () => {
  const p = planifier(base);
  assert.equal(p.prete, true);
  assert.ok(p.publics.length >= 2);
  assert.ok(p.questions_ciblage.length >= 5);
  assert.equal(p.variantes.length, 2);
  assert.deepEqual(p.variantes.map((v) => v.change), ['accroche', 'accroche']);
  assert.match(p.regle_arret.quand, /2 fois 8 €/);
  assert.ok(p.rapport.champs.includes('coût par vente (€)'));
  assert.match(p.lancement, /accord de Basile/);
});

test('le budget demandé ne dépasse jamais le plafond, et se partage entre les variantes', () => {
  const p = planifier({ ...base, budget_eur: 5000 });
  assert.equal(p.budget_eur, 300);
  assert.equal(p.variantes.reduce((s, v) => s + v.budget_eur, 0), 300);
});

test('sans marge connue, aucun seuil en euros n\'est inventé', () => {
  const p = planifier({ ...base, marge_nette_eur: undefined });
  assert.equal(p.produit.marge_nette_eur, null);
  assert.match(p.regle_arret.quand, /20 % du budget/);
});

test('il manque une cible ou une promesse : le plan dit quoi, il ne devine pas', () => {
  const p = planifier({ nom: 'x', cible: 'martiens' });
  assert.equal(p.prete, false);
  assert.equal(p.manque.length, 2);
});
