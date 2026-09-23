// La porte de déploiement, essayée à blanc : un faux Docker, un faux Caddy, une fausse
// adresse web, et le vrai script porte/porte.sh. Chaque version est une archive, comme
// celle que la CI enverra ; ce que la page « sert » vient du service réellement lancé.
import './outils.mjs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEPOT = path.resolve(new URL('../..', import.meta.url).pathname);
const PORTE = path.join(DEPOT, 'porte/porte.sh');
const B = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-porte-'));
const R = { racine: B, cerveau: path.join(B, 'raime-brain'), maison: path.join(B, 'porte'),
  caddy: path.join(B, 'caddy-services'), etat: path.join(B, 'conteneurs'), outils: path.join(B, 'outils') };
const lire = (f) => fs.readFileSync(f, 'utf8');
const ecrire = (f, t, mode) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, { mode }); };

// ── Les faux outils ─────────────────────────────────────────────────────────
before(() => {
  for (const d of Object.values(R)) fs.mkdirSync(d, { recursive: true });
  // Docker : garde l'état des conteneurs (nom → version) dans un dossier.
  ecrire(path.join(R.outils, 'docker'), `#!/usr/bin/env bash
echo "$*" >> "${B}/docker.log"
case "$1" in
  build) ctx="\${@: -1}"; [ -e "$ctx/CASSE_CONSTRUCTION" ] && exit 1; exit 0 ;;
  run)   nom=""; ver=""; while [ $# -gt 0 ]; do case "$1" in --name) nom="$2"; shift;; --label) case "$2" in raime.version=*) ver="\${2#raime.version=}";; esac; shift;; esac; shift; done
         echo "$ver" > "${R.etat}/$nom"; exit 0 ;;
  rm)    rm -f "${R.etat}/\${@: -1}"; exit 0 ;;
  exec)  [ -e "${B}/CADDY_REFUSE" ] && exit 1; exit 0 ;;
esac`, 0o755);
  // curl : répond comme Caddy — il faut un bloc pour l'adresse et un conteneur lancé,
  // et la page servie est l'index.html de la version de ce conteneur.
  ecrire(path.join(R.outils, 'curl'), `#!/usr/bin/env bash
url="\${@: -1}"; hote="\${url#https://}"; hote="\${hote%%/*}"; nom="\${hote%%.*}"
[ -f "${R.caddy}/$nom.caddy" ] || exit 7
ver="$(cat "${R.etat}/raime-service-$nom" 2>/dev/null)" || exit 7
cat "${R.maison}/versions/$ver/services/$nom/index.html" 2>/dev/null || exit 22`, 0o755);
  // Le lanceur du cerveau : npm ci relie les dépendances du dépôt ; le reste s'exécute pour de vrai.
  ecrire(path.join(R.outils, 'lanceur'), `#!/usr/bin/env bash
cd "${R.cerveau}"
case "$1" in "npm ci"*) rm -rf node_modules; ln -s "${DEPOT}/node_modules" node_modules; exit 0 ;; esac
sh -c "$1"`, 0o755);
  // Le cerveau tel qu'il tourne avant le premier passage par la porte.
  ecrire(path.join(R.cerveau, 'agents/lib.js'), 'export const origine = true;\n');
  // Ce que le serveur possède et que le dépôt ne doit jamais écraser.
  ecrire(path.join(R.cerveau, '.env'), 'OPENROUTER_API_KEY=valeur-du-serveur\n');
  ecrire(path.join(R.cerveau, 'out/heraut.log'), 'journal du serveur\n');
  ecrire(path.join(R.cerveau, 'seulement-sur-le-serveur.txt'), 'à garder\n');
});

const env = () => ({ ...process.env, PORTE_RACINE: R.racine, PORTE_DOCKER: path.join(R.outils, 'docker'),
  PORTE_CURL: path.join(R.outils, 'curl'), PORTE_LANCEUR: path.join(R.outils, 'lanceur'),
  PORTE_ESSAIS: '2', PORTE_PAUSE: '0', SSH_ORIGINAL_COMMAND: '' });

