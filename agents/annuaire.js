// AGENT ANNUAIRE — il donne à Basile les numéros pour décrocher son téléphone.
//
// OpenStreetMap ne couvrait que les enseignes nationales : 2 numéros sur 64. Mais 143 de
// nos cibles ont un site web, et un cabinet affiche toujours son téléphone sur sa page
// contact ou ses mentions légales — c'est même une obligation légale pour ces dernières.
// On visite donc les mêmes pages que le Fureteur, pour en extraire autre chose.
//
// Précautions déterministes, dans l'ordre d'importance :
//   ① on ne retient QUE les formats français valides, jamais une suite de chiffres
//   ② on écarte les numéros de fax, explicitement signalés dans la page
//   ③ on préfère le fixe local (04) au mobile : on appelle un cabinet, pas une personne
//   ④ on écarte les numéros surtaxés (08) et les numéros trop répétitifs (gabarits)
import pg from 'pg';

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
};
const PAGES = ['', '/contact', '/mentions-legales', '/nous-contacter'];
const TIMEOUT = 9000;
const PARALLELE = 6;

async function page(url) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal, redirect: 'follow' });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('html')) return null;
    return (await r.text()).slice(0, 400000);
  } catch { return null; } finally { clearTimeout(t); }
}

// Normalise vers 0XXXXXXXXX, ou null si ce n'est pas un numéro français plausible.
function normaliser(brut) {
  let c = String(brut).replace(/[^\d+]/g, '');
  if (c.startsWith('0033')) c = '+33' + c.slice(4);
  if (c.startsWith('+33')) c = '0' + c.slice(3);
  if (!/^0[1-9]\d{8}$/.test(c)) return null;
  if (c.startsWith('08')) return null;                 // surtaxé
  if (/^(\d)\1{8}$/.test(c.slice(1))) return null;     // 0111111111 : gabarit de démonstration
  if (/^0[1-9]0{8}$/.test(c)) return null;
  // Numeros de demonstration sequentiels : 06 12 34 56 78, 01 23 45 67 89.
  if ('0123456789'.includes(c.slice(1)) || '9876543210'.includes(c.slice(1))) return null;
  return c;
}

// Un numéro précédé de « fax » dans les 40 caractères qui le précèdent n'est pas un contact.
function estFax(html, index) {
  const avant = html.slice(Math.max(0, index - 60), index).toLowerCase();
  return /fax|t[ée]l[ée]copie/.test(avant);
}

