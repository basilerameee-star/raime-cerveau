// L'AGENDA DES RELANCES (08/10/2026) : ce que Basile choisit de rappeler revient le jour J, en tête, et y reste tant qu'il
// ne l'a pas traité ; les dates se disent en français ; une cible n'a qu'une relance ouverte ; écrire exige l'en-tête maison ;
// les « plus tard » d'avant sont repris une seule fois ; la liste d'appels ne montre plus les fiches écartées et dit le vrai métier.
// (sans tests/banc/outils.mjs : il coupe tout le réseau, et ce test parle au Cockpit lancé ici, comme jarvis.test.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-agenda-'));
Object.assign(process.env, {
  PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime',
  COFFRE_FICHIER: path.join(T, 'coffre.env'), LIVRABLES_DIR: path.join(T, 'travail'), RECHERCHE_URL: 'http://127.0.0.1:1',
  MODELE_LOCAL_URL: 'http://127.0.0.1:1', EXECUTANT_URL: 'http://127.0.0.1:1', OPENROUTER_API_KEY: 'ne-doit-jamais-servir',
});
const a = require('../../jarvis/agenda.cjs');
const b = require('../../jarvis/bases.cjs');
let jarvis, base;
const SIRENS = ['900000101', '900000102', '900000103', '900000104', '900000105'];

before(async () => {
  await b.preparer();
  await a.preparer();
  await b.lireN8n(`INSERT INTO prospects(siren, name, sector, naf, city, status, telephone) VALUES
    ('900000101', 'CABINET ECOGER TEST', 'Cabinets comptables', '69.20Z', 'ANNECY', 'nouveau', '04 50 00 01 01'),
    ('900000102', 'FIDUCIAIRE MIGREE', 'Cabinets comptables', '69.20Z', 'ANNECY', 'nouveau', '04 50 00 01 02'),
    ('900000103', 'ECOLE DE SKI TEST', 'Organismes de formation', '85.59B', 'ANNECY', 'contacte', '04 50 00 01 03'),
    ('900000104', 'OFFICE NOTARIAL TEST', 'Cabinets d avocats', '69.10Z', 'ANNECY', 'contacte', '04 50 00 01 04'),
    ('900000105', 'BROUILLON SEUL', 'Cabinets comptables', '69.20Z', 'ANNECY', 'nouveau', '04 50 00 01 05')`);
  await b.lireN8n(`INSERT INTO outreach(siren, prospect_name, subject, body, status, sent_at) VALUES
    ('900000103', 'Ecole de ski', 's', 'b', 'envoye', now() - interval '9 days'),
    ('900000104', 'Office notarial', 's', 'b', 'envoye', now() - interval '9 days'),
    ('900000105', 'Brouillon seul', 's', 'b', 'brouillon', NULL)`);
  const { serveur } = require('../../jarvis/serveur.cjs');
  jarvis = serveur.listen(0);
  await new Promise((r) => jarvis.once('listening', r));
  base = `http://127.0.0.1:${jarvis.address().port}`;
});
after(async () => {
  jarvis.close();
  await b.lireN8n(`DELETE FROM outreach WHERE siren = ANY($1)`, [SIRENS]);
  await b.lireN8n(`DELETE FROM prospects WHERE siren = ANY($1)`, [SIRENS]);
  await b.lire(`DELETE FROM rappels_historique WHERE rappel_id IN (SELECT id FROM rappels WHERE cible_id = ANY($1) OR nom LIKE 'Banc %')`, [SIRENS]);
  await b.lire(`DELETE FROM rappels WHERE cible_id = ANY($1) OR nom LIKE 'Banc %'`, [SIRENS]);
  await b.lire(`DELETE FROM appels WHERE siren = ANY($1)`, [SIRENS]);
  await b.lire(`DELETE FROM agenda_vus WHERE cle LIKE 'migration:9000001%'`);
  await b.cerveau.end(); await b.n8n.end();
});

const AUJ = '2026-10-08';   // un jeudi
const ecrire = (chemin, corps, entetes = { 'X-Jarvis': '1' }) => fetch(base + chemin, { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) });

