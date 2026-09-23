// RADAR DE MESURE — le sonar du sous-marin.
//
// La Vigie existante collecte de l'OPINION : blogs de chercheurs, presse spécialisée.
// Onze de ses sources sont mortes, et ce sont précisément les sources d'opinion.
// Ce radar-ci collecte de la MESURE : ce qui sort réellement, à quel prix, et ce que
// des acheteurs paient vraiment. Il écrit dans la même table pour que les cinq
// consommateurs existants en profitent sans être modifiés.
//
// Aucun modèle n'intervient : le tri est déterministe. Un radar qui interprète avant
// d'enregistrer transforme un fait en opinion — exactement ce qu'on cherche à quitter.
import pg from 'pg';

const UA = { 'User-Agent': 'raime-radar/1.0 (cabinet conseil IA; contact@raime.fr)' };
const TIMEOUT = 15000;

async function json(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function texte(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

// ── ① Ce qui sort : les publications de modèles ─────────────────────────────
// Signal direct de la frontière technique, et le meilleur observatoire de l'open source
// chinois — Qwen, DeepSeek, GLM et les autres publient ici avant tout le monde.
async function huggingFace() {
  // Deux regards : ce qui vient de paraître, et ce qui monte. Filtrer les nouveautés
  // sur leur nombre de téléchargements n'a aucun sens — un modèle publié ce matin en a zéro.
  const [neufs, montants] = await Promise.all([
    json('https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=25&filter=text-generation'),
    json('https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=15'),
  ]);
  const vus = new Set();
  const d = [...neufs, ...montants].filter((m) => m && m.id && !vus.has(m.id) && vus.add(m.id));
  return d.map((m) => ({
    source: 'HF · nouveaux modèles',
    title: m.id,
    url: `https://huggingface.co/${m.id}`,
    published_at: m.createdAt || null,
    summary: `${m.downloads || 0} téléchargements · ${m.likes || 0} mentions · ${(m.tags || []).slice(0, 6).join(', ')}`,
    relevance: (m.downloads || 0) > 5000 ? 4 : 3,
  }));
}

// ── ② Ce qui se construit : les outils que les intégrateurs vont revendre ────
async function gitHub() {
  const depuis = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const d = await json(`https://api.github.com/search/repositories?q=llm+OR+agent+created:>${depuis}&sort=stars&order=desc&per_page=20`);
  return (d.items || []).filter((x) => (x.stargazers_count || 0) >= 100).map((x) => ({
    source: 'GitHub · outils émergents',
    title: x.full_name,
    url: x.html_url,
    published_at: x.created_at,
    summary: `${x.stargazers_count} étoiles en moins de 30 jours · ${x.language || '—'} · ${(x.description || '').slice(0, 160)}`,
    relevance: x.stargazers_count > 1000 ? 5 : 3,
  }));
}

// ── ③ Ce qui arrive : la recherche, 6 à 18 mois avant les produits ──────────
async function arXiv() {
  const xml = await texte('https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=25');
  const entrees = xml.split('<entry>').slice(1);
  return entrees.map((e) => {
    const p = (b) => (e.match(new RegExp(`<${b}[^>]*>([\\s\\S]*?)</${b}>`)) || [])[1];
    const titre = (p('title') || '').replace(/\s+/g, ' ').trim();
    const lien = (e.match(/<id>([^<]+)<\/id>/) || [])[1];
    if (!titre || !lien) return null;
    return {
      source: 'arXiv · recherche',
      title: titre.slice(0, 240),
      url: lien,
      published_at: p('published') || null,
      summary: (p('summary') || '').replace(/\s+/g, ' ').trim().slice(0, 380),
      relevance: 3,
    };
  }).filter(Boolean);
}

// ── ④ Le signal de commoditisation : ce qui tourne en local, gratuitement ───
// Le jour où un modèle suffisant tourne sur le poste du client, l'argument « il faut
// une API payante » s'effondre. C'est la menace principale identifiée par la Prospective.
async function ollama() {
  const html = await texte('https://ollama.com/library');
  const vus = new Set();
  const out = [];
  const re = /href="\/library\/([a-z0-9._-]+)"/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 25) {
    const nom = m[1];
    if (vus.has(nom)) continue;
    vus.add(nom);
    out.push({
      source: 'Ollama · modèles locaux',
      title: nom,
      url: `https://ollama.com/library/${nom}`,
      published_at: null,
      summary: 'Modèle exécutable en local, sans API ni abonnement.',
      relevance: 3,
    });
  }
  return out;
}

// ── ⑤ LE PRIX RÉEL : ce que des acheteurs paient vraiment ───────────────────
// La seule source ouverte qui porte des montants. Requête resserrée : « intelligence
// artificielle » seul ramenait une exposition à Nantes et des goodies publicitaires.
async function boamp() {
  const termes = encodeURIComponent('"intelligence artificielle" OR "automatisation des processus" OR chatbot OR "agent conversationnel"');
  const d = await json(`https://boamp-datadila.opendatasoft.com/api/records/1.0/search/?dataset=boamp&q=${termes}&rows=30&sort=dateparution`);
  return (d.records || []).map((r) => {
    const f = r.fields || {};
    const objet = String(f.objet || '').replace(/\s+/g, ' ').trim();
    // On écarte le bruit : impression, goodies, scénographie, mobilier.
    if (/goodies|scénographie|scenographie|impression|mobilier|nettoyage|restauration/i.test(objet)) return null;
    if (!objet) return null;
    return {
      source: 'BOAMP · marchés publics',
      title: objet.slice(0, 240),
      url: `https://www.boamp.fr/avis/detail/${f.idweb || r.recordid}`,
      published_at: f.dateparution || null,
      summary: `${f.nomacheteur || 'acheteur non précisé'} · ${f.famille_libelle || 'tranche non précisée'} · ${f.type_marche_facette || ''}`,
      relevance: /90 k|seuils européens|seuils europeens/i.test(String(f.famille_libelle)) ? 5 : 4,
    };
  }).filter(Boolean);
}

const SOURCES = [
  ['Hugging Face', huggingFace],
  ['GitHub', gitHub],
  ['arXiv', arXiv],
  ['Ollama', ollama],
  ['BOAMP', boamp],
];

export async function scruter({ n8n, brain }) {
  const bilan = [];
  for (const [nom, fn] of SOURCES) {
    const t0 = Date.now();
    try {
      const items = await fn();
      let neufs = 0;
      for (const it of items) {
        if (!it.url) continue;
        const { rowCount } = await n8n.query(
          `INSERT INTO veille_ia(captured_at, published_at, source, title, url, summary, relevance)
           VALUES(now(), $1, $2, $3, $4, $5, $6) ON CONFLICT (url) DO NOTHING`,
          [it.published_at, it.source, it.title, it.url, it.summary, it.relevance]);
        neufs += rowCount;
      }
      bilan.push({ source: nom, recus: items.length, neufs, ms: Date.now() - t0, etat: 'ok' });
    } catch (e) {
      bilan.push({ source: nom, recus: 0, neufs: 0, ms: Date.now() - t0, etat: `échec : ${e.message}` });
      // Une source qui tombe doit se voir : c'est la leçon des onze sources muettes.
      await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
        ['radar', `Source de mesure indisponible : ${nom}`, String(e.message).slice(0, 300)]);
    }
  }
  return bilan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const b = await scruter({ n8n, brain });
    console.log(`\n╔══ RADAR DE MESURE ══╗\n`);
    b.forEach((x) => console.log(
      `  ${x.source.padEnd(14)} ${String(x.recus).padStart(3)} reçus · ${String(x.neufs).padStart(3)} nouveaux · ${String(x.ms).padStart(5)} ms · ${x.etat}`));
    const total = b.reduce((s, x) => s + x.neufs, 0);
    console.log(`\n  ${total} élément(s) de mesure ajouté(s) à la veille.\n`);
  } finally { await brain.end(); await n8n.end(); }
}