export function extraire(html) {
  const texte = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const trouves = new Map();

  // Deux passes : les liens tel: sont les plus fiables, le texte vient ensuite.
  const reTel = /href=["']tel:([+0-9 .\-()]{8,20})["']/gi;
  let m;
  while ((m = reTel.exec(texte))) {
    const n = normaliser(m[1]);
    if (n && !trouves.has(n)) trouves.set(n, { numero: n, source: 'lien tel:', poids: 3 });
  }

  const reTexte = /(?:\+33|0033|0)\s?[1-9](?:[\s.\-]?\d{2}){4}/g;
  while ((m = reTexte.exec(texte))) {
    const n = normaliser(m[0]);
    if (!n) continue;
    if (estFax(texte, m.index)) continue;
    if (!trouves.has(n)) trouves.set(n, { numero: n, source: 'texte', poids: 1 });
  }

  // Classement : lien tel: d'abord, puis fixe local 04, puis autres fixes, puis mobile.
  const rang = (t) => t.poids * 10
    + (t.numero.startsWith('04') ? 5 : 0)
    + (/^0[1235]/.test(t.numero) ? 3 : 0)
    + (/^09/.test(t.numero) ? 1 : 0);
  return [...trouves.values()].sort((a, b) => rang(b) - rang(a))[0] || null;
}

async function traiter(p) {
  let site = String(p.website || '').trim();
  if (!site) return null;
  if (!/^https?:\/\//.test(site)) site = 'https://' + site;
  const base = site.replace(/(https?:\/\/[^/]+).*/, '$1');

  for (const chemin of PAGES) {
    const html = await page(base + chemin);
    if (!html) continue;
    const t = extraire(html);
    if (t) return { siren: p.siren, ...t, page: base + chemin };
  }
  return null;
}

export async function annuaire({ n8n, brain, limite = 200 }) {
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS telephone text');
  await n8n.query('ALTER TABLE prospects ADD COLUMN IF NOT EXISTS telephone_source text');

  const { rows: cibles } = await n8n.query(`
    SELECT siren, name, website FROM prospects
    WHERE departement = '74' AND effectif_est >= 10 AND telephone IS NULL
      AND website IS NOT NULL AND website <> ''
      AND sector IN ('Cabinets comptables','Cabinets d avocats','Cabinets de conseil',
                     'Organismes de formation','CCI')
    ORDER BY effectif_est DESC LIMIT $1`, [limite]);

  const bilan = { examines: cibles.length, trouves: 0, fixes: 0, mobiles: 0, echecs: 0 };

  for (let i = 0; i < cibles.length; i += PARALLELE) {
    const lot = cibles.slice(i, i + PARALLELE);
    const res = await Promise.all(lot.map((p) => traiter(p).catch(() => null)));
    for (const r of res) {
      if (!r) { bilan.echecs++; continue; }
      await n8n.query('UPDATE prospects SET telephone=$2, telephone_source=$3 WHERE siren=$1',
        [r.siren, r.numero, `site (${r.source})`]);
      bilan.trouves++;
      if (/^0[1-59]/.test(r.numero)) bilan.fixes++; else bilan.mobiles++;
    }
  }

  // ── PURGE DES NUMEROS DE GABARIT ───────────────────────────────────────────
  // Un numero qui apparait chez PLUSIEURS cabinets n'est le numero d'AUCUN : c'est un
  // pied de page de plateforme web ou un standard national. Sans cette regle, 23 cabinets
  // haut-savoyards se voyaient attribuer le meme numero martiniquais, et 13 etudes
  // notariales le standard du notariat parisien.
  const { rows: doublons } = await n8n.query(`
    SELECT telephone, count(*)::int AS n FROM prospects
    WHERE telephone IS NOT NULL GROUP BY telephone HAVING count(*) > 1`);
  let purges = 0;
  for (const d of doublons) {
    const { rowCount } = await n8n.query(
      'UPDATE prospects SET telephone=NULL, telephone_source=NULL WHERE telephone=$1', [d.telephone]);
    purges += rowCount;
  }
  // ── PURGE GEOGRAPHIQUE ─────────────────────────────────────────────────────
  // Un cabinet de Haute-Savoie ne repond pas sur un indicatif des Pyrenees. Un numero
  // dont l'indicatif ne correspond pas a la region vient d'ailleurs sur la page :
  // partenaire, siege national, prestataire. On ne le livre pas.
  const { rowCount: horsZone } = await n8n.query(`
    UPDATE prospects SET telephone = NULL, telephone_source = NULL
    WHERE departement = '74' AND telephone IS NOT NULL
      AND left(telephone, 2) NOT IN ('06','07','09')
      AND left(telephone, 3) NOT IN ('045','047')`);
  bilan.purges_geographiques = horsZone;
  bilan.trouves -= horsZone;

  bilan.purges_gabarit = purges;
  bilan.numeros_gabarit = doublons.length;
  bilan.trouves -= purges;

  await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)',
    ['annuaire', `${bilan.trouves} téléphones extraits sur ${bilan.examines} sites examinés`,
     'OSM ne couvrait que les enseignes nationales (2 sur 64). Les sites des cabinets, eux, affichent leur numéro — les mentions légales y obligent. Numéros de fax et surtaxés écartés, fixe local préféré au mobile.']);

  return bilan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const b = await annuaire({ n8n, brain });
    console.log(`\n╔══ ANNUAIRE ══╗\n`);
    console.log(`  sites examinés   : ${b.examines}`);
    console.log(`  numéros trouvés  : ${b.trouves}  (${b.fixes} fixes · ${b.mobiles} mobiles)`);
    console.log(`  sans numéro      : ${b.echecs}`);
    console.log(`  purgés (hors zone): ${b.purges_geographiques} indicatifs incompatibles avec la région`);
    console.log(`  purgés (gabarits): ${b.purges_gabarit} numéros partagés entre plusieurs cabinets (${b.numeros_gabarit} numéros distincts)`);
    const { rows } = await n8n.query(
      `SELECT count(*)::int n FROM prospects WHERE telephone IS NOT NULL AND departement='74'`);
    console.log(`\n  cibles appelables en Haute-Savoie : ${rows[0].n}\n`);
  } finally { await brain.end(); await n8n.end(); }
}
