// L'ESSAYEUR — du code trouvé sur GitHub, comparé à d'autres, essayé à part, avant d'entrer.
//
// Demande de Basile (25/09/2026) : que le cerveau aille sur GitHub, cherche, récupère un code
// analysé parmi d'autres, le choisisse selon des critères précis, le teste dans un bac à sable,
// et l'intègre pour s'étendre.
//
//   ① chercher      GitHub, plusieurs candidats pour un même besoin
//   ② rapatrier     en quarantaine (essais/), jamais dans le cerveau ; archive vérifiée avant ouverture
//   ③ inspecter     par le code : clés, scripts d'installation, binaires, lignes illisibles, tests, taille
//   ④ classer       sur des critères écrits (CRITERES) : certains éliminent, les autres notent
//   ⑤ essayer       tools/bac_a_sable.py, sur l'hôte : aucun réseau pendant les tests, aucune clé,
//                   disque en lecture seule, mémoire, processeur et durée bornés
//   ⑥ conclure      un rapport, et une proposition d'intégration (table demandes)
//
// L'INTÉGRATION n'est jamais faite ici. Tant que le Gardien n'existe pas, elle suit la zone 2 de la
// Constitution : le cerveau présente le lot, un « ok » de Basile vaut pour le lot.
//
//   node agents/essayeur.js chercher "<besoin>" [--langage javascript|python] [--max 4]
//   python3 tools/bac_a_sable.py essais/<id>          (sur l'hôte)
//   node agents/essayeur.js conclure essais/<id>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { noter } from './rechercheur.js';
import { verifier } from './installeur.js';

const ICI = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const ESSAIS = process.env.ESSAIS_DIR || path.join(ICI, '..', 'essais');
const H = { 'User-Agent': 'rAIme-essayeur/1.0 (+https://raime.fr)', Accept: 'application/vnd.github+json' };