// ── Une version = une archive du dépôt ──────────────────────────────────────
let n = 0;
function version({ agent = 'export const pret = true;\n', services = {} } = {}) {
  n += 1;
  const sha = String(n).padStart(40, 'a');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-version-'));
  ecrire(path.join(d, 'agents/lib.js'), agent);
  ecrire(path.join(d, 'package.json'), '{"name":"raime-brain","type":"module"}\n');
  ecrire(path.join(d, 'package-lock.json'), '{}\n');
  ecrire(path.join(d, '.env'), 'NE_DOIT_JAMAIS_ARRIVER=1\n');
  for (const [nom, s] of Object.entries(services)) {
    ecrire(path.join(d, `services/${nom}/Dockerfile`), 'FROM caddy:2-alpine\n');
    ecrire(path.join(d, `services/${nom}/service.conf`), s.conf ?? `port=8080\nchemin=/\ncontient=${s.attendu}\n`);
    ecrire(path.join(d, `services/${nom}/index.html`), s.page);
    if (s.casse) ecrire(path.join(d, `services/${nom}/CASSE_CONSTRUCTION`), '');
  }
  const archive = spawnSync('tar', ['-czf', '-', '-C', d, '.'], { maxBuffer: 1e8 }).stdout;
  return { sha, archive };
}

function porte(demande, archive) {
  const r = spawnSync('bash', [PORTE], { env: { ...env(), SSH_ORIGINAL_COMMAND: demande }, input: archive ?? '', encoding: 'utf8' });
  return { code: r.status, sortie: r.stdout, erreurs: r.stderr };
}
const enService = () => (fs.existsSync(path.join(R.maison, 'courante')) ? lire(path.join(R.maison, 'courante')).trim() : '');
const conteneur = (nom) => { const f = path.join(R.etat, `raime-service-${nom}`); return fs.existsSync(f) ? lire(f).trim() : null; };

const VITRINE = { page: '<h1>Bienvenue chez Exemple</h1>', attendu: 'Bienvenue chez Exemple' };
let A;

// ── Les refus ───────────────────────────────────────────────────────────────
test('la porte ne comprend que trois demandes', () => {
  assert.equal(porte('rm -rf /').code, 2);
  assert.equal(porte('deployer 1234').code, 2, 'un identifiant de version doit faire 40 caractères hexadécimaux');
  assert.equal(porte(`deployer ${'a'.repeat(40)} ; reboot`).code, 2);
  assert.equal(porte('').code, 2);
  assert.match(porte('etat').sortie, /en service : \n/);
});

test('une archive qui n’est pas le dépôt est refusée', () => {
  const r = porte(`deployer ${'b'.repeat(40)}`, Buffer.from('pas une archive'));
  assert.equal(r.code, 2);
  assert.equal(enService(), '');
});

test('un premier déploiement raté remet le cerveau d’origine, photographié avant', () => {
  const Z = version({ agent: 'export const = cassé;\n' });
  const r = porte(`deployer ${Z.sha}`, Z.archive);
  assert.equal(r.code, 3, r.erreurs);
  assert.match(r.erreurs, /photographié/);
  assert.equal(lire(path.join(R.cerveau, 'agents/lib.js')), 'export const origine = true;\n');
  assert.equal(enService(), '');
});

// ── La mise en service ──────────────────────────────────────────────────────
test('une version avec un service passe en ligne : conteneur, bloc Caddy, vérification', () => {
  A = version({ services: { vitrine: VITRINE } });
  const r = porte(`deployer ${A.sha}`, A.archive);
  assert.equal(r.code, 0, r.erreurs);
  assert.match(r.sortie, /en ligne : https:\/\/vitrine\.raime\.fr/);
  assert.equal(enService(), A.sha);
  assert.equal(conteneur('vitrine'), A.sha);
  assert.equal(lire(path.join(R.caddy, 'vitrine.caddy')), 'vitrine.raime.fr {\n  reverse_proxy raime-service-vitrine:8080\n}\n');
  assert.equal(lire(path.join(R.cerveau, 'agents/lib.js')), 'export const pret = true;\n');
});

test('ce que le serveur possède reste intact : .env, journaux, fichiers hors dépôt', () => {
  assert.equal(lire(path.join(R.cerveau, '.env')), 'OPENROUTER_API_KEY=valeur-du-serveur\n');
  assert.equal(lire(path.join(R.cerveau, 'out/heraut.log')), 'journal du serveur\n');
  assert.ok(fs.existsSync(path.join(R.cerveau, 'seulement-sur-le-serveur.txt')));
});

