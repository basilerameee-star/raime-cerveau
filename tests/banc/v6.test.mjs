// LE COCKPIT V6 EN DIRECT (15/10/2026) : /api/v6 assemble la page de la maquette avec les vraies données, sur les bases du
// banc. Ce qui est prouvé ici : la même forme que la maquette ; l'état d'un agent se calcule (passages, flux n8n, relevé du
// serveur) et une source illisible reste « non relevé », jamais un état d'un autre jour ; les appels, rappels, relances et
// offres viennent des tables ; les gestes écrivent pour de vrai (appel noté, rappel avec sa note, demande pour Claude) et
// exigent l'en-tête maison ; la page n'appelle que des routes qui existent.
// (sans tests/banc/outils.mjs : il coupe le réseau, et ce test parle au Cockpit lancé ici, comme agenda.test.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-v6-'));
let executant, jarvis, base, b, agenda, v6, creeN8n = false;
const AGENTS = ['fureteur', 'vitrines', 'directeur', 'cordon'];
before(async () => {
  executant = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"etat":"libre","moteur":"hermes"}'); }).listen(0);
  await new Promise((r) => executant.once('listening', r));
  Object.assign(process.env, {
    PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
    PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime',
    COFFRE_FICHIER: path.join(T, 'coffre.env'), LIVRABLES_DIR: path.join(T, 'travail'), RECHERCHE_URL: 'http://127.0.0.1:1',
    MODELE_LOCAL_URL: 'http://127.0.0.1:1', EXECUTANT_URL: `http://127.0.0.1:${executant.address().port}`, OPENROUTER_API_KEY: 'ne-doit-jamais-servir',
  });
  b = require('../../jarvis/bases.cjs');
  agenda = require('../../jarvis/agenda.cjs');
  v6 = require('../../jarvis/v6.cjs');
  await b.preparer(); await agenda.preparer(); await require('../../jarvis/candidatures.cjs').preparer(); await require('../../jarvis/courrier.cjs').preparer();
  await v6.preparer();
  const B = (sql, p) => b.cerveau.query(sql, p), N = (sql, p) => b.n8n.query(sql, p);
  // les tables des agents, telles que leurs modules les créent en production
  for (const sql of [
    'CREATE TABLE IF NOT EXISTS boucle_passages (agent text NOT NULL, fin_le timestamptz NOT NULL DEFAULT now(), statut text NOT NULL, duree_ms int)',
    `CREATE TABLE IF NOT EXISTS vitrines (id serial PRIMARY KEY, source text NOT NULL, source_id text UNIQUE NOT NULL, nom text, metier text, adresse text, ville text,
      telephone text, carte text, site text, site_etat text, site_signaux text[], email text, email_source text, slug text UNIQUE, demo_html text, sujet text, corps text,
      statut text NOT NULL DEFAULT 'nouveau', motif text, envoye_le timestamptz, note text, cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now())`,
    'CREATE TABLE IF NOT EXISTS candidatures_alertes (cle text PRIMARY KEY, le timestamptz NOT NULL DEFAULT now())',
    `CREATE TABLE IF NOT EXISTS clips_demandes (id serial PRIMARY KEY, url text NOT NULL, campagne text NOT NULL, nombre int NOT NULL DEFAULT 20, consignes text,
      etat text NOT NULL DEFAULT 'a_faire', message text, cree_le timestamptz NOT NULL DEFAULT now(), maj timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS clips_publies (campagne text NOT NULL, clip text NOT NULL, plateforme text NOT NULL, lien text NOT NULL,
      publie_le timestamptz NOT NULL DEFAULT now(), declare_whop boolean NOT NULL DEFAULT false, PRIMARY KEY (campagne, clip, plateforme))`,
    fs.readFileSync(path.join(RACINE, 'migrations/025_verification_clips.sql'), 'utf8'),
    `CREATE TABLE IF NOT EXISTS clips_buffer (id serial PRIMARY KEY, campagne text NOT NULL, clip text NOT NULL, plateforme text NOT NULL, quand timestamptz NOT NULL,
      etat text NOT NULL DEFAULT 'a_faire', post_id text, lien text, message text, cree_le timestamptz NOT NULL DEFAULT now(), maj timestamptz NOT NULL DEFAULT now(), UNIQUE (campagne, clip, plateforme))`,
    `CREATE TABLE IF NOT EXISTS campagnes_proposees (id serial PRIMARY KEY, le date NOT NULL DEFAULT current_date, rang int, nom text, marque text, budget_restant numeric,
      cpm numeric, par_publication numeric, candidature boolean, pourquoi text, fiche text, videos text, url_fiche text, lancee boolean NOT NULL DEFAULT false, UNIQUE (le, nom))`,
    'CREATE TABLE IF NOT EXISTS direction (id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(), jour date NOT NULL, bilan jsonb NOT NULL, texte text NOT NULL)',
    'CREATE TABLE IF NOT EXISTS regime_budget (id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(), mode text NOT NULL, facteur real, pauses text[], chiffres jsonb, mesures text[])',
    `CREATE TABLE IF NOT EXISTS pensees (id bigserial PRIMARY KEY, nuit date NOT NULL, rang int NOT NULL, type text, titre text, vu text, conclusion text, proposition text,
      confiance real, sources jsonb, cree_le timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS veille_poles (id bigserial PRIMARY KEY, pole text NOT NULL, source text NOT NULL, titre text NOT NULL, lien text NOT NULL, detail text,
      score int NOT NULL, vu_le timestamptz NOT NULL DEFAULT now(), UNIQUE (pole, lien))`,
    `CREATE TABLE IF NOT EXISTS trading_bougies (symbole text NOT NULL, echelle text NOT NULL, debut timestamptz NOT NULL, o numeric, h numeric, l numeric, c numeric NOT NULL,
      v numeric, PRIMARY KEY (symbole, echelle, debut))`,
    `CREATE TABLE IF NOT EXISTS trading_portefeuilles (agent text NOT NULL, symbole text NOT NULL, liquidites numeric NOT NULL, quantite numeric NOT NULL,
      depuis timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (agent, symbole))`,
    `CREATE TABLE IF NOT EXISTS trading_operations (id bigserial PRIMARY KEY, agent text NOT NULL, symbole text NOT NULL, le timestamptz NOT NULL DEFAULT now(), sens text NOT NULL,
      prix numeric NOT NULL, montant numeric NOT NULL, frais numeric NOT NULL)`,
    'CREATE TABLE IF NOT EXISTS bourse_strategies (nom text PRIMARY KEY, libelle text NOT NULL, regles text NOT NULL, debut date NOT NULL, capital numeric NOT NULL)',
    `CREATE TABLE IF NOT EXISTS bourse_valeurs (strategie text NOT NULL, mode text NOT NULL, jour date NOT NULL, valeur numeric NOT NULL, liquidites numeric NOT NULL,
      positions jsonb, PRIMARY KEY (strategie, mode, jour))`,
  ]) await B(sql);
  const [n8nPropre] = (await N(`SELECT to_regclass('execution_entity') IS NULL AS a`)).rows;
  creeN8n = n8nPropre.a;
  for (const sql of [
    'CREATE TABLE IF NOT EXISTS workflow_entity (id varchar(36) PRIMARY KEY, name text, active boolean NOT NULL DEFAULT true)',
    'CREATE TABLE IF NOT EXISTS execution_entity (id serial PRIMARY KEY, "workflowId" varchar(36), status text, "startedAt" timestamptz)',
    `CREATE TABLE IF NOT EXISTS vitrines_envoi (id int PRIMARY KEY, to_email text NOT NULL, sujet text NOT NULL, corps text NOT NULL, statut text NOT NULL DEFAULT 'a_envoyer',
      resend_id text, erreur text, envoye_le timestamptz, cree_le timestamptz NOT NULL DEFAULT now(), maj_le timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS vitrines_envoi_config (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), mode text NOT NULL DEFAULT 'test', plafond_jour int NOT NULL DEFAULT 10,
      from_email text NOT NULL DEFAULT 'contact@raime.fr', from_name text NOT NULL DEFAULT 'rAIme', test_to text)`,
    'INSERT INTO vitrines_envoi_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
  ]) await N(sql);

  // les données du banc : une boucle, des flux, des commerces, des entreprises, des offres, des clips, un budget
  // (ce que d'autres tests ont pu laisser pour ces agents est d'abord retiré : l'attendu ne dépend que d'ici)
  await B('DELETE FROM boucle_passages WHERE agent = ANY($1)', [AGENTS]);
  await B(`DELETE FROM journal WHERE acteur = 'fureteur' OR (acteur = 'boucle' AND changement LIKE 'Échec de l''agent %')`);
  await B(`INSERT INTO boucle_passages (agent, statut, fin_le) VALUES
    ('fureteur', 'ok', now() - interval '3 days'), ('fureteur', 'echec', now() - interval '2 days'), ('fureteur', 'ok', now() - interval '20 minutes'),
    ('vitrines', 'ok', now() - interval '5 hours'), ('vitrines', 'echec', now() - interval '30 minutes'),
    ('directeur', 'ok', now() - interval '4 days'), ('cordon', 'ok', now() - interval '10 minutes')`);
  await B(`INSERT INTO journal (acteur, changement, motif, created_at) VALUES ('boucle', 'Échec de l''agent vitrines', 'Overpass ne répond pas', now() - interval '30 minutes'),
    ('fureteur', '25 fiches : 0 sites prouvés, 3 sans site', 'Moteur : fermé ou muet (on ne contourne pas).', now() - interval '20 minutes')`);
  await N(`INSERT INTO workflow_entity (id, name, active) VALUES ('sherlockSrc00001', 'Sherlock', true), ('expediteurEnv001', 'Expéditeur', false)`);
  await N(`INSERT INTO execution_entity ("workflowId", status, "startedAt") VALUES ('sherlockSrc00001', 'success', now() - interval '1 hour'), ('expediteurEnv001', 'success', now() - interval '2 days')`);
  await B(`INSERT INTO vitrines (id, source, source_id, nom, metier, ville, telephone, email, slug, statut, envoye_le, sujet, corps) VALUES
    (9001, 'osm', 'banc-9001', 'Boulangerie du Banc', 'boulangerie', 'Annecy', '+33450672316', NULL, 'boulangerie-du-banc', 'a_appeler', NULL, NULL, NULL),
    (9002, 'osm', 'banc-9002', 'Garage du Banc', 'garage automobile', 'Annecy', '04 50 00 00 02', 'garage@banc.test', 'garage-du-banc', 'envoye', now() - interval '8 days', 'Votre maquette', 'Bonjour'),
    (9003, 'osm', 'banc-9003', 'Coiffeur du Banc', 'coiffeur', 'Annecy', '04 50 00 00 03', NULL, 'coiffeur-du-banc', 'a_appeler', NULL, NULL, NULL),
    (9004, 'osm', 'banc-9004', 'Fleuriste sans numéro', 'fleuriste', 'Annecy', NULL, 'fleur@banc.test', 'fleuriste-banc', 'valide', NULL, 'Sujet', 'Corps'),
    (9005, 'osm', 'banc-9005', 'Pressing écarté', 'pressing', 'Annecy', '04 50 00 00 05', NULL, NULL, 'ecarte', NULL, NULL, NULL)`);
  await N(`INSERT INTO prospects (siren, name, sector, naf, city, status, telephone) VALUES
    ('900000601', 'CABINET BANC V6', 'Cabinets comptables', '69.20Z', 'ANNECY', 'nouveau', '04 50 00 06 01'),
    ('900000602', 'NOTAIRE BANC V6', 'Notaires', '69.10Z', 'ANNECY', 'nouveau', '04 50 00 06 02')`);
  await N(`INSERT INTO outreach (siren, prospect_name, segment, to_email, subject, body, status, created_at) VALUES
    ('900000601', 'Cabinet Banc', 'Cabinets comptables', 'c@banc.test', 'Vos tâches', 'Bonjour, le pré-audit…', 'brouillon', now()),
    ('900000602', 'Notaire Banc', 'Notaires', 'n@banc.test', 'Vos tâches', 'Bonjour', 'envoye', now() - interval '3 days')`);
  await N(`UPDATE outreach SET sent_at = now() - interval '3 days' WHERE siren = '900000602'`);
  await B(`INSERT INTO candidatures (id, offre, fiche, statut, envoi, maj) VALUES
    ('banc-v6-clic', '{"titre":"Vendeur banc","entreprise":"Banc SA","lieu":"Genève","source":"jobup","pays":"CH","lien":"https://banc.test/1"}', '{"lettre":"…"}', 'a_valider', NULL, now()),
    ('banc-v6-toi', '{"titre":"Conseiller banc","entreprise":"Banc AG","lieu":"Lausanne","source":"jobs.ch","pays":"CH","lien":"https://banc.test/2"}', '{"lettre":"…"}', 'a_toi', '{"statut":"site_employeur"}', now()),
    ('banc-v6-fr', '{"titre":"Offre française","entreprise":"Banc SARL","lieu":"Lyon","source":"HelloWork","pays":"FR"}', NULL, 'hors_auto', NULL, now()),
    ('banc-v6-file', '{"titre":"Assistant banc","entreprise":"Banc GmbH","lieu":"Genève","source":"jobup","pays":"CH"}', '{"lettre":"…"}', 'valide', '{"detail":"formulaire : pas de place pour la lettre"}', now() - interval '5 hours')`);
  await B(`INSERT INTO clips_publies (campagne, clip, plateforme, lien, publie_le, etat, controle_le, compte) VALUES
    ('banc', 'c1', 'youtube', 'https://y.test/1', now() - interval '6 days', 'en_ligne', now() - interval '2 hours', '@banc'),
    ('banc', 'c2', 'tiktok', 'https://t.test/2', now() - interval '6 days', 'disparu', now() - interval '2 hours', '@banc')`);
  await B(`INSERT INTO regime_budget (mode, chiffres) VALUES ('normal', '{"plafond_eur": 16, "depense_mois_eur": 0.5, "reste_eur": 15.5}')`);
  await B(`INSERT INTO agent_runs (agent, model, tokens_in, tokens_out, cost_usd, created_at) VALUES ('penseur', 'Gemini · gemini-3.5-flash', 1000, 500, 0, now() - interval '1 day')`);
  const { serveur } = require('../../jarvis/serveur.cjs');
  jarvis = serveur.listen(0);
  await new Promise((r) => jarvis.once('listening', r));
  base = `http://127.0.0.1:${jarvis.address().port}`;
});
after(async () => {
  jarvis.close(); executant.close();
  const B = (sql) => b.cerveau.query(sql).catch(() => {}), N = (sql) => b.n8n.query(sql).catch(() => {});
  await B(`DELETE FROM rappels_historique WHERE rappel_id IN (SELECT id FROM rappels WHERE cible_id IN ('9001','9002','9003','9004','900000601','900000602'))`);
  await B(`DELETE FROM rappels WHERE cible_id IN ('9001','9002','9003','9004','900000601','900000602')`);
  await B(`DELETE FROM appels WHERE siren IN ('v9001','v9002','v9003','v9004','900000601','900000602')`);
  await b.cerveau.query('DELETE FROM boucle_passages WHERE agent = ANY($1)', [AGENTS]).catch(() => {});
  await B('DELETE FROM releve_hote'); await B(`DELETE FROM clips_publies WHERE campagne = 'banc'`); await B(`DELETE FROM regime_budget WHERE chiffres ->> 'reste_eur' = '15.5'`);
  await B(`DELETE FROM vitrines WHERE id BETWEEN 9001 AND 9005`); await B(`DELETE FROM candidatures WHERE id LIKE 'banc-v6-%'`);
  await B(`DELETE FROM commandes WHERE source = 'cockpit'`); await B(`DELETE FROM agent_runs WHERE agent = 'penseur'`);
  await B(`DELETE FROM journal WHERE acteur IN ('boucle', 'fureteur') OR motif LIKE 'siren v900%' OR motif LIKE 'siren 9000006%'`);
  await N(`DELETE FROM outreach WHERE siren IN ('900000601','900000602')`); await N(`DELETE FROM prospects WHERE siren IN ('900000601','900000602')`);
  if (creeN8n) { await N('DROP TABLE IF EXISTS execution_entity'); await N('DROP TABLE IF EXISTS workflow_entity'); }
  await b.cerveau.end(); await b.n8n.end();
});

