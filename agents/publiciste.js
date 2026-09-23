// AGENT PUBLICISTE — le calendrier de la semaine, prêt à partir. BROUILLONS SEULEMENT.
//
// Chaque semaine : neuf publications (LinkedIn, Facebook, Instagram, TikTok), un texte et
// un visuel en image fixe chacune, sans visage et sans vidéo, et la place prévue pour
// mesurer leurs résultats. Rien n'est publié : ce fichier ne contient aucun appel à un
// réseau social, et aucun compte n'existe encore. Basile publie, le jour où il le décide.
//
// Le modèle rédige ; le code relit (règle 6) : voix de la maison, aucun CPF, aucun chiffre
// qui ne vienne des offres publiées (publicite/offres.json), aucun prix hors celui du livre,
// le nom de Basile nulle part (règle 7), et les règles propres à chaque réseau.
//
//   node agents/publiciste.js            prépare la semaine prochaine
import fs from 'node:fs';
import path from 'node:path';
import { askJson, logRun } from './lib.js';
import { controlerVoix } from '../atelier/voix.js';

const PROMPT_VERSION = 'publiciste-v1';
const OFFRES = JSON.parse(fs.readFileSync(new URL('../publicite/offres.json', import.meta.url), 'utf8'));
const SORTIE = process.env.PUBLICITE_SORTIE || '/app/out/publicite';

// Le plan de la semaine : quel réseau, quel jour (1 = lundi). Neuf publications.
export const PLAN = [
  ['linkedin', 1], ['instagram', 1], ['facebook', 2], ['linkedin', 3], ['tiktok', 3],
  ['instagram', 4], ['facebook', 5], ['linkedin', 5], ['tiktok', 6],
];

// Les règles de chaque réseau, vérifiées par le code. Formats d'image : 1080 × 1350 (portrait
// 4:5) pour le fil, 1080 × 1920 (9:16) pour TikTok en mode photo.
export const RESEAUX = {
  linkedin:  { min: 300, max: 1300, dieses: [0, 3], lien: true,  image: [1080, 1350] },
  facebook:  { min: 150, max: 800,  dieses: [0, 3], lien: true,  image: [1080, 1350] },
  instagram: { min: 150, max: 1000, dieses: [3, 8], lien: false, image: [1080, 1350] },
  tiktok:    { min: 80,  max: 300,  dieses: [3, 5], lien: false, image: [1080, 1920] },
};

const SYSTEME = `Tu prépares le calendrier de publications de la semaine pour rAIme, conseil en intelligence artificielle.
Tu ne publies rien : ce sont des brouillons. Chaque publication part d'UNE offre de la liste fournie, et n'affirme
rien d'autre que ce que l'offre dit. Voix de la maison : français courant, le lecteur d'abord, aucun « je », aucune
tournure négative (ne… pas, aucun, jamais…), peu de jargon, aucun prix sauf celui du livre, aucun chiffre absent de l'offre,
aucun nom de personne, aucune mention du CPF.
Règles par réseau : linkedin 300 à 1300 caractères, 0 à 3 mots-dièse, lien raime.fr permis ; facebook 150 à 800,
0 à 3 mots-dièse, lien permis ; instagram 150 à 1000, 3 à 8 mots-dièse, aucun lien (écrire « lien en bio ») ;
tiktok 80 à 300, 3 à 5 mots-dièse, aucun lien.
Pour chaque publication, un visuel en image fixe : un titre de 60 caractères au plus et une ligne de 80 au plus,
posés sur la charte de rAIme — aucun visage, aucune photo, aucune vidéo.
Réponds en JSON : {"publications":[{"reseau":"linkedin","jour":1,"offre":"clé de l'offre","texte":"...",
"visuel":{"titre":"...","ligne":"..."}}]} — exactement les publications demandées, dans l'ordre.`;

// ── Le code relit ──────────────────────────────────────────────────────────
function nombresPermis() {
  const permis = new Set();
  for (const o of OFFRES.offres) for (const n of JSON.stringify(o).match(/\d+/g) || []) permis.add(n);
  return permis;
}

