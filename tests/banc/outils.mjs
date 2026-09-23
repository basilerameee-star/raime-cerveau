// OUTILS DU BANC D'ESSAI — à importer EN PREMIER dans chaque test.
//
// Trois garanties, posées avant que le moindre agent soit chargé :
//   ① le modèle est factice (MODELE_FACTICE=1) et aucune clé n'est lue ;
//   ② le réseau est coupé : tout fetch() non prévu par le test échoue ;
//   ③ la bibliothèque écrit dans un dossier temporaire, jamais dans /app.
//
// Les bases sont celles de preparer_bases.sh (noms en _test). Le mot de passe vient
// de PGPASSWORD, jamais du code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

process.env.MODELE_FACTICE = '1';
delete process.env.OPENROUTER_API_KEY;

const hote = process.env.PGHOST || 'localhost';
const port = process.env.PGPORT || '5432';
const qui = process.env.PGUSER || 'raime';
const url = (base) => `postgres://${qui}@${hote}:${port}/${base}`;
process.env.DATABASE_URL = url(process.env.BANC_BASE_BRAIN || 'raime_brain_test');
process.env.DATABASE_URL_N8N = url(process.env.BANC_BASE_N8N || 'n8n_test');

export const BIBLIO = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-biblio-'));
process.env.BIBLIO_ENTREE = BIBLIO;

// ── Le réseau coupé ─────────────────────────────────────────────────────────
// Un test peut déclarer des réponses pour des adresses précises ; tout le reste échoue.
const reponsesPrevues = [];
export const requetes = [];
globalThis.fetch = async (adresse) => {
  const u = String(adresse);
  requetes.push(u);
  const prevue = reponsesPrevues.find((r) => r.motif.test(u));
  if (!prevue) throw new Error(`réseau coupé au banc d'essai : ${u}`);
  const corps = prevue.corps;
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => corps,
    text: async () => (typeof corps === 'string' ? corps : JSON.stringify(corps)),
  };
};
export function prevoir(motif, corps) { reponsesPrevues.push({ motif, corps }); }

// ── Les bases ───────────────────────────────────────────────────────────────
export async function bases() {
  const brain = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N });
  await brain.connect(); await n8n.connect();
  return { brain, n8n, fermer: async () => { await brain.end(); await n8n.end(); } };
}

// Copie la bibliothèque fictive des fixtures dans le dossier temporaire.
export function copierBibliotheque() {
  fs.cpSync(new URL('../fixtures/notes_fictives', import.meta.url), BIBLIO, { recursive: true });
  return BIBLIO;
}

export const compter = async (client, sql, params = []) =>
  Number((await client.query(sql, params)).rows[0].n);
