// La 3D de Codex devenue tableau de bord (07/10/2026, note 20) : la page n'appelle que des routes qui existent, chaque
// $('id') de son script existe dans la page, ses modules sont lisibles, Three.js est celui de ses empreintes ; les
// fichiers sous /3d/ sont servis par liste blanche (jamais hors du dossier), compressés, et 304 quand rien n'a changé ;
// /api/reseau ne montre que des données réelles et dit quand une source tombe.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const D3 = path.join(RACINE, 'jarvis/interface/3d');
const lire = (f) => fs.readFileSync(f, 'utf8');
const page = lire(path.join(D3, 'index.html'));
const locaux = [...page.matchAll(/<script[^>]*\bsrc="\/3d\/([^"]+)"/g)].map((m) => m[1]).filter((f) => !f.startsWith('vendor/'));

test('3D : chaque $(\'id\') du script de Jarvis existe dans la page ; les modules locaux sont lisibles', () => {
  assert.ok(locaux.includes('jarvis.js') && locaux.includes('ontologie-app.js'));
  const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const js = lire(path.join(D3, 'jarvis.js'));
  assert.doesNotThrow(() => new Function(js));
  const proteges = new Set([...js.matchAll(/if \(\$\('([\w-]+)'\)\)/g)].map((m) => m[1]));
  const manquants = [...new Set([...js.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]))].filter((id) => !ids.has(id) && !proteges.has(id));
  assert.deepEqual(manquants, [], 'éléments absents de la page 3D');
  for (const f of fs.readdirSync(D3).filter((x) => /^ontologie.*\.js$|^carte-modele\.js$/.test(x))) {
    const r = spawnSync(process.execPath, ['--check', path.join(D3, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f} : ${r.stderr}`);
  }
});

test('3D : la page n’appelle que des routes qui existent dans Jarvis', () => {
  const code = ['jarvis.js', 'ontologie-app.js'].map((f) => lire(path.join(D3, f))).join('\n') + page;
  const appels = [...new Set([...code.matchAll(/['"`](\/api\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?)/g)].map((m) => m[1]))];
  const serveur = fs.readdirSync(path.join(RACINE, 'jarvis')).filter((f) => f.endsWith('.cjs')).map((f) => lire(path.join(RACINE, 'jarvis', f))).join('\n');
  const absentes = appels.filter((r) => !serveur.includes(r) && !serveur.includes(r.replace(/\//g, '\\/')));
  assert.deepEqual(absentes, [], 'routes appelées par la 3D mais absentes de Jarvis');
});

test('3D : Three.js est celui de ses empreintes (manifest.json, studio-manifest.json)', () => {
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const m = JSON.parse(lire(path.join(D3, 'vendor/manifest.json')));
  for (const [f, h] of Object.entries(m.files)) assert.equal(sha(path.join(D3, 'vendor', f)), h, f);
  const s = JSON.parse(lire(path.join(D3, 'vendor/studio-manifest.json')));
  for (const f of s.files) assert.equal(sha(path.join(D3, f.path)), f.sha256, f.path);
});

test('3D : /3d/ ne sert que la liste blanche, compressé, 304 quand rien n’a changé ; jamais hors du dossier', async () => {
  const { fichier3d } = createRequire(import.meta.url)('../../jarvis/serveur.cjs');
  const appel = (url, entetes = {}) => new Promise((ok) => {
    const res = new PassThrough(); const morceaux = [];
    res.writeHead = (code, h) => { res.code = code; res.h = h || {}; };
    res.on('data', (c) => morceaux.push(c)); res.on('finish', () => ok({ code: res.code, h: res.h, corps: Buffer.concat(morceaux) }));
    fichier3d({ headers: entetes }, res, url);
  });
  for (const u of ['/3d/../serveur.cjs', '/3d/..%2f..%2fserveur.cjs', '/3d/vendor/../../../bases.cjs', '/3d//etc/passwd', '/3d/index.exe'])
    assert.ok([403, 404].includes((await appel(u)).code), u);
  const a = await appel('/3d/vendor/three.module.js', { 'accept-encoding': 'gzip' });
  assert.equal(a.code, 200);
  assert.equal(a.h['Content-Encoding'], 'gzip');
  assert.match(a.h['Content-Type'], /javascript/);
  assert.equal((await appel('/3d/vendor/three.module.js', { 'if-none-match': a.h.ETag })).code, 304);
  assert.equal((await appel('/3d/polices/InterVariable.woff2')).code, 200, 'la police partagée avec les maquettes');
});

test('/api/reseau : données réelles seulement ; une source qui tombe se dit dans erreurs[]', async () => {
  const { reseau } = createRequire(import.meta.url)('../../jarvis/reseau.cjs');
  const catalogue = () => ({ noeuds: [{ id: 'a', nom: 'Radar', modules: ['radar'], statut: 'COMPLETED' },
    { id: 'h', nom: 'Hermes', modules: ['hermes'] }, { id: 'p', nom: 'Futur', modules: [], statut: 'PLANNED' }] });
  const ok = await reseau({ catalogue, requete: async () => [{ agent: 'radar', statut: 'ok', fin_le: '2026-10-07T10:00:00Z' },
    { agent: 'vitrines', statut: 'echec', fin_le: '2026-10-07T09:00:00Z' }], sante: async () => ({ etat: 'libre' }) });
  assert.deepEqual(ok.erreurs, []);
  const radar = ok.noeuds.find((n) => n.id === 'a');
  assert.equal(radar.statut, 'UNKNOWN', 'le statut d’aperçu du catalogue n’est jamais repris');
  assert.deepEqual(radar.traces.map((t) => t.statut), ['COMPLETED']);
  assert.equal(ok.noeuds.find((n) => n.id === 'h').statut, 'IDLE');
  assert.equal(ok.noeuds.find((n) => n.id === 'p').statut, 'PLANNED');
  assert.deepEqual(ok.hors_catalogue, ['vitrines']);
  const ko = await reseau({ catalogue, requete: async () => { throw new Error('base'); }, sante: async () => { throw new Error('x'); } });
  assert.deepEqual(ko.erreurs.sort(), ['HERMES_INJOIGNABLE', 'TRACES_INDISPONIBLES']);
  assert.equal(ko.noeuds.find((n) => n.id === 'h').statut, 'OFFLINE');
});
