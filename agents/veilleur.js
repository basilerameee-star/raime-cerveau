// AGENT VEILLEUR — les yeux de la maison sur le monde.
//
// Le chasseur mesure ce que le catalogue propose. Le veilleur va plus loin : il regarde
// ce qui se dit et se publie ailleurs — forums, dépôts de code, nouveaux modèles, travaux
// de recherche — et range ce qui sert la maison dans la bibliothèque.
//
// QUATRE SOURCES OFFICIELLES, toutes publiques et gratuites, interrogées par leur API :
//   ① Hacker News (Algolia)        — ce dont les praticiens parlent
//   ② GitHub (recherche de dépôts) — prompts, harnais, agents, outils
//   ③ Hugging Face                 — les modèles qui paraissent
//   ④ arXiv                        — les travaux qui comptent
//
// Aucune page n'est aspirée, aucune règle de site n'est contournée : ce sont les API
// prévues pour cela. Le tri se fait par du code — donc sans dépenser un centime — et
// seuls les passages retenus entrent dans la bibliothèque.
const H = (s) => ({ 'User-Agent': 'rAIme-veilleur/1.0 (+https://raime.fr)', Accept: s || 'application/json' });
const JOUR = 24 * 60 * 60 * 1000;

// Ce que la maison cherche. Un mot pèse : le score décide de l'entrée en bibliothèque.
const INTERETS = [
  ['prompt', 3], ['agent', 3], ['rag', 3], ['retrieval', 2], ['fine-tun', 2], ['benchmark', 3],
  ['evaluation', 2], ['router', 2], ['cost', 2], ['pricing', 3], ['cheap', 2], ['open-source', 2],
  ['self-host', 3], ['sovereign', 3], ['audit', 3], ['automation', 2], ['n8n', 3], ['workflow', 2],
  ['embedding', 2], ['context', 1], ['reasoning', 2], ['distill', 2], ['quantiz', 2], ['latency', 2],
];
const SEUIL = 4;   // en dessous, le bruit reste dehors

function note(texte) {
  const t = (texte || '').toLowerCase();
  return INTERETS.reduce((s, [mot, poids]) => s + (t.includes(mot) ? poids : 0), 0);
}

async function json(url, entetes) {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { headers: entetes || H(), signal: c.signal });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.json();
  } finally { clearTimeout(minuteur); }
}

async function texte(url, entetes) {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), 25000);
  try {
    const r = await fetch(url, { headers: entetes || H('application/atom+xml'), signal: c.signal });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return await r.text();
  } finally { clearTimeout(minuteur); }
}

// ── ① Hacker News ────────────────────────────────────────────────────────────
async function hackernews() {
  const depuis = Math.floor((Date.now() - 2 * JOUR) / 1000);
  const d = await json(`https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=created_at_i>${depuis},points>30&hitsPerPage=40`);
  // Un titre de forum est court : on lui ajoute l'adresse et le texte du message,
  // sinon le tri par mots écarte des sujets qui comptent.
  return (d.hits || []).map((h) => ({
    source: 'hackernews', titre: h.title || '', lien: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    detail: `${h.points} points · ${h.num_comments || 0} commentaires`,
    corps: `${h.title || ''} ${h.url || ''} ${(h.story_text || '').slice(0, 800)}`,
  }));
}

// ── ② GitHub : dépôts récents et suivis ──────────────────────────────────────
async function github() {
  const depuis = new Date(Date.now() - 7 * JOUR).toISOString().slice(0, 10);
  const q = encodeURIComponent(`(prompt OR agent OR rag OR eval) pushed:>${depuis} stars:>200`);
  const d = await json(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`,
    { ...H(), Accept: 'application/vnd.github+json' });
  return (d.items || []).map((r) => ({
    source: 'github', titre: r.full_name, lien: r.html_url,
    detail: `${r.stargazers_count} étoiles · ${r.language || 'texte'}`,
    corps: `${r.full_name} — ${r.description || ''}`,
  }));
}

// ── ③ Hugging Face : les modèles qui paraissent ──────────────────────────────
async function huggingface() {
  const d = await json('https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=30&full=false');
  return (d || []).map((m) => ({
    source: 'huggingface', titre: m.modelId || m.id, lien: `https://huggingface.co/${m.modelId || m.id}`,
    detail: `${m.downloads || 0} téléchargements · ${(m.tags || []).slice(0, 4).join(', ')}`,
    corps: `${m.modelId || m.id} — ${(m.tags || []).join(' ')} ${m.pipeline_tag || ''}`,
  }));
}

