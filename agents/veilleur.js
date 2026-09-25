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
  ['text-generation', 2], ['code', 2], ['coder', 2], ['swe-bench', 3], ['hermes', 3], ['harness', 3],
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

// ── ③ bis Hugging Face : ce que la communauté adopte vraiment (tendances), hors des grands noms ──
// Voulu par Basile le 25/09/2026 : être « sur le devant de la scène », pas seulement sur l'archi-grand public.
async function hf_tendances() {
  const d = await json('https://huggingface.co/api/models?sort=trendingScore&limit=30');
  return (d || []).filter((m) => !/uncensored|abliterat|nsfw/i.test(m.id || '')).map((m) => ({
    source: 'hf_tendances', titre: m.id || m.modelId, lien: `https://huggingface.co/${m.id || m.modelId}`,
    detail: `tendance ${m.trendingScore || 0} · ${m.likes || 0} j'aime · ${(m.tags || []).slice(0, 4).join(', ')}`,
    corps: `${m.id || m.modelId} — ${(m.tags || []).join(' ')} ${m.pipeline_tag || ''}`,
  }));
}

// ── ③ ter Hugging Face Papers : les publications du jour retenues par la communauté ──
async function hf_papers() {
  const d = await json('https://huggingface.co/api/daily_papers?limit=30');
  return (d || []).filter((x) => x.paper && x.paper.id).map((x) => ({
    source: 'hf_papers', titre: x.paper.title || x.title || x.paper.id, lien: `https://huggingface.co/papers/${x.paper.id}`,
    detail: `${x.paper.upvotes ?? 0} votes`,
    corps: `${x.paper.title || ''} ${String(x.paper.summary || '').slice(0, 600)}`,
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

// ── ⑤ Les figures de l'IA, par Google Actualités ─────────────────────────────
// Repris du flux « Vigie · Radar personnalités IA » : ce que disent et font trente
// personnes dont les choix techniques finissent par devenir les nôtres.
const FIGURES = [
  'Geoffrey Hinton', 'Yoshua Bengio', 'Yann LeCun', 'Jürgen Schmidhuber', 'Andrew Ng', 'Fei-Fei Li',
  'Ian Goodfellow', 'Andrej Karpathy', 'François Chollet', 'Demis Hassabis', 'Ilya Sutskever', 'Jeff Dean',
  'Sam Altman', 'Dario Amodei', 'Mira Murati', 'Jim Fan',
  'Stuart Russell', 'Paul Christiano', 'Eliezer Yudkowsky', 'Dan Hendrycks', 'Chris Olah',
  'Jan Leike', 'Helen Toner', 'Leopold Aschenbrenner', 'Daniel Kokotajlo',
  'Timnit Gebru', 'Margaret Mitchell', 'Gary Marcus', 'Emily Bender', 'Meredith Whittaker',
];

async function personnalites() {
  const propre = (s) => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).trim();
  const sortie = [];
  for (const qui of FIGURES) {
    const q = encodeURIComponent(`"${qui}" (AI OR "artificial intelligence" OR "intelligence artificielle")`);
    let xml;
    try {
      xml = await texte(`https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`, H('application/rss+xml'));
    } catch { continue; }
    const items = xml.split(/<item[\s>]/i).slice(1, 3);   // deux articles par personne, au plus
    for (const c of items) {
      const titre = propre((c.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
      const lien = propre((c.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
      const date = (c.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1];
      if (!titre || !lien) continue;
      const age = date ? Date.now() - new Date(date.trim()).getTime() : 0;
      if (age > 4 * JOUR) continue;
      sortie.push({
        source: 'personnalites', titre: `${qui} — ${titre}`, lien,
        detail: qui, corps: `${qui} ${titre}`,
      });
    }
  }
  return sortie;
}

const SOURCES = { hackernews, github, huggingface, hf_tendances, hf_papers, arxiv, personnalites };

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

// L'actualité devient une offre : deux à quatre idées vendables par semaine, ancrées
// sur ce que la veille a réellement rapporté. Rien n'est promis à un client : ce sont
// des pistes, écrites au journal, que Basile garde ou jette.
async function idees(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS idees_offres (
      id bigserial PRIMARY KEY, titre text NOT NULL, promesse text, ancrage text,
      famille text, cree_le timestamptz NOT NULL DEFAULT now())`);
  const { rows: [recent] } = await brain.query(
    `SELECT max(cree_le) AS le FROM idees_offres`);
  if (recent?.le && Date.now() - new Date(recent.le).getTime() < 6 * JOUR) return null;

  const { rows: sujets } = await brain.query(
    `SELECT titre, source FROM veille WHERE vu_le > now() - interval '7 days'
     ORDER BY score DESC LIMIT 25`);
  if (sujets.length < 5) return null;

  const { askJson } = await import('./lib.js');
  const r = await askJson({
    task: 'redaction',
    system: 'Tu es le radar produit de rAIme, conseil en intelligence artificielle : formation, ' +
            'audit des postes, arbitrage des propositions reçues, automatisation. À partir de la ' +
            'veille de la semaine, propose 2 à 4 offres vendables dès maintenant à des entreprises ' +
            'françaises. Chaque idée : un titre court, une promesse en une phrase, la ligne de veille ' +
            'qui l’ancre, et la famille parmi formation, audit, arbitrage, automatisation. ' +
            'Réponds en JSON : {"idees":[{"titre":"","promesse":"","ancrage":"","famille":""}]}',
    user: sujets.map((s) => `- [${s.source}] ${s.titre}`).join('\n'),
    maxTokens: 1200,
  });
  const liste = (r.data?.idees || []).slice(0, 4);
  for (const i of liste) {
    await brain.query(
      `INSERT INTO idees_offres(titre, promesse, ancrage, famille) VALUES($1,$2,$3,$4)`,
      [String(i.titre || '').slice(0, 200), String(i.promesse || '').slice(0, 500),
       String(i.ancrage || '').slice(0, 300), String(i.famille || '').slice(0, 40)]);
  }
  if (liste.length) {
    await brain.query(
      `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['veilleur', `${liste.length} idée(s) d'offre tirées de la veille`,
       liste.map((i) => `${i.titre} (${i.famille})`).join(' · ')]);
  }
  return liste;
}

export async function veiller({ brain, sources = Object.keys(SOURCES) }) {
  await schema(brain);
  const retenus = [], pannes = [];

  for (const nom of sources) {
    try {
      const items = await SOURCES[nom]();
      for (const it of items) {
        // Pour les figures de l'IA, c'est le nom qui fait la pertinence, pas les mots du titre.
        // Une tendance Hugging Face est un signal (adoption réelle) : bonus de 2, il faut aussi toucher nos sujets.
        const s = note(`${it.titre} ${it.corps}`) + (it.source === 'personnalites' ? 4 : it.source === 'hf_tendances' ? 2 : 0);
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

  // Une fois par semaine : ce que la veille suggère de vendre. Repris du flux
  // « Radar · Veille → produit ». Un seul appel de modèle, quelques millièmes d'euro.
  try { await idees(brain); } catch (e) { pannes.push(`idées : ${e.message}`); }

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
