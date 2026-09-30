// LE NOUVEAU COCKPIT JARVIS, joué pour de vrai sur les bases du banc : ce qu'il prend pour un ordre,
// ce qu'il répond sans frais, ce qu'il protège. Le 26/09/2026, « ok top, fais moi un site… » n'était pas
// reconnu et Jarvis disait encore « tant que le budget n'est pas rechargé » : plus jamais.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-jarvis-'));
const appelsLocal = [];
let local, jarvis, base, executant;
let santeExecutant = { etat: 'libre', moteur: 'hermes' };

before(async () => {
  // Le modèle local simulé (format Ollama) : il note ce qu'on lui demande et répond.
  local = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      appelsLocal.push(JSON.parse(b || '{}'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { role: 'assistant', content: 'Réponse du modèle local.' } }));
    });
  }).listen(0);
  await new Promise((r) => local.once('listening', r));
  executant = http.createServer((req, res) => {
    res.writeHead(santeExecutant.etat === 'indisponible' ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(santeExecutant));
  }).listen(0);
  await new Promise((r) => executant.once('listening', r));
  fs.mkdirSync(path.join(T, 'travail/demande-7/app'), { recursive: true });
  fs.writeFileSync(path.join(T, 'travail/demande-7/app/index.html'), '<h1>site livré</h1>');
  Object.assign(process.env, {
    PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
    PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime',
    LIVRABLES_DIR: path.join(T, 'travail'), COFFRE_FICHIER: path.join(T, 'coffre.env'),
    MODELE_LOCAL_URL: `http://127.0.0.1:${local.address().port}`, EXECUTANT_URL: `http://127.0.0.1:${executant.address().port}`, RECHERCHE_URL: 'http://127.0.0.1:1',
    OPENROUTER_API_KEY: 'ne-doit-jamais-servir',
  });
  const { serveur } = require('../../jarvis/serveur.cjs');
  const b = require('../../jarvis/bases.cjs');
  await b.lire('DROP TABLE IF EXISTS commandes'); await b.lire('DROP TABLE IF EXISTS revenus');
  await b.preparer(); await require('../../jarvis/outils.cjs').preparer();
  jarvis = serveur.listen(0);
  await new Promise((r) => jarvis.once('listening', r));
  base = `http://127.0.0.1:${jarvis.address().port}`;
});
after(async () => {
  jarvis.close(); local.close(); executant.close();
  const b = require('../../jarvis/bases.cjs');
  await b.lire('DROP TABLE IF EXISTS commandes'); await b.lire('DROP TABLE IF EXISTS revenus');
  await b.cerveau.end(); await b.n8n.end();
});

