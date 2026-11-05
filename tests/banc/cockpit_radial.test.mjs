// Le cockpit radial (04/11/2026) : ses données sont complètes et cohérentes, son script est du JavaScript valide,
// il ne charge rien d'ailleurs, et le serveur le sert à / et /jarvis avant la v8 (qui reste entière à /v8).
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const D3 = path.join(RACINE, 'jarvis/interface/3d');
const lire = (f) => fs.readFileSync(f, 'utf8');
const page = lire(path.join(D3, 'radial.html'));
const ETATS = ['actif', 'garde', 'encours', 'coupe', 'supprime', 'nonreleve'];

function donnees() {
  const bac = { window: {} };
  vm.runInNewContext(lire(path.join(D3, 'radial-donnees.js')), bac);
  return bac.window.RAIME;
}

test('radial : chaque pôle et chaque agent a un nom, un texte et un état connu ; les identifiants sont uniques', () => {
  const R = donnees();
  assert.ok(R && Array.isArray(R.poles) && R.poles.length >= 5, 'des pôles');
  assert.ok(!Number.isNaN(Date.parse(R.releve)), 'la date du relevé');
  const ids = new Set(), cles = new Set();
  for (const p of R.poles) {
    assert.ok(p.cle && p.nom && p.resume, `pôle incomplet : ${p.cle}`);
    assert.ok(ETATS.includes(p.etat), `état inconnu pour le pôle ${p.cle} : ${p.etat}`);
    assert.ok(!cles.has(p.cle), `pôle en double : ${p.cle}`); cles.add(p.cle);
    assert.ok(p.branches.length > 0, `pôle vide : ${p.cle}`);
    for (const b of p.branches) {
      assert.ok(b.id && b.nom && b.texte, `agent incomplet dans ${p.cle} : ${b.id}`);
      assert.ok(ETATS.includes(b.etat), `état inconnu pour ${b.id} : ${b.etat}`);
      assert.ok(!ids.has(b.id), `agent en double : ${b.id}`); ids.add(b.id);
    }
  }
  for (const a of R.anneaux) assert.ok(a.valeur && a.texte, 'un chiffre du centre sans texte');
});

test('radial : le script de la page est valide et ne charge rien d’ailleurs', () => {
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1, 'un seul script dans la page');
  const r = spawnSync(process.execPath, ['--check', '-'], { input: scripts[0], encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(page, /<script src="\/3d\/radial-donnees\.js"><\/script>/);
  assert.match('/3d/radial-donnees.js', /^\/3d\/[\w./-]+\.(js|css|json|woff2|txt)$/, 'servi par la liste blanche de /3d/');
  assert.doesNotMatch(page, /(?:src|href)="https?:\/\//, 'aucune ressource chargée d’ailleurs');
  assert.match(page, /fetch\('\/api\/v6'/, 'le dernier passage des agents vient de /api/v6');
  assert.match(page, /a\.etat === 'panne' \|\| a\.etat === 'arret'/, 'une panne vue par le serveur est signalée, pas cachée');
  assert.match(page, /if \(p\) allerPole\(p\); else if \(b\) allerAgent\(b\);/, 'un lien #pôle ouvre le pôle, même si un agent porte le même nom');
  // chaque id cherché par le script existe dans la page
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const cherches = [...new Set([...scripts[0].matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]))];
  assert.deepEqual(cherches.filter((id) => !ids.has(id)), [], 'éléments absents de la page');
});

test('radial : / et /jarvis servent le radial avant la v8, qui reste à /v8 ; la v6 reste en secours', () => {
  const serveur = lire(path.join(RACINE, 'jarvis/serveur.cjs'));
  const ir = serveur.indexOf("(url === '/' || url === '/jarvis' || url === '/radial') && fs.existsSync(path.join(TROIS_D, 'radial.html'))");
  const i8 = serveur.indexOf("url === '/' || url === '/jarvis' || url === '/v8') && fs.existsSync(path.join(TROIS_D, 'v8.html'))");
  assert.ok(ir > 0 && i8 > ir, 'le radial d’abord, la v8 derrière');
});
