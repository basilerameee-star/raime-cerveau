// La bascule vers Hermes et le retour, joués pour de vrai avec un « docker » simulé qui note chaque
// commande. Les scripts sont ceux du dépôt ; seul leur dossier racine (/opt/raime) est déplacé.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const DEPOT = new URL('../../', import.meta.url).pathname;
let RACINE, BIN, TRAVAIL, JOURNAL;

function scenario({ cockpitSansTravail = false } = {}) {
  RACINE = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-opt-raime-'));
  BIN = path.join(RACINE, 'bin'); TRAVAIL = path.join(RACINE, 'travail-cockpit'); JOURNAL = path.join(RACINE, 'docker.log');
  for (const d of [BIN, TRAVAIL, 'hermes-data', 'raime-brain/hermes']) fs.mkdirSync(path.isAbsolute(d) ? d : path.join(RACINE, d), { recursive: true });
  for (const f of ['config.yaml', 'SOUL.md', 'docker-compose.hermes.yml', 'brancher.sh', 'revenir.sh'])
    fs.writeFileSync(path.join(RACINE, 'raime-brain/hermes', f),
      fs.readFileSync(path.join(DEPOT, 'hermes', f), 'utf8').replaceAll('/opt/raime', RACINE).replace(/^sleep \d+$/m, 'sleep 0'));
  fs.cpSync(path.join(DEPOT, 'hermes/competences'), path.join(RACINE, 'raime-brain/hermes/competences'), { recursive: true });
  fs.writeFileSync(path.join(RACINE, 'hermes.env'), 'OPENROUTER_API_KEY=fictive\nRAIME_MCP_JETON=fictif\n');
  fs.writeFileSync(path.join(RACINE, 'mcp.env'), 'RAIME_MCP_JETON=fictif\n');   // posé à l'étape 1 de la notice
  fs.writeFileSync(path.join(RACINE, 'restart-harness'), 'unless-stopped');
  // Le faux docker : répond comme le vrai aux seules questions que posent les scripts.
  fs.writeFileSync(path.join(BIN, 'docker'), `#!/usr/bin/env bash
echo "$*" >> "${JOURNAL}"
case "$*" in
  "inspect raime-cockpit-1 --format"*) ${cockpitSansTravail ? 'echo ""' : `echo "${TRAVAIL}"`} ;;
  "inspect raime-harness-1 --format"*) cat "${RACINE}/restart-harness" ;;
  "inspect raime-harness-1") exit 0 ;;
  "update --restart="*" raime-harness-1") echo "\${2#--restart=}" > "${RACINE}/restart-harness" ;;
  "exec raime-cockpit-1 wget -qO- http://harness:8201/sante") echo '{"etat":"libre","moteur":"hermes"}' ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });
}
const lancer = (script) => spawnSync('bash', [path.join(RACINE, 'raime-brain/hermes', script)],
  { env: { ...process.env, PATH: `${BIN}:${process.env.PATH}` }, encoding: 'utf8' });
const journal = () => fs.readFileSync(JOURNAL, 'utf8').trim().split('\n');

test('brancher : clé posée une fois, ancien exécutant arrêté (pas supprimé), Hermes et le relais lancés, santé vérifiée', () => {
  scenario();
  const r = lancer('brancher.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /"moteur":"hermes"/);
  assert.match(r.stdout, /BRANCHE/);
  const env = fs.readFileSync(path.join(RACINE, 'hermes-compose.env'), 'utf8');
  const uid = fs.statSync(TRAVAIL).uid;
  assert.match(env, new RegExp(`^TRAVAIL_HOTE=${TRAVAIL}$`, 'm'));
  assert.match(env, new RegExp(`^HERMES_UID=${uid}$`, 'm'));
  const cle = fs.readFileSync(path.join(RACINE, 'hermes.env'), 'utf8').match(/^API_SERVER_KEY=([0-9a-f]{64})$/m);
  assert.ok(cle, 'clé API absente ou mal formée');
  assert.equal(fs.readFileSync(path.join(RACINE, 'executant.env'), 'utf8').trim(), `API_SERVER_KEY=${cle[1]}`);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(cle[1]), 'la clé ne doit jamais s’afficher');
  assert.equal(fs.readFileSync(path.join(RACINE, 'harness-restart.txt'), 'utf8').trim(), 'unless-stopped');
  const j = journal();
  const i = (motif) => j.findIndex((l) => motif.test(l));
  assert.ok(i(/^update --restart=no raime-harness-1$/) >= 0, 'redémarrage automatique de l’ancien exécutant non coupé');
  assert.ok(i(/^stop raime-harness-1$/) > i(/^update --restart=no raime-harness-1$/), 'redémarrage coupé AVANT l’arrêt');
  assert.ok(i(/^compose .* up -d --force-recreate hermes raime-executant$/) > i(/^stop raime-harness-1$/));
  assert.equal(i(/\brm\b|remove-orphans|down\b/), -1, 'rien n’est supprimé à la bascule');
  // Deuxième passage : la clé ne change pas (le relais et Hermes restent d'accord).
  assert.equal(lancer('brancher.sh').status, 0);
  assert.equal(fs.readFileSync(path.join(RACINE, 'hermes.env'), 'utf8').match(/^API_SERVER_KEY=/gm).length, 1);
});

test('revenir : le relais retiré, la règle de redémarrage d’origine rendue, l’ancien exécutant relancé', () => {
  scenario();
  assert.equal(lancer('brancher.sh').status, 0);
  assert.equal(fs.readFileSync(path.join(RACINE, 'restart-harness'), 'utf8').trim(), 'no');
  const r = lancer('revenir.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(path.join(RACINE, 'restart-harness'), 'utf8').trim(), 'unless-stopped');
  const j = journal();
  assert.ok(j.includes('rm raime-executant'));
  assert.ok(j.includes('start raime-harness-1'));
  assert.ok(!j.some((l) => /^rm raime-hermes|^rm raime-harness/.test(l)), 'Hermes et l’ancien exécutant sont gardés');
});

test('brancher refuse net si le Cockpit n’a pas de dossier /travail (rien n’est arrêté)', () => {
  scenario({ cockpitSansTravail: true });
  const r = lancer('brancher.sh');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /ECHEC/);
  assert.ok(!journal().some((l) => /^stop|^update|^compose/.test(l)));
});

test('le compose se lit avec le vrai « docker compose » : relais nommé harness, /travail partagé, aucun port publié',
  { skip: spawnSync('docker', ['compose', 'version']).status !== 0 && 'docker compose absent' }, () => {
  scenario();
  assert.equal(lancer('brancher.sh').status, 0);
  const sortie = execFileSync('docker', ['compose', '--env-file', path.join(RACINE, 'hermes-compose.env'),
    '-f', path.join(RACINE, 'raime-brain/hermes/docker-compose.hermes.yml'), 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, DOCKER_HOST: 'unix:///nulle-part' } });
  const c = JSON.parse(sortie).services;
  assert.deepEqual(c['raime-executant'].networks.raime_default.aliases, ['harness']);
  const cible = (s, dest) => c[s].volumes.find((v) => v.target === dest)?.source;
  assert.equal(cible('hermes', '/travail'), TRAVAIL);
  assert.equal(cible('raime-executant', '/travail'), TRAVAIL);
  assert.equal(c.hermes.volumes.find((v) => v.target === '/cerveau').read_only, true);
  assert.equal(c.hermes.environment.HERMES_UID, String(fs.statSync(TRAVAIL).uid));
  for (const s of Object.values(c)) { assert.equal(s.ports, undefined); assert.notEqual(s.network_mode, 'host'); }
});

test('brancher installe les compétences de la maison chez Hermes (pas la vidéo, qui reste sur le PC) et garde l’ancienne version', () => {
  scenario();
  assert.equal(lancer('brancher.sh').status, 0);
  const skills = path.join(RACINE, 'hermes-data/skills');
  assert.ok(fs.existsSync(path.join(skills, 'site-premium/SKILL.md')));
  assert.ok(fs.existsSync(path.join(skills, 'charte-raime/SKILL.md')));
  assert.ok(!fs.existsSync(path.join(skills, 'video-wangp')));
  fs.appendFileSync(path.join(skills, 'site-premium/SKILL.md'), '\nAmélioration écrite par Hermes.\n');
  assert.equal(lancer('brancher.sh').status, 0);
  assert.match(fs.readFileSync(path.join(RACINE, 'hermes-data/skills-anciennes/site-premium/SKILL.md'), 'utf8'), /Amélioration écrite par Hermes/);
});