const dire = (message) => fetch(base + '/api/dire', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' }, body: JSON.stringify({ message }) }).then((r) => r.json());

test('les ordres sont reconnus, même précédés de « ok top, » ou dits avec « fais-moi » ; les questions non', () => {
  const { INTENTION_ACTION } = require('../../jarvis/esprit.cjs');
  for (const t of ['ok top, fais moi un site pour mercedes en mode cyberpunk. Tu le dépose sur Github', 'fais-moi un site',
    'Crée une page qui liste 5 nouveautés', 'Alors, écris un article sur l’IA', 'Parfait, dépose le code sur GitHub', 'Jarvis, corrige la page d’accueil'])
    assert.ok(INTENTION_ACTION.test(t), t);
  for (const t of ['fais le point', 'fais-moi le point sur la veille', 'Bonjour, tu m’entends ?', 'qu’est-ce que tu penses du site ?', 'Combien de crédits reste-t-il ?'])
    assert.ok(!INTENTION_ACTION.test(t), t);
});

test('un ordre dit à Jarvis part dans la file d’Hermes et se voit dans le tableau', async () => {
  const r = await dire('ok top, fais moi un site pour Mercedes en mode cyberpunk');
  assert.equal(r.voie, 'action');
  assert.ok(r.commande > 0);
  assert.match(r.reply, /ordre numéro \d+/);
  assert.match(r.reply, /dans la file/);
  assert.doesNotMatch(r.reply, /dans la minute/);
  const e = await (await fetch(base + '/api/etat')).json();
  const o = e.ordres.find((x) => x.id === r.commande);
  assert.equal(o.etat, 'a_faire');
  assert.equal(o.pour, 'harness');
});

test('Hermes refuse sa clé : le tableau expose l’indisponibilité et sa cause', async () => {
  santeExecutant = { etat: 'indisponible', moteur: 'hermes', raison: 'Hermes refuse la clé du relais.', statut: 401 };
  try {
    const e = await (await fetch(base + '/api/etat')).json();
    assert.deepEqual(e.mains, { etat: 'indisponible', raison: 'Hermes refuse la clé du relais.' });
  } finally { santeExecutant = { etat: 'libre', moteur: 'hermes' }; }
});

test('une question : réponse du modèle local (aucune clé), sans budget ni OpenRouter dans la consigne', async () => {
  const avant = appelsLocal.length;
  const r = await dire('Bonjour Jarvis, où en est-on ?');
  assert.equal(r.voie, 'jarvis');
  assert.equal(r.reply, 'Réponse du modèle local.');
  const consigne = appelsLocal.slice(avant)[0].messages[0].content;
  assert.match(consigne, /LE BUDGET NE LIMITE RIEN/);
  assert.match(consigne, /Objectif n°1 \(monétisation des contenus\) : 2000 €/);
  assert.doesNotMatch(consigne, /Arrêt des dépenses|recharge est à prévoir/);
});

test('le budget se dit sans frais ; les anciennes réponses sur le crédit sortent de la mémoire', async () => {
  const { PERIME } = require('../../jarvis/esprit.cjs');
  const r = await dire('Combien de crédits reste-t-il ?');
  assert.equal(r.voie, 'budget');
  assert.match(r.reply, /le budget ne bloque rien/);
  for (const t of ["Je ne peux pas le faire tant que le budget n'est pas rechargé.", 'Les crédits de modèles épuisés bloquent la tâche.', 'On attendra le 1er du mois.'])
    assert.ok(PERIME.test(t), t);
  assert.ok(!PERIME.test('Je crée le site Mercedes, je te donne le lien dès qu’il est prêt.'));
});

test('objectif 2 000 € : un encaissement noté compte ; écrire exige l’en-tête maison', async () => {
  const noter = (entetes) => fetch(base + '/api/revenus', { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes },
    body: JSON.stringify({ montant: '690', source: 'formation Dirigeant' }) });
  assert.equal((await noter({})).status, 403, 'un autre site ne peut pas écrire');
  assert.deepEqual(await (await noter({ 'X-Jarvis': '1' })).json(), { ok: true });
  const e = await (await fetch(base + '/api/etat')).json();
  assert.equal(e.objectif.mois, 690);
  assert.equal(e.objectif.objectif, 2000);
});

test('un ordre bloqué se relance d’un geste, une seule fois', async () => {
  const { lire } = require('../../jarvis/bases.cjs');
  const [{ id }] = await lire("INSERT INTO commandes (texte, pour, reponse) VALUES ('test', 'claude', 'Hermes n''a pas abouti') RETURNING id");
  const relancer = (n) => fetch(`${base}/api/ordres/${n}/relancer`, { method: 'POST', headers: { 'X-Jarvis': '1' } }).then((r) => r.json());
  assert.deepEqual(await relancer(id), { ok: true });
  assert.equal((await lire('SELECT pour FROM commandes WHERE id = $1', [id]))[0].pour, 'harness');
  assert.deepEqual(await relancer(id), { ok: false });
});

test('livrables : servis en lecture, isolés (sandbox), sans sortie du dossier', async () => {
  const r = await fetch(base + '/livrables/demande-7/app/');
  assert.equal(await r.text(), '<h1>site livré</h1>');
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(base + '/livrables/..%2f..%2fetc%2fpasswd')).status, 403);
});

