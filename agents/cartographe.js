// AGENT CARTOGRAPHE — il donne à Basile ce qui lui manque pour décrocher son téléphone.
//
// Construit après avoir TESTÉ OpenStreetMap comme source d'adresses courriel : 9 sur 76,
// 12 % de rendement. Mauvaise source pour ce que je cherchais. Mais 34 téléphones sur 76,
// et 27 sites — or le plan d'attaque note que les numéros manquent à la liste d'appels,
// et le Fureteur enrichit dix fois plus vite quand il connaît déjà le site.
//
// La leçon, et elle vaut d'être écrite : une source ne se juge pas bonne ou mauvaise
// dans l'absolu. Elle se juge sur ce qu'elle livre réellement. J'ai failli l'écarter
// parce qu'elle échouait à la mission que je lui avais assignée d'avance.
//
// Aucun modèle n'intervient. Rapprochement par jetons de nom et ville, seuil strict :
// mieux vaut ne pas rapprocher que rapprocher à tort — un mauvais numéro coûte un appel
// perdu et une crédibilité entamée.
import pg from 'pg';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const BBOX_74 = '45.68,5.80,46.41,7.05';   // Haute-Savoie
const TYPES = ['accountant', 'lawyer', 'notary', 'tax_advisor', 'consulting', 'educational_institution'];

// Mots qui n'aident jamais à identifier un cabinet : on ne rapproche pas dessus.
const VIDES = new Set(['cabinet', 'societe', 'société', 'sarl', 'sas', 'sa', 'scp', 'selarl', 'selas',
  'associes', 'associés', 'et', 'de', 'du', 'des', 'la', 'le', 'les', 'office', 'etude', 'étude',
  'expert', 'experts', 'comptable', 'comptables', 'avocat', 'avocats', 'notaire', 'notaires',
  'conseil', 'conseils', 'groupe', 'maitre', 'maître']);

const jetons = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  .split(' ').filter((m) => m.length > 2 && !VIDES.has(m));

const telNormalise = (t) => {
  const c = String(t || '').replace(/[^\d+]/g, '');
  if (/^\+33\d{9}$/.test(c)) return '0' + c.slice(3);
  if (/^0\d{9}$/.test(c)) return c;
  return null;
};

async function interroger(type) {
  const q = `[out:json][timeout:25];nwr["office"="${type}"](${BBOX_74});out tags center;`;
  const r = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
               'User-Agent': 'raime-cartographe/1.0 (cabinet conseil; contact@raime.fr)' },
    body: 'data=' + encodeURIComponent(q),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return (d.elements || []).map((e) => {
    const t = e.tags || {};
    return {
      nom: t.name || t['operator'] || null,
      ville: t['addr:city'] || null,
      telephone: telNormalise(t.phone || t['contact:phone']),
      site: t.website || t['contact:website'] || null,
      courriel: t.email || t['contact:email'] || null,
    };
  }).filter((x) => x.nom && (x.telephone || x.site || x.courriel));
}

export async function cartographier({ n8n, brain }) {
  // Colonne ajoutée si absente : le téléphone n'existait nulle part dans la base.
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS telephone text');
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS telephone_source text');

  // On ne cible que les prospects susceptibles d'être appelés : Haute-Savoie, 20 salariés et plus.
  const { rows: cibles } = await n8n.query(`
    SELECT siren, name, city, website, telephone
    FROM prospects
    WHERE departement = '74' AND effectif_est >= 20`);

  const index = cibles.map((c) => ({ ...c, jetons: jetons(c.name), ville: String(c.city || '').toLowerCase() }));

  const bilan = { interroges: 0, etablissements: 0, telephones: 0, sites: 0, courriels: 0, ambigus: 0, sources: [] };

  for (const type of TYPES) {
    try {
      const lieux = await interroger(type);
      bilan.interroges++;
      bilan.etablissements += lieux.length;
      bilan.sources.push(`${type} : ${lieux.length}`);

      for (const l of lieux) {
        const jl = jetons(l.nom);
        if (!jl.length) continue;

        // Rapprochement strict : au moins deux jetons communs, ou un seul s'il est long
        // et que la ville concorde. En dessous, on renonce — un faux positif coûte plus
        // qu'un numéro manquant.
        const candidats = index.map((c) => {
          const communs = c.jetons.filter((m) => jl.includes(m));
          const memeVille = l.ville && c.ville && c.ville.includes(String(l.ville).toLowerCase());
          const score = communs.length + (memeVille ? 0.5 : 0)
            + (communs.some((m) => m.length >= 6) ? 0.5 : 0);
          return { c, communs: communs.length, score };
        }).filter((x) => x.communs >= 2 || (x.communs === 1 && x.score >= 2));

        if (!candidats.length) continue;
        candidats.sort((a, b) => b.score - a.score);
        // Deux candidats à égalité = ambiguïté. On ne devine pas.
        if (candidats.length > 1 && candidats[0].score === candidats[1].score) { bilan.ambigus++; continue; }

        const p = candidats[0].c;
        if (l.telephone && !p.telephone) {
          await n8n.query('UPDATE prospects SET telephone=$2, telephone_source=$3 WHERE siren=$1',
            [p.siren, l.telephone, 'openstreetmap']);
          bilan.telephones++;
        }
        if (l.site && !p.website) {
          await n8n.query('UPDATE prospects SET website=$2 WHERE siren=$1', [p.siren, l.site]);
          bilan.sites++;
        }
        if (l.courriel && /@/.test(l.courriel)) {
          const { rowCount } = await n8n.query(
            "UPDATE prospects SET contact_email=$2 WHERE siren=$1 AND contact_email IS NULL", [p.siren, l.courriel]);
          bilan.courriels += rowCount;
        }
      }
    } catch (e) {
      bilan.sources.push(`${type} : ÉCHEC ${String(e.message).slice(0, 60)}`);
      await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)',
        ['cartographe', `Interrogation OSM en échec : ${type}`, String(e.message).slice(0, 200)]);
    }
    await new Promise((r) => setTimeout(r, 3000));   // Overpass est un bien commun : on ne le martèle pas.
  }

  if (bilan.telephones || bilan.sites || bilan.courriels) {
    await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)',
      ['cartographe', `OSM : ${bilan.telephones} téléphone(s), ${bilan.sites} site(s), ${bilan.courriels} courriel(s)`,
       'Source testée avant usage : 12 % de rendement en courriels — mauvaise source pour cela. 45 % en téléphones — bonne source pour la liste d appels.']);
  }
  return bilan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const b = await cartographier({ n8n, brain });
    console.log(`\n╔══ CARTOGRAPHE ══╗\n`);
    b.sources.forEach((s) => console.log(`  ${s}`));
    console.log(`\n  ${b.etablissements} établissements examinés`);
    console.log(`  téléphones ajoutés : ${b.telephones}`);
    console.log(`  sites ajoutés      : ${b.sites}   (le Fureteur ira dix fois plus vite dessus)`);
    console.log(`  courriels ajoutés  : ${b.courriels}`);
    console.log(`  rapprochements refusés pour ambiguïté : ${b.ambigus}\n`);
    const { rows } = await n8n.query(
      "SELECT count(*)::int n FROM prospects WHERE telephone IS NOT NULL");
    console.log(`  prospects joignables par téléphone : ${rows[0].n}\n`);
  } finally { await brain.end(); await n8n.end(); }
}