test('les dates dites en français ; de aujourd’hui à deux ans, jamais au-delà ni dans le passé', () => {
  assert.equal(a.comprendreDate('dans 3 semaines', AUJ), '2026-10-29');
  assert.equal(a.comprendreDate('dans trois mois', AUJ), '2027-01-08');
  assert.equal(a.comprendreDate('le 12 novembre', AUJ), '2026-11-12');
  assert.equal(a.comprendreDate('demain', AUJ), '2026-10-09');
  assert.equal(a.comprendreDate('dans quinze jours', AUJ), '2026-10-22');
  assert.equal(a.comprendreDate('lundi', AUJ), '2026-10-12');
  assert.equal(a.comprendreDate('un jour', AUJ), null);
  assert.equal(a.resoudre({ dans: 0 }, { auj: AUJ }).erreur !== undefined, true, 'un délai de zéro jour est refusé');
  assert.equal(a.resoudre({ echeance: AUJ }, { auj: AUJ }).dans, 0, 'aujourd’hui, à une date précise, est permis');
  assert.equal(a.resoudre({ dans: 731 }, { auj: AUJ }).dans, 731);
  assert.ok(a.resoudre({ dans: 732 }, { auj: AUJ }).erreur);
  assert.ok(a.resoudre({ echeance: '2026-10-07' }, { auj: AUJ }).erreur, 'jamais dans le passé');
  assert.equal(a.resoudre({ dans_mois: 6 }, { auj: AUJ }).jour, '2027-04-08');
});

test('la voix : « rappelle-moi X dans 3 semaines » est une relance ; une durée en minutes reste une minuterie', () => {
  assert.deepEqual(a.comprendreVoix('Rappelle-moi Ecoger dans 3 semaines', AUJ), { qui: 'Ecoger', jour: '2026-10-29', quand: 'dans 3 semaines' });
  assert.equal(a.comprendreVoix('rappelle Durand le 12 novembre', AUJ).jour, '2026-11-12');
  assert.equal(a.comprendreVoix('Rappelle-moi dans 10 minutes de relancer le garage', AUJ), null);
  assert.equal(a.comprendreVoix('quelle heure est-il', AUJ), null);
});

test('une relance sur un prospect : le nom vient du registre, une seule relance ouverte par cible, le report garde l’histoire', async () => {
  const r = await a.creer({ cible_type: 'prospect', cible_id: '900000101', dans: 3, motif: 'n’a pas décroché' });
  assert.equal(r.ok, true);
  assert.match(r.item.nom, /Ecoger/i);
  assert.equal(r.item.telephone, '04 50 00 01 01');
  const deux = await a.creer({ cible_type: 'prospect', cible_id: '900000101', dans: 5 });
  assert.equal(deux.deplace, true, 'la même cible : la relance existante est déplacée, pas doublée');
  assert.equal(deux.id, r.id);
  const rep = await a.agir(r.id, { action: 'reporter', dans: 7, note: 'en congés' });
  assert.equal(rep.ok, true);
  const f = await a.fiche(r.id);
  const lignes = (f.historique || []).map((h) => h.quoi);
  assert.ok(lignes.some((q) => /^Relance prévue/.test(q)), `historique : ${lignes.join(' | ')}`);
  assert.ok(lignes.filter((q) => /^Relance déplacée/.test(q)).length >= 2, 'deux reports : la seconde demande, puis « en congés »');
  assert.ok(lignes.some((q) => /en congés/.test(q)), 'la note du report est gardée');
  assert.equal((await a.creer({ cible_type: 'prospect', cible_id: '12', dans: 1 })).ok, false, 'un siren a neuf chiffres');
});

test('« pas joint » clôt la relance et en ouvre une à 7 jours ; « rappeler le… » exige une date', async () => {
  const [o] = await b.lire(`SELECT id FROM rappels WHERE cible_type = 'prospect' AND cible_id = '900000101' AND statut = 'a_faire'`);
  assert.equal((await a.agir(o.id, { action: 'fait', resultat: 'rappeler' })).ok, false);
  const r = await a.agir(o.id, { action: 'fait', resultat: 'pas_joint' });
  assert.equal(r.ok, true);
  assert.equal(r.item.statut, 'fait');
  assert.equal(r.suivant.jour, a.plusJours(a.aujourdhui(), 7));
  assert.equal((await a.agir(o.id, { action: 'reporter', dans: 2 })).ok, false, 'une relance traitée ne se reporte plus');
  const [ap] = await b.lire(`SELECT etat FROM appels WHERE siren = '900000101'`);
  assert.equal(ap && ap.etat, 'plus_tard', 'la liste d’appels le sait aussi');
});