test('l’interface, le coffre (présent ou absent, jamais la valeur), la santé avec la version', async () => {
  const page = await (await fetch(base + '/')).text();
  assert.match(page, /J\.A\.R\.V\.I\.S/);
  for (const id of ['b-conversation', 'b-dicter', 'saisie', 'sphere']) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.equal((await fetch(base + '/visage.js')).status, 404, 'l’ancien visage est retiré');
  const ranger = await fetch(base + '/api/coffre', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' },
    body: JSON.stringify({ nom: 'GEMINI_API_KEY', valeur: 'cle-secrete-banc' }) });
  assert.deepEqual(await ranger.json(), { ok: true });
  const c = await (await fetch(base + '/api/coffre')).text();
  assert.doesNotMatch(c, /cle-secrete-banc/);
  assert.equal(JSON.parse(c).presents.GEMINI_API_KEY, true);
  assert.match(await (await fetch(base + '/healthz')).text(), /^ok [0-9a-f]{12}$/);
});

test('aucun appel payant dans le code du Cockpit', () => {
  const dir = new URL('../../jarvis/', import.meta.url).pathname;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.cjs')))
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /openrouter\.ai/, f);
});

test('la liste des capacités : servie, honnête (chaque « à brancher » dit ce qu’il faut), connue de Jarvis', async () => {
  const c = await (await fetch(base + '/api/capacites')).json();
  const toutes = c.domaines.flatMap((d) => d.capacites);
  assert.ok(toutes.length >= 25);
  for (const x of toutes) {
    assert.ok(['en_place', 'a_brancher', 'a_faire', 'interdit'].includes(x.etat), x.nom);
    if (x.etat === 'a_brancher' || x.etat === 'a_faire') assert.ok(x.il_faut, `${x.nom} : il faut dire ce qui manque`);
  }
  assert.ok(toutes.some((x) => /argent/i.test(x.nom) && x.etat === 'interdit'));
  const avant = appelsLocal.length;
  await dire('Qu’est-ce que tu sais faire ?');
  // Le tri des e-mails tourne depuis le 30/09 (en place) ; la lecture de l'agenda attend son adresse iCal.
  assert.match(appelsLocal.slice(avant)[0].messages[0].content, /TES CAPACITÉS RÉELLES : en place : .*Trier tes e-mails.*À brancher : .*Lire ton agenda/);
});

test('Jarvis ne s’attribue aucune action : la consigne le lui interdit, et ses fausses affirmations sortent de la mémoire', async () => {
  const { SYSTEME, PERIME } = require('../../jarvis/esprit.cjs');
  assert.match(SYSTEME, /TOI, TU PARLES ; TES MAINS AGISSENT/);
  assert.match(SYSTEME, /SOIS BREF/);
  assert.ok(PERIME.test("J'ai maintenant le contrôle total sur ces fichiers."));
  assert.ok(PERIME.test("J'ai modifié l'apparence de l'interface."));
});

test('le modèle local voit l’état réel du cerveau : il tient dans la partie de la consigne qu’il lit', async () => {
  const { resserrer } = require('../../jarvis/parole.cjs');
  const avant = appelsLocal.length;
  await dire('Où en est-on ?');
  const lu = resserrer(appelsLocal.slice(avant)[0].messages)[0].content;
  assert.match(lu, /ÉTAT DU CERVEAU/);
  assert.match(lu, /Objectif n°1 \(monétisation des contenus\) : 2000 €/);
});

test('l’objectif de 2 000 € compte la monétisation des contenus, pas les ventes de rAIme', async () => {
  const noter = (montant, plateforme) => fetch(base + '/api/revenus', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' },
    body: JSON.stringify({ montant, source: 'test', plateforme }) }).then((r) => r.json());
  const avant = (await (await fetch(base + '/api/etat')).json()).objectif.mois;
  await noter('120', 'tiktok'); await noter('990', 'raime');
  const o = (await (await fetch(base + '/api/etat')).json()).objectif;
  assert.equal(o.mois, avant + 120, 'une vente rAIme ne compte pas dans l’objectif');
  assert.equal(o.raime, 990);
  assert.ok(o.plateformes.some((p) => p.plateforme === 'tiktok' && p.montant === 120));
});