// ── Les retours en arrière ──────────────────────────────────────────────────
test('une page qui ne dit plus ce qu’elle doit : retour seul à la version précédente', () => {
  const B2 = version({ services: { vitrine: { page: '<h1>Erreur 500</h1>', attendu: 'Bienvenue chez Exemple' } } });
  const r = porte(`deployer ${B2.sha}`, B2.archive);
  assert.equal(r.code, 3);
  assert.equal(enService(), A.sha);
  assert.equal(conteneur('vitrine'), A.sha, 'le conteneur de la version précédente est relancé');
  assert.match(lire(path.join(R.maison, 'journal.log')), /RETOUR ARRIÈRE réussi/);
});

test('un cerveau qui ne se charge plus : retour seul, fichiers d’avant remis', () => {
  const C = version({ agent: 'export const = cassé;\n', services: { vitrine: VITRINE } });
  const r = porte(`deployer ${C.sha}`, C.archive);
  assert.equal(r.code, 3);
  assert.match(r.erreurs, /le cerveau ne se charge pas/);
  assert.equal(lire(path.join(R.cerveau, 'agents/lib.js')), 'export const pret = true;\n');
  assert.equal(enService(), A.sha);
});

test('une construction ratée ou un Caddy qui refuse : retour seul aussi', () => {
  const D = version({ services: { vitrine: { ...VITRINE, casse: true } } });
  assert.equal(porte(`deployer ${D.sha}`, D.archive).code, 3);
  fs.writeFileSync(path.join(B, 'CADDY_REFUSE'), '');
  const E = version({ services: { vitrine: VITRINE } });
  const r = porte(`deployer ${E.sha}`, E.archive);
  fs.rmSync(path.join(B, 'CADDY_REFUSE'));
  assert.equal(r.code, 3);
  assert.match(r.erreurs, /Caddy refuse/);
  assert.equal(enService(), A.sha);
});

// ── Les services qui changent ───────────────────────────────────────────────
let F;
test('un service retiré du dépôt est retiré du serveur ; un nouveau apparaît', () => {
  F = version({ services: { boutique: { page: 'Acheter maintenant', attendu: 'Acheter' } } });
  assert.equal(porte(`deployer ${F.sha}`, F.archive).code, 0);
  assert.equal(conteneur('vitrine'), null);
  assert.ok(!fs.existsSync(path.join(R.caddy, 'vitrine.caddy')));
  assert.equal(conteneur('boutique'), F.sha);
  assert.equal(lire(path.join(R.maison, 'precedente')).trim(), A.sha);
});

test('un nom déjà pris sur le serveur (n8n) est refusé, rien ne bouge', () => {
  const G = version({ services: { n8n: { page: 'x', attendu: 'x' } } });
  assert.equal(porte(`deployer ${G.sha}`, G.archive).code, 2);
  assert.equal(enService(), F.sha);
});

test('un service sans texte à vérifier est refusé : ce qui ne se vérifie pas ne part pas', () => {
  const H = version({ services: { muet: { page: 'x', conf: 'port=8080\n' } } });
  const r = porte(`deployer ${H.sha}`, H.archive);
  assert.equal(r.code, 2);
  assert.match(r.erreurs, /contient= » manque/);
});

test('« revenir » remet la version précédente à la demande', () => {
  const r = porte('revenir');
  assert.equal(r.code, 0, r.erreurs);
  assert.equal(enService(), A.sha);
  assert.equal(conteneur('vitrine'), A.sha);
  assert.equal(conteneur('boutique'), null);
  assert.match(porte('etat').sortie, new RegExp(`en service : ${A.sha}\\nprécédente : ${F.sha}`));
});

test('« revenir » deux fois de suite rend la version d’où l’on venait', () => {
  assert.equal(lire(path.join(R.maison, 'precedente')).trim(), F.sha);
  const { code } = porte('revenir');
  assert.equal(code, 0);
  assert.equal(enService(), F.sha);
});

test('sur un serveur vierge, un premier déploiement raté ne laisse rien derrière lui', () => {
  for (const f of ['courante', 'precedente']) fs.rmSync(path.join(R.maison, f), { force: true });
  fs.rmSync(path.join(R.cerveau, 'agents'), { recursive: true, force: true });
  const I = version({ services: { essai: { page: 'autre chose', attendu: 'attendu' } } });
  const r = porte(`deployer ${I.sha}`, I.archive);
  assert.equal(r.code, 4);
  assert.equal(conteneur('essai'), null);
  assert.ok(!fs.existsSync(path.join(R.caddy, 'essai.caddy')));
});