// ── ④ arXiv : les travaux récents ────────────────────────────────────────────
async function arxiv() {
  const x = await texte('http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=25');
  const entrees = x.split('<entry>').slice(1);
  return entrees.map((e) => {
    const p = (b) => (e.match(new RegExp(`<${b}[^>]*>([\\s\\S]*?)</${b}>`)) || [, ''])[1].replace(/\s+/g, ' ').trim();
    return {
      source: 'arxiv', titre: p('title'), lien: (e.match(/<id>(.*?)<\/id>/) || [, ''])[1],
      detail: p('published').slice(0, 10), corps: `${p('title')} — ${p('summary').slice(0, 600)}`,
    };
  });
}

const SOURCES = { hackernews, github, huggingface, arxiv };

async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS veille (
      id        bigserial PRIMARY KEY,
      source    text NOT NULL,
      titre     text NOT NULL,
      lien      text NOT NULL,
      detail    text,
      score     int  NOT NULL,
      vu_le     timestamptz NOT NULL DEFAULT now(),
      UNIQUE(lien)
    )`);
  await brain.query('CREATE INDEX IF NOT EXISTS veille_date ON veille(vu_le DESC)');
}

export async function veiller({ brain, sources = Object.keys(SOURCES) }) {
  await schema(brain);
  const retenus = [], pannes = [];

  for (const nom of sources) {
    try {
      const items = await SOURCES[nom]();
      for (const it of items) {
        const s = note(`${it.titre} ${it.corps}`);
        if (s < SEUIL || !it.lien) continue;
        const r = await brain.query(
          `INSERT INTO veille(source, titre, lien, detail, score) VALUES($1,$2,$3,$4,$5)
           ON CONFLICT (lien) DO NOTHING RETURNING id`,
          [it.source, it.titre.slice(0, 300), it.lien, (it.detail || '').slice(0, 200), s]);
        if (r.rowCount) retenus.push({ ...it, score: s });
      }
    } catch (e) {
      pannes.push(`${nom} : ${e.message}`);
    }
  }

  // Ce qui est retenu entre dans la bibliothèque : un fichier par jour et par source.
  if (retenus.length) {
    const { ranger } = await import('./bibliothecaire.js');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const racine = process.env.BIBLIO_ENTREE || '/app/bibliotheque';
    const dossier = path.join(racine, 'veille');
    fs.mkdirSync(dossier, { recursive: true });
    const jour = new Date().toISOString().slice(0, 10);
    for (const src of [...new Set(retenus.map((r) => r.source))]) {
      const lignes = retenus.filter((r) => r.source === src)
        .sort((a, b) => b.score - a.score)
        .map((r) => `## ${r.titre}\n\n${r.corps.slice(0, 900)}\n\nSource : ${r.lien} · ${r.detail} · intérêt ${r.score}\n`);
      fs.writeFileSync(path.join(dossier, `${jour}-${src}.md`),
        `# Veille ${src} — ${jour}\n\n${lignes.join('\n')}`, 'utf8');
    }
    await ranger({ brain, racine });
  }

  const parSource = {};
  retenus.forEach((r) => { parSource[r.source] = (parSource[r.source] || 0) + 1; });
  await brain.query(
    `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['veilleur', `${retenus.length} trouvaille(s) rangée(s)`,
     `${Object.entries(parSource).map(([k, v]) => `${k} : ${v}`).join(' · ') || 'rien de neuf au-dessus du seuil'}` +
     (pannes.length ? ` — sources muettes : ${pannes.join(' | ')}` : '')]);

  return { retenus, pannes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const r = await veiller({ brain });
  console.log(`\n╔══ VEILLE : ${r.retenus.length} trouvaille(s) ══╗\n`);
  for (const t of r.retenus.sort((a, b) => b.score - a.score).slice(0, 12)) {
    console.log(`  [${String(t.score).padStart(2)}] ${t.source.padEnd(12)} ${t.titre.slice(0, 80)}`);
    console.log(`       ${t.lien}`);
  }
  if (r.pannes.length) console.log('\n  sources muettes :', r.pannes.join(' | '));
  await brain.end();
}
