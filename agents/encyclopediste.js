// AGENT ENCYCLOPÉDISTE — il remplit la bibliothèque de savoir, domaine par domaine.
//
// Le bibliothécaire savait ranger et retrouver ; personne ne lui apportait de savoir
// général. Le 24/09/2026, la bibliothèque ne contenait ni finance, ni biologie, ni
// mathématiques, ni physique, ni santé, ni droit, ni spiritualité, ni ésotérisme.
//
// PREMIÈRE SOURCE : Wikipédia en français. Libre de droits (CC BY-SA 4.0), relue par
// une communauté, interrogeable par son API officielle, sans clé ni dépense. Chaque
// article rangé porte sa source et sa licence. D'autres sources viendront ensuite
// (publications ouvertes, textes juridiques officiels, classiques du domaine public) :
// l'architecte les proposera quand il constatera un manque.
//
// MÉTHODE : chaque domaine part d'une catégorie racine. Chaque jour l'agent y prend
// quelques dizaines d'articles neufs, descend dans les sous-catégories quand la racine
// est épuisée (deux niveaux au plus), et garde son curseur : la bibliothèque grossit
// un peu chaque jour, sans jamais reprendre ce qu'elle a déjà.
//
//   node agents/encyclopediste.js          un passage (30 articles par domaine)
//   node agents/encyclopediste.js 5        un passage court, 5 articles par domaine
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://fr.wikipedia.org/w/api.php';
const UA = { 'User-Agent': 'rAIme-encyclopediste/1.0 (https://raime.fr; contact@raime.fr)' };
const RACINE = process.env.BIBLIO_ENTREE || '/app/bibliotheque';
const PROFONDEUR_MAX = 2;
const PAUSE_MS = 250;      // politesse envers le service public qui nous prête son savoir

// Les domaines voulus par Basile, et leur porte d'entrée. La liste s'allonge sans code :
// une ligne ici, ou une ligne dans la table savoir_categories.
// « Catégorie:Droit français » n'existe pas : le premier passage n'y a rien trouvé (24/09).
// Ajouts du même jour, à la demande de Basile : métaphysique, quantique, et « tout » —
// cosmologie, religions, mythologie, histoire, neurosciences, nutrition, et ce qui sert
// directement le travail (informatique, marketing, management).
export const DOMAINES = {
  finance:       ['Catégorie:Finance'],
  economie:      ['Catégorie:Économie'],
  droit:         ['Catégorie:Droit en France', 'Catégorie:Droit'],
  sante:         ['Catégorie:Santé', 'Catégorie:Médecine'],
  nutrition:     ['Catégorie:Nutrition'],
  neurosciences: ['Catégorie:Neurosciences'],
  biologie:      ['Catégorie:Biologie'],
  mathematiques: ['Catégorie:Mathématiques'],
  physique:      ['Catégorie:Physique'],
  quantique:     ['Catégorie:Physique quantique', 'Catégorie:Mécanique quantique'],
  cosmologie:    ['Catégorie:Cosmologie', 'Catégorie:Astronomie'],
  chimie:        ['Catégorie:Chimie'],
  psychologie:   ['Catégorie:Psychologie'],
  philosophie:   ['Catégorie:Philosophie'],
  metaphysique:  ['Catégorie:Métaphysique'],
  spiritualite:  ['Catégorie:Spiritualité'],
  religions:     ['Catégorie:Religion', 'Catégorie:Théologie'],
  mythologie:    ['Catégorie:Mythologie'],
  esoterisme:    ['Catégorie:Ésotérisme', 'Catégorie:Alchimie', 'Catégorie:Astrologie'],
  histoire:      ['Catégorie:Histoire'],
  informatique:  ['Catégorie:Informatique'],
  marketing:     ['Catégorie:Marketing'],
  management:    ['Catégorie:Management'],
};

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal });
    if (!r.ok) throw new Error(`Wikipédia ${r.status}`);
    return await r.json();
  } finally { clearTimeout(minuteur); await attendre(PAUSE_MS); }
}

