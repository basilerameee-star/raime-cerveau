// Les portes d'entrée : cartographier, peser, préparer, présenter un lot. Rien n'est envoyé.
import { bases, prevoir, requetes } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PORTES_PAUSE_MS = '0';
process.env.PORTES_SORTIE = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-portes-'));
const P = await import('../../agents/portes.js');

// Trois sites fictifs. La CCI : une page « devenir formateur » avec un formulaire ; son robots.txt
// interdit /recrutement. Le premier organisme : une adresse e-mail. Le second : un formulaire gardé par un captcha.
const FORM = '<form action="/envoi"><input name="nom"><input name="email"><textarea name="message"></textarea></form>';
prevoir(/cci-fictive\.invalid\/robots\.txt$/, 'User-agent: *\nDisallow: /recrutement\n');
prevoir(/cci-fictive\.invalid\/devenir-formateur$/, `<h1>Devenir formateur</h1><p>Nous recherchons des formateurs indépendants.</p>${FORM}`);
prevoir(/cci-fictive\.invalid\/recrutement$/, '<p>page interdite par robots.txt</p>');
prevoir(/cci-fictive\.invalid/, '<a href="/devenir-formateur">Devenir formateur</a><form role="search"><input name="q"></form>');
prevoir(/formation-exemple\.invalid\/contact$/, '<p>Écrivez-nous : <a href="mailto:contact@formation-exemple.invalid">contact</a></p>');
prevoir(/formation-exemple\.invalid/, '<p>Organisme de formation</p>');
prevoir(/organisme-garde\.invalid\/devenir-formateur$/, `<p>Vivier de formateurs</p><div class="g-recaptcha"></div>${FORM}`);
prevoir(/organisme-garde\.invalid/, '<p>Bienvenue</p>');

let b, carto, lot;
before(async () => {
  b = await bases();
  await b.brain.query('DROP TABLE IF EXISTS portes; TRUNCATE journal');
  const i = await P.importer({ brain: b.brain, n8n: b.n8n });
  assert.equal(i.nouvelles, 3);
  carto = await P.cartographier({ brain: b.brain });
  lot = await P.presenterLot({ brain: b.brain, taille: 30 });
});
after(async () => b.fermer());

const porte = async (nom) => (await b.brain.query('SELECT * FROM portes WHERE nom = $1', [nom])).rows[0];

test('la CCI : formulaire « devenir formateur » reconnu, porte préparée puis présentée', async () => {
  const p = await porte('CCI Fictive Savoie');
  assert.equal(p.procedure, 'formulaire');
  assert.equal(p.adresse, 'https://cci-fictive.invalid/devenir-formateur');
  assert.equal(p.captcha, false);
  assert.equal(p.etat, 'presentee');
  assert.equal(p.lot, 1);
});

test('robots.txt est respecté : la page interdite n’est pas lue', () => {
  assert.ok(!requetes.includes('https://cci-fictive.invalid/recrutement'));
  assert.ok(requetes.includes('https://cci-fictive.invalid/robots.txt'));
});

test('l’organisme sans formulaire : l’adresse e-mail est la porte', async () => {
  const p = await porte('Formation Exemple');
  assert.equal(p.procedure, 'email');
  assert.equal(p.adresse, 'contact@formation-exemple.invalid');
});

test('un captcha n’est jamais contourné : la porte va à Basile', async () => {
  const p = await porte('Organisme Gardé');
  assert.equal(p.captcha, true);
  assert.equal(p.etat, 'a_faire_par_basile');
  assert.equal(lot.basile, 1);
});

test('la balance est écrite : bénéfice, risque, zone 2', async () => {
  const p = await porte('CCI Fictive Savoie');
  assert.equal(p.balance.zone, 2);
  assert.ok(p.balance.benefice.some((x) => /recrute explicitement des formateurs/.test(x)));
  assert.ok(p.balance.risque.some((x) => /réversible/.test(x)));
});

test('le dossier ne contient que ce qui existe ; le reste est nommé comme manquant', async () => {
  const d = (await porte('CCI Fictive Savoie')).dossier;
  assert.equal(d.champs.siret, '91113862600021');
  assert.equal(d.champs.email, 'contact@raime.fr');
  assert.equal(d.champs.adresse_postale, null, 'l’adresse est « communiquée sur demande » : elle ne s’invente pas');
  assert.deepEqual(d.manquants, ['adresse_postale', 'telephone', 'cv_formateur', 'tarif_journalier', 'attestation_assurance_rc_pro']);
  assert.equal(d.champs.offres.length, 3);
});

test('le lot présenté dit tout à Basile, et que rien n’est parti', () => {
  assert.equal(lot.portes, 2);
  const md = fs.readFileSync(lot.fichier, 'utf8');
  assert.match(md, /Un seul « ok » vaut pour tout ce lot/);
  assert.match(md, /rien n'est parti à ce jour/);
  assert.match(md, /Organisme Gardé/);
  assert.match(md, /adresse_postale/);
});

test('aucun envoi : seules des pages ont été lues, aucun formulaire soumis', () => {
  assert.ok(requetes.every((u) => /\.invalid(\/|$)/.test(u)));
  assert.ok(!requetes.some((u) => /\/envoi$/.test(u)));
});

test('un seul lot en attente à la fois', async () => {
  const r = await P.portes({ brain: b.brain, n8n: b.n8n });
  assert.equal(r.lot, null);
  assert.equal(r.importees.nouvelles, 0);
});

test('reconnaissance d’une plateforme de marchés publics et d’un formulaire de recherche écarté', () => {
  const a = P.analyserPage('<a href="https://www.marches-publics.info/x">Nos marchés publics</a><form role="search"><input><input><input></form>', 'https://x.invalid/');
  assert.equal(a.plateforme, 'https://www.marches-publics.info/x');
  assert.equal(a.formulaires, 0);
  assert.equal(P.procedure([{ url: 'https://x.invalid/', ...a }]).type, 'plateforme');
});
