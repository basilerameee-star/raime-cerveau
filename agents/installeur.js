// AGENT INSTALLEUR — il va chercher des compétences là où elles existent, et les pose
// en quarantaine. Jamais en service tout seul.
//
// POURQUOI LA QUARANTAINE : une compétence, c'est un texte qui dicte une conduite. Un
// dépôt public peut en publier une qui détourne le travail — exfiltrer un secret, écrire
// ailleurs, contourner une limite. Un code tiers installé d'office, c'est la porte grande
// ouverte. L'installeur lit, vérifie, range à part, et écrit ce qu'il a trouvé. La mise
// en service reste un geste humain.
//
//   node agents/installeur.js <proprietaire/depot> [chemin]
//   node agents/installeur.js anthropics/skills
//
// Ce qu'il retient : les fichiers SKILL.md (avec leur en-tête nom + description) et les
// consignes en Markdown. Ce qu'il refuse : tout fichier exécutable, tout fichier lourd,
// tout texte qui porte une clé ou une adresse de commande.
import fs from 'node:fs';
import path from 'node:path';

const ICI = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const QUARANTAINE = process.env.INSTALLEUR_QUARANTAINE || path.join(ICI, '..', 'competences-candidates')   // hors du plugin : rien ne se charge par accident;
const ENTETES = { 'User-Agent': 'rAIme-installeur/1.0 (+https://raime.fr)', Accept: 'application/vnd.github+json' };
const TAILLE_MAX = 120_000;

// Ce qui fait refuser un fichier, quoi qu'il raconte de lui-même.
const REFUS = [
  [/\b(sk-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{12,})\b/, 'porte une clé'],
  [/\bcurl\s+[^|\n]*\|\s*(ba)?sh\b/, 'télécharge et exécute un script'],
  [/\b(rm\s+-rf\s+\/|mkfs|dd\s+if=)/, 'contient une commande destructrice'],
  [/(\.onion\b|pastebin\.com\/raw|ngrok\.io)/, 'pointe vers un dépôt de commande anonyme'],
];

async function api(url) {
  const r = await fetch(url, { headers: ENTETES });
  if (!r.ok) throw new Error(`GitHub ${r.status} sur ${url.replace('https://api.github.com', '')}`);
  return r.json();
}

// L'en-tête d'une compétence : un nom, une description. Sans eux, ce n'est pas une compétence.
function entete(texte) {
  const m = texte.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const nom = (m[1].match(/^name:\s*(.+)$/m) || [])[1];
  const desc = (m[1].match(/^description:\s*(.+)$/m) || [])[1];
  return nom ? { nom: nom.trim().replace(/^["']|["']$/g, ''), description: (desc || '').trim() } : null;
}

function verifier(texte) {
  for (const [motif, raison] of REFUS) if (motif.test(texte)) return raison;
  return null;
}

export async function installer({ depot, chemin = '', brain = null, max = 12 }) {
  const branche = (await api(`https://api.github.com/repos/${depot}`)).default_branch;
  const arbre = await api(`https://api.github.com/repos/${depot}/git/trees/${branche}?recursive=1`);

  const candidats = (arbre.tree || [])
    .filter((f) => f.type === 'blob' && f.size && f.size < TAILLE_MAX)
    .filter((f) => /SKILL\.md$/i.test(f.path) || /(^|\/)(prompts?|skills?|instructions?)\/.+\.md$/i.test(f.path))
    .filter((f) => f.path.startsWith(chemin))
    .slice(0, max);

  fs.mkdirSync(QUARANTAINE, { recursive: true });
  const poses = [], refuses = [];

  for (const f of candidats) {
    const brut = `https://raw.githubusercontent.com/${depot}/${branche}/${f.path}`;
    let texte;
    try { texte = await (await fetch(brut, { headers: { 'User-Agent': ENTETES['User-Agent'] } })).text(); }
    catch (e) { refuses.push({ chemin: f.path, raison: `illisible : ${e.message}` }); continue; }

    const danger = verifier(texte);
    if (danger) { refuses.push({ chemin: f.path, raison: danger }); continue; }

    const tete = entete(texte);
    // Une compétence se reconnaît à son en-tête. Un fichier d'exemples ou d'annexe
    // reste de la documentation : il va dans la bibliothèque, jamais dans les compétences.
    if (!tete && !/SKILL\.md$/i.test(f.path)) {
      refuses.push({ chemin: f.path, raison: 'sans en-tête de compétence (nom, description)' });
      continue;
    }
    const nom = (tete?.nom || path.basename(path.dirname(f.path)) || path.basename(f.path, '.md'))
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    const dossier = path.join(QUARANTAINE, `${depot.split('/')[1]}--${nom}`);
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, 'SKILL.md'),
      `<!-- Rapporté par l'installeur le ${new Date().toISOString().slice(0, 10)} depuis ${brut} -->\n` +
      `<!-- EN QUARANTAINE : à lire avant toute mise en service. -->\n${texte}`, 'utf8');
    poses.push({ nom, chemin: f.path, taille: f.size, decrite: Boolean(tete?.description) });
  }

  if (brain) {
    for (const p of poses) {
      await brain.query(
        `INSERT INTO candidats (domaine, identifiant, titre, source, donnees, nature, verdict, motif)
         VALUES ('competence', $1, $2, $3, $4, 'jugement', 'en_attente', $5)
         ON CONFLICT (domaine, identifiant) DO UPDATE SET vu_le = now()`,
        [`${depot}:${p.nom}`, `Compétence rapportée : ${p.nom}`, depot,
         JSON.stringify({ chemin: p.chemin, taille: p.taille }),
         'En quarantaine. Lecture humaine exigée avant mise en service.']);
    }
    await brain.query(
      `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['installeur', `${poses.length} compétence(s) en quarantaine depuis ${depot}`,
       refuses.length ? `Refusées : ${refuses.map((r) => `${r.chemin} (${r.raison})`).join(' · ')}` : 'Aucun refus.']);
  }

  return { depot, branche, poses, refuses, quarantaine: QUARANTAINE };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('installeur.js')) {
  const depot = process.argv[2];
  if (!depot) { console.log('usage : node agents/installeur.js <proprietaire/depot> [chemin]'); process.exit(0); }
  let brain = null;
  if (process.env.DATABASE_URL) {
    const { db } = await import('./lib.js');
    brain = db(); await brain.connect();
  }
  const r = await installer({ depot, chemin: process.argv[3] || '', brain });
  console.log(`\n╔══ ${r.poses.length} compétence(s) en quarantaine · ${r.refuses.length} refus ══╗\n`);
  for (const p of r.poses) console.log(`  ✓ ${p.nom.padEnd(34)} ${p.chemin}`);
  for (const x of r.refuses) console.log(`  ✗ ${x.chemin} — ${x.raison}`);
  console.log(`\n  Dossier : ${r.quarantaine}`);
  if (brain) await brain.end();
}
