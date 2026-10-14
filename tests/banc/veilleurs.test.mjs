// Les deux veilleurs (08/10/2026). Le 03/10, l'ordre n°40 (campagne Michael Sartain) est resté « à faire » des jours sans
// que rien ne le dise, et 16 clips TikTok ont disparu sans alerte. Ce banc tient, sur les vraies bases de test :
//   ① le Veilleur des ordres : plus de 24 h à faire ou en cours → rouge dans /api/rapport, dans /api/etat et au journal
//     (une fois par ordre) ; une table illisible se dit « lecture en échec », jamais « aucun ordre en retard » ;
//   ② l'e-mail de 7 h 30 (n8n/heraut_format_email.js, le code posé dans n8n) : la partie rouge s'écrit en rouge ;
//   ③ la Sentinelle (n8n/sentinelle_clips.sql) : un clip disparu part une fois, à son passage suivant.
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { bases } from './outils.mjs';

const require = createRequire(import.meta.url);
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-veilleurs-'));
Object.assign(process.env, {
  PGDATABASE: process.env.BANC_BASE_N8N || 'n8n_test', PGDATABASE_CERVEAU: process.env.BANC_BASE_BRAIN || 'raime_brain_test',
  PGHOST: process.env.PGHOST || 'localhost', PGUSER: process.env.PGUSER || 'raime',
  COFFRE_FICHIER: path.join(T, 'coffre.env'), LIVRABLES_DIR: path.join(T, 'travail'), RECHERCHE_URL: 'http://127.0.0.1:1',
  MODELE_LOCAL_URL: 'http://127.0.0.1:1', EXECUTANT_URL: 'http://127.0.0.1:1', OPENROUTER_API_KEY: 'ne-doit-jamais-servir',
});
const b = require('../../jarvis/bases.cjs');
const o = require('../../jarvis/ordres_retard.cjs');
const { rapport, etat } = require('../../jarvis/serveur.cjs');
const DEPOT = new URL('../../', import.meta.url);
after(async () => { await b.cerveau.end(); await b.n8n.end(); });

// Quatre ordres : deux en retard (11 jours, 30 h), un récent (2 h), un vieux mais fait.
async function semer() {
  await b.preparer();
  await b.cerveau.query(`DELETE FROM commandes WHERE texte LIKE 'banc veilleur%'`);
  await b.cerveau.query(`DELETE FROM journal WHERE acteur = 'veilleur_ordres'`);
  const { rows } = await b.cerveau.query(`INSERT INTO commandes (texte, pour, etat, cree_le) VALUES
    ('banc veilleur : la campagne Michael Sartain', 'claude', 'a_faire', now() - interval '11 days'),
    ('banc veilleur : un ordre confié à Hermes', 'harness', 'en_cours', now() - interval '30 hours'),
    ('banc veilleur : un ordre de ce matin', 'claude', 'a_faire', now() - interval '2 hours'),
    ('banc veilleur : un vieil ordre fait', 'claude', 'faite', now() - interval '20 days') RETURNING id`);
  return rows.map((r) => Number(r.id));
}
const miens = (liste) => liste.filter((l) => /banc veilleur/.test(l.texte || l.ligne || l));

test('veilleur des ordres : plus de 24 h à faire ou en cours, et rien d’autre ; la ligne dit depuis quand et qui attend', async () => {
  const [sartain, hermes] = await semer();
  const liste = miens(await o.enRetard((s, p) => b.cerveau.query(s, p).then((r) => r.rows)));
  assert.deepEqual(liste.map((x) => Number(x.id)), [sartain, hermes]);
  assert.match(o.ligne(liste[0]), new RegExp(`^n°${sartain} — banc veilleur : la campagne Michael Sartain · à faire depuis 11 jours \\(donné le \\d\\d/\\d\\d\\) · attend Claude$`));
  assert.match(o.ligne(liste[1]), / · en cours depuis 30 h \(donné le \d\d\/\d\d\) · confié à Hermes$/);
  assert.equal(o.section([]), null, 'rien en retard : pas de partie rouge');
});

test('l’e-mail de 7 h 30 (/api/rapport) : la partie rouge, juste après les relances ; le cockpit (/api/etat) : le nombre et les lignes', async () => {
  const [sartain] = await semer();
  const r = await rapport();
  assert.match(r.sections[0].titre, /Tes relances du jour/, 'l’argent reste en tête (choix de Basile)');
  const rouge = r.sections[1];
  assert.equal(rouge.rouge, true);
  assert.match(rouge.titre, /^Ordres en retard : \d+ \(à faire ou en cours depuis plus de 24 h\)$/);
  assert.ok(rouge.lignes.some((l) => l.startsWith(`n°${sartain} — banc veilleur : la campagne Michael Sartain`)));
  assert.ok(!rouge.lignes.some((l) => /un ordre de ce matin|un vieil ordre fait/.test(l)));
  const e = await etat();
  assert.equal(e.ordres_en_retard.total, e.ordres_en_retard.liste.length);
  assert.ok(e.ordres_en_retard.liste.some((x) => x.id === sartain && x.etat === 'a_faire' && x.heures >= 264));
});