test('heure et rappels répondus par du code, sans modèle', async () => {
  const avant = appelsLocal.length;
  assert.match((await dire('Quelle heure est-il ?')).reply, /^Il est /);
  assert.match((await dire('Rappelle-moi dans 10 minutes de relancer le garage Morel')).reply, /C'est noté : relancer le garage Morel/);
  assert.equal(appelsLocal.length, avant, 'aucun appel au modèle');
});

test('appels de relance : un e-mail sans réponse depuis 7 jours met le numéro sous les yeux de Basile, jusqu’à ce qu’il note l’appel', async () => {
  const b = require('../../jarvis/bases.cjs');
  await b.lireN8n(`INSERT INTO prospects(siren, name, sector, city, status, telephone) VALUES
    ('900000001', 'Fleuriste Test', 'commerce', 'Annecy', 'contacte', '04 50 00 00 01'),
    ('900000002', 'Garage Récent', 'commerce', 'Annecy', 'contacte', '04 50 00 00 02'),
    ('900000003', 'Boulangerie Répondue', 'commerce', 'Annecy', 'contacte', '04 50 00 00 03')`);
  await b.lireN8n(`INSERT INTO outreach(siren, prospect_name, subject, body, status, sent_at, reply_at) VALUES
    ('900000001', 'Fleuriste Test', 's', 'b', 'envoye', now() - interval '9 days', NULL),
    ('900000002', 'Garage Récent', 's', 'b', 'envoye', now() - interval '2 days', NULL),
    ('900000003', 'Boulangerie Répondue', 's', 'b', 'envoye', now() - interval '12 days', now() - interval '10 days')`);
  try {
    const liste = await (await fetch(base + '/api/appels')).json();
    const sirens = liste.liste.map((x) => x.siren);
    assert.ok(sirens.includes('900000001'), 'neuf jours sans réponse : à appeler');
    assert.ok(!sirens.includes('900000002'), 'deux jours : trop tôt');
    assert.ok(!sirens.includes('900000003'), 'il a répondu : pas d’appel');
    const f = liste.liste.find((x) => x.siren === '900000001');
    assert.equal(f.telephone, '04 50 00 00 01'); assert.ok(f.jours >= 9);
    const e = await (await fetch(base + '/api/etat')).json();
    assert.ok(e.appels.a_faire >= 1);
    const noter = (corps, entetes = { 'X-Jarvis': '1' }) => fetch(base + '/api/appels/900000001', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) });
    assert.equal((await noter({ etat: 'appele' }, {})).status, 403, 'écrire exige l’en-tête maison');
    assert.deepEqual(await (await noter({ etat: 'n_importe' })).json(), { ok: false, erreur: 'état attendu : appele, pas_interesse, plus_tard' });
    assert.deepEqual(await (await noter({ etat: 'plus_tard', note: 'rappeler lundi', dans_jours: 4 })).json(), { ok: true });
    assert.ok(!(await (await fetch(base + '/api/appels')).json()).liste.some((x) => x.siren === '900000001'), 'plus tard : sorti pour quatre jours');
    await b.lire("UPDATE appels SET rappel_le = current_date WHERE siren = '900000001'");
    assert.ok((await (await fetch(base + '/api/appels')).json()).liste.some((x) => x.siren === '900000001'), 'le jour venu, il revient');
    assert.deepEqual(await (await noter({ etat: 'appele' })).json(), { ok: true });
    assert.ok(!(await (await fetch(base + '/api/appels')).json()).liste.some((x) => x.siren === '900000001'), 'appelé : sorti');
    const { phrase } = require('../../jarvis/appels.cjs');
    assert.equal(typeof await phrase(), 'string');
  } finally {
    await b.lireN8n("DELETE FROM outreach WHERE siren LIKE '90000000_'");
    await b.lireN8n("DELETE FROM prospects WHERE siren LIKE '90000000_'");
    await b.lire('DROP TABLE IF EXISTS appels');
  }
});

