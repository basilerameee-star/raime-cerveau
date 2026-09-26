// L'installation complète sur le serveur et le passage au nouveau Cockpit Jarvis, joués pour de vrai avec
// un « docker » simulé qui note chaque commande. Seul le dossier racine (/opt/raime) est déplacé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const DEPOT = new URL('../../', import.meta.url).pathname;

// options : santeApresMaj (Jarvis répond après la bascule), geminiAuCoffre (la clé est rangée au coffre),
// gemmaDispo (le modèle Gemma 4 se télécharge), compose (version de docker compose), surchargeEtrangere
// (un docker-compose.override.yml du serveur existe déjà, comme sur le vrai serveur le 26/09/2026).
function scenario({ santeApresMaj = true, geminiAuCoffre = true, gemmaDispo = true, compose = '2.29.1', surchargeEtrangere = true } = {}) {
  const R = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-installer-'));
  const d = (p) => path.join(R, p);
  for (const x of ['bin', 'travail-cockpit', 'hermes-data', 'raime-brain/hermes', 'raime-brain/node_modules/pg', 'raime-brain/cockpit', 'compose']) fs.mkdirSync(d(x), { recursive: true });
  const copier = (src, dst) => fs.writeFileSync(d(dst), fs.readFileSync(path.join(DEPOT, src), 'utf8')
    .replaceAll('/opt/raime', R).replace(/^sleep \d+$/m, 'sleep 0'));
  for (const f of ['config.yaml', 'SOUL.md', 'docker-compose.hermes.yml', 'brancher.sh', 'revenir.sh', 'installer.sh']) copier(`hermes/${f}`, `raime-brain/hermes/${f}`);
  fs.cpSync(path.join(DEPOT, 'hermes/competences'), d('raime-brain/hermes/competences'), { recursive: true });
  fs.cpSync(path.join(DEPOT, 'jarvis'), d('raime-brain/jarvis'), { recursive: true });
  for (const f of ['installer.sh', 'revenir.sh']) copier(`jarvis/${f}`, `raime-brain/jarvis/${f}`);
  fs.writeFileSync(d('raime-brain/node_modules/pg/package.json'), '{}');
  fs.writeFileSync(d('raime-brain/cockpit/server.js'), '// copie laissée par l’ancien Cockpit');
  fs.writeFileSync(d('raime-brain/.env'), 'DATABASE_URL=fictive\n');
  fs.writeFileSync(d('compose/docker-compose.yml'), 'services: {}\n');
  if (surchargeEtrangere) fs.writeFileSync(d('compose/docker-compose.override.yml'), 'services: {} # réglage de Basile\n');
  fs.writeFileSync(d('compose/.env'), 'POSTGRES_PASSWORD=fictif\nCOMPOSE_PROJECT_NAME=raime\n');
  const fichiers = [d('compose/docker-compose.yml'), ...(surchargeEtrangere ? [d('compose/docker-compose.override.yml')] : [])].join(',');
  // La version que Jarvis annonce : l'empreinte de ses fichiers .cjs et .json, comme serveur.cjs la calcule.
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(d('raime-brain/jarvis')).filter((f) => /\.(cjs|json)$/.test(f)).sort()) h.update(fs.readFileSync(d(`raime-brain/jarvis/${f}`)));
  const version = h.digest('hex').slice(0, 12);
  fs.writeFileSync(d('hermes.env'), 'RAIME_MCP_JETON=fictif\n');
  fs.writeFileSync(d('mcp.env'), 'RAIME_MCP_JETON=fictif\n');
  fs.writeFileSync(d('etat-restart'), 'unless-stopped');
  fs.writeFileSync(d('etat-maj'), 'non');
  fs.writeFileSync(d('bin/docker'), `#!/usr/bin/env bash
echo "$*" >> "${d('docker.log')}"
case "$*" in
  "compose version --short") echo "${compose}" ;;
  "inspect raime-cockpit-1 --format {{range .Mounts}}"*) echo "${d('travail-cockpit')}" ;;
  *"com.docker.compose.project.working_dir"*) echo "${d('compose')}" ;;
  *"com.docker.compose.project.config_files"*) echo "${fichiers}" ;;
  *"com.docker.compose.service"*) echo "cockpit" ;;
  "inspect raime-cockpit-1 --format {{.Config.Image}}") echo "raime-cockpit" ;;
  "inspect raime-cockpit-1 --format {{.Image}}") echo "sha256:ancienne" ;;
  "inspect raime-harness-1 --format"*) cat "${d('etat-restart')}" ;;
  "inspect raime-harness-1") exit 0 ;;
  "update --restart="*" raime-harness-1") echo "\${2#--restart=}" > "${d('etat-restart')}" ;;
  "exec raime-cockpit-1 sh -c"*) ${geminiAuCoffre ? 'echo "GEMINI_API_KEY=cle-gemini-secrete-123"' : 'exit 1'} ;;
  "exec raime-cockpit-1 wget -qO- http://harness:8201/sante") echo '{"etat":"libre","moteur":"hermes"}' ;;
  "exec raime-cockpit-1 wget -qO- -T 180"*) echo '{"message":{"role":"assistant","content":"Une PME gagne du temps."}}' ;;
  "exec raime-cockpit-1 wget -qO- http://127.0.0.1:8090/healthz") if [ "$(cat "${d('etat-maj')}")" = oui ]; then ${santeApresMaj ? `echo "ok ${version}"` : 'exit 1'}; else echo ok; fi ;;
  *"jarvis.yml up -d --no-deps cockpit") echo oui > "${d('etat-maj')}" ;;
  *" up -d --no-deps cockpit") echo non > "${d('etat-maj')}" ;;
  "exec raime-ollama ollama pull gemma4:e4b") ${gemmaDispo ? 'exit 0' : 'exit 1'} ;;
  "exec raime-ollama ollama show gemma4:e4b --license") echo "Apache License 2.0 (exemple)" ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });
  const lancer = (script) => spawnSync('bash', [d(script)], { env: { ...process.env, PATH: `${d('bin')}:${process.env.PATH}` }, encoding: 'utf8' });
  const journal = () => fs.readFileSync(d('docker.log'), 'utf8').trim().split('\n');
  return { R, d, lancer, journal, version };
}

test('installer : clé Gemini transmise une fois (Hermes et agents) et jamais affichée, bascule, Gemma 4, Jarvis en service', () => {
  const s = scenario();
  const r = s.lancer('raime-brain/hermes/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cle Gemini transmise : .*hermes\.env/);
  assert.match(r.stdout, /cle Gemini transmise : .*raime-brain\/\.env/);
  assert.doesNotMatch(r.stdout + r.stderr, /cle-gemini-secrete-123/, 'la clé ne doit jamais s’afficher');
  for (const f of ['hermes.env', 'raime-brain/.env']) assert.match(fs.readFileSync(s.d(f), 'utf8'), /^GEMINI_API_KEY=cle-gemini-secrete-123$/m);
  assert.match(fs.readFileSync(s.d('hermes-data/config.yaml'), 'utf8'), /provider: "gemini"/, 'avec la clé, Hermes travaille sur Gemini gratuit');
  assert.match(r.stdout, /BRANCHE/);
  assert.match(r.stdout, /gemma4:e4b : \d+ s -> Une PME gagne du temps\./);
  assert.match(r.stdout, /licence de gemma4:e4b/);
  assert.doesNotMatch(r.stdout, /qwen3/, 'Qwen3 (plusieurs minutes de réflexion sur le serveur) n’est plus installé');
  assert.match(r.stdout, new RegExp(`JARVIS EN SERVICE : version ${s.version}`));
  assert.ok(!fs.existsSync(s.d('raime-brain/cockpit')), 'la copie de l’ancien Cockpit est retirée');
  assert.match(r.stdout, /INSTALLE/);
  const j = s.journal();
  const i = (m) => j.findIndex((l) => m.test(l));
  assert.ok(i(/up -d --force-recreate hermes raime-executant/) >= 0 && i(/up -d raime-ollama/) > i(/up -d --force-recreate hermes/), 'la bascule avant le modèle local');
  assert.ok(i(/jarvis\.yml up -d --no-deps cockpit$/) > i(/ollama pull gemma4:e4b/), 'le Cockpit est remplacé en dernier');
  assert.ok(i(/^restart raime-boucle$/) > i(/jarvis\.yml up -d/), 'les agents relisent la clé');
  assert.equal(i(/openrouter/i), -1);
  assert.equal(i(/remove-orphans|\bdown\b|^rm raime-hermes|^rm raime-harness/), -1, 'rien n’est supprimé');
  // Relancer ne double rien.
  assert.equal(s.lancer('raime-brain/hermes/installer.sh').status, 0);
  for (const f of ['hermes.env', 'raime-brain/.env']) assert.equal(fs.readFileSync(s.d(f), 'utf8').match(/^GEMINI_API_KEY=/gm).length, 1);
});

test('installer sans clé Gemini au coffre : il continue avec le modèle local', () => {
  const s = scenario({ geminiAuCoffre: false });
  const r = s.lancer('raime-brain/hermes/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pas de cle Gemini au coffre/);
  assert.doesNotMatch(fs.readFileSync(s.d('hermes.env'), 'utf8'), /GEMINI_API_KEY/);
  assert.match(fs.readFileSync(s.d('hermes-data/config.yaml'), 'utf8'), /provider: "local"/, 'sans clé, Hermes passe au modèle local, jamais à OpenRouter');
});


test('Jarvis : la surcharge posée lit le code livré, en lecture seule, sans reconstruction ; l’ancien est gardé', () => {
  const s = scenario();
  const r = s.lancer('raime-brain/jarvis/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const sur = fs.readFileSync(s.d('compose/docker-compose.jarvis.yml'), 'utf8');
  assert.match(sur, /pose par raime-brain\/jarvis\/installer\.sh/);
  assert.match(sur, /build: !reset null/);
  assert.match(sur, /command: \["node", "jarvis\/demarrer\.cjs"\]/);
  assert.match(sur, new RegExp(`- ${s.d('raime-brain/jarvis')}:/app/jarvis:ro`));
  assert.ok(s.journal().includes('tag sha256:ancienne raime-cockpit-ancien:avant-jarvis'));
  assert.equal(fs.readFileSync(s.d('cockpit-avant-jarvis.txt'), 'utf8').trim(), 'raime-cockpit');
  // Relancer ne double rien et ne réécrit pas la sauvegarde.
  assert.equal(s.lancer('raime-brain/jarvis/installer.sh').status, 0);
  assert.equal(s.journal().filter((l) => /raime-cockpit-ancien:avant-jarvis$/.test(l)).length, 1);
});

test('Jarvis ne répond pas avec la bonne version : l’ancien Cockpit est remis (code 3)', () => {
  const s = scenario({ santeApresMaj: false });
  const r = s.lancer('raime-brain/jarvis/installer.sh');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /REVENU/);
  assert.ok(!fs.existsSync(s.d('compose/docker-compose.jarvis.yml')), 'notre fichier est retiré');
  assert.equal(fs.readFileSync(s.d('compose/.env'), 'utf8'), 'POSTGRES_PASSWORD=fictif\nCOMPOSE_PROJECT_NAME=raime\n', 'le .env n’est pas touché');
  assert.ok(s.journal().includes('tag raime-cockpit-ancien:avant-jarvis raime-cockpit'), 'l’ancienne image est remise');
  assert.ok(fs.existsSync(s.d('raime-brain/cockpit')), 'rien de l’ancien n’est effacé');
});

test('retour en arrière volontaire : jarvis/revenir.sh remet l’ancien Cockpit', () => {
  const s = scenario();
  assert.equal(s.lancer('raime-brain/jarvis/installer.sh').status, 0);
  const r = s.lancer('raime-brain/jarvis/revenir.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(s.d('compose/docker-compose.jarvis.yml')));
  assert.equal(fs.readFileSync(s.d('compose/.env'), 'utf8'), 'POSTGRES_PASSWORD=fictif\nCOMPOSE_PROJECT_NAME=raime\n', 'le .env retrouve son contenu d’avant');
  assert.match(fs.readFileSync(s.d('compose/docker-compose.override.yml'), 'utf8'), /réglage de Basile/);
  assert.ok(s.journal().includes('tag raime-cockpit-ancien:avant-jarvis raime-cockpit'));
});

test('garde-fou : docker compose trop ancien : rien n’est touché', () => {
  const s = scenario({ compose: '2.20.0' });
  const r = s.lancer('raime-brain/jarvis/installer.sh');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(!s.journal().some((l) => /^tag |up -d/.test(l)));
});

test('le docker-compose.override.yml du serveur n’est jamais touché ; notre fichier passe derrière, inscrit au .env', () => {
  const s = scenario({ surchargeEtrangere: true });
  const r = s.lancer('raime-brain/jarvis/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(s.d('compose/docker-compose.override.yml'), 'utf8'), 'services: {} # réglage de Basile\n');
  const env = fs.readFileSync(s.d('compose/.env'), 'utf8');
  assert.match(env, /^POSTGRES_PASSWORD=fictif$/m, 'les réglages du .env restent');
  const liste = env.match(/^COMPOSE_FILE=(.*)$/m)[1].split(':');
  assert.deepEqual(liste, [s.d('compose/docker-compose.yml'), s.d('compose/docker-compose.override.yml'), s.d('compose/docker-compose.jarvis.yml')]);
  assert.ok(s.journal().some((l) => l.includes(`-f ${s.d('compose/docker-compose.override.yml')} -f ${s.d('compose/docker-compose.jarvis.yml')} up -d --no-deps cockpit`)));
  // Relancer ne double pas la ligne.
  assert.equal(s.lancer('raime-brain/jarvis/installer.sh').status, 0);
  assert.equal(fs.readFileSync(s.d('compose/.env'), 'utf8').match(/^COMPOSE_FILE=/gm).length, 1);
});

test('sans surcharge sur le serveur : même chemin', () => {
  const s = scenario({ surchargeEtrangere: false });
  const r = s.lancer('raime-brain/jarvis/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(s.d('compose/.env'), 'utf8'), new RegExp(`^COMPOSE_FILE=${s.d('compose/docker-compose.yml')}:${s.d('compose/docker-compose.jarvis.yml')}$`, 'm'));
});

test('modèle local introuvable : l’installation s’arrête avant de toucher au Cockpit', () => {
  const s = scenario({ gemmaDispo: false });
  const r = s.lancer('raime-brain/hermes/installer.sh');
  assert.notEqual(r.status, 0);
  assert.ok(!s.journal().some((l) => /up -d --no-deps cockpit$/.test(l)), 'le Cockpit n’est pas remplacé');
});
