// L'installation complète sur le serveur et la mise à jour du Cockpit, jouées pour de vrai avec un
// « docker » simulé qui note chaque commande. Seul le dossier racine (/opt/raime) est déplacé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEPOT = new URL('../../', import.meta.url).pathname;

// options : cockpitNeuf (le dossier de construction a le nouveau code), santeApresMaj (le Cockpit reconstruit répond),
// geminiAuCoffre (la clé est rangée au coffre du Cockpit), gemmaDispo (le modèle Gemma 4 se télécharge).
function scenario({ cockpitNeuf = true, santeApresMaj = true, geminiAuCoffre = true, gemmaDispo = true } = {}) {
  const R = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-installer-'));
  const d = (p) => path.join(R, p);
  for (const x of ['bin', 'travail-cockpit', 'hermes-data', 'raime-brain/hermes', 'raime-brain/cockpit', 'compose']) fs.mkdirSync(d(x), { recursive: true });
  const copier = (src, dst) => fs.writeFileSync(d(dst), fs.readFileSync(path.join(DEPOT, src), 'utf8')
    .replaceAll('/opt/raime', R).replace(/^sleep \d+$/m, 'sleep 0'));
  for (const f of ['config.yaml', 'SOUL.md', 'docker-compose.hermes.yml', 'brancher.sh', 'revenir.sh', 'installer.sh']) copier(`hermes/${f}`, `raime-brain/hermes/${f}`);
  copier('cockpit/mettre_a_jour.sh', 'raime-brain/cockpit/mettre_a_jour.sh');
  fs.writeFileSync(d('raime-brain/cockpit/server.js'), cockpitNeuf ? 'const { repondreSansFrais } = require("./parole.js");' : '// ancien');
  fs.writeFileSync(d('hermes.env'), 'OPENROUTER_API_KEY=fictive\nRAIME_MCP_JETON=fictif\n');
  fs.writeFileSync(d('mcp.env'), 'RAIME_MCP_JETON=fictif\n');
  fs.writeFileSync(d('etat-restart'), 'unless-stopped');
  fs.writeFileSync(d('etat-maj'), 'non');
  const cfg = JSON.stringify({ services: { cockpit: { build: { context: d('raime-brain/cockpit') } } } });
  fs.writeFileSync(d('bin/docker'), `#!/usr/bin/env bash
echo "$*" >> "${d('docker.log')}"
case "$*" in
  "inspect raime-cockpit-1 --format {{range .Mounts}}"*) echo "${d('travail-cockpit')}" ;;
  *"com.docker.compose.project.working_dir"*) echo "${d('compose')}" ;;
  *"com.docker.compose.project.config_files"*) echo "${d('compose')}/docker-compose.yml,${d('compose')}/docker-compose.override.yml" ;;
  *"com.docker.compose.service"*) echo "cockpit" ;;
  "inspect raime-cockpit-1 --format {{.Config.Image}}") echo "raime-cockpit" ;;
  "inspect raime-cockpit-1 --format {{.Image}}") echo "sha256:ancienne" ;;
  "inspect raime-harness-1 --format"*) cat "${d('etat-restart')}" ;;
  "inspect raime-harness-1") exit 0 ;;
  "update --restart="*" raime-harness-1") echo "\${2#--restart=}" > "${d('etat-restart')}" ;;
  "exec raime-cockpit-1 sh -c"*) ${geminiAuCoffre ? 'echo "GEMINI_API_KEY=cle-gemini-secrete-123"' : 'exit 1'} ;;
  "exec raime-cockpit-1 wget -qO- http://harness:8201/sante") echo '{"etat":"libre","moteur":"hermes"}' ;;
  "exec raime-cockpit-1 wget -qO- -T 600"*) echo '{"message":{"role":"assistant","content":"Une PME gagne du temps."}}' ;;
  "exec raime-cockpit-1 wget -qO- http://127.0.0.1:8090/healthz") [ "$(cat "${d('etat-maj')}")" = oui ] && ${santeApresMaj ? 'exit 0' : 'exit 1'}; exit 0 ;;
  "exec raime-cockpit-1 grep -q repondreSansFrais /app/server.js") [ "$(cat "${d('etat-maj')}")" = oui ] ;;
  *"config --format json") echo '${cfg}' ;;
  *" build cockpit") echo oui > "${d('etat-maj')}" ;;
  "tag raime-cockpit:avant-maj raime-cockpit") echo non > "${d('etat-maj')}" ;;
  "exec raime-ollama ollama pull gemma4:e4b") ${gemmaDispo ? 'exit 0' : 'exit 1'} ;;
  "exec raime-ollama ollama show gemma4:e4b --license") echo "Apache License 2.0 (exemple)" ;;
  *) exit 0 ;;
esac
`, { mode: 0o755 });
  const lancer = (script) => spawnSync('bash', [d(script)], { env: { ...process.env, PATH: `${d('bin')}:${process.env.PATH}` }, encoding: 'utf8' });
  const journal = () => fs.readFileSync(d('docker.log'), 'utf8').trim().split('\n');
  return { R, d, lancer, journal };
}