export const LIMITES = { octetsMax: 5_000_000, fichiersMax: 600, ligneMax: 5000, dependancesMax: 20, moisMax: 24 };
export const LICENCES_OK = new Set(['mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'isc', 'mpl-2.0', 'unlicense', '0bsd']);

// ── Les critères, écrits une fois. Un critère « éliminatoire » écarte le candidat, quoi qu'il vaille ailleurs.
export const CRITERES = [
  { code: 'S1', eliminatoire: true, libelle: 'Aucune clé, aucune commande dangereuse, aucun binaire, aucune ligne illisible' },
  { code: 'S2', eliminatoire: true, libelle: 'Aucun script lancé à l’installation' },
  { code: 'L1', eliminatoire: true, libelle: 'Licence libre, sans contamination (MIT, Apache, BSD, ISC, MPL)' },
  { code: 'V1', eliminatoire: true, libelle: `Projet vivant : non archivé, modifié depuis moins de ${LIMITES.moisMax} mois` },
  { code: 'T1', eliminatoire: true, libelle: 'Des tests existent, et le langage sait être essayé ici (JavaScript, Python)' },
  { code: 'E1', eliminatoire: true, libelle: 'Les tests passent dans le bac à sable, sans réseau' },
  { code: 'A1', poids: 3, libelle: 'Répond au besoin (mots du besoin présents)' },
  { code: 'F1', poids: 2, libelle: 'Éprouvé par d’autres (étoiles)' },
  { code: 'D1', poids: 2, libelle: `Sobre : peu de dépendances (${LIMITES.dependancesMax} au plus)` },
  { code: 'R1', poids: 1, libelle: 'Récent' },
  { code: 'P1', poids: 1, libelle: 'Petit, donc relisable' },
];

const BINAIRE = /\.(exe|dll|so|dylib|bin|jar|class|pyc|wasm|node)$/i;
const IGNORES = new Set(['.git', 'node_modules', '.deps', '__pycache__']);
const TEXTE = /\.(js|mjs|cjs|ts|tsx|jsx|json|py|md|txt|yml|yaml|toml|cfg|ini|sh|html|css)$/i;

/** L'archive est lue avant d'être ouverte : aucun chemin qui remonte, aucun lien qui sort. */
export function archiveSure(listing) {
  const problemes = [];
  for (const ligne of String(listing).split('\n').filter(Boolean)) {
    const lien = ligne.match(/^l\S*\s.*?\s(\S+) -> (\S+)$/);
    const nom = lien ? lien[1] : ligne.trim().split(/\s+/).pop();
    if (/^\//.test(nom) || /(^|\/)\.\.(\/|$)/.test(nom)) problemes.push(`chemin hors du dossier : ${nom}`);
    if (lien && (/^\//.test(lien[2]) || /\.\./.test(lien[2]))) problemes.push(`lien vers l'extérieur : ${lien[1]} -> ${lien[2]}`);
  }
  return problemes;
}

function parcourir(dossier, racine = dossier, acc = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    if (IGNORES.has(e.name)) continue;
    const p = path.join(dossier, e.name);
    if (e.isSymbolicLink()) { acc.push({ chemin: path.relative(racine, p), lien: true, octets: 0 }); continue; }
    if (e.isDirectory()) parcourir(p, racine, acc);
    else acc.push({ chemin: path.relative(racine, p).split(path.sep).join('/'), octets: fs.statSync(p).size });
  }
  return acc;
}

/** Ce que le code montre de lui-même, sans jamais l'exécuter. */
export function inspecter(dossier) {
  const fichiers = parcourir(dossier);
  const f = { fichiers: fichiers.length, octets: fichiers.reduce((s, x) => s + x.octets, 0), dangers: [], binaires: [],
    lignesLongues: [], scriptsInstallation: [], dependances: 0, tests: false, langage: null, commandeTest: null };
  for (const x of fichiers) {
    const complet = path.join(dossier, x.chemin);
    if (BINAIRE.test(x.chemin)) { f.binaires.push(x.chemin); continue; }
    if (x.lien || !TEXTE.test(x.chemin) || x.octets > 400_000) continue;
    const t = fs.readFileSync(complet, 'utf8');
    if (/^\x7fELF|^MZ/.test(t.slice(0, 4))) f.binaires.push(x.chemin);
    const d = verifier(t);
    if (d) f.dangers.push(`${x.chemin} : ${d}`);
    if (!/\.min\.|lock|\.map$|\.json$|\.md$/.test(x.chemin) && t.split('\n').some((l) => l.length > LIMITES.ligneMax)) f.lignesLongues.push(x.chemin);
  }
  const pj = path.join(dossier, 'package.json');
  if (fs.existsSync(pj)) {
    let p = {}; try { p = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { f.dangers.push('package.json illisible'); }
    const s = p.scripts || {};
    f.scriptsInstallation = ['preinstall', 'install', 'postinstall', 'prepare'].filter((k) => s[k] && k !== 'prepare' || (k === 'prepare' && /curl|wget|node\s+\S+\.js/.test(s[k] || '')));
    f.dependances = Object.keys(p.dependencies || {}).length;
    f.langage = 'javascript';
    const t = s.test || '';
    if (t && !/no test specified/.test(t)) { f.tests = true; f.commandeTest = 'npm test'; }
  } else if (fichiers.some((x) => /(^|\/)(requirements\.txt|pyproject\.toml|setup\.py)$/.test(x.chemin))) {
    f.langage = 'python';
    const req = path.join(dossier, 'requirements.txt');
    f.dependances = fs.existsSync(req) ? fs.readFileSync(req, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).length : 0;
    f.tests = fichiers.some((x) => /(^|\/)(tests?\/|test_[^/]*\.py$|[^/]*_test\.py$)/.test(x.chemin));
    if (f.tests) f.commandeTest = 'python -m pytest -q -p no:cacheprovider';
  }
  return f;
}

/** La note, par le code. Renvoie les critères un par un, ce qui élimine, et la note sur 100. */
export function evaluer(candidat, faits, besoin, essai = null, maintenant = Date.now()) {
  const r = {};
  const piste = noter({ source: 'github', titre: candidat.nom, lien: candidat.lien, resume: candidat.description || '',
    licence: candidat.licence, maj: candidat.maj, popularite: candidat.etoiles, archive: candidat.archive }, besoin, maintenant);
  r.S1 = { ok: !faits.dangers.length && !faits.binaires.length && !faits.lignesLongues.length,
    pourquoi: [...faits.dangers, ...faits.binaires.map((b) => `binaire : ${b}`), ...faits.lignesLongues.map((l) => `ligne illisible : ${l}`)].join(' · ') || 'rien à signaler' };
  r.S2 = { ok: !faits.scriptsInstallation.length, pourquoi: faits.scriptsInstallation.join(', ') || 'aucun' };
  const l = String(candidat.licence || '').toLowerCase();
  r.L1 = { ok: LICENCES_OK.has(l), pourquoi: l || 'aucune licence' };
  const mois = candidat.maj ? (maintenant - new Date(candidat.maj).getTime()) / (30.44 * 86_400_000) : Infinity;
  r.V1 = { ok: !candidat.archive && mois <= LIMITES.moisMax, pourquoi: candidat.archive ? 'archivé' : `${Math.round(mois)} mois` };
  r.T1 = { ok: faits.tests && ['javascript', 'python'].includes(faits.langage), pourquoi: faits.tests ? faits.langage : 'aucun test' };
  r.E1 = essai ? { ok: essai.code === 0, pourquoi: essai.code === 0 ? `réussi en ${essai.duree} s` : `échec (code ${essai.code})` }
               : { ok: null, pourquoi: 'pas encore essayé' };
  r.A1 = { note: piste.notes.adequation };
  r.F1 = { note: Math.min(1, Math.log10(1 + (candidat.etoiles || 0)) / 3) };
  r.D1 = { note: faits.dependances > LIMITES.dependancesMax ? 0 : 1 - faits.dependances / (LIMITES.dependancesMax + 1) };
  r.R1 = { note: piste.notes.fraicheur };
  r.P1 = { note: faits.octets > LIMITES.octetsMax || faits.fichiers > LIMITES.fichiersMax ? 0 : 1 - faits.octets / LIMITES.octetsMax };
  const notes = CRITERES.filter((c) => c.poids);
  const note = Math.round(100 * notes.reduce((s, c) => s + c.poids * r[c.code].note, 0) / notes.reduce((s, c) => s + c.poids, 0));
  const elimine = CRITERES.filter((c) => c.eliminatoire && r[c.code].ok === false).map((c) => c.code);
  return { criteres: r, note, elimine };
}

/** Le classement : les candidats sans élimination d'abord, puis la note. */
export function classer(evalues) {
  return [...evalues].sort((a, b) => (a.eval.elimine.length > 0) - (b.eval.elimine.length > 0) || b.eval.note - a.eval.note);
}

/** Ce que le bac à sable doit lancer. L'installation ne lance jamais de script du candidat. */
export function planEssai(faits) {
  if (faits.langage === 'javascript') {
    return { image: 'node:20-alpine',
      installer: 'if [ -f package-lock.json ]; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi',
      tester: faits.commandeTest || 'npm test' };
  }
  if (faits.langage === 'python') {
    return { image: 'python:3.12-slim',
      installer: 'pip install --no-cache-dir --only-binary=:all: --target /code/.deps pytest $( [ -f requirements.txt ] && echo "-r requirements.txt" )',
      tester: `PYTHONPATH=/code/.deps:/code ${faits.commandeTest || 'python -m pytest -q -p no:cacheprovider'}` };
  }
  return null;
}

// ── Les appels au monde (GitHub) ────────────────────────────────────────────────────────────
async function json(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`GitHub ${r.status} sur ${url.replace('https://api.github.com', '')}`);
  return r.json();
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().slice(0, 40);

export async function chercher({ besoin, langage = null, max = 4, maintenant = Date.now() }) {
  const q = encodeURIComponent(`${besoin} archived:false${langage ? ` language:${langage}` : ''}`);
  const d = await json(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=12`);
  const candidats = (d.items || []).filter((x) => x.size * 1024 <= LIMITES.octetsMax).slice(0, max).map((x) => ({
    nom: x.full_name, lien: x.html_url, description: x.description, licence: x.license?.spdx_id?.toLowerCase() || null,
    maj: x.pushed_at, etoiles: x.stargazers_count, archive: x.archived, branche: x.default_branch }));
  const id = `${new Date(maintenant).toISOString().slice(0, 10)}-${slug(besoin)}`;
  const dossier = path.join(ESSAIS, id);
  fs.mkdirSync(path.join(dossier, 'candidats'), { recursive: true });
  const resultats = [];
  for (const c of candidats) {
    const ici = path.join(dossier, 'candidats', c.nom.replace('/', '--'));
    fs.mkdirSync(path.join(ici, 'code'), { recursive: true });
    try {
      const commit = await json(`https://api.github.com/repos/${c.nom}/commits/${c.branche}`);
      c.sha = commit.sha;
      const r = await fetch(`https://codeload.github.com/${c.nom}/tar.gz/${c.sha}`, { headers: { 'User-Agent': H['User-Agent'] } });
      if (!r.ok) throw new Error(`téléchargement ${r.status}`);
      const archive = path.join(ici, 'archive.tar.gz');
      fs.writeFileSync(archive, Buffer.from(await r.arrayBuffer()));
      const listing = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const pb = archiveSure(listing);
      if (pb.length) throw new Error(`archive refusée : ${pb.slice(0, 3).join(' ; ')}`);
      execFileSync('tar', ['-xzf', archive, '-C', path.join(ici, 'code'), '--strip-components=1', '--no-same-owner']);
      fs.unlinkSync(archive);
      const faits = inspecter(path.join(ici, 'code'));
      const ev = evaluer(c, faits, besoin, null, maintenant);
      const plan = ev.elimine.length ? null : planEssai(faits);
      fs.writeFileSync(path.join(ici, 'plan.json'), JSON.stringify({ candidat: c, faits, eval: ev, plan, bloque: !plan }, null, 1));
      resultats.push({ candidat: c, faits, eval: ev });
    } catch (e) {
      fs.writeFileSync(path.join(ici, 'plan.json'), JSON.stringify({ candidat: c, erreur: e.message, bloque: true }, null, 1));
      resultats.push({ candidat: c, erreur: e.message });
    }
  }
  fs.writeFileSync(path.join(dossier, 'essai.json'), JSON.stringify({ besoin, langage, id, cree_le: new Date(maintenant).toISOString() }, null, 1));
  return { id, dossier, resultats };
}

/** Après le bac à sable : la note finale, le rapport, la proposition d'intégration. */
export function conclure(dossier, maintenant = Date.now()) {
  const { besoin, id } = JSON.parse(fs.readFileSync(path.join(dossier, 'essai.json'), 'utf8'));
  const evalues = [];
  for (const nom of fs.readdirSync(path.join(dossier, 'candidats'))) {
    const ici = path.join(dossier, 'candidats', nom);
    const plan = JSON.parse(fs.readFileSync(path.join(ici, 'plan.json'), 'utf8'));
    if (plan.erreur) { evalues.push({ candidat: plan.candidat, erreur: plan.erreur, eval: { elimine: ['—'], note: 0, criteres: {} } }); continue; }
    const res = fs.existsSync(path.join(ici, 'resultat.json')) ? JSON.parse(fs.readFileSync(path.join(ici, 'resultat.json'), 'utf8')) : null;
    evalues.push({ candidat: plan.candidat, faits: plan.faits, essai: res, eval: evaluer(plan.candidat, plan.faits, besoin, res, maintenant) });
  }
  const liste = classer(evalues);
  const retenu = liste.find((x) => !x.eval.elimine.length && x.essai && x.essai.code === 0) || null;
  const L = [`# Essai de code : ${besoin}`, '', `Référence ${id}. ${liste.length} candidat(s) comparé(s) sur GitHub.`, '',
    '| Candidat | Note | Éliminé par | Essai | Licence | Étoiles |', '|---|---|---|---|---|---|'];
  for (const x of liste) {
    L.push(`| ${x.candidat.nom} | ${x.eval.note} | ${x.eval.elimine.join(', ') || '—'} | ${x.erreur ? x.erreur : x.eval.criteres.E1?.pourquoi || '—'} | ${x.candidat.licence || '—'} | ${x.candidat.etoiles ?? '—'} |`);
  }
  L.push('', '## Les critères', '');
  for (const c of CRITERES) L.push(`- **${c.code}** ${c.eliminatoire ? '(éliminatoire)' : `(poids ${c.poids})`} : ${c.libelle}`);
  L.push('', '## Décision', '');
  if (retenu) {
    L.push(`Retenu : **${retenu.candidat.nom}** (commit ${String(retenu.candidat.sha).slice(0, 7)}), ${retenu.eval.note}/100, tests réussis sans réseau.`,
      '', `Intégration proposée : le code entre dans \`extensions/${retenu.candidat.nom.split('/')[1]}/\` avec son origine (dépôt, commit, licence), puis passe le banc d'essai du cerveau. `
      + 'Elle attend le « ok » de Basile (zone 2 de la Constitution) tant que le Gardien n’existe pas.');
  } else {
    L.push('Aucun candidat retenu : aucun ne passe tous les critères éliminatoires. Le besoin reste ouvert.');
  }
  const rapport = L.join('\n');
  fs.writeFileSync(path.join(dossier, 'RAPPORT.md'), rapport, 'utf8');
  return { besoin, id, liste, retenu, rapport };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const [action, ...reste] = process.argv.slice(2);
  const opt = (n) => { const i = reste.indexOf(`--${n}`); return i > -1 ? reste[i + 1] : null; };
  if (action === 'chercher') {
    const besoin = reste.filter((x, i) => !x.startsWith('--') && !(i > 0 && reste[i - 1].startsWith('--'))).join(' ');
    const r = await chercher({ besoin, langage: opt('langage'), max: Number(opt('max') || 4) });
    console.log(`essai ${r.id} — ${r.resultats.length} candidat(s) rapatrié(s) en quarantaine :`);
    for (const x of r.resultats) console.log(`  ${x.candidat.nom.padEnd(40)} ${x.erreur ? `✗ ${x.erreur}` : `${x.eval.note}/100 ${x.eval.elimine.length ? `éliminé : ${x.eval.elimine.join(',')}` : 'à essayer'}`}`);
    console.log(`\nensuite, sur l'hôte : python3 tools/bac_a_sable.py essais/${r.id}`);
  } else if (action === 'conclure') {
    const r = conclure(path.resolve(reste[0]));
    console.log(r.rapport);
  } else {
    console.error('usage : node agents/essayeur.js chercher "<besoin>" [--langage javascript] | conclure essais/<id>');
    process.exit(1);
  }
}
