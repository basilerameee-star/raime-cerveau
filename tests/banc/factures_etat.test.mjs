// L'état des factures dans le cockpit (22/10/2026) : rejoué sur les objets réels des e-mails de la boîte de Basile.
// Hetzner n'envoie aucune confirmation de paiement : « Payment Warning » reste rouge tant que Basile ne dit pas « C'est réglé » ;
// une alerte de coût ou une facture émise ne décident rien ; un échec Anthropic n'est plus lu comme « payé » ;
// Google Workspace (« Échec d'un paiement ») est enfin reconnu.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { etatFacture, TEXTES } = require('../../jarvis/v6.cjs');
const F = Object.fromEntries(TEXTES.factures.map((f) => [f.cle, f]));
const mail = (sujet, recu_le) => ({ sujet, recu_le, de: 'x' });

test('Hetzner : l’avertissement reste rouge, l’alerte de coût et la facture émise ne décident rien', () => {
  const m = [mail('Billing alert for project rAIme', '2026-10-16T21:29:00Z'), mail('Payment Warning (K0843535326)', '2026-10-14T10:28:00Z')];
  assert.equal(etatFacture(F.hetzner, m, null).etat, 'panne');
  assert.equal(etatFacture(F.hetzner, [mail('Hetzner Online GmbH - Invoice 081001188609 (K0843535326)', '2026-09-27T00:27:00Z')], null), null, 'facture émise : rien de connu');
  assert.equal(etatFacture(F.hetzner, [mail('Credit card charge failed (K0843535326)', '2026-09-28T04:07:00Z')], null).etatTxt, 'Paiement refusé');
});

test('Hetzner : « C’est réglé » dit par Basile après l’avertissement passe la facture à « Payé », pas avant', () => {
  const m = [mail('Payment Warning (K0843535326)', '2026-10-14T10:28:00Z')];
  const apres = etatFacture(F.hetzner, m, { le: '2026-10-22T09:30:00Z', par: 'Basile' });
  assert.equal(apres.etat, 'ok');
  assert.match(apres.etatTxt, /^Payé \(déclaré par Basile le 22\/10\)$/);
  assert.equal(etatFacture(F.hetzner, m, { le: '2026-10-13T09:00:00Z', par: 'Basile' }).etat, 'panne', 'déclarée avant le dernier avertissement : reste rouge');
});

test('Anthropic : le reçu dit payé ; l’échec et la pause d’accès disent refusé', () => {
  assert.equal(etatFacture(F.claude, [mail('Your receipt from Anthropic, PBC #2023-5845-1520', '2026-09-30T08:53:00Z')], null).etat, 'ok');
  for (const s of ['€21.60 payment to Anthropic, PBC was unsuccessful', 'Your subscription access has been paused']) {
    assert.equal(etatFacture(F.claude, [mail(s, '2026-11-29T11:30:00Z')], null).etat, 'panne', s);
  }
  const sujets = new RegExp(F.claude.courriels.sujets, 'i');
  assert.ok(sujets.test('Your subscription access has been paused') && sujets.test('payment to Anthropic, PBC was unsuccessful'), 'ces e-mails sont bien lus');
});

test('Google Workspace : l’échec de paiement est reconnu et lu', () => {
  assert.ok(F.workspace.courriels, 'Workspace a enfin ses motifs');
  const de = new RegExp(F.workspace.courriels.de, 'i'), sujets = new RegExp(F.workspace.courriels.sujets, 'i');
  const s = 'Échec d\'un paiement : Google Workspace Business Starter pour raime.fr';
  assert.ok(de.test('workspace-noreply@google.com') && sujets.test(s));
  assert.equal(etatFacture(F.workspace, [mail(s, '2026-10-01T18:44:00Z')], null).etat, 'panne');
});
