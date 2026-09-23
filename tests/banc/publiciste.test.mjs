// Le publiciste : neuf brouillons par semaine, relus par le code, jamais publiés.
import { bases, compter, requetes } from './outils.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SORTIE = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-publicite-'));
process.env.PUBLICITE_SORTIE = SORTIE;
const { preparerSemaine, relirePublication, lundiSuivant, PLAN, visuelSvg } = await import('../../agents/publiciste.js');

const JEUDI = new Date('2026-09-24T09:00:00Z');
let b, r;
before(async () => {
  b = await bases();
  await b.brain.query('DROP VIEW IF EXISTS publications_mesure; DROP TABLE IF EXISTS publications; TRUNCATE journal, agent_runs');
  r = await preparerSemaine({ brain: b.brain, maintenant: JEUDI });
});
after(async () => b.fermer());

test('la semaine préparée est celle du lundi suivant', () => {
  assert.equal(lundiSuivant(JEUDI).toISOString().slice(0, 10), '2026-09-28');
  assert.equal(lundiSuivant(new Date('2026-09-28T08:00:00Z')).toISOString().slice(0, 10), '2026-10-05');
  assert.equal(r.semaine, '2026-09-28');
});

test('neuf brouillons, sur les quatre réseaux, aux jours prévus', async () => {
  assert.equal(r.prepares, PLAN.length);
  assert.deepEqual(r.fautes, []);
  const { rows } = await b.brain.query(`SELECT reseau, jour::text, statut FROM publications ORDER BY jour, id`);
  assert.equal(rows.length, 9);
  assert.deepEqual([...new Set(rows.map((x) => x.reseau))].sort(), ['facebook', 'instagram', 'linkedin', 'tiktok']);
  assert.ok(rows.every((x) => x.statut === 'brouillon'));
  assert.equal(rows[0].jour, '2026-09-28');
});

test('un visuel en image fixe par publication, au format de son réseau, sans visage ni photo', () => {
  const svg = fs.readdirSync(path.join(SORTIE, '2026-09-28')).filter((f) => f.endsWith('.svg'));
  assert.equal(svg.length, 9);
  const tiktok = fs.readFileSync(path.join(SORTIE, '2026-09-28', svg.find((f) => f.includes('tiktok'))), 'utf8');
  assert.match(tiktok, /width="1080" height="1920"/);
  for (const f of svg) {
    const t = fs.readFileSync(path.join(SORTIE, '2026-09-28', f), 'utf8');
    assert.doesNotMatch(t, /<image|<video|<foreignObject|href=/, `${f} : seulement du texte et des formes`);
  }
  assert.match(fs.readFileSync(path.join(SORTIE, '2026-09-28/CALENDRIER.md'), 'utf8'), /Rien n’est publié/);
});

test('rien n’est publié : aucune requête vers un réseau social', () => {
  assert.equal(requetes.length, 0);
});

test('une semaine préparée ne se prépare pas deux fois', async () => {
  const r2 = await preparerSemaine({ brain: b.brain, maintenant: JEUDI });
  assert.equal(r2.prepares, 0);
  assert.equal(await compter(b.brain, 'SELECT count(*) n FROM publications'), 9);
});

test('la mesure est prête : une publication saisie donne son taux d’engagement', async () => {
  await b.brain.query(`UPDATE publications SET statut = 'publie', impressions = 1000, reactions = 30, commentaires = 5,
    partages = 5, clics = 12, mesure_le = now() WHERE reseau = 'linkedin' AND jour = '2026-09-28'`);
  const { rows: [m] } = await b.brain.query(`SELECT publiees::int, engagement_pct::float, clics_pct::float
    FROM publications_mesure WHERE reseau = 'linkedin' AND offre = 'pro/formation/dirigeant'`);
  assert.deepEqual(m, { publiees: 1, engagement_pct: 4, clics_pct: 1.2 });
});

// ── La relecture par le code ────────────────────────────────────────────────
const BON = { reseau: 'tiktok', offre: 'pro/audit', texte: 'Où l’IA vous fait-elle gagner du temps ? Un audit poste par poste répond, avant d’investir un euro. #IA #Audit #Entreprise',
  visuel: { titre: 'Poste par poste', ligne: 'Le temps gagné' } };
const avec = (champs) => ({ ...BON, ...champs });

test('une publication conforme passe', () => assert.deepEqual(relirePublication(BON), []));

const FAUTES = [
  ['un lien sur TikTok', avec({ texte: BON.texte + ' raime.fr' }), /lien interdit/],
  ['un prix de service', avec({ texte: BON.texte.replace('répond', 'répond pour 900 €') }), /chiffres absents|prix hors du livre/],
  ['un chiffre inventé', avec({ texte: BON.texte.replace('Un audit', '87 % des entreprises le font. Un audit') }), /chiffres absents des offres : 87/],
  ['le CPF', avec({ texte: BON.texte.replace('Un audit', 'Finançable par le CPF. Un audit') }), /CPF/],
  ['le nom de Basile', avec({ texte: BON.texte.replace('Un audit', 'Basile vous répond. Un audit') }), /Basile/],
  ['une négation', avec({ texte: BON.texte.replace('répond', 'ne vous coûte rien et répond') }), /négative/],
  ['trop de mots-dièse', avec({ texte: BON.texte + ' #a #b #c' }), /mots-dièse/],
  ['une offre inconnue', avec({ offre: 'pro/coaching' }), /offre inconnue/],
  ['un visuel trop long', avec({ visuel: { titre: 'x'.repeat(61) } }), /visuel/],
];
for (const [nom, p, attendu] of FAUTES) {
  test(`refusé : ${nom}`, () => assert.match(relirePublication(p).join(' | '), attendu));
}

test('le visuel coupe un titre long sur plusieurs lignes', () => {
  const s = visuelSvg({ titre: 'Un titre assez long pour tenir sur deux lignes', ligne: 'x' }, [1080, 1350]);
  assert.ok((s.match(/font-size="92"/g) || []).length >= 2);
});
