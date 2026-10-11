// RECHERCHER UNE SOLUTION — à chaque difficulté, le cerveau va chercher lui-même comment
// s'améliorer, là où la réponse se trouve, et juge seul ce qui est bon pour lui.
//
// Les sources, toutes publiques et sans clé :
//   bibliothèque   ce que la maison sait déjà (Postgres, en français, gratuit)
//   github         dépôts de code, avec leurs étoiles, leur licence, leur fraîcheur
//   hackernews     ce qu'en disent les praticiens
//   arxiv          les travaux publiés
//   moteur         un moteur de recherche auto-hébergé (SearXNG), quand la session locale l'aura
//                  installé : RECHERCHE_URL=http://searxng:8080 ; documentations et forums y passent
//
// Chaque piste est NOTÉE PAR LE CODE, sur six critères : fiabilité de la source, fraîcheur,
// licence, sécurité (les mêmes refus que l'installeur), adéquation au problème, coût.
// La meilleure piste passe en QUARANTAINE (table pistes) : essayée, mesurée, et adoptée
// seulement si elle gagne. Rien ne s'installe ici.
import { verifier } from './installeur.js';
import { score } from './amelioration.js';

const H = { 'User-Agent': 'rAIme-rechercheur/1.0 (+https://raime.fr)', Accept: 'application/json' };
const JOUR = 86_400_000;
const LICENCES_LIBRES = new Set(['mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'isc', 'mpl-2.0', 'unlicense',
  'cc0-1.0', 'lgpl-3.0', 'lgpl-2.1', 'cc-by-4.0', 'cc-by-sa-4.0', '0bsd']);
const LICENCES_CONTAMINANTES = new Set(['gpl-2.0', 'gpl-3.0', 'agpl-3.0']);
// Poids des critères : la sécurité et l'adéquation d'abord.
export const POIDS = { securite: 3, adequation: 3, fiabilite: 2, licence: 2, fraicheur: 1, cout: 1 };

const VIDES = new Set(['pour', 'avec', 'dans', 'sans', 'plus', 'moins', 'comment', 'faire', 'quand', 'quel', 'quelle',
  'une', 'des', 'les', 'the', 'and', 'for', 'with', 'how', 'from']);
export const motsCles = (s) => [...new Set(String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((m) => m.length > 2 && !VIDES.has(m)))];

async function json(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// ── Les sources : chacune rend des pistes au même format ────────────────────
export const SOURCES = {
  async bibliotheque({ brain, probleme }) {
    if (!brain) return [];
    const { chercher } = await import('./bibliothecaire.js');
    const r = await chercher({ brain, question: probleme, combien: 3, exclure: [] });
    return r.map((p) => ({ source: 'bibliotheque', titre: p.titre, lien: `bibliotheque:${p.source}`,
      resume: p.extrait.slice(0, 400), licence: 'maison', maj: null, popularite: null }));
  },
  async github({ probleme }) {
    const q = encodeURIComponent(`${motsCles(probleme).slice(0, 5).join(' ')} in:name,description,readme`);
    const d = await json(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=6`);
    return (d.items || []).map((x) => ({ source: 'github', titre: x.full_name, lien: x.html_url,
      resume: x.description || '', licence: x.license?.spdx_id?.toLowerCase() || null, maj: x.pushed_at,
      popularite: x.stargazers_count, archive: x.archived }));
  },
  async hackernews({ probleme }) {
    const d = await json(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(motsCles(probleme).slice(0, 5).join(' '))}`);
    return (d.hits || []).map((x) => ({ source: 'hackernews', titre: x.title || '', lien: x.url || `https://news.ycombinator.com/item?id=${x.objectID}`,
      resume: (x.story_text || '').slice(0, 400), licence: null, maj: x.created_at, popularite: x.points }));
  },
  async arxiv({ probleme }) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
    let x;
    try {
      const r = await fetch(`http://export.arxiv.org/api/query?max_results=4&search_query=all:${encodeURIComponent(motsCles(probleme).slice(0, 4).join(' AND all:'))}`, { headers: H, signal: c.signal });
      if (!r.ok) throw new Error(`${r.status}`);
      x = await r.text();
    } finally { clearTimeout(t); }
    return x.split('<entry>').slice(1).map((e) => {
      const p = (b) => (e.match(new RegExp(`<${b}[^>]*>([\\s\\S]*?)</${b}>`)) || [, ''])[1].replace(/\s+/g, ' ').trim();
      return { source: 'arxiv', titre: p('title'), lien: p('id'), resume: p('summary').slice(0, 400),
        licence: null, maj: p('updated') || p('published'), popularite: null };
    });
  },
  async moteur({ probleme }) {
    // Le moteur souverain du serveur (SearXNG, installé le 25/09/2026) ; l'adresse se change par RECHERCHE_URL.
    const base = process.env.RECHERCHE_URL || (process.env.MODELE_FACTICE === '1' ? '' : 'http://searxng:8080');
    if (!base) return [];
    const d = await json(`${base.replace(/\/$/, '')}/search?format=json&language=fr&q=${encodeURIComponent(probleme)}`);
    return (d.results || []).slice(0, 8).map((x) => ({ source: 'moteur', titre: x.title || '', lien: x.url,
      resume: (x.content || '').slice(0, 400), licence: null, maj: x.publishedDate || null, popularite: null }));
  },
};

// ── La note, par le code ────────────────────────────────────────────────────
const DOMAINES_OFFICIELS = /(^|\.)(nodejs\.org|postgresql\.org|developer\.mozilla\.org|docs\.github\.com|stripe\.com|caddyserver\.com|docs\.docker\.com|openrouter\.ai|anthropic\.com|python\.org|legifrance\.gouv\.fr|service-public\.fr|cnil\.fr|economie\.gouv\.fr)$/;

