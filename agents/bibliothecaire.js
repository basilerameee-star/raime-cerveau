// AGENT BIBLIOTHÉCAIRE — la mémoire longue de la maison.
//
// Le cerveau savait mesurer, juger, écrire. Il lui manquait de SAVOIR : quatre documents
// en base, aucune table de morceaux, donc aucune recherche possible dans ses propres
// connaissances. Le bibliothécaire avale des textes, les découpe, les range, et les
// retrouve par le sens des mots.
//
// SOUVERAIN PAR CONSTRUCTION : la recherche se fait dans Postgres, en français, sans
// appeler personne et sans dépenser un centime. Aucun fournisseur ne détient la
// bibliothèque ; une sauvegarde suffit à la déplacer ailleurs.
//
//   node agents/bibliothecaire.js ranger              range ce qui attend dans bibliotheque/
//   node agents/bibliothecaire.js chercher "question" lit la bibliothèque
import fs from 'node:fs';
import path from 'node:path';

const ENTREE = process.env.BIBLIO_ENTREE || '/app/bibliotheque';
const MORCEAU = 1400;      // caractères par morceau : une idée entière, jamais une phrase coupée
const CHEVAUCHE = 200;     // de quoi garder le fil entre deux morceaux

async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id         bigserial PRIMARY KEY,
      source     text NOT NULL,
      titre      text,
      domaine    text DEFAULT 'general',
      rang       int  NOT NULL,
      texte      text NOT NULL,
      mots       tsvector GENERATED ALWAYS AS (to_tsvector('french', texte)) STORED,
      empreinte  text NOT NULL,
      ajoute_le  timestamptz NOT NULL DEFAULT now(),
      UNIQUE(empreinte)
    )`);
  await brain.query('CREATE INDEX IF NOT EXISTS kb_chunks_mots ON kb_chunks USING GIN(mots)');
  await brain.query('CREATE INDEX IF NOT EXISTS kb_chunks_source ON kb_chunks(source, rang)');
}

// Une empreinte courte et stable : le même passage rangé deux fois occupe une seule place.
function empreinte(texte) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < texte.length; i++) {
    h1 = (h1 ^ texte.charCodeAt(i)) * 16777619 >>> 0;
    h2 = (h2 + texte.charCodeAt(i) * (i + 7)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

// Découpe aux frontières de paragraphe : on préfère un morceau un peu court à une idée coupée.
function decouper(texte) {
  const propre = texte.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const blocs = propre.split(/\n\n+/);
  const morceaux = [];
  let courant = '';
  for (const b of blocs) {
    if ((courant + '\n\n' + b).length > MORCEAU && courant) {
      morceaux.push(courant.trim());
      courant = courant.slice(-CHEVAUCHE) + '\n\n' + b;
    } else {
      courant = courant ? courant + '\n\n' + b : b;
    }
  }
  if (courant.trim()) morceaux.push(courant.trim());
  return morceaux.filter((m) => m.length > 120);
}

function fichiers(racine) {
  const sortie = [];
  const visiter = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      // Les dossiers cachés (.obsidian, .git…) portent des réglages, pas du savoir :
      // l'architecte a reçu « workspace.json » en réponse à une question commerciale.
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) visiter(p);
      else if (/\.(md|markdown|txt|csv|json)$/i.test(e.name) && fs.statSync(p).size < 4_000_000) sortie.push(p);
    }
  };
  if (fs.existsSync(racine)) visiter(racine);
  return sortie;
}

export async function ranger({ brain, racine = ENTREE }) {
  await schema(brain);
  const liste = fichiers(racine);
  let ajoutes = 0, vus = 0;

  for (const f of liste) {
    const texte = fs.readFileSync(f, 'utf8');
    const source = path.relative(racine, f).replace(/\\/g, '/');
    const domaine = source.split('/')[0] || 'general';
    const titre = (texte.match(/^#\s+(.+)$/m) || [, path.basename(f, path.extname(f))])[1];
    const morceaux = decouper(texte);
    for (let i = 0; i < morceaux.length; i++) {
      vus++;
      const r = await brain.query(
        `INSERT INTO kb_chunks(source, titre, domaine, rang, texte, empreinte)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (empreinte) DO NOTHING RETURNING id`,
        [source, titre.slice(0, 200), domaine, i, morceaux[i], empreinte(morceaux[i])]);
      if (r.rowCount) ajoutes++;
    }
  }

  const { rows: [t] } = await brain.query(
    `SELECT count(*)::int morceaux, count(DISTINCT source)::int sources, count(DISTINCT domaine)::int domaines FROM kb_chunks`);
  await brain.query(
    `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['bibliothecaire', `${ajoutes} morceau(x) rangé(s) sur ${vus} lus`,
     `La bibliothèque porte ${t.morceaux} morceaux, ${t.sources} sources, ${t.domaines} domaines.`]);
  return { ajoutes, vus, total: t };
}