export function relirePublication(p) {
  const fautes = [];
  const r = RESEAUX[p?.reseau];
  if (!r) return [`réseau inconnu : ${p?.reseau}`];
  const offre = OFFRES.offres.find((o) => o.cle === p.offre);
  if (!offre) fautes.push(`offre inconnue : ${p.offre}`);
  const t = String(p.texte || '');
  if (t.length < r.min || t.length > r.max) fautes.push(`${p.reseau} : ${t.length} caractères (${r.min} à ${r.max})`);
  const dieses = (t.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  if (dieses < r.dieses[0] || dieses > r.dieses[1]) fautes.push(`${p.reseau} : ${dieses} mots-dièse (${r.dieses[0]} à ${r.dieses[1]})`);
  const liens = t.match(/https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(fr|com|io)\b/gi) || [];
  if (!r.lien && liens.length) fautes.push(`${p.reseau} : lien interdit dans le texte (${liens[0]})`);
  if (liens.some((l) => !/^(https?:\/\/)?(www\.)?raime\.fr\/?/i.test(l))) fautes.push(`lien étranger : ${liens.find((l) => !/raime\.fr/i.test(l))}`);
  const tout = `${t}\n${p.visuel?.titre || ''}\n${p.visuel?.ligne || ''}`;
  fautes.push(...controlerVoix(tout));
  if (/Basile/i.test(tout)) fautes.push('le nom de Basile paraît hors d’une obligation légale');
  const permis = nombresPermis();
  const inventes = [...new Set((tout.match(/\d+/g) || []).filter((n) => !permis.has(n)))];
  if (inventes.length) fautes.push(`chiffres absents des offres : ${inventes.join(', ')}`);
  const prix = tout.match(/\d[\d\s]*(?:[.,]\d+)?\s*(?:€|euros?)/gi) || [];
  if (prix.some((x) => x.replace(/\s/g, '') !== '19€') || (prix.length && p.offre !== 'livre'))
    fautes.push(`prix hors du livre : ${prix.join(', ')}`);
  if (!p.visuel?.titre || p.visuel.titre.length > 60) fautes.push('visuel : titre absent ou plus de 60 caractères');
  if (p.visuel?.ligne && p.visuel.ligne.length > 80) fautes.push('visuel : ligne de plus de 80 caractères');
  return fautes;
}

// ── Le visuel : une image fixe, du texte sur la charte rose, aucun visage par construction ──
const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function couper(texte, largeur) {
  const lignes = []; let l = '';
  for (const m of String(texte).split(/\s+/)) {
    if ((l + ' ' + m).trim().length > largeur && l) { lignes.push(l); l = m; } else l = (l + ' ' + m).trim();
  }
  if (l) lignes.push(l);
  return lignes;
}
export function visuelSvg({ titre, ligne }, [w, h]) {
  const titreLignes = couper(titre, 16);
  const y0 = Math.round(h * 0.38);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6e5569"/><stop offset=".38" stop-color="#8c7187"/><stop offset=".7" stop-color="#ab8fa4"/><stop offset="1" stop-color="#cfa9ba"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#f)"/>
<text x="96" y="140" font-family="Inter, sans-serif" font-size="44" font-weight="650" fill="#ffffff">rAIme</text>
${titreLignes.map((l, i) => `<text x="96" y="${y0 + i * 104}" font-family="Inter, sans-serif" font-size="92" font-weight="650" letter-spacing="-3" fill="#ffffff">${echapper(l)}</text>`).join('\n')}
${couper(ligne || '', 34).map((l, i) => `<text x="96" y="${y0 + titreLignes.length * 104 + 40 + i * 54}" font-family="Inter, sans-serif" font-size="40" fill="#f6d3dc">${echapper(l)}</text>`).join('\n')}
<text x="96" y="${h - 110}" font-family="Inter, sans-serif" font-size="34" fill="#f2e8ee">raime.fr</text>
</svg>
`;
}

// ── La base : les brouillons et la place de leurs mesures ───────────────────
async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS publications (
      id              bigserial PRIMARY KEY,
      semaine         date NOT NULL,
      jour            date NOT NULL,
      reseau          text NOT NULL CHECK (reseau IN ('linkedin','facebook','instagram','tiktok')),
      offre           text NOT NULL,
      texte           text NOT NULL,
      visuel_titre    text,
      visuel_fichier  text,
      statut          text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','publie','abandonne')),
      publie_le       timestamptz,
      adresse         text,
      -- mesures, saisies une fois la publication faite (à 48 heures puis à 7 jours)
      impressions     int, reactions int, commentaires int, partages int, clics int, abonnes_gagnes int,
      mesure_le       timestamptz,
      cree_le         timestamptz NOT NULL DEFAULT now(),
      UNIQUE (jour, reseau)
    )`);
  await brain.query(`
    CREATE OR REPLACE VIEW publications_mesure AS
    SELECT reseau, offre, count(*) FILTER (WHERE statut = 'publie') AS publiees,
           sum(impressions) AS impressions,
           round(100.0 * sum(coalesce(reactions,0) + coalesce(commentaires,0) + coalesce(partages,0))
                 / nullif(sum(impressions), 0), 2) AS engagement_pct,
           round(100.0 * sum(clics) / nullif(sum(impressions), 0), 2) AS clics_pct,
           sum(abonnes_gagnes) AS abonnes_gagnes
    FROM publications GROUP BY reseau, offre`);
}