export function noter(piste, probleme, maintenant = Date.now()) {
  const n = {};
  // Sécurité : les refus de l'installeur, plus les adresses de commande et les dépôts archivés.
  const danger = verifier(`${piste.titre}\n${piste.resume}\n${piste.lien}`);
  n.securite = danger ? 0 : piste.archive ? 0.4 : 1;

  // Adéquation : la part des mots du problème présents dans la piste.
  const mots = motsCles(probleme);
  const texte = motsCles(`${piste.titre} ${piste.resume}`);
  n.adequation = mots.length ? mots.filter((m) => texte.some((t) => t.startsWith(m.slice(0, 5)))).length / mots.length : 0;

  // Fiabilité : la source, puis ce qu'en disent les autres.
  let hote = '';
  try { hote = new URL(piste.lien).hostname; } catch { /* bibliothèque:… */ }
  const base = { bibliotheque: 0.8, arxiv: 0.7, github: 0.5, hackernews: 0.4, moteur: 0.4 }[piste.source] ?? 0.3;
  const renom = piste.popularite ? Math.min(0.3, Math.log10(1 + piste.popularite) / 12) : 0;
  n.fiabilite = Math.min(1, (DOMAINES_OFFICIELS.test(hote) ? 0.9 : base) + renom);

  // Fraîcheur : pleine sous six mois, nulle au-delà de trois ans.
  const age = piste.maj ? (maintenant - new Date(piste.maj).getTime()) / JOUR : null;
  n.fraicheur = age == null || Number.isNaN(age) ? 0.5 : age < 180 ? 1 : age > 1095 ? 0 : 1 - (age - 180) / 915;

  // Licence : libre = oui ; contaminante = prudence ; inconnue = à lire avant tout usage de code.
  const l = String(piste.licence || '').toLowerCase();
  n.licence = l === 'maison' ? 1 : LICENCES_LIBRES.has(l) ? 1 : LICENCES_CONTAMINANTES.has(l) ? 0.4 : piste.source === 'github' ? 0.2 : 0.6;

  // Coût : tout est gratuit ici ; une piste qui mentionne un abonnement ou une clé payante perd.
  n.cout = /\b(pricing|paid|subscription|abonnement|payant|enterprise plan)\b/i.test(`${piste.titre} ${piste.resume}`) ? 0.3 : 1;

  const total = score(n);
  return { ...piste, notes: n, note: Math.round(100 * total), refus: danger || (n.securite === 0 ? 'insécure' : null) };
}

async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS pistes (
      id         bigserial PRIMARY KEY,
      probleme   text NOT NULL,
      source     text NOT NULL,
      titre      text NOT NULL,
      lien       text NOT NULL,
      note       int  NOT NULL,
      notes      jsonb NOT NULL,
      etat       text NOT NULL DEFAULT 'quarantaine' CHECK (etat IN ('quarantaine','essai','adoptee','rejetee')),
      mesure     jsonb,
      cree_le    timestamptz NOT NULL DEFAULT now(),
      UNIQUE (probleme, lien)
    )`);
}

// Interroge toutes les sources, note chaque piste, met la meilleure en quarantaine.
export async function rechercherSolution({ brain = null, probleme, sources = Object.keys(SOURCES), maintenant = Date.now() }) {
  const p = String(probleme || '').trim();
  if (p.length < 10) throw new Error('problème trop vague pour être cherché');
  const brutes = [], muettes = [];
  for (const nom of sources) {
    try { brutes.push(...await SOURCES[nom]({ brain, probleme: p })); }
    catch (e) { muettes.push(`${nom} : ${e.message}`); }
  }
  const vues = new Set();
  const pistes = brutes.filter((x) => x.lien && !vues.has(x.lien) && vues.add(x.lien))
    .map((x) => noter(x, p, maintenant))
    .sort((a, b) => b.note - a.note);
  const retenue = pistes.find((x) => !x.refus && x.notes.adequation > 0) || null;

  if (brain && retenue) {
    await schema(brain);
    await brain.query(`INSERT INTO pistes(probleme, source, titre, lien, note, notes) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT (probleme, lien) DO UPDATE SET note = EXCLUDED.note, notes = EXCLUDED.notes`,
      [p.slice(0, 400), retenue.source, retenue.titre.slice(0, 300), retenue.lien, retenue.note, JSON.stringify(retenue.notes)]);
    await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['rechercheur', `Piste en quarantaine pour « ${p.slice(0, 120)} » : ${retenue.titre.slice(0, 120)} (${retenue.note}/100)`,
       `${pistes.length} piste(s) notées sur ${sources.length} source(s)${muettes.length ? ` ; muettes : ${muettes.join(' | ')}` : ''}`.slice(0, 500)]);
  }
  return { probleme: p, pistes, retenue, muettes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const r = await rechercherSolution({ brain, probleme: process.argv.slice(2).join(' ') });
  console.log(`\n╔══ ${r.pistes.length} piste(s) pour « ${r.probleme} » ══╗`);
  for (const x of r.pistes.slice(0, 8)) console.log(`  [${String(x.note).padStart(3)}] ${x.source.padEnd(12)} ${x.titre.slice(0, 70)}${x.refus ? `  ✗ ${x.refus}` : ''}\n        ${x.lien}`);
  if (r.muettes.length) console.log(`  sources muettes : ${r.muettes.join(' | ')}`);
  await brain.end();
}