const lireV6 = async () => { const r = await fetch(base + '/api/v6'); assert.equal(r.status, 200); return r.json(); };
const ecrire = (chemin, corps, entetes = { 'X-Jarvis': '1' }) => fetch(base + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) });
const agentDe = (D, id) => D.agents.find((a) => a.id === id);
const MAQUETTE = ['NOW', 'agents', 'plan', 'majs', 'factures', 'clients', 'rappels', 'brouillons', 'modeles', 'vies', 'relances', 'offres', 'modelesIA', 'modelesSource', 'modelesNote', 'credits', 'categories', 'depuis'];
const ETATS = ['inconnu', 'ok', 'vide', 'panne', 'arret', 'attente', 'construction', 'afaire', 'alerte', 'gris'];

test('v6 : la forme de la maquette, chaque agent avec un état connu de la page, les textes datés', async () => {
  const D = await lireV6();
  for (const k of MAQUETTE) assert.ok(k in D, `clé ${k} absente`);
  assert.equal(D.agents.length, v6.TEXTES.agents.length);
  for (const a of D.agents) {
    assert.ok(ETATS.includes(a.etat), `${a.id} : état ${a.etat}`);
    assert.ok(a.nom && a.secteur && a.texte_le, a.id);
    if (a.fige) assert.ok(!a.dernier, `${a.id} : un état écrit ne prétend pas avoir de passage frais`);
  }
  assert.ok(D.plan.quartiers.length && D.plan.flux.length);
  assert.equal(D.factures[0].date, v6.TEXTES.factures_date, 'les factures portent la date de leur relevé');
  assert.match(D.modelesSource, /en direct/);
});

