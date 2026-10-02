// Les clips de KinGKlip (02/10/2026) : une demande se valide et entre en file ; les clips prêts se lisent avec leur
// légende ; un lien publié se note par plateforme ; la vidéo se sert par morceaux (Range) pour le téléphone.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-clips-'));
Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime', CLIPS_DIR: dossier });
const require = createRequire(import.meta.url);
const clips = require('../../jarvis/clips.cjs');
const { lire } = require('../../jarvis/bases.cjs');

test('une demande : lien et nom obligatoires, nombre borné, nom de campagne propre', async () => {
  assert.equal((await clips.demander({ url: 'pas un lien', campagne: 'x' })).ok, false);
  assert.equal((await clips.demander({ url: 'https://drive.example/v', campagne: '' })).ok, false);
  const r = await clips.demander({ url: 'https://drive.example/v', campagne: 'Motivation Été #1', nombre: 999 });
  assert.equal(r.ok, true);
  const [d] = await lire('SELECT campagne, nombre, etat FROM clips_demandes WHERE id = $1', [r.id]);
  assert.deepEqual([d.campagne, d.nombre, d.etat], ['motivation-ete-1', 40, 'a_faire']);
});

test('les clips prêts se lisent avec leur légende ; un lien publié se note, puis se déclare à Whop', async () => {
  fs.mkdirSync(path.join(dossier, 'motivation-ete-1'), { recursive: true });
  fs.writeFileSync(path.join(dossier, 'motivation-ete-1', 'clips.json'), JSON.stringify({ source: 'https://drive.example/v', clips: [{ clip: 'clip-01.mp4', debut: 10, fin: 38.4, titre: 'Ose' }] }));
  fs.writeFileSync(path.join(dossier, 'motivation-ete-1', 'clip-01.txt'), 'Ose\n\n#motivation');
  fs.writeFileSync(path.join(dossier, 'motivation-ete-1', 'clip-01.mp4'), Buffer.alloc(1000, 1));
  let l = await clips.liste();
  const c = l.campagnes.find((x) => x.campagne === 'motivation-ete-1');
  assert.deepEqual([c.clips[0].duree, c.clips[0].legende, c.clips[0].fichier], [28, 'Ose\n\n#motivation', '/clips/f/motivation-ete-1/clip-01.mp4']);
  assert.equal((await clips.noterPublication({ campagne: 'motivation-ete-1', clip: 'clip-01.mp4', plateforme: 'myspace', lien: 'https://x' })).ok, false);
  assert.equal((await clips.noterPublication({ campagne: 'motivation-ete-1', clip: 'clip-01.mp4', plateforme: 'tiktok', lien: 'https://tiktok.com/@kingklip76/video/1' })).ok, true);
  await clips.declarerWhop({ campagne: 'motivation-ete-1', clip: 'clip-01.mp4', plateforme: 'tiktok' });
  l = await clips.liste();
  const p = l.campagnes.find((x) => x.campagne === 'motivation-ete-1').clips[0].publies[0];
  assert.deepEqual([p.plateforme, p.declare_whop], ['tiktok', true]);
});

test('la vidéo se sert par morceaux (Range) ; un chemin hors du dossier est refusé', async () => {
  const sortie = () => { const r = { statut: 0, entetes: {}, corps: [] }; return Object.assign(r, { writeHead: (s, h) => { r.statut = s; r.entetes = h || {}; }, end: () => {}, write: () => true, on: () => r, once: () => r, emit: () => {} }); };
  const envoyer = () => {}, json = async () => ({}), fichierInterface = () => {};
  const r = sortie();
  await clips.router({ headers: { range: 'bytes=0-99' } }, r, { url: '/clips/f/motivation-ete-1/clip-01.mp4', m: 'GET', envoyer, json, fichierInterface });
  assert.equal(r.statut, 206); assert.equal(r.entetes['Content-Range'], 'bytes 0-99/1000');
  const r2 = sortie();
  assert.equal(await clips.router({ headers: {} }, r2, { url: '/clips/f/../etc/clip-01.mp4', m: 'GET', envoyer, json, fichierInterface }), false);
});

test('Instagram : le lien public est signé, expire, et un clip inconnu ne part pas', async () => {
  const u = new URL(clips.lienPublic('camp-a', 'clip-01.mp4'));
  const [, , exp, sig, camp, clip] = u.pathname.split('/');
  assert.equal(clips.lienValide(exp, sig, camp, clip), true);
  assert.equal(clips.lienValide(exp, sig, camp, 'clip-02.mp4'), false);           // signature liée au clip
  assert.equal(clips.lienValide('1000000000', sig, camp, clip), false);           // expiré
  assert.equal((await clips.publierInstagram({ campagne: 'camp-a', clip: 'clip-99.mp4' })).ok, false);
});

test('Buffer : créneaux du soir à New York, jamais deux clips au même créneau', async () => {
  const t0 = Date.UTC(2026, 9, 2, 12, 0);
  const a = clips.prochainCreneau(new Set(), t0);
  assert.equal(a.toISOString(), '2026-10-02T22:30:00.000Z');
  const b = clips.prochainCreneau(new Set([a.getTime()]), t0);
  assert.equal(b.toISOString(), '2026-10-02T23:30:00.000Z');
  assert.equal((await clips.programmerBuffer({ campagne: 'camp-a', clip: 'clip-99.mp4' })).ok, false);
});

test('la page Clips : son script se lit sans erreur de syntaxe (sinon le formulaire part sans JavaScript)', () => {
  const html = fs.readFileSync(new URL('../../jarvis/interface/clips.html', import.meta.url), 'utf8');
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
});