test('installer : clé Gemini transmise une fois et jamais affichée, bascule, modèles local et Gemma 4 essayés, Cockpit à jour', () => {
  const s = scenario();
  const r = s.lancer('raime-brain/hermes/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /cle Gemini transmise/);
  assert.doesNotMatch(r.stdout + r.stderr, /cle-gemini-secrete-123/, 'la clé ne doit jamais s’afficher');
  assert.match(fs.readFileSync(s.d('hermes.env'), 'utf8'), /^GEMINI_API_KEY=cle-gemini-secrete-123$/m);
  assert.match(r.stdout, /BRANCHE/);
  assert.match(r.stdout, /qwen3:4b : \d+ s -> Une PME gagne du temps\./);
  assert.match(r.stdout, /gemma4:e4b : \d+ s ->/);
  assert.match(r.stdout, /licence de gemma4:e4b/);
  assert.match(r.stdout, /COCKPIT A JOUR/);
  assert.match(r.stdout, /INSTALLE/);
  const j = s.journal();
  const i = (m) => j.findIndex((l) => m.test(l));
  assert.ok(i(/up -d --force-recreate hermes raime-executant/) >= 0 && i(/up -d raime-ollama/) > i(/up -d --force-recreate hermes/), 'la bascule avant le modèle local');
  assert.ok(i(/ build cockpit$/) > i(/ollama pull qwen3:4b/), 'le Cockpit est reconstruit en dernier');
  assert.equal(i(/remove-orphans|\bdown\b|^rm raime-hermes|^rm raime-harness/), -1, 'rien n’est supprimé');
  // Relancer ne double rien.
  assert.equal(s.lancer('raime-brain/hermes/installer.sh').status, 0);
  assert.equal(fs.readFileSync(s.d('hermes.env'), 'utf8').match(/^GEMINI_API_KEY=/gm).length, 1);
});

test('installer sans clé Gemini au coffre et sans Gemma 4 : il continue avec le modèle local', () => {
  const s = scenario({ geminiAuCoffre: false, gemmaDispo: false });
  const r = s.lancer('raime-brain/hermes/installer.sh');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /pas de cle Gemini au coffre/);
  assert.match(r.stdout, /gemma4:e4b indisponible pour l'instant : qwen3:4b reste seul/);
  assert.doesNotMatch(fs.readFileSync(s.d('hermes.env'), 'utf8'), /GEMINI_API_KEY/);
});

test('mise à jour du Cockpit : si la nouvelle version ne répond pas, l’ancienne est remise (code 3)', () => {
  const s = scenario({ santeApresMaj: false });
  const r = s.lancer('raime-brain/cockpit/mettre_a_jour.sh');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /retour a la precedente/);
  const j = s.journal();
  assert.ok(j.includes('tag sha256:ancienne raime-cockpit:avant-maj'), 'version en service gardée avant la construction');
  assert.ok(j.includes('tag raime-cockpit:avant-maj raime-cockpit'), 'ancienne version remise');
  assert.ok(j.findIndex((l) => l === 'tag raime-cockpit:avant-maj raime-cockpit') > j.findIndex((l) => / build cockpit$/.test(l)));
});

test('mise à jour du Cockpit : sans le nouveau code dans le dossier de construction, rien n’est touché', () => {
  const s = scenario({ cockpitNeuf: false });
  const r = s.lancer('raime-brain/cockpit/mettre_a_jour.sh');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /n'a pas encore la nouvelle version ; rien n'est touche/);
  assert.ok(!s.journal().some((l) => /^tag | build |up -d/.test(l)));
});