async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS savoir_categories (
      categorie  text PRIMARY KEY,
      domaine    text NOT NULL,
      profondeur int  NOT NULL DEFAULT 0,
      curseur    text,
      epuisee    boolean NOT NULL DEFAULT false,
      vue_le     timestamptz NOT NULL DEFAULT now()
    )`);
  await brain.query(`
    CREATE TABLE IF NOT EXISTS savoir_pages (
      titre       text PRIMARY KEY,
      domaine     text NOT NULL,
      caracteres  int,
      recupere_le timestamptz NOT NULL DEFAULT now()
    )`);
  for (const [domaine, racines] of Object.entries(DOMAINES)) {
    for (const cat of racines) {
      await brain.query(
        `INSERT INTO savoir_categories(categorie, domaine, profondeur) VALUES($1,$2,0) ON CONFLICT DO NOTHING`,
        [cat, domaine]);
    }
  }
}

const nomFichier = (titre) => titre.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'article';

async function rangerArticle(brain, domaine, titre) {
  const d = await api({ action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', titles: titre });
  const page = d.query?.pages?.[0];
  const texte = (page?.extract || '').trim();
  // Une ébauche de trois lignes n'est pas du savoir : on la note pour ne pas y revenir.
  if (!page || page.missing || texte.length < 800) {
    await brain.query(`INSERT INTO savoir_pages(titre, domaine, caracteres) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [titre, domaine, texte.length]);
    return false;
  }
  const dossier = path.join(RACINE, `savoir-${domaine}`);
  fs.mkdirSync(dossier, { recursive: true });
  const lien = `https://fr.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
  const jour = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(dossier, `${nomFichier(page.title)}.md`),
    `# ${page.title}\n\n${texte}\n\n---\nSource : Wikipédia en français, « ${page.title} », ${lien}. `
    + `Licence CC BY-SA 4.0. Récupéré le ${jour}.\n`, 'utf8');
  await brain.query(`INSERT INTO savoir_pages(titre, domaine, caracteres) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
    [titre, domaine, texte.length]);
  return true;
}

// Un domaine : on prend dans la catégorie la moins profonde qui n'est pas épuisée.
async function nourrirDomaine(brain, domaine, combien) {
  let ranges = 0, tours = 0;
  while (ranges < combien && tours < 12) {
    tours++;
    const { rows: [cat] } = await brain.query(
      `SELECT categorie, profondeur, curseur FROM savoir_categories
       WHERE domaine = $1 AND NOT epuisee ORDER BY profondeur, vue_le LIMIT 1`, [domaine]);
    if (!cat) break;

    const d = await api({ action: 'query', list: 'categorymembers', cmtitle: cat.categorie,
      cmtype: 'page|subcat', cmlimit: '50', ...(cat.curseur ? { cmcontinue: cat.curseur } : {}) });
    const membres = d.query?.categorymembers || [];

    for (const m of membres) {
      if (ranges >= combien) break;
      if (m.ns === 14) {
        if (cat.profondeur < PROFONDEUR_MAX) {
          await brain.query(
            `INSERT INTO savoir_categories(categorie, domaine, profondeur) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
            [m.title, domaine, cat.profondeur + 1]);
        }
        continue;
      }
      if (m.ns !== 0) continue;
      const { rowCount } = await brain.query(`SELECT 1 FROM savoir_pages WHERE titre = $1`, [m.title]);
      if (rowCount) continue;
      try { if (await rangerArticle(brain, domaine, m.title)) ranges++; }
      catch { /* un article illisible ne bloque pas le domaine */ }
    }

    const suite = d.continue?.cmcontinue || null;
    await brain.query(`UPDATE savoir_categories SET curseur = $2, epuisee = $3, vue_le = now() WHERE categorie = $1`,
      [cat.categorie, suite, !suite]);
  }
  return ranges;
}

export async function nourrir({ brain, combien = 30 }) {
  await schema(brain);
  const bilan = {};
  for (const domaine of Object.keys(DOMAINES)) {
    try { bilan[domaine] = await nourrirDomaine(brain, domaine, combien); }
    catch (e) { bilan[domaine] = `muet : ${e.message}`; }
  }
  const { ranger } = await import('./bibliothecaire.js');
  const r = await ranger({ brain, racine: RACINE });
  const total = Object.values(bilan).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['encyclopediste', `${total} article(s) de savoir rangé(s)`,
     `${Object.entries(bilan).map(([k, v]) => `${k} ${v}`).join(' · ')} — bibliothèque : ${r.total.morceaux} morceaux`]);
  return { bilan, total, bibliotheque: r.total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const r = await nourrir({ brain, combien: parseInt(process.argv[2] || '30', 10) });
  console.log(`\n╔══ SAVOIR : ${r.total} article(s) rangé(s) ══╗\n`);
  for (const [d, n] of Object.entries(r.bilan)) console.log(`  ${d.padEnd(14)} ${n}`);
  console.log(`\n  La bibliothèque porte ${r.bibliotheque.morceaux} morceaux, ${r.bibliotheque.sources} documents.`);
  await brain.end();
}
