// Les deux bases du serveur (raime_brain : le cerveau ; n8n : la prospection et la conversation) et le
// coffre de Basile. Une lecture qui échoue rend une liste vide, jamais une erreur : l'écran reste debout.
'use strict';

const fs = require('fs');
const { Pool } = require('pg');

const reglages = (database, max) => ({
  host: process.env.PGHOST || 'postgres', user: process.env.PGUSER || 'n8n', password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT || '5432', 10), database, max,
});
const cerveau = new Pool(reglages(process.env.PGDATABASE_CERVEAU || 'raime_brain', 3));
const n8n = new Pool(reglages(process.env.PGDATABASE || 'n8n', 3));
cerveau.on('error', () => {}); n8n.on('error', () => {});

const sur = (pool) => async (sql, params) => { try { return (await pool.query(sql, params || [])).rows; } catch (e) { return []; } };
const lire = sur(cerveau);
const lireN8n = sur(n8n);

// Les tables propres au Cockpit, créées si elles manquent : les ordres (migrations/021) et les
// encaissements, pour suivre l'objectif de 2 000 € par mois.
async function preparer() {
  await lire(`CREATE TABLE IF NOT EXISTS commandes (id serial PRIMARY KEY, cree_le timestamptz NOT NULL DEFAULT now(), texte text NOT NULL,
    source text NOT NULL DEFAULT 'jarvis', pour text NOT NULL DEFAULT 'claude',
    etat text NOT NULL DEFAULT 'a_faire' CHECK (etat IN ('a_faire','en_cours','faite','refusee')), reponse text, traite_le timestamptz)`);
  await lire('CREATE INDEX IF NOT EXISTS commandes_etat ON commandes(etat, cree_le)');
  await lire(`CREATE TABLE IF NOT EXISTS revenus (id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(),
    montant_eur numeric(10,2) NOT NULL CHECK (montant_eur > 0), source text NOT NULL, note text)`);
  await lire('ALTER TABLE revenus ADD COLUMN IF NOT EXISTS plateforme text');
}

// ── LE COFFRE — Basile y range ses accès. Les valeurs ne sont jamais renvoyées ni journalisées.
const COFFRE = process.env.COFFRE_FICHIER || '/coffre/secrets.env';
function lireCoffre() {
  try {
    return Object.fromEntries(fs.readFileSync(COFFRE, 'utf8').split('\n').filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  } catch (e) { return {}; }
}
function rangerCoffre(nom, valeur) {
  const c = lireCoffre(); c[nom] = valeur;
  fs.writeFileSync(COFFRE, Object.entries(c).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(COFFRE, 0o600);
}

module.exports = { cerveau, n8n, lire, lireN8n, preparer, lireCoffre, rangerCoffre };