// Recherche par les mots, en français : racines, accents et pluriels compris.
// Deux temps : d'abord les passages qui portent TOUS les mots, ensuite ceux qui en portent
// quelques-uns. Une question longue trouve ainsi toujours de quoi répondre.
// `exclure` écarte des domaines entiers : la documentation technique en anglais, versée en
// masse, noyait les notes de la maison. Leçon de l'architecte, premier cycle v2 (2026-09-23).
export async function chercher({ brain, question, combien = 5, domaine = null, exclure = [] }) {
  await schema(brain);
  const conditions = [], extra = [];
  if (domaine) { extra.push(domaine); conditions.push(`domaine = $${3 + extra.length}`); }
  if (exclure.length) { extra.push(exclure); conditions.push(`NOT (domaine = ANY($${3 + extra.length}::text[]))`); }
  const filtre = conditions.length ? `AND ${conditions.join(' AND ')}` : '';
  // On lit quatre fois plus large, puis on garde un seul passage par document.
  const params = (q, mode) => [q, combien * 4, mode, ...extra];

  // Le TITRE et le chemin pèsent trois fois plus que le corps : « Carte commerciale » est un
  // titre, et la recherche l'ignorait (écart persistant relevé par l'architecte, 2026-09-23).
  // websearch_to_tsquery ne lève jamais d'erreur de syntaxe, quelle que soit la question.
  const requete = async (expression, mode) => {
    const q = mode === 'tous les mots' ? "plainto_tsquery('french', $1)" : "websearch_to_tsquery('french', $1)";
    const { rows } = await brain.query(`
      SELECT source, titre, domaine, rang, $3::text AS mode,
             ts_rank_cd(mots, ${q}) + 3 * ts_rank_cd(coalesce(mots_titre, ''::tsvector), ${q}) AS poids,
             left(texte, 700) AS extrait
      FROM kb_chunks
      WHERE (mots @@ ${q} OR coalesce(mots_titre, ''::tsvector) @@ ${q}) ${filtre}
      ORDER BY poids DESC LIMIT $2`, params(expression, mode));
    return rows;
  };

  // Un document ne répond qu'une fois : trois morceaux du même texte ne font pas trois sources.
  const diversifier = (liste) => {
    const vus = new Set();
    return liste.filter((l) => (vus.has(l.source) ? false : vus.add(l.source)));
  };

  const trouves = diversifier(await requete(question, 'tous les mots'));
  if (trouves.length >= combien) return trouves.slice(0, combien);

  // Quelques mots suffisent : on garde les mots utiles, on les joint par « ou ».
  const mots = question.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((m) => m.length > 3);
  if (!mots.length) return trouves;

  const large = await requete(mots.join(' OR '), 'quelques mots');
  return diversifier([...trouves, ...large]).slice(0, combien);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const [action, ...reste] = process.argv.slice(2);
  if (action === 'chercher') {
    const r = await chercher({ brain, question: reste.join(' ') });
    console.log(`\n╔══ ${r.length} passage(s) ══╗\n`);
    for (const p of r) console.log(`  [${p.domaine}] ${p.titre} · ${p.source}\n      ${p.extrait.replace(/\n/g, ' ').slice(0, 220)}…\n`);
  } else {
    const r = await ranger({ brain });
    console.log(`[bibliothecaire] ${r.ajoutes} morceau(x) neufs sur ${r.vus} lus — la bibliothèque porte ${r.total.morceaux} morceaux, ${r.total.sources} sources.`);
  }
  await brain.end();
}