test('vitrines : la maquette est publique et isolée, la fiche dit « e-mail non trouvé », l’appel se note', async () => {
  const b = require('../../jarvis/bases.cjs');
  const { preparer, maquette } = await import('../../agents/vitrines.js');
  await preparer(b.cerveau);
  const v = { nom: 'Fleuriste Démo', metier: 'fleuriste', ville: 'Annecy', telephone: '04 50 99 99 99', source_id: 'google:demo1' };
  const [{ id }] = await b.lire(`INSERT INTO vitrines (source, source_id, nom, metier, ville, telephone, slug, demo_html, statut, motif, site_etat)
    VALUES ('google', $1, $2, $3, $4, $5, 'fleuriste-demo-abc123', $6, 'a_appeler', 'e-mail non trouvé', 'aucun') RETURNING id`,
  [v.source_id, v.nom, v.metier, v.ville, v.telephone, maquette(v)]);
  try {
    const page = await fetch(base + '/demo/fleuriste-demo-abc123');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /^sandbox/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex');
    assert.match(await page.text(), /Fleuriste Démo/);
    assert.equal((await fetch(base + '/demo/inconnue-000')).status, 404);
    const f = await (await fetch(`${base}/api/vitrines/${id}`)).json();
    assert.equal(f.email_message, 'e-mail non trouvé');
    assert.match(f.maquette, /\/demo\/fleuriste-demo-abc123$/);
    const l = await (await fetch(base + '/api/vitrines?statut=a_appeler')).json();
    assert.ok(l.vitrines.some((x) => x.id === id));
    const appels = await (await fetch(base + '/api/appels')).json();
    const a = appels.liste.find((x) => x.siren === `v${id}`);
    assert.equal(a.raison, 'e-mail non trouvé');
    const noter = await fetch(`${base}/api/appels/v${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' }, body: JSON.stringify({ etat: 'appele' }) });
    assert.deepEqual(await noter.json(), { ok: true });
    assert.ok(!(await (await fetch(base + '/api/appels')).json()).liste.some((x) => x.siren === `v${id}`));
    const refus = await fetch(`${base}/api/vitrines/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis': '1' }, body: JSON.stringify({ action: 'valider' }) });
    assert.deepEqual(await refus.json(), { ok: false, erreur: 'seul un brouillon se valide' });
    assert.equal((await fetch(`${base}/api/vitrines/${id}`, { method: 'POST', body: '{}' })).status, 403);
  } finally {
    await b.lire('DROP TABLE IF EXISTS vitrines'); await b.lire('DROP TABLE IF EXISTS vitrines_recherches'); await b.lire('DROP TABLE IF EXISTS vitrines_villes');
    await b.lire('DROP TABLE IF EXISTS appels');
  }
});

test('une réponse brève n’est jamais un ordre ; « relance les ordres 7 et 8 » relance par du code', async () => {
  const b = require('../../jarvis/bases.cjs');
  const avant = (await b.lire('SELECT count(*)::int AS n FROM commandes'))[0].n;
  for (const m of ['Parfait.', "Non, c'est bon.", '23 et 24', 'ok top']) {
    const r = await dire(m);
    assert.notEqual(r.voie, 'action', `« ${m} » ne doit pas devenir un ordre`);
  }
  assert.equal((await b.lire('SELECT count(*)::int AS n FROM commandes'))[0].n, avant, 'aucun ordre créé');
  const [bloque] = await b.lire("INSERT INTO commandes (texte, pour, etat, reponse) VALUES ('ordre bloqué', 'claude', 'a_faire', 'Hermes n''a pas abouti') RETURNING id");
  const [fait] = await b.lire("INSERT INTO commandes (texte, pour, etat) VALUES ('ordre fait', 'harness', 'faite') RETURNING id");
  const r = await dire(`Relance les ordres ${bloque.id} et ${fait.id}`);
  assert.equal(r.voie, 'relance');
  assert.match(r.reply, new RegExp(`ordre ${bloque.id} est relancé.*ordre ${fait.id} est déjà fait`, 'i'));
  const [x] = await b.lire('SELECT etat, pour FROM commandes WHERE id = $1', [bloque.id]);
  assert.deepEqual(x, { etat: 'a_faire', pour: 'harness' });
  assert.equal((await b.lire('SELECT count(*)::int AS n FROM commandes'))[0].n, avant + 2, 'rien de neuf pour Hermes');
});
