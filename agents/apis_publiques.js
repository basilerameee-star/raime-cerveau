// LES API PUBLIQUES — le répertoire communautaire public-apis (github.com/public-apis/public-apis, licence
// MIT), versé dans la base du cerveau (demande de Basile, 30/09/2026 : « l'intégrer à nos bases »).
//
// À quoi il sert : avant de construire un outil, chercher s'il existe déjà une API qui rend ce service,
// gratuite ou non, avec ou sans clé (MASTER_ARCHITECTURE, « construire vs acheter » : l'existant d'abord).
// Hermes y accède par l'outil MCP « api_publique_chercher » ; Jarvis et les agents par chercher().
//
// Le code lit le README du dépôt, sans modèle : une ligne de tableau = une API. La section sponsorisée
// (« APIs Covered Under APILayer Suite ») est écartée. Rien n'est réimporté si le dernier commit est
// déjà en base. La liste dit qu'une API existe ; elle ne garantit ni son prix ni sa disponibilité.
//
//   node agents/apis_publiques.js            actualise
//   node agents/apis_publiques.js "météo"    cherche
const DEPOT = 'public-apis/public-apis';
const BRANCHE = 'master';
const SPONSORISEE = /APILayer|sponsor/i;

const cellules = (ligne) => ligne.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
const oui = (t) => /^yes$/i.test(String(t).trim());

// Le README en lignes d'API : { nom, lien, description, auth, https, cors, categorie }.
export function analyser(markdown) {
  const apis = [];
  let categorie = null;
  for (const ligne of String(markdown).split(/\r?\n/)) {
    const titre = /^###\s+(.+?)\s*$/.exec(ligne);
    if (titre) { categorie = SPONSORISEE.test(titre[1]) ? null : titre[1]; continue; }
    if (!categorie || !/^\|\s*\[/.test(ligne)) continue;
    const c = cellules(ligne);
    if (c.length !== 5) continue;
    const lienNom = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(c[0]);
    if (!lienNom) continue;
    const auth = c[2].replace(/`/g, '').trim();
    apis.push({ nom: lienNom[1].trim(), lien: lienNom[2], description: c[1].slice(0, 500), categorie,
      auth: /^no$/i.test(auth) ? '' : auth.slice(0, 40), https: oui(c[3]), cors: c[4].toLowerCase().slice(0, 10) });
  }
  return apis;
}

async function preparer(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS apis_publiques (
    id serial PRIMARY KEY, nom text NOT NULL, lien text NOT NULL, description text, categorie text,
    auth text, https boolean, cors text, source_commit text NOT NULL, maj_le timestamptz NOT NULL DEFAULT now(),
    UNIQUE (nom, lien))`);
  await brain.query(`CREATE INDEX IF NOT EXISTS apis_publiques_texte ON apis_publiques
    USING gin (to_tsvector('english', nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, '')))`);
}

// Verse la dernière version du répertoire, si elle est nouvelle. Rend { commit, apis, nouveau }.
export async function actualiser({ brain, fetch = globalThis.fetch } = {}) {
  await preparer(brain);
  const lire = async (url, type) => {
    const r = await fetch(url, { headers: { 'User-Agent': 'raime-cerveau', Accept: type }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    return type.includes('json') ? r.json() : r.text();
  };
  const commit = (await lire(`https://api.github.com/repos/${DEPOT}/commits/${BRANCHE}`, 'application/vnd.github+json')).sha;
  if (!/^[0-9a-f]{40}$/.test(String(commit))) throw new Error('commit illisible');
  const { rows } = await brain.query('SELECT count(*)::int AS n FROM apis_publiques WHERE source_commit = $1', [commit]);
  if (rows[0].n > 0) return { commit, apis: rows[0].n, nouveau: false };

  const apis = analyser(await lire(`https://raw.githubusercontent.com/${DEPOT}/${commit}/README.md`, 'text/plain'));
  if (apis.length < 500) throw new Error(`seulement ${apis.length} API lues : format changé, rien n'est remplacé`);
  await brain.query('BEGIN');
  try {
    await brain.query('DELETE FROM apis_publiques');
    for (let i = 0; i < apis.length; i += 200) {
      const lot = apis.slice(i, i + 200), valeurs = [], p = [];
      lot.forEach((a, j) => {
        const b = j * 8;
        valeurs.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`);
        p.push(a.nom, a.lien, a.description, a.categorie, a.auth, a.https, a.cors, commit);
      });
      await brain.query(`INSERT INTO apis_publiques (nom, lien, description, categorie, auth, https, cors, source_commit)
        VALUES ${valeurs.join(',')} ON CONFLICT (nom, lien) DO NOTHING`, p);
    }
    await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES ($1, $2, $3)`,
      ['apis_publiques', `Répertoire des API publiques : ${apis.length} API versées`, `github.com/${DEPOT} @ ${commit.slice(0, 12)}, licence MIT`]);
    await brain.query('COMMIT');
  } catch (e) { await brain.query('ROLLBACK'); throw e; }
  return { commit, apis: apis.length, nouveau: true };
}

// Les API qui répondent à un besoin (mots en anglais de préférence : le répertoire est en anglais).
export async function chercher({ brain, besoin, sansCle = false, combien = 8 }) {
  const n = Math.min(20, Math.max(1, Number(combien) || 8));
  const filtre = sansCle ? "AND coalesce(auth, '') = ''" : '';
  let { rows } = await brain.query(`SELECT nom, lien, description, categorie, auth, https, cors,
      ts_rank(to_tsvector('english', nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, '')), websearch_to_tsquery('english', $1)) AS r
    FROM apis_publiques WHERE to_tsvector('english', nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, ''))
      @@ websearch_to_tsquery('english', $1) ${filtre} ORDER BY r DESC, https DESC, nom LIMIT ${n}`, [String(besoin)]);
  if (!rows.length) { // des mots isolés, en dernier recours (un besoin écrit en français, par exemple)
    const mots = String(besoin).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((m) => m.length >= 4).slice(0, 5);
    if (mots.length) {
      ({ rows } = await brain.query(`SELECT nom, lien, description, categorie, auth, https, cors FROM apis_publiques
        WHERE (${mots.map((_, i) => `(nom || ' ' || coalesce(description, '') || ' ' || coalesce(categorie, '')) ILIKE $${i + 1}`).join(' OR ')})
        ${filtre} ORDER BY https DESC, nom LIMIT ${n}`, mots.map((m) => `%${m}%`)));
    }
  }
  return rows.map(({ r, ...a }) => a);
}

export const enLigne = (a) => `${a.nom} (${a.categorie}) — ${a.description} · clé : ${a.auth || 'aucune'} · HTTPS : ${a.https ? 'oui' : 'non'} · ${a.lien}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try {
    if (process.argv[2]) console.log((await chercher({ brain, besoin: process.argv.slice(2).join(' ') })).map(enLigne).join('\n') || 'Rien.');
    else console.log(await actualiser({ brain }));
  } finally { await brain.end(); }
}