test('v6 : l’état d’un agent se calcule (passages, échecs et leur cause, retard, flux n8n désactivé)', async () => {
  const D = await lireV6();
  const vit = agentDe(D, 'vitrines');
  assert.equal(vit.etat, 'panne');
  assert.match(vit.derniere_panne.texte, /Overpass ne répond pas/);
  const fur = agentDe(D, 'fureteur');
  assert.equal(fur.etat, 'vide', 'il passe, mais ne prouve aucun site');
  assert.equal(fur.sante, undefined);
  assert.match(fur.mesure, /25 fiches lues, 0 site prouvé/);
  assert.equal(agentDe(D, 'directeur').etat, 'panne', 'un agent quotidien muet depuis 4 jours ne passe plus');
  assert.match(agentDe(D, 'directeur').derniere_panne.texte, /ne passe plus/);
  const cordon = agentDe(D, 'cordon');
  assert.equal(cordon.etat, 'ok');
  assert.equal(cordon.sante.type, 'jamais');
  assert.equal(agentDe(D, 'sherlock').etat, 'ok');
  assert.equal(agentDe(D, 'expediteur').etat, 'arret');
  assert.match(agentDe(D, 'expediteur').derniere_panne.texte, /désactivé/);
  assert.equal(agentDe(D, 'hermes').etat, 'ok');
});