// Le lundi de la semaine prochaine (UTC).
export function lundiSuivant(maintenant = new Date()) {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d;
}
const jourIso = (lundi, n) => new Date(lundi.getTime() + (n - 1) * 86400000).toISOString().slice(0, 10);

export async function preparerSemaine({ brain, maintenant = new Date() }) {
  await schema(brain);
  const lundi = lundiSuivant(maintenant);
  const semaine = lundi.toISOString().slice(0, 10);
  const { rows: [deja] } = await brain.query(`SELECT count(*)::int n FROM publications WHERE semaine = $1`, [semaine]);
  if (deja.n) return { semaine, prepares: 0, motif: 'semaine déjà préparée', fautes: [] };

  const demande = `OFFRES PUBLIÉES :\n${JSON.stringify(OFFRES.offres)}\n\nPUBLICATIONS DEMANDÉES, dans l'ordre :\n`
    + PLAN.map(([r, j], i) => `${i + 1}. ${r}, jour ${j}`).join('\n');
  let pubs = [], fautes = [], cout = 0, meta = null;
  for (let essai = 1; essai <= 2; essai++) {
    const r = await askJson({ task: 'redaction', system: SYSTEME, maxTokens: 6000,
      user: essai === 1 ? demande : `${demande}\n\nPUBLICATIONS REFUSÉES À RÉÉCRIRE :\n- ${fautes.join('\n- ')}` });
    cout += r.meta?.costUsd || 0; meta = r.meta;
    pubs = Array.isArray(r.data?.publications) ? r.data.publications.slice(0, PLAN.length) : [];
    fautes = pubs.length === PLAN.length ? [] : [`${pubs.length} publications au lieu de ${PLAN.length}`];
    pubs.forEach((p, i) => {
      if (p.reseau !== PLAN[i][0]) fautes.push(`n° ${i + 1} : ${p.reseau} au lieu de ${PLAN[i][0]}`);
      for (const f of relirePublication(p)) fautes.push(`n° ${i + 1} (${p.reseau}) : ${f}`);
    });
    if (!fautes.length) break;
  }

  // Seules les publications sans faute deviennent des brouillons ; les autres sont nommées au journal.
  const dossier = path.join(SORTIE, semaine);
  fs.mkdirSync(dossier, { recursive: true });
  const gardees = [];
  for (let i = 0; i < pubs.length; i++) {
    const p = pubs[i];
    if (p.reseau !== PLAN[i][0] || relirePublication(p).length) continue;
    const jour = jourIso(lundi, PLAN[i][1]);
    const fichier = `${jour}-${p.reseau}.svg`;
    fs.writeFileSync(path.join(dossier, fichier), visuelSvg(p.visuel, RESEAUX[p.reseau].image));
    await brain.query(`INSERT INTO publications(semaine, jour, reseau, offre, texte, visuel_titre, visuel_fichier)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (jour, reseau) DO NOTHING`,
      [semaine, jour, p.reseau, p.offre, p.texte, p.visuel.titre, path.join(semaine, fichier)]);
    gardees.push({ ...p, jour, fichier });
  }
  fs.writeFileSync(path.join(dossier, 'CALENDRIER.md'), `# Calendrier de la semaine du ${semaine} — brouillons\n\n`
    + 'Rien n’est publié. Chaque publication attend la décision de Basile.\n\n'
    + gardees.map((p) => `## ${p.jour} · ${p.reseau}\n\nVisuel : \`${p.fichier}\` — ${p.visuel.titre}\n\n${p.texte}\n`).join('\n'));

  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['publiciste', `${gardees.length} brouillon(s) pour la semaine du ${semaine}`,
     fautes.length ? `refusées : ${fautes.slice(0, 6).join(' · ')}`.slice(0, 500) : 'toutes conformes'].map(String));
  await logRun(brain, { agent: 'publiciste', task: 'redaction', model: meta?.model, tokensIn: meta?.tokensIn || 0,
    tokensOut: meta?.tokensOut || 0, costUsd: cout, ms: null, status: gardees.length ? 'ok' : 'echec', promptVersion: PROMPT_VERSION });
  return { semaine, prepares: gardees.length, fautes, cout, dossier };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const r = await preparerSemaine({ brain });
  console.log(`[publiciste] semaine du ${r.semaine} : ${r.prepares} brouillon(s)${r.motif ? ` — ${r.motif}` : ''}`);
  if (r.fautes.length) console.log('  refusées :\n  - ' + r.fautes.join('\n  - '));
  await brain.end();
}
