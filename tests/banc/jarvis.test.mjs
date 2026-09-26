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
let local, jarvis, base;

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
  fs.mkdirSync(path.join(T, 'travail/demande-7/app'), { recursive: true });
  fs.writeFileSync(path.join(T, 'travail/demande-7/app/index.html'), '<h1>site livré</h1>');
  Object.assign(process.env, {
    PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
    PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime',
    LIVRABLES_DIR: path.join(T, 'travail'), COFFRE_FICHIER: path.join(T, 'coffre.env'),
    MODELE_LOCAL_URL: `http://127.0.0.1:${local.address().port}`, EXECUTANT_URL: 'http://127.0.0.1:1', RECHERCHE_URL: 'http://127.0.0.1:1',
    OPENROUTER_API_KEY: 'ne-doit-jamais-servir',
  });
  const { serveur } = require('../../jarvis/serveur.cjs');
  const b = require('../../jarvis/bases.cjs');
  await b.lire('DROP TABLE IF EXISTS commandes'); await b.lire('DROP TABLE IF EXISTS revenus');
  await b.preparer();
  jarvis = serveur.listen(0);
  await new Promise((r) => jarvis.once('listening', r));
  base = `http://127.0.0.1:${jarvis.address().port}`;
});
after(async () => {
  jarvis.close(); local.close();
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
  const e = await (await fetch(base + '/api/etat')).json();
  const o = e.ordres.find((x) => x.id === r.commande);
  assert.equal(o.etat, 'a_faire');
  assert.equal(o.pour, 'harness');
});

test('une question : réponse du modèle local (aucune clé), sans budget ni OpenRouter dans la consigne', async () => {
  const avant = appelsLocal.length;
  const r = await dire('Bonjour Jarvis, où en est-on ?');
  assert.equal(r.voie, 'jarvis');
  assert.equal(r.reply, 'Réponse du modèle local.');
  const consigne = appelsLocal.slice(avant)[0].messages[0].content;
  assert.match(consigne, /LE BUDGET NE LIMITE RIEN/);
  assert.match(consigne, /Objectif n°1 : 2000 €/);
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
  assert.match(appelsLocal.slice(avant)[0].messages[0].content, /TES CAPACITÉS RÉELLES : en place : .*À brancher : .*Trier tes e-mails/);
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
  assert.match(lu, /Objectif n°1 : 2000 €/);
});