test('v6 : le relevé du serveur fait vivre sauvegardes et livraisons ; trop vieux, il ne décide plus de rien', async () => {
  const sha = Object.keys(v6.TEXTES.majs.sujets)[0];
  const releve = { journaux: { backup: { modifie: new Date(Date.now() - 3 * 3600e3).toISOString(), fin: ['backup : n8n 3.8M, raime_brain 42M'] },
    offsite: { modifie: new Date(Date.now() - 3 * 3600e3).toISOString(), fin: ['offsite : R2 OK'] } },
  porte: { en_service: 2, echecs: 1, premier: '2026-09-24T08:15:38Z', courante: sha, lignes: [
    '2026-10-14T15:39:13Z déploiement de aaaaaaaaaaaa1111 demandé (en service : x)', '2026-10-14T15:39:48Z EN SERVICE : aaaaaaaaaaaa1111',
    '2026-10-14T16:00:00Z ÉCHEC de la vérification : bbbbbbbbbbbb2222, RETOUR à la version précédente',
    `2026-10-15T01:46:27Z déploiement de ${sha}0000 demandé (en service : x)`, `2026-10-15T01:47:02Z EN SERVICE : ${sha}0000`] },
  conteneurs: [{ nom: 'raime-cockpit-1', etat: 'Up 2 hours' }, { nom: 'raime-metabase-1', etat: 'Up 7 weeks' }] };
  await b.cerveau.query('INSERT INTO releve_hote (donnees) VALUES ($1)', [releve]);
  let D = await lireV6();
  assert.equal(agentDe(D, 'sauvegardes').etat, 'ok');
  const liv = agentDe(D, 'livraison');
  assert.equal(liv.etat, 'ok');
  assert.equal(D.majs.livrees[0].sha, sha, 'la plus récente en tête');
  assert.equal(D.majs.livrees[0].sujet, v6.TEXTES.majs.sujets[sha]);
  assert.equal(D.majs.livrees[0].porte, 35);
  assert.equal(D.majs.livrees[1].ok, false);
  assert.equal(D.majs.stats.n, 2);
  assert.equal(agentDe(D, 'inutiles').etat, 'arret', 'Metabase allumé pour rien');
  await b.cerveau.query(`UPDATE releve_hote SET le = now() - interval '2 hours'`);
  D = await lireV6();
  for (const id of ['sauvegardes', 'livraison', 'chercheur_camp']) {
    assert.equal(agentDe(D, id).etat, 'inconnu', `${id} : un relevé de 2 h ne prouve rien`);
    assert.match(agentDe(D, id).derniere_panne.texte, /relevé du serveur date de/);
  }
  assert.equal(D.direct.releve_hote.frais, false);
});

