// LE FURETEUR ET TAVILY (15/10/2026) : la recherche web passe par l'API de Tavily quand la clé gratuite de Basile est rangée
// (1 000 crédits par mois, sans carte). Au plus 30 recherches par jour, témoin compris, comptées dans le cerveau ; refus de la
// clé ou quota de Tavily épuisé : fermé 24 heures, rien n'est affirmé (« inconnu », revu le lendemain).
import './outils.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bases, prevoir, requetes } from './outils.mjs';

const f = await import('../../agents/fureteur.js');
const FICHES = ['932000001', '932000002'];
const db = await bases().catch(() => null);
const debut = new Date();
after(async () => {
  delete process.env.TAVILY_API_KEY;
  if (!db) return;
  await db.n8n.query('DELETE FROM prospects WHERE siren = ANY($1::text[])', [FICHES]).catch(() => {});
  await db.brain.query("DELETE FROM recherches_web WHERE moteur = 'tavily'").catch(() => {});
  await db.brain.query("DELETE FROM journal WHERE acteur = 'fureteur' AND created_at >= $1", [debut]).catch(() => {});
  await db.fermer();
});

test('chercherTavily : la requête (clé en en-tête, 8 résultats), les résultats triés comme ceux d’un moteur ; sans clé, rien n’est demandé', async () => {
  const appels = [];
  const fetch = async (url, o) => { appels.push({ url, o }); return { ok: true, status: 200, json: async () => ({ results: [
    { url: 'https://www.linkedin.com/company/cabinet-alpha' }, { url: 'https://cabinet-alpha.fr/contact' },
    { url: 'https://www.notaires.fr/fr/office/alpha' }, { url: 'https://www.pappers.fr/entreprise/alpha' }, { url: 'https://cabinet-alpha.fr/equipe' }] }) }; };
  const r = await f.chercherTavily('Cabinet Alpha annecy', { cle: 'cle-test', fetch });
  assert.deepEqual(r, { ferme: false, sites: ['https://cabinet-alpha.fr'], portails: ['https://www.notaires.fr/fr/office/alpha'], vide: false });
  assert.equal(appels[0].url, 'https://api.tavily.com/search');
  assert.equal(appels[0].o.method, 'POST');
  assert.equal(appels[0].o.headers.Authorization, 'Bearer cle-test');
  assert.deepEqual(JSON.parse(appels[0].o.body), { query: 'Cabinet Alpha annecy', search_depth: 'basic', max_results: 8 });
  assert.equal((await f.chercherTavily('x', { cle: '', fetch })).ferme, true);
  assert.equal(appels.length, 1, 'sans clé : aucune requête');
  const vide = await f.chercherTavily('x', { cle: 'cle-test', fetch: async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }) });
  assert.deepEqual(vide, { ferme: false, sites: [], portails: [], vide: true }, 'aucun résultat : vide (le témoin départagera)');
  const panne = await f.chercherTavily('x', { cle: 'cle-test', fetch: async () => { throw new Error('réseau'); } });
  assert.equal(panne.ferme, true, 'panne de réseau : rien n’est affirmé');
});

test('passer avec la clé : le quota du jour est tenu (témoin compris) et compté dans le cerveau ; au-delà, « inconnu », revu demain', async (t) => {
  if (!db) { t.skip('bases du banc absentes'); return; }
  const { n8n, brain } = db;
  process.env.TAVILY_API_KEY = 'cle-test';
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS furete_le timestamptz, ADD COLUMN IF NOT EXISTS furete_note text');
  for (const [i, nom] of ['CABINET OMEGA BANC', 'CABINET SIGMA BANC'].entries()) {
    await n8n.query(`INSERT INTO prospects (siren, name, naf, sector, city, departement, status, effectif_est)
      VALUES ($1, $2, '69.20Z', 'Cabinets comptables', 'ANNECY', '74', 'nouveau', $3)`, [FICHES[i], nom, 9000 - i]);
  }
  await brain.query('CREATE TABLE IF NOT EXISTS recherches_web (le timestamptz NOT NULL DEFAULT now(), moteur text NOT NULL, nombre int NOT NULL)');
  await brain.query("INSERT INTO recherches_web (moteur, nombre) VALUES ('tavily', $1)", [f.TAVILY_PAR_JOUR - 1]);
  prevoir(/^https:\/\/api\.tavily\.com\/search$/, { results: [{ url: 'https://omega-ailleurs.fr' }] });
  const avant = requetes.filter((u) => u.includes('api.tavily.com')).length;
  const b = await f.passer({ n8n, brain, combien: 2, outils: { lire: async () => null, existe: async () => false, attente: 0 } });
  assert.equal(requetes.filter((u) => u.includes('api.tavily.com')).length - avant, 1, 'une seule recherche restait aujourd’hui');
  assert.equal(b.recherches_tavily, 1);
  assert.match(b.moteur, /^Tavily, quota du jour atteint \(30\)$/);
  const { rows: [s] } = await brain.query("SELECT sum(nombre)::int AS n FROM recherches_web WHERE moteur = 'tavily'");
  assert.equal(s.n, f.TAVILY_PAR_JOUR, 'la recherche faite est comptée');
  const { rows } = await n8n.query('SELECT siren, site_statut FROM prospects WHERE siren = ANY($1::text[]) ORDER BY siren', [FICHES]);
  assert.deepEqual(rows.map((r) => r.site_statut), ['absent', 'inconnu'], 'la première cherchée sans site à elle ; la seconde attend demain');
  const j = await brain.query("SELECT motif FROM journal WHERE acteur = 'fureteur' AND created_at >= $1 ORDER BY created_at DESC LIMIT 1", [debut]);
  assert.match(j.rows[0].motif, /Moteur : Tavily, quota du jour atteint/);
});

test('chercherTavily : clé refusée ou quota de Tavily épuisé (432) → fermé 24 heures, plus aucune requête', async () => {
  let n = 0;
  const refus = async () => { n++; return { ok: false, status: 432, json: async () => ({}) }; };
  assert.equal((await f.chercherTavily('x', { cle: 'cle-test', fetch: refus })).ferme, true);
  const marche = async () => { n++; return { ok: true, status: 200, json: async () => ({ results: [{ url: 'https://a.fr' }] }) }; };
  assert.equal((await f.chercherTavily('x', { cle: 'cle-test', fetch: marche })).ferme, true, 'fermé pour 24 heures');
  assert.equal(n, 1, 'on ne frappe plus à une porte qui a dit non');
});
