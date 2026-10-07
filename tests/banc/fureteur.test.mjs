// Le Fureteur réécrit (07/10/2026) : un site n'est retenu que s'il prouve être celui de l'entreprise (SIREN, ou nom ET
// ville) ; l'adresse doit y être écrite, à son domaine ; jamais devinée, jamais celle d'un moteur ou d'un annuaire.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const f = await import('../../agents/fureteur.js');
const NAZ = { siren: '123456789', name: 'SCP NAZ & ASSOCIES, NOTAIRES', city: 'ANNECY' };

test('la preuve : le SIREN sur la page, ou tous les mots propres du nom ET la ville ; un mot seul ne prouve rien', () => {
  assert.equal(f.preuve('Mentions légales — RCS Annecy 123 456 789', NAZ), 'siren');
  assert.equal(f.preuve('SIRET 12345678900012', NAZ), 'siren');
  assert.equal(f.preuve('Étude Naz & Associés, 3 rue Royale, 74000 Annecy', NAZ), 'nom et ville');
  assert.equal(f.preuve('Étude Naz à Lyon', NAZ), null, 'pas la bonne ville');
  assert.equal(f.preuve('Cabinet à Annecy, notaires associés', NAZ), null, 'les mots du métier ne prouvent rien');
  assert.equal(f.preuve('n° 9123456789', NAZ), null, 'un SIREN collé à d’autres chiffres n’en est pas un');
});

test('les adresses écrites sur le site, au domaine du site ; la boîte générale avant celle d’une personne', () => {
  const l = f.adressesDe('<a href="mailto:Jean.Naz@naz-associes.notaires.fr">x</a> accueil [at] naz-associes.notaires.fr logo@2x.png contact@buttondown.email');
  assert.deepEqual(l, ['jean.naz@naz-associes.notaires.fr', 'accueil@naz-associes.notaires.fr', 'contact@buttondown.email']);
  assert.equal(f.choisirAdresse(l, NAZ, 'https://naz-associes.notaires.fr'), 'accueil@naz-associes.notaires.fr');
  assert.equal(f.choisirAdresse(['webmaster@agence-web.fr', 'no-reply@naz-associes.notaires.fr'], NAZ, 'https://naz-associes.notaires.fr'), null);
});

test('les domaines tirés du nom, sans les mots du notariat ; .notaires.fr pour une étude', () => {
  const d = f.domainesDevines(NAZ);
  assert.equal(d[0], 'naz-associes.notaires.fr');
  assert.ok(d.includes('nazassocies.fr'));
  assert.deepEqual(f.domainesDevines({ name: 'FIDURALP' }), ['fiduralp.fr', 'fiduralp.com']);
  assert.deepEqual(f.domainesDevines({ name: 'CABINET CONSEIL' }), [], 'un nom fait de mots du métier ne donne aucun domaine');
});

test('visiter : un site sans preuve est rejeté ; un site prouvé rend son adresse et son téléphone', async () => {
  const pages = {
    'https://naz-associes.notaires.fr': '<a href="/mentions-legales">Mentions</a><a href="/contact">Contact</a><p>Bienvenue</p>',
    'https://naz-associes.notaires.fr/mentions-legales': '<p>SCP Naz, RCS Annecy 123 456 789</p>',
    'https://naz-associes.notaires.fr/contact': '<a href="tel:+33450000001">04 50 00 00 01</a> <a href="mailto:office@naz-associes.notaires.fr">écrire</a>',
    'https://autre.fr': '<p>Une autre étude, à Lyon</p><a href="mailto:contact@autre.fr">x</a>',
  };
  const lire = async (u) => (pages[u.replace(/\/$/, '')] ? { url: u.replace(/\/$/, ''), html: pages[u.replace(/\/$/, '')] } : null);
  const v = await f.visiter('https://naz-associes.notaires.fr', NAZ, lire);
  assert.deepEqual([v.preuve, v.email, v.telephone], ['siren', 'office@naz-associes.notaires.fr', '0450000001']);
  const x = await f.visiter('https://autre.fr', NAZ, lire);
  assert.equal(x.preuve, null);
  assert.equal(x.email, undefined, 'aucune adresse prise sur un site non prouvé');
});

test('le nom : la parenthèse qui répète le nom disparaît ; une messagerie grand public seulement si l’adresse porte le nom', async () => {
  const { joliNom, adresseFiable } = await import('../../agents/prospection_auto.js');
  assert.equal(joliNom('SURPERFORMANCE (ZONEBOURSE - SURPERFORMANCE)'), 'Surperformance');
  assert.equal(joliNom('FIDUCIAIRE ET CONSEIL RHONE-ALPES (FIDURALP)'), 'Fiduralp', 'le nom d’usage quand le nom officiel est long');
  assert.equal(joliNom('CAB WIRION STE FIDUC RHONE ALPES JURA'), 'Cabinet Wirion Société Fiduciaire Rhône Alpes Jura');
  assert.equal(joliNom('DUPONT (DUPONT CONSEIL)'), 'Dupont', 'un nom court garde sa forme');
  assert.equal(adresseFiable({ name: 'CABINET DUPONT', contact_email: 'cabinet.dupont@wanadoo.fr' }), true);
  assert.equal(adresseFiable({ name: 'CABINET DUPONT', contact_email: 'jean74@orange.fr' }), false);
});