test('v6 : commerces et entreprises, appels, relances, brouillons et offres viennent des tables', async () => {
  const D = await lireV6();
  const c = (cle) => D.clients.find((x) => x.cle === cle);
  assert.equal(c('v9001').etape, 'aappeler');
  assert.equal(c('v9001').tel, '04 50 67 23 16', 'un numéro français lisible');
  assert.equal(c('v9002').etape, 'attente');
  assert.equal(c('v9004').etape, 'completer');
  assert.match(c('v9004').raison, /téléphone manquant/);
  assert.equal(c('v9005'), undefined, 'un commerce écarté n’est jamais proposé');
  assert.ok(D.relancesRetard >= 1, 'la maquette envoyée il y a 8 jours remonte');
  assert.ok(D.brouillons.includes('p900000601'));
  assert.ok(c('p900000601').outreach > 0, 'le brouillon garde son numéro pour être validé');
  assert.equal(c('p900000602').etape, 'attente');
  const o = (k) => D.offres.find((x) => x.cle === k);
  assert.equal(o('banc-v6-clic').etat, 'clic');
  assert.equal(o('banc-v6-toi').etat, 'ouvrir');
  assert.match(o('banc-v6-toi').raison, /site de l’employeur/);
  assert.equal(o('banc-v6-file').etat, 'file');
  assert.equal(o('banc-v6-fr'), undefined, 'une offre française n’est jamais proposée');
  assert.equal(agentDe(D, 'envoyeur').etat, 'panne', 'une candidature validée qui attend plus de 3 h');
  const [t] = (await b.cerveau.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE etat = 'en_ligne')::int AS ok, count(*) FILTER (WHERE etat = 'disparu')::int AS ko
    FROM clips_publies WHERE plateforme = 'tiktok'`)).rows;
  assert.ok(t.ko >= 1);
  assert.deepEqual(D.vies.clipping.verification.find((x) => x[0] === 'TikTok').slice(2), [t.n, t.ok, t.ko], 'la vérification compte ce qui est en base');
  assert.ok(D.modelesIA.some((m) => m.nom === 'Gemini 3.5 Flash' && m.j7 >= 1500));
  assert.equal(D.budget.reste, 15.5);
});

test('v6 : noter un appel écrit pour de vrai, par l’agenda ; sans l’en-tête maison, refusé', async () => {
  assert.equal((await ecrire('/api/v6/appel/v9001', { resultat: 'pas_joint' }, {})).status, 403);
  const auj = agenda.aujourdhui();
  let r = await (await ecrire('/api/v6/appel/v9001', { resultat: 'pas_joint' })).json();
  assert.equal(r.ok, true);
  assert.equal(r.suivant.jour, agenda.plusJours(auj, 7));
  const ouvert = await b.cerveau.query(`SELECT to_char(echeance AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS jour FROM rappels WHERE cible_type = 'vitrine' AND cible_id = '9001' AND statut = 'a_faire'`);
  assert.equal(ouvert.rows[0].jour, agenda.plusJours(auj, 7));
  assert.equal((await b.cerveau.query(`SELECT etat FROM appels WHERE siren = 'v9001'`)).rows[0].etat, 'plus_tard');
  // « à rappeler » avec une date et une note : la note est sur la relance, et l'agenda de la page la montre
  const jour = agenda.plusJours(auj, 3);
  r = await (await ecrire('/api/v6/appel/v9003', { resultat: 'rappeler', echeance: jour, note: 'veut un devis' })).json();
  assert.equal(r.ok, true);
  assert.equal((await ecrire('/api/v6/appel/v9003', { resultat: 'rappeler', echeance: auj })).status, 200);
  assert.equal((await (await ecrire('/api/v6/appel/v9003', { resultat: 'rappeler', echeance: auj })).json()).ok, false, 'pas pour aujourd’hui : dès demain');
  let D = await lireV6();
  const rap = D.rappels.find((x) => x.cle === 'v9003');
  assert.equal(rap.jour, jour); assert.equal(rap.note, 'veut un devis');
  // « pas intéressé » : le commerce sort des listes ; « intéressé » : une relance à 2 jours
  assert.equal((await (await ecrire('/api/v6/appel/v9002', { resultat: 'pas_interesse' })).json()).ok, true);
  assert.equal((await b.cerveau.query(`SELECT statut FROM vitrines WHERE id = 9002`)).rows[0].statut, 'pas_interesse');
  r = await (await ecrire('/api/v6/appel/p900000602', { resultat: 'interesse' })).json();
  assert.equal(r.suivant.jour, agenda.plusJours(auj, 2));
  D = await lireV6();
  assert.equal(D.clients.find((x) => x.cle === 'v9002').etape, 'non');
  assert.equal(D.clients.find((x) => x.cle === 'p900000602').etape, 'interesse');
  assert.equal((await (await ecrire('/api/v6/appel/v9001', { resultat: 'n_importe_quoi' })).json()).ok, false);
});

test('v6 : une demande devient un ordre pour Claude, visible tout de suite dans « Mises à jour »', async () => {
  assert.equal((await ecrire('/api/v6/demande', { texte: 'Mets Annecy en premier' }, {})).status, 403);
  assert.equal((await (await ecrire('/api/v6/demande', { texte: '   ' })).json()).ok, false);
  assert.equal((await (await ecrire('/api/v6/demande', { texte: 'ma clé sk-abcdefghijklmnopqrstu' })).json()).ok, false);
  const r = await (await ecrire('/api/v6/demande', { sujet: 'Commerce › Site web', texte: 'Mets Annecy en premier' })).json();
  assert.equal(r.ok, true);
  const [o] = (await b.cerveau.query('SELECT texte, pour, source, etat FROM commandes WHERE id = $1', [r.id])).rows;
  assert.deepEqual(o, { texte: 'Commerce › Site web : Mets Annecy en premier', pour: 'claude', source: 'cockpit', etat: 'a_faire' });
  const D = await lireV6();
  const a = D.majs.attente.find((x) => x.id === r.id);
  assert.ok(a && a.retard === false && a.pour === 'Claude');
});

test('v6 : une table illisible se dit, et l’agent qui en dépend reste « non relevé », jamais un zéro', async () => {
  await b.cerveau.query('ALTER TABLE clips_publies RENAME TO clips_publies_banc');
  try {
    const D = await lireV6();
    assert.ok(D.direct.erreurs.some((e) => /^clips : table absente/.test(e)), JSON.stringify(D.direct.erreurs));
    assert.equal(agentDe(D, 'verif_pub').etat, 'inconnu');
    assert.ok(!D.vies.clipping.verification, 'pas de tableau inventé');
  } finally { await b.cerveau.query('ALTER TABLE clips_publies_banc RENAME TO clips_publies'); }
});

test('v6 : la page est servie (compressée) et n’appelle que des routes qui existent dans Jarvis', async () => {
  const r = await fetch(base + '/v6', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  const page = fs.readFileSync(path.join(RACINE, 'jarvis/interface/v6.html'), 'utf8');
  assert.match(await r.text(), /Cockpit rAIme/);
  const brut = await new Promise((ok) => http.get(base + '/api/v6', { headers: { 'Accept-Encoding': 'gzip' } }, (x) => { const m = []; x.on('data', (c) => m.push(c)); x.on('end', () => ok({ h: x.headers, b: Buffer.concat(m) })); }));
  assert.equal(brut.h['content-encoding'], 'gzip');
  assert.ok(JSON.parse(zlib.gunzipSync(brut.b)).agents.length > 0);
  const appels = [...new Set([...page.matchAll(/['"`](\/api\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?)/g)].map((m) => m[1]))];
  const serveur = fs.readdirSync(path.join(RACINE, 'jarvis')).filter((f) => f.endsWith('.cjs')).map((f) => fs.readFileSync(path.join(RACINE, 'jarvis', f), 'utf8')).join('\n');
  assert.deepEqual(appels.filter((x) => !serveur.includes(x) && !serveur.includes(x.replace(/\//g, '\\/'))), []);
  for (const mort of ['data-maquette', 'sera branché', 'Maquette v6']) assert.ok(!page.includes(mort), `bouton ou texte de maquette restant : ${mort}`);
});
