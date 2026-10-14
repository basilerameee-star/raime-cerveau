import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function scenario(mode, maintenance = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'recharger-hermes-'));
  const racine = path.join(base, 'cerveau'), porte = path.join(base, 'porte'), travail = path.join(base, 'travail');
  fs.mkdirSync(path.join(racine, 'hermes'), { recursive: true });
  fs.mkdirSync(path.join(racine, 'jarvis'));
  fs.mkdirSync(path.join(porte, 'versions', 'a'.repeat(40), 'hermes'), { recursive: true });
  fs.mkdirSync(travail);
  fs.writeFileSync(path.join(porte, 'courante'), 'a'.repeat(40));
  fs.writeFileSync(path.join(porte, 'versions', 'a'.repeat(40), 'hermes', 'executant.js'), 'ANCIEN');
  fs.writeFileSync(path.join(racine, 'hermes', 'executant.js'), 'NOUVEAU');
  fs.writeFileSync(path.join(racine, 'jarvis', 'verification.cjs'), 'VERIFICATEUR');
  if (maintenance) fs.writeFileSync(path.join(travail, '.maintenance'), 'pause administrative');
  const attendu = crypto.createHash('sha256').update('NOUVEAUVERIFICATEUR').digest('hex');
  const docker = path.join(base, 'docker-factice');
  fs.writeFileSync(docker, `#!/usr/bin/env bash
set -eu
case "$1" in
  inspect) echo "$BANC_TRAVAIL" ;;
  exec)
    [ "$BANC_MODE" != inconnu ] || exit 1
    if [ "$BANC_MODE" = occupe ]; then echo 'occupe ancienne'; exit 0; fi
    if [ "$BANC_MODE" = deja ] || [ -f "$BANC_COMPTE" ]; then
      if [ "$BANC_MODE" = casse ]; then echo 'libre ancienne'; else echo "libre $BANC_ATTENDU"; fi
    else echo 'libre ancienne'; fi ;;
  restart)
    [ -e "$BANC_TRAVAIL/.maintenance" ] || exit 7
    n=0; [ ! -f "$BANC_COMPTE" ] || n=$(cat "$BANC_COMPTE")
    echo "$((n+1))" > "$BANC_COMPTE" ;;
  *) exit 9 ;;
esac
`, { mode: 0o755 });
  const compte = path.join(base, 'restarts');
  const r = spawnSync('bash', [new URL('../../hermes/recharger.sh', import.meta.url).pathname], {
    env: { ...process.env, RAIME_RECHARGE_RACINE: racine, RAIME_RECHARGE_PORTE: porte,
      RAIME_RECHARGE_DOCKER: docker, RAIME_RECHARGE_DELAI: '0', RAIME_RECHARGE_SANTE: '0',
      BANC_TRAVAIL: travail, BANC_MODE: mode, BANC_ATTENDU: attendu, BANC_COMPTE: compte },
    encoding: 'utf8', timeout: 10000,
  });
  const result = { statut: r.status, sortie: r.stdout + r.stderr,
    redemarrages: fs.existsSync(compte) ? +fs.readFileSync(compte, 'utf8') : 0,
    maintenance: fs.existsSync(path.join(travail, '.maintenance')),
    code: fs.readFileSync(path.join(racine, 'hermes', 'executant.js'), 'utf8') };
  fs.rmSync(base, { recursive: true, force: true });
  return result;
}

test('une version déjà chargée ne redémarre aucun travail', () => {
  const r = scenario('deja');
  assert.equal(r.statut, 0); assert.equal(r.redemarrages, 0); assert.equal(r.maintenance, false);
});
test('une ancienne version libre est rechargée et sa nouvelle empreinte est vérifiée', () => {
  const r = scenario('libre');
  assert.equal(r.statut, 0, r.sortie); assert.equal(r.redemarrages, 1); assert.equal(r.maintenance, false);
  assert.match(r.sortie, /Exécutant vérifié/);
});
test('un travail encore occupé arrête la livraison sans le tuer', () => {
  const r = scenario('occupe');
  assert.notEqual(r.statut, 0); assert.equal(r.redemarrages, 0); assert.equal(r.maintenance, false);
  assert.match(r.sortie, /sans interruption/);
});
test('une nouvelle version non vérifiée remet le code du relais précédent', () => {
  const r = scenario('casse');
  assert.notEqual(r.statut, 0); assert.equal(r.redemarrages, 2); assert.equal(r.code, 'ANCIEN'); assert.equal(r.maintenance, false);
});
test('une maintenance administrative préexistante reste en place', () => {
  const r = scenario('libre', true);
  assert.equal(r.statut, 0); assert.equal(r.maintenance, true);
});
test('une santé inconnue ne déclenche aucun redémarrage', () => {
  const r = scenario('inconnu');
  assert.notEqual(r.statut, 0); assert.equal(r.redemarrages, 0); assert.equal(r.code, 'NOUVEAU');
});
