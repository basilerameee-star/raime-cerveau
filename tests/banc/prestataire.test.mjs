// Le prestataire (01/10/2026) : ce que Basile adresse à Claude devient un ticket « chantier » pour la routine Ingénierie ;
// le reste ne part pas ; cinq par jour au plus ; un secret ne part jamais ; le compte rendu livré clôt l'ordre.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

Object.assign(process.env, { PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime',
  ORDRES_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'banc-ordres-')),
  COFFRE_FICHIER: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banc-coffre-')), 'coffre.env') });
const require = createRequire(import.meta.url);
const p = require('../../jarvis/prestataire.cjs');
const { lire } = require('../../jarvis/bases.cjs');

after(async () => { await lire("DELETE FROM commandes WHERE pour IN ('routine', 'claude') AND texte LIKE '%[banc prestataire]%'"); });

test('ce qui s’adresse à Claude se reconnaît ; le reste, non', () => {
  for (const m of ['Demande à Claude de refaire la page des vitrines', 'Claude, construis un site pour la boulangerie', 'Fais faire ça par Claude', 'il faut que Claude doit corriger ça'])
    assert.ok(p.POUR_CLAUDE.test(m), m);
  for (const m of ['Fais un site pour la boulangerie', 'Quelle heure est-il ?', 'Envoie le rapport à Basile'])
    assert.ok(!p.POUR_CLAUDE.test(m), m);
  assert.equal(p.CONFIER_ORDRE.exec('confie l’ordre 12 à Claude')[1], '12');
  assert.equal(p.CONFIER_ORDRE.exec("passe la demande 7 à Claude")[1], '7');
  assert.equal(p.CONFIER_ORDRE.exec('confie l’ordre 12 à Hermes'), null);
});

test('un ordre pour Claude devient un ticket chantier, avec le fichier de compte rendu à livrer ; plafond et secret respectés', async () => {
  await require('../../jarvis/bases.cjs').preparer();
  await p.preparer();
  await lire("UPDATE commandes SET etat = 'faite' WHERE etat = 'a_faire' AND pour = 'routine'");
  await lire("UPDATE commandes SET confie_le = now() - interval '2 days' WHERE confie_le > now() - interval '24 hours'");
  const tickets = [];
  const fetch = async (url, o) => { tickets.push({ url, corps: JSON.parse(o.body), auth: o.headers.Authorization });
    return { ok: true, status: 201, json: async () => ({ number: 40 + tickets.length, html_url: `https://github.com/x/y/issues/${40 + tickets.length}` }) }; };
  const coffre = { GITHUB_CHANTIER_TOKEN: 'jeton-de-test' };

  assert.deepEqual(await p.confier({ fetch, coffre: {} }), { parti: false, raison: 'rien' });
  const [{ id }] = await lire("INSERT INTO commandes (texte, pour) VALUES ('Refaire la maquette [banc prestataire]', 'routine') RETURNING id");
  assert.equal((await p.confier({ fetch, coffre: {} })).raison, 'jeton', 'sans jeton, rien ne part');
  const c = await p.confier({ fetch, coffre });
  assert.equal(c.parti, true);
  assert.match(tickets[0].url, /\/repos\/basilerameee-star\/raime-cerveau\/issues$/);
  assert.deepEqual(tickets[0].corps.labels, ['chantier']);
  assert.match(tickets[0].corps.title, new RegExp(`^Ordre n°${id} : Refaire la maquette`));
  assert.match(tickets[0].corps.body, new RegExp(`jarvis/ordres/${id}\\.md`));
  let [o] = await lire('SELECT etat, ticket, reponse FROM commandes WHERE id = $1', [id]);
  assert.deepEqual([o.etat, o.ticket], ['en_cours', 41]); assert.match(o.reponse, /7 h 07 et 19 h 07/);

  const [{ id: s }] = await lire("INSERT INTO commandes (texte, pour) VALUES ('ma clé sk-abcdefghijklmnopqrstuv [banc prestataire]', 'routine') RETURNING id");
  assert.equal((await p.confier({ fetch, coffre })).raison, 'secret');
  assert.equal(tickets.length, 1, 'un secret ne part jamais sur GitHub');
  assert.equal((await lire('SELECT pour FROM commandes WHERE id = $1', [s]))[0].pour, 'claude');

  for (let i = 0; i < p.MAX_JOUR; i++) await lire("INSERT INTO commandes (texte, pour) VALUES ($1, 'routine')", [`ordre ${i} [banc prestataire]`]);
  for (let i = 0; i < p.MAX_JOUR; i++) await p.confier({ fetch, coffre });
  assert.equal((await p.confier({ fetch, coffre })).raison, 'plafond', `${p.MAX_JOUR} par jour au plus`);

  fs.writeFileSync(path.join(process.env.ORDRES_DIR, `${id}.md`), 'La maquette est refaite. Elle est en ligne.');
  await p.suivre();
  [o] = await lire('SELECT etat, reponse FROM commandes WHERE id = $1', [id]);
  assert.deepEqual([o.etat, o.reponse], ['faite', 'La maquette est refaite. Elle est en ligne.']);
});