test('écrire exige l’en-tête maison ; une relance du jour reste affichée d’une lecture à l’autre, signalée une seule fois', async () => {
  assert.equal((await ecrire('/api/agenda', { cible_type: 'tache', nom: 'Banc tâche', echeance: a.aujourdhui() }, {})).status, 403);
  const c = await (await ecrire('/api/agenda', { cible_type: 'tache', nom: 'Banc tâche', echeance: a.aujourdhui(), priorite: 3 })).json();
  assert.equal(c.ok, true);
  const e1 = await (await fetch(base + '/api/etat')).json();
  const e2 = await (await fetch(base + '/api/etat')).json();
  assert.ok(e1.agenda.alertes.some((x) => x.id === c.id), 'en tête le jour J');
  assert.ok(e2.agenda.alertes.some((x) => x.id === c.id), 'toujours là à la lecture suivante');
  assert.ok(e1.agenda.a_signaler.some((x) => x.id === c.id), 'signalée la première fois');
  assert.ok(!e2.agenda.a_signaler.some((x) => x.id === c.id), 'pas deux fois');
  assert.ok(e1.agenda.compteurs.du_jour >= 1);
  assert.equal(typeof e1.agenda.compteurs.argent_mois, 'number');
  const j = await (await fetch(base + '/api/agenda/jour')).json();
  assert.ok(j.alertes.some((x) => x.id === c.id));
  assert.equal((await fetch(base + '/agenda')).status, 200, 'la page de l’agenda est servie');
  const r = await (await ecrire(`/api/agenda/${c.id}`, { action: 'fait', resultat: 'fait' })).json();
  assert.equal(r.ok, true);
  const rapport = await (await fetch(base + '/api/rapport')).json();
  assert.match(rapport.sections[0].titre, /Tes relances du jour/);
});

test('les « plus tard » d’avant sont repris une seule fois ; un « plus tard » revient le jour J même sans e-mail envoyé', async () => {
  await b.lire(`INSERT INTO appels (siren, etat, note, rappel_le) VALUES ('900000102', 'plus_tard', 'rappeler en novembre', current_date + 20)
    ON CONFLICT (siren) DO UPDATE SET etat = 'plus_tard', rappel_le = EXCLUDED.rappel_le`);
  const n1 = await a.migrer(), n2 = await a.migrer();
  assert.ok(n1 >= 1);
  assert.equal(n2, 0, 'rejouée : aucun doublon');
  assert.equal((await b.lire(`SELECT count(*)::int AS n FROM rappels WHERE cible_id = '900000102' AND statut = 'a_faire'`))[0].n, 1);
  // l'e-mail de 900000105 n'est qu'un brouillon : la liste d'appels ne le montrerait jamais, l'agenda si
  const r = await (await ecrire('/api/appels/900000105', { etat: 'plus_tard', dans_jours: 2 })).json();
  assert.equal(r.ok, true);
  await b.lire(`UPDATE rappels SET echeance = now() WHERE cible_id = '900000105' AND statut = 'a_faire'`);
  const j = await a.jour({ signaler: false });
  assert.ok(j.alertes.some((x) => x.cible_id === '900000105'), 'le jour venu, il revient');
});

test('la liste d’appels : jamais une fiche écartée ou d’un code exclu ; le vrai métier plutôt que l’ancien classement', async () => {
  const l = await (await fetch(base + '/api/appels?limite=500')).json();
  assert.ok(!l.liste.some((x) => x.siren === '900000103'), 'école de ski (85.59B) : jamais à appeler');
  const notaire = l.liste.find((x) => x.siren === '900000104');
  assert.ok(notaire, 'neuf jours sans réponse : à appeler');
  assert.equal(notaire.categorie, 'Notaires');
  const { activite } = require('../../jarvis/appels.cjs');
  assert.equal(activite('69.10Z', 'CABINET DURAND AVOCATS'), 'Avocats');
  assert.equal(activite('69.20Z', 'X'), 'Cabinets comptables');
  // « mal classé » : la fiche sort de la prospection, ce n'est pas un refus
  const m = await (await ecrire('/api/appels/900000104', { etat: 'mal_classe', note: 'banc' })).json();
  assert.equal(m.ok, true);
  const [p] = await b.lireN8n(`SELECT status FROM prospects WHERE siren = '900000104'`);
  assert.equal(p.status, 'exclu');
});
