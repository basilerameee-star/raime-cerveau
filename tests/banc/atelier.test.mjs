// L'atelier sur trois phrases fictives : le modèle est factice, Stripe aussi, le réseau coupé.
// Chaque service produit doit passer tous les contrôles ; chaque faute glissée exprès, être vue.
import { prevoir, requetes } from './outils.mjs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { fabriquer } = await import('../../atelier/atelier.js');
const { assainir } = await import('../../atelier/brief.js');
const { relireContenu, redigerContenu } = await import('../../atelier/contenu.js');
const { controlerService } = await import('../../atelier/controles.js');
const { creerPaiement } = await import('../../atelier/stripe.js');

const SERVICES = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-services-'));
const PHRASES = {
  raime: 'Fais-moi un site pour vendre un atelier en ligne de rAIme sur les agents IA, 49 € la place',
  voitures: 'Fais-moi un site pour vendre des voitures électriques d’occasion de la marque Exemplia',
  bougies: 'Un site pour vendre des bougies artisanales à 24 €, couleurs #2f4f4f et #e0b36a',
};

// Faux Stripe : chaque création répond un identifiant ; le lien est de test.
let n = 0;
prevoir(/api\.stripe\.com\/v1\/products$/, { id: 'prod_fictif', object: 'product' });
prevoir(/api\.stripe\.com\/v1\/prices$/, { id: 'price_fictif', object: 'price' });
prevoir(/api\.stripe\.com\/v1\/payment_links$/, { id: 'plink_fictif', url: 'https://buy.stripe.com/test_fictif00', livemode: false });

const lire = (nom, f) => fs.readFileSync(path.join(SERVICES, nom, 'site', f), 'utf8');
const R = {};
before(async () => {
  process.env.STRIPE_CLE_TEST = 'rk_test_banc_fictive';
  R.raime = await fabriquer({ phrase: PHRASES.raime, dossierServices: SERVICES });
  R.voitures = await fabriquer({ phrase: PHRASES.voitures, dossierServices: SERVICES });
  R.bougies = await fabriquer({ phrase: PHRASES.bougies, demonstration: true, dossierServices: SERVICES });
  n = requetes.length;
});

// ── ① Le brief ne garde que ce que dit la phrase ────────────────────────────
test('un prix absent de la phrase disparaît, et devient une question', () => {
  assert.equal(R.voitures.brief.prix, null, 'le modèle proposait 15 000 € : la phrase ne le dit pas');
  assert.ok(R.voitures.questions.some((q) => /Quel est le prix/.test(q)));
});

test('une identité de vendeur absente de la phrase disparaît, et devient une question', () => {
  assert.equal(R.voitures.brief.vendeur, null);
  assert.ok(R.voitures.questions.some((q) => /Qui vend/.test(q)));
});

test('un prix écrit dans la phrase est gardé, au centime près', () => {
  assert.deepEqual(R.raime.brief.prix, { montant: 49, devise: 'EUR' });
  assert.equal(assainir({ prix: { montant: 19.9 } }, 'un livre à 19,90 €').prix.montant, 19.9);
  assert.equal(assainir({ prix: { montant: 20 } }, 'un livre à 19,90 €').prix, null);
});

test('un nom déjà pris sur le serveur est changé', () => {
  assert.equal(assainir({ nom: 'n8n' }, 'x').nom, 'n8n-boutique');
  assert.equal(assainir({ nom: 'Café & Thé !' }, 'x').nom, 'cafe-the');
});

test('« maison rAIme » exige que la phrase nomme rAIme', () => {
  assert.equal(assainir({ maison: 'raime' }, 'un site pour des bougies').maison, 'client');
});

// ── ③ Le contenu est relu par le code ───────────────────────────────────────
test('un contenu fautif est renvoyé une fois, puis accepté corrigé', async () => {
  const brief = assainir({ produit: 'Bougie fautive' }, 'bougie fautive');
  const r = await redigerContenu(brief);
  assert.equal(r.essais, 2);
  assert.equal(r.contenu.accroche, 'Un savoir-faire à portée de main');
});

test('la relecture voit le « je », la négation et le chiffre inventé', () => {
  const brief = assainir({}, 'bougies');
  const c = JSON.parse(JSON.stringify(R.raime.contenu));
  c.accroche = 'Je vous offre 48 heures de livraison';
  c.sous_titre = 'Sans aucun frais caché.';
  const f = relireContenu(c, brief).join(' | ');
  assert.match(f, /« je »/);
  assert.match(f, /tournure négative/);
  assert.match(f, /chiffres absents du brief : 48/);
});

// ── ②④⑤ Trois phrases, trois services qui passent tous les contrôles ───────
for (const cas of ['raime', 'voitures', 'bougies']) {
  test(`${cas} : tous les contrôles passent`, () => {
    const r = R[cas];
    assert.ok(r.controle.ok, JSON.stringify(r.controle.resultats.filter((x) => !x.ok)));
    assert.equal(r.controle.resultats.length, 8);
    assert.ok(fs.existsSync(path.join(SERVICES, r.brief.nom, 'Dockerfile')));
  });
}