test('table des ordres illisible : « lecture en échec » dans l’e-mail et le cockpit, jamais « aucun ordre en retard »', async () => {
  await semer();
  await b.cerveau.query('ALTER TABLE commandes RENAME TO commandes_cachee_banc');
  try {
    const rouge = (await rapport()).sections.find((s) => s.rouge);
    assert.ok(rouge, 'la partie rouge reste');
    assert.match(rouge.titre, /lecture en échec/);
    const e = await etat();
    assert.equal(e.ordres_en_retard.total, null);
    assert.match(e.ordres_en_retard.erreur, /^lecture en échec/);
  } finally { await b.cerveau.query('ALTER TABLE commandes_cachee_banc RENAME TO commandes'); }
});

test('agent de boucle : chaque ordre en retard est écrit UNE fois au journal ; il est dans les rythmes', async () => {
  const [sartain, hermes] = await semer();
  const { veiller } = await import('../../agents/veilleur_ordres.js');
  const { brain, fermer } = await bases();
  try {
    await veiller({ brain });
    await veiller({ brain });
    const { rows } = await brain.query(`SELECT changement FROM journal WHERE acteur = 'veilleur_ordres' AND changement LIKE ANY($1) ORDER BY changement`,
      [[`Ordre n°${sartain} %`, `Ordre n°${hermes} %`]]);
    assert.deepEqual(rows.map((x) => x.changement).sort(), [`Ordre n°${sartain} en retard : à faire depuis plus de 24 h`, `Ordre n°${hermes} en retard : en cours depuis plus de 24 h`].sort());
  } finally { await fermer(); }
  const { RYTHMES } = await import('../../agents/rythmes.js');
  assert.ok(RYTHMES.some((r) => r.nom === 'veilleur_ordres' && r.module === './veilleur_ordres.js' && r.fn === 'veiller'));
});

// Le code du nœud n8n, exécuté comme n8n le fait : corps d'une fonction asynchrone, this.helpers et $ fournis.
async function formatEmail(reponseCockpit) {
  const code = fs.readFileSync(new URL('n8n/heraut_format_email.js', DEPOT), 'utf8');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const $ = () => ({ first: () => ({ json: { digest: { date: '2026-10-09', gardien: [{ x: '[dur] Clips disparus' }] } } }) });
  const helpers = { httpRequest: async () => { if (reponseCockpit instanceof Error) throw reponseCockpit; return reponseCockpit; } };
  const [{ json }] = await new AsyncFunction('$', code).call({ helpers }, $);
  return json.email_body.html;
}

test('l’e-mail : la partie rouge en rouge, les autres comme avant ; le Cockpit muet le dit aussi en rouge', async () => {
  const html = await formatEmail({ sections: [{ titre: 'Tes relances du jour', lignes: ['Rien.'] },
    { titre: 'Ordres en retard : 1', rouge: true, lignes: ['n°40 — la campagne <Sartain> · à faire depuis 11 jours'] }] });
  assert.match(html, /<h3 style="color:#b91c1c[^"]*">Ordres en retard : 1<\/h3><ul style="[^"]*color:#b91c1c"><li[^>]*>n°40 — la campagne &lt;Sartain&gt; · à faire depuis 11 jours<\/li>/);
  assert.match(html, /<h3 style="color:#0a5a3e[^"]*">Tes relances du jour<\/h3><ul style="margin:2px 0;padding-left:18px;font-size:13px">/);
  assert.match(html, /\[dur\] Clips disparus/);
  const muet = await formatEmail(new Error('cockpit injoignable'));
  assert.match(muet, /Le Cockpit n’a pas répondu ce matin/);
  assert.match(muet, /color:#b91c1c[^>]*>Tes ordres en retard n’ont pas pu être lus non plus/);
});

test('Sentinelle : un clip disparu part une fois, à son passage suivant ; un passage en échec le laisse au suivant', async () => {
  const clause = fs.readFileSync(new URL('n8n/sentinelle_clips.sql', DEPOT), 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('--')).map((l) => l.trim()).join(' ');
  const { n8n, fermer } = await bases();
  try {
    await n8n.query(`CREATE TEMP TABLE gardien_log (id serial PRIMARY KEY, severity text, rule text, detail text, created_at timestamptz DEFAULT now())`);
    await n8n.query(`CREATE TEMP TABLE execution_entity ("workflowId" text, status text, "startedAt" timestamptz)`);
    const diagnostic = async () => (await n8n.query(`SELECT probleme FROM ( SELECT 'rien' AS probleme WHERE false ${clause} ) x`)).rows.map((r) => r.probleme);
    await n8n.query(`INSERT INTO gardien_log (severity, rule, detail, created_at) VALUES
      ('dur', 'Clips disparus', 'ancien, déjà envoyé', now() - interval '8 hours'), ('dur', 'Clips disparus', '16 clips ne sont plus en ligne : TikTok…', now() - interval '1 hour'),
      ('dur', 'Autre règle', 'pas pour ce passage', now() - interval '1 hour')`);
    assert.deepEqual(await diagnostic(), ['Clips disparus : 16 clips ne sont plus en ligne : TikTok…'], 'sans passage connu : les 6 dernières heures');
    await n8n.query(`INSERT INTO execution_entity VALUES ('sentinelleMon01', 'success', now() - interval '30 minutes'), ('sentinelleMon01', 'error', now() - interval '5 minutes')`);
    assert.deepEqual(await diagnostic(), [], 'déjà envoyé au passage réussi d’il y a 30 min');
    await n8n.query(`UPDATE execution_entity SET "startedAt" = now() - interval '2 hours' WHERE status = 'success'`);
    assert.equal((await diagnostic()).length, 1, 'le passage en échec (Resend en panne) ne compte pas : le suivant envoie');
  } finally { await fermer(); }
});
