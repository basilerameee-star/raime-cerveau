// MISSION COMPLÈTE — une seule commande, du devis reçu au rapport client.
// Analyste → Auditeur → Contradicteur → Rédacteur (déterministe) → markdown
//
// node agents/mission.js <fichier> --client "Nom" [--secteur "..."] [--taille "..."] [--contexte "..."]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { db } from './lib.js';
import { analyser } from './analyste.js';
import { auditer } from './auditeur.js';
import { contredire } from './contradicteur.js';
import { rediger } from './redacteur.js';
import { lireMaturite } from './arbitrage.js';

function arg(nom, def = null) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const fichier = process.argv[2];
if (!fichier || fichier.startsWith('--')) {
  console.error('Usage: node agents/mission.js <fichier-proposition> --client "Nom" [--secteur "..."] [--taille "..."] [--contexte "..."] [--maturite M1=oui,M2=non,M3=oui,M4=oui]');
  process.exit(1);
}
const nomClient = arg('client', 'Client non nommé');
const secteur = arg('secteur');
const taille = arg('taille');
const contexte = arg('contexte');
// Maturite constatee chez le client (M1 a M4) : sans elle, l'axe C du Score ne se note pas.
const maturite = lireMaturite(arg('maturite'));

const c = db();
await c.connect();
const t0 = Date.now();
try {
  // 1. Profil client (créé ou réutilisé)
  let { rows } = await c.query('SELECT id FROM companies WHERE name=$1', [nomClient]);
  if (!rows.length) {
    rows = (await c.query(
      `INSERT INTO companies(name,sector,size,profile) VALUES($1,$2,$3,$4) RETURNING id`,
      [nomClient, secteur, taille, JSON.stringify({ contexte: contexte || null, saisi_le: new Date().toISOString() })]
    )).rows;
    console.log(`▸ Client créé : ${nomClient}`);
  } else {
    console.log(`▸ Client existant : ${nomClient}`);
  }
  const companyId = rows[0].id;

  // 2. ANALYSTE
  process.stdout.write('▸ Analyste (extraction de la proposition)... ');
  const texte = readFileSync(fichier, 'utf8');
  const an = await analyser({ texte, companyId, client: c });
  console.log(`${an.parsed.non_dits?.length || 0} non-dits · ${an.meta.cout}`);

  // 3. AUDITEUR
  process.stdout.write('▸ Auditeur (7 regards + 8 questions)... ');
  const au = await auditer({ proposalId: an.id, companyId, maturite, client: c });
  if (au.meta.status !== 'ok') throw new Error(`Auditeur en échec : ${au.meta.status}`);
  const sr = au.audit.score_raime;
  const lu = sr?.rendu ? `Score rAIme ${sr.score}/1000 ${sr.mention}` : `Score non rendu (a obtenir : ${(sr?.aObtenir || []).join(', ')})`;
  console.log(`${lu} · ${au.audit.constats?.length || 0} constats · ${au.meta.cout}`);

  // 4. CONTRADICTEUR
  process.stdout.write('▸ Contradicteur (revue adverse)... ');
  const co = await contredire({ auditId: au.id, client: c });
  console.log(`${co.contradiction.objections?.length || 0} objections · solidité ${co.contradiction.solidite_globale || '?'} · ${co.meta.cout}`);
  if (co.blocage) console.log(`  ⚠ ${co.blocage}`);

  // 5. RÉDACTEUR (déterministe, coût nul)
  process.stdout.write('▸ Rédacteur (déterministe)... ');
  const re = await rediger({ auditId: au.id, client: c });
  mkdirSync('out', { recursive: true });
  const nomFichier = `out/audit-${nomClient.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${au.id.slice(0, 8)}.md`;
  writeFileSync(nomFichier, re.markdown, 'utf8');
  console.log(`${re.markdown.length} caractères · 0 $`);

  // 6. Bilan
  const { rows: co2 } = await c.query(
    `SELECT round(sum(cost_usd)::numeric,4) AS total, count(*) AS appels
     FROM agent_runs WHERE ref = ANY($1::uuid[])`, [[an.id, au.id]]);
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`RAPPORT : ${nomFichier}`);
  console.log(`Audit   : ${au.id}`);
  console.log(`Durée   : ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`Coût IA : ${co2[0].total} $ (${co2[0].appels} appels)`);
  console.log(`Statut  : ${co.contradiction.verdict_livraison || 'livrable'}`);
  console.log('═'.repeat(58));
} finally { await c.end(); }