test('rAIme : palette rose, logo, paiement Stripe de test, conditions de vente', () => {
  const accueil = lire('atelier-agents', 'index.html');
  assert.match(accueil, /#6e5569/);
  assert.match(accueil, /logo-mark-blanc\.png/);
  assert.match(accueil, /href="https:\/\/buy\.stripe\.com\/test_fictif00">Acheter/);
  assert.match(accueil, /49 €/);
  assert.ok(fs.existsSync(path.join(SERVICES, 'atelier-agents/site/cgv/index.html')));
  assert.equal(R.raime.paiement.mode, 'test');
});

test('voitures : sans prix ni vendeur, un devis, et rAIme comme éditeur', () => {
  const accueil = lire('exemplia-occasion', 'index.html');
  assert.doesNotMatch(accueil, /stripe/);
  assert.match(accueil, /Demander un devis/);
  assert.match(lire('exemplia-occasion', 'contact/index.html'), /action="mailto:contact@raime\.fr/);
  assert.match(lire('exemplia-occasion', 'mentions-legales/index.html'), /SIRET : 91113862600021/);
  assert.ok(!fs.existsSync(path.join(SERVICES, 'exemplia-occasion/site/cgv')));
});

test('bougies : démonstration signalée, non indexée, couleurs du client, lien de test', () => {
  const accueil = lire('bougies', 'index.html');
  assert.match(accueil, /Site de démonstration réalisé par rAIme/);
  assert.match(accueil, /noindex/);
  assert.match(accueil, /#2f4f4f/);
  assert.match(accueil, /buy\.stripe\.com\/test_/);
  assert.match(lire('bougies', 'cgv/index.html'), /sans débit réel/);
});

test('seuls produits, prix et liens de paiement ont été demandés à Stripe', () => {
  const stripe = requetes.slice(0, n).filter((u) => /stripe/.test(u));
  assert.deepEqual([...new Set(stripe)].sort(), ['https://api.stripe.com/v1/payment_links',
    'https://api.stripe.com/v1/prices', 'https://api.stripe.com/v1/products']);
  assert.equal(stripe.length, 6, 'deux services payables, trois créations chacun');
});

test('le service est lisible par la porte : port, chemin, texte présent sur la page', () => {
  const conf = fs.readFileSync(path.join(SERVICES, 'bougies/service.conf'), 'utf8');
  assert.match(conf, /^port=80$/m);
  const contient = conf.match(/^contient=(.*)$/m)[1];
  assert.ok(lire('bougies', 'index.html').includes(contient));
});

// ── Les contrôles voient les fautes glissées exprès ─────────────────────────
test('les contrôles attrapent un « je », un prix inventé, un lien mort, un lien étranger', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-casse-'));
  fs.cpSync(path.join(SERVICES, 'bougies'), d, { recursive: true });
  const f = path.join(d, 'site/offre/index.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</main>',
    '<p>Je garantis 12 € de remise.</p><a href="/promo/">promo</a><a href="https://exemple.invalid">x</a></main>'));
  const r = controlerService(d, R.bougies.brief);
  const echecs = Object.fromEntries(r.resultats.filter((x) => !x.ok).map((x) => [x.controle, x.erreurs.join(' | ')]));
  assert.deepEqual(Object.keys(echecs).sort(), ['inventions', 'liens', 'voix']);
  assert.match(echecs.inventions, /« 12 »/);
  assert.match(echecs.liens, /lien mort \/promo\//);
  assert.match(echecs.liens, /lien externe inconnu/);
});

test('les contrôles attrapent une page légale absente et un vrai paiement en démonstration', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-casse-'));
  fs.cpSync(path.join(SERVICES, 'bougies'), d, { recursive: true });
  fs.rmSync(path.join(d, 'site/mentions-legales'), { recursive: true });
  const f = path.join(d, 'site/index.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replaceAll('test_fictif00', 'reel00'));
  const r = controlerService(d, R.bougies.brief);
  const noms = r.resultats.filter((x) => !x.ok).map((x) => x.controle);
  assert.ok(noms.includes('pages') && noms.includes('paiement') && noms.includes('liens'));
});

// ── Stripe : seulement la clé restreinte, seulement en création ─────────────
test('Stripe refuse une clé secrète, une clé réelle en test, et l’absence de prix', async () => {
  process.env.STRIPE_CLE_TEST = 'sk_test_cle_secrete_fictive';
  await assert.rejects(creerPaiement({ produit: 'x', montant: 5, nom: 'x' }), /clé restreinte rk_test_/);
  process.env.STRIPE_CLE_TEST = 'rk_live_fictive';
  await assert.rejects(creerPaiement({ produit: 'x', montant: 5, nom: 'x' }), /rk_test_/);
  process.env.STRIPE_CLE_TEST = 'rk_test_banc_fictive';
  await assert.rejects(creerPaiement({ produit: 'x', montant: 0, nom: 'x' }), /aucun prix/);
  delete process.env.STRIPE_CLE_TEST;
  await assert.rejects(creerPaiement({ produit: 'x', montant: 5, nom: 'x' }), /STRIPE_CLE_TEST absente/);
});

test('sans clé Stripe, le service part quand même, avec un devis et une question', async () => {
  delete process.env.STRIPE_CLE_TEST;
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-sans-cle-'));
  const r = await fabriquer({ phrase: PHRASES.raime, dossierServices: d });
  assert.ok(r.controle.ok);
  assert.equal(r.paiement, null);
  assert.match(fs.readFileSync(path.join(d, 'atelier-agents/site/index.html'), 'utf8'), /Demander un devis/);
  assert.ok(r.questions.some((q) => /clé Stripe restreinte/.test(q)));
});
