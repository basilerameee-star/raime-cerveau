// Le cerveau ouvert à Hermes : un vrai serveur HTTP, de vraies requêtes MCP, le Gardien au milieu.
import { bases, copierBibliotheque, BIBLIO, compter, prevoir } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { creerServeur, traiter, OUTILS } = await import('../../agents/raime_mcp.js');
const { ranger } = await import('../../agents/bibliothecaire.js');

const JETON = 'jeton-fictif-du-banc-assez-long-pour-passer';
let b, serveur, port;

// fetch est coupé par le banc : les requêtes passent par http.request, comme un vrai client.
function poster(corps, { jeton = JETON, methode = 'POST', chemin = '/mcp' } = {}) {
  return new Promise((ok, ko) => {
    const donnees = typeof corps === 'string' ? corps : JSON.stringify(corps);
    const req = http.request({ host: '127.0.0.1', port, path: chemin, method: methode,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; });
      res.on('end', () => ok({ statut: res.statusCode, corps: t ? JSON.parse(t) : null }));
    });
    req.on('error', ko); if (methode === 'POST') req.write(donnees); req.end();
  });
}
const appeler = (name, args = {}, id = 7) => poster({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

before(async () => {
  b = await bases();
  await b.brain.query('TRUNCATE kb_chunks, journal, demandes');
  await b.brain.query(`INSERT INTO demandes(question, pourquoi, bloquant) VALUES
    ('Quel prix pour l''audit des postes ?', 'aucun prix connu', true), ('Quelle cible pour la prospection ?', null, false)`);
  copierBibliotheque(); await ranger({ brain: b.brain, racine: BIBLIO });
  serveur = creerServeur({ brain: b.brain, n8n: b.n8n, jeton: JETON });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  port = serveur.address().port;
});
after(async () => { serveur.close(); await b.fermer(); });

test('sans jeton posé, le serveur refuse de démarrer', () => {
  assert.throws(() => creerServeur({ brain: null, jeton: '' }), /RAIME_MCP_JETON/);
});

test('une requête sans le bon jeton est refusée', async () => {
  assert.equal((await poster({ jsonrpc: '2.0', id: 1, method: 'ping' }, { jeton: null })).statut, 401);
  assert.equal((await poster({ jsonrpc: '2.0', id: 1, method: 'ping' }, { jeton: 'x'.repeat(40) })).statut, 401);
});

test('la poignée de main MCP : initialize, puis notification sans réponse', async () => {
  const r = await poster({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hermes' } } });
  assert.equal(r.corps.result.serverInfo.name, 'raime-cerveau');
  assert.ok(r.corps.result.capabilities.tools);
  assert.equal((await poster({ jsonrpc: '2.0', method: 'notifications/initialized' })).statut, 202);
});

test('tools/list rend le catalogue fermé, avec ses schémas', async () => {
  const r = await poster({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(r.corps.result.tools.map((t) => t.name).sort(),
    ['amelioration_proposer', 'api_publique_chercher', 'bibliotheque_chercher', 'cap_lire', 'chantier_ouvrir', 'etat_maison', 'feuille_de_route_lire', 'journal_lire', 'questions_pour_basile']);
  assert.ok(r.corps.result.tools.every((t) => t.inputSchema.type === 'object'));
});

test('bibliotheque_chercher rend le passage et sa source', async () => {
  const r = await appeler('bibliotheque_chercher', { question: 'formation des dirigeants' });
  assert.match(r.corps.result.content[0].text, /Formation des dirigeants.*offre\/formation-dirigeants\.md/);
});

test('questions_pour_basile : la bloquante d’abord', async () => {
  const t = (await appeler('questions_pour_basile')).corps.result.content[0].text;
  assert.match(t.split('\n')[0], /\(bloquant\) : Quel prix pour l'audit des postes/);
});

test('etat_maison : le relevé chiffré, machine et commerce', async () => {
  assert.match((await appeler('etat_maison')).corps.result.content[0].text, /agents vivants.*client\(s\)/);
});

test('chaque appel laisse sa ligne au journal, et journal_lire la relit', async () => {
  assert.ok(await compter(b.brain, "SELECT count(*) n FROM journal WHERE acteur = 'hermes'") >= 3);
  assert.match((await appeler('journal_lire', { combien: 5, acteur: 'hermes' })).corps.result.content[0].text, /hermes · bibliotheque_chercher/);
});

test('le Gardien coupe un appel qui transporte un secret', async () => {
  const r = await appeler('bibliotheque_chercher', { question: 'ma clé ghp_' + 'A'.repeat(30) });
  assert.equal(r.corps.result.isError, true);
  assert.match(r.corps.result.content[0].text, /Refusé par le Gardien \(coupe_circuit\).*secret/);
  assert.equal(await compter(b.brain, "SELECT count(*) n FROM journal WHERE changement LIKE 'bibliotheque_chercher refusé%'"), 1);
});

test('un outil hors catalogue, un argument inconnu, un argument manquant : refusés', async () => {
  assert.equal((await appeler('terminal_executer', { cmd: 'rm -rf /' })).corps.error.code, -32602);
  assert.match((await appeler('journal_lire', { sql: 'DROP TABLE journal' })).corps.result.content[0].text, /argument inconnu/);
  assert.match((await appeler('chantier_ouvrir', { titre: 'x' })).corps.result.content[0].text, /manquant/);
});

test('chantier_ouvrir passe par les gardes des chantiers (sans jeton GitHub, rien ne part)', async () => {
  delete process.env.GITHUB_CHANTIER_TOKEN;
  const r = await appeler('chantier_ouvrir', { titre: 'Recherche lente', constat: 'La recherche prend trop de temps.',
    mesure: '1 200 ms pour 4 passages', attendu: 'Moins de 200 ms pour 4 passages.' });
  assert.match(r.corps.result.content[0].text, /non ouvert : jeton GITHUB_CHANTIER_TOKEN absent/);
});

test('JSON illisible, méthode inconnue, mauvais chemin, GET : réponses propres', async () => {
  assert.equal((await poster('{pas du json')).corps.error.code, -32700);
  assert.equal((await poster({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).corps.error.code, -32601);
  assert.equal((await poster({ jsonrpc: '2.0', id: 4, method: 'ping' }, { chemin: '/autre' })).statut, 404);
  assert.equal((await poster(null, { methode: 'GET' })).statut, 405);
});

test('un lot de messages reçoit un lot de réponses', async () => {
  const r = await poster([{ jsonrpc: '2.0', id: 10, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 11, method: 'ping' }]);
  assert.deepEqual(r.corps.map((x) => x.id), [10, 11]);
});

test('la configuration d’Hermes pointe sur ce serveur, sans aucun secret écrit', async () => {
  const fs = await import('node:fs');
  const lire = (f) => fs.readFileSync(new URL(`../../hermes/${f}`, import.meta.url), 'utf8');
  const config = lire('config.yaml');
  assert.match(config, /url: "http:\/\/raime-mcp:8766\/mcp"/);
  assert.match(config, /Authorization: "Bearer \$\{RAIME_MCP_JETON\}"/);
  // Les commentaires expliquent ce qui est exclu : seules les lignes actives comptent.
  const compose = lire('docker-compose.hermes.yml').split('\n').filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s+#.*$/, '')).join('\n');
  assert.match(compose, /command: \["gateway", "run"\]/, 'Hermes tourne en passerelle, sinon il redémarre en boucle');
  assert.doesNotMatch(compose, /network_mode:\s*host|docker\.sock|^\s*ports:/m, 'pas de réseau hôte, pas de socket Docker, aucun port publié');
  for (const f of ['config.yaml', 'SOUL.md', 'docker-compose.hermes.yml', 'INSTALLER.md']) {
    assert.doesNotMatch(lire(f), /\b(sk-or-v1-[A-Za-z0-9]{20,}|(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{20,})\b/, `${f} porte un secret`);
  }
  assert.match(lire('SOUL.md'), /Zone 3, jamais/, 'la Constitution est dans l’âme d’Hermes');
});

