// Le cockpit v8 à l'essai (22/10/2026) : chaque $('#id') de son script existe dans la page, il n'appelle que des routes
// qui existent dans Jarvis, ses modules sont du JavaScript valide qui n'importe que des fichiers servis sous /3d/, et
// le serveur sert bien /v8 (la page) sans toucher à / et /jarvis (la v6 jusqu'à l'accord de Basile).
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const D3 = path.join(RACINE, 'jarvis/interface/3d');
const lire = (f) => fs.readFileSync(f, 'utf8');
const page = lire(path.join(D3, 'v8.html'));
const app = lire(path.join(D3, 'v8-app.js'));
const agence = lire(path.join(D3, 'v8-agence.js'));

test('v8 : chaque élément que le script cherche par son id existe dans la page', () => {
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  // les éléments créés par le script lui-même (formulaires du tiroir, de la liste d'appels, de l'agenda)
  const crees = new Set([...app.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  const cherches = [...new Set([...app.matchAll(/\$\('#([\w-]+)/g)].map((m) => m[1]))];
  assert.ok(cherches.length > 20, 'le script cherche bien ses éléments');
  assert.deepEqual(cherches.filter((id) => !ids.has(id) && !crees.has(id)), [], 'éléments absents de la page v8');
});

test('v8 : les modules sont valides et n’importent que des fichiers servis sous /3d/', () => {
  for (const f of ['v8-app.js', 'v8-agence.js']) {
    const r = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: lire(path.join(D3, f)), encoding: 'utf8' });
    assert.equal(r.status, 0, `${f} : ${r.stderr}`);
  }
  const imports = [...(app + agence).matchAll(/(?:from|import\()\s*'([^']+)'/g)].map((m) => m[1]);
  for (const i of imports) {
    if (i === 'three') continue;
    assert.match(i, /^\/3d\/[\w./-]+\.js$/, `import hors de /3d/ : ${i}`);
    assert.ok(fs.existsSync(path.join(D3, i.slice('/3d/'.length))), `fichier importé absent : ${i}`);
  }
  assert.match(page, /"three":"\/3d\/vendor\/three\.module\.js"/, 'Three.js vient de vendor (empreintes vérifiées ailleurs)');
  assert.match(page, /src="\/3d\/v8-app\.js"/);
  assert.doesNotMatch(page + app + agence, /https?:\/\/(?!cockpit\.raime\.fr)[\w.-]+\.(?:com|net|io)\/[\w./-]+\.(?:js|css)/, 'aucune bibliothèque chargée d’ailleurs');
});

test('v8 : la page n’appelle que des routes qui existent dans Jarvis', () => {
  const appels = [...new Set([...app.matchAll(/['"`](\/api\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?)/g)].map((m) => m[1]))];
  assert.ok(appels.includes('/api/v6') && appels.includes('/api/v7/analyses') && appels.includes('/api/dire'));
  const serveur = fs.readdirSync(path.join(RACINE, 'jarvis')).filter((f) => f.endsWith('.cjs')).map((f) => lire(path.join(RACINE, 'jarvis', f))).join('\n');
  const absentes = appels.filter((r) => !serveur.includes(r) && !serveur.includes(r.replace(/\//g, '\\/')));
  assert.deepEqual(absentes, [], 'routes appelées par la v8 mais absentes de Jarvis');
  assert.ok(/headers: ECRIRE/.test(app) && /'X-Jarvis': '1'/.test(app), 'écrire passe par l’en-tête maison');
});

test('v8 : /v8 sert la page ; / et /jarvis restent la v6', () => {
  const serveur = lire(path.join(RACINE, 'jarvis/serveur.cjs'));
  assert.match(serveur, /url === '\/v8'\) return servir3d\(req, res, path\.join\(TROIS_D, 'v8\.html'\)/);
  assert.match(serveur, /\(url === '\/' \|\| url === '\/jarvis'\) && v6\) return v6\.page\(req, res\)/);
  const fichier3d = /^\/3d\/[\w./-]+\.(js|css|json|woff2|txt)$/;
  for (const f of ['/3d/v8-app.js', '/3d/v8-agence.js', '/3d/ontologie-studio.js']) assert.match(f, fichier3d);
});
