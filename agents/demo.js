// Chaîne complète : profil entreprise → Analyste → Auditeur → restitution lisible.
// node agents/demo.js samples/proposition-exemple.txt
import { readFileSync } from 'node:fs';
import { db, money } from './lib.js';
import { analyser } from './analyste.js';
import { auditer } from './auditeur.js';

const fichier = process.argv[2] || 'samples/proposition-exemple.txt';
const c = db();
await c.connect();
try {
  // 1. Profil entreprise (contexte statique client)
  const nom = 'Cabinet Delmas & Associés';
  let { rows } = await c.query('SELECT id FROM companies WHERE name=$1', [nom]);
  if (!rows.length) {
    rows = (await c.query(
      `INSERT INTO companies(name,sector,size,profile) VALUES($1,$2,$3,$4) RETURNING id`,
      [nom, 'Expertise comptable', '45 salariés', JSON.stringify({
        localisation: 'Annecy (74)',
        processus_cible: 'traitement des e-mails clients',
        volumetrie: '1 200 e-mails / semaine (~5 200 / mois)',
        charge_actuelle: '1,5 ETP au secrétariat',
        outils: ['Outlook 365', 'logiciel métier comptable'],
        contraintes: ['données clients confidentielles', 'secret professionnel comptable', 'RGPD'],
        maturite_ia: 'faible',
        priorites_direction: 'réduire la charge du secrétariat sans dégrader la relation client',
      })]
    )).rows;
  }
  const companyId = rows[0].id;
  console.log(`Entreprise : ${nom} (${companyId})\n`);

  // 2. ANALYSTE
  console.log('── AGENT ANALYSTE ────────────────────────────────');
  const texte = readFileSync(fichier, 'utf8');
  const a = await analyser({ texte, companyId, client: c });
  console.log(`Fournisseur   : ${a.parsed.fournisseur}`);
  console.log(`Objet         : ${a.parsed.objet}`);
  console.log(`Coût initial  : ${a.parsed.couts?.initial} ${a.parsed.couts?.devise || ''} | récurrent : ${a.parsed.couts?.recurrent_mensuel}/mois`);
  console.log(`Coût à l'échelle : ${a.parsed.couts?.a_l_echelle}`);
  console.log(`\nNON-DITS DÉTECTÉS (${a.parsed.non_dits?.length || 0}) :`);
  (a.parsed.non_dits || []).forEach(x => console.log(`  • ${x}`));
  console.log(`\n[analyste] ${a.meta.model} · ${a.meta.cout} · ${a.meta.ms} ms`);

  // 3. AUDITEUR
  console.log('\n── AGENT AUDITEUR ────────────────────────────────');
  const au = await auditer({ proposalId: a.id, companyId, client: c });
  const A = au.audit;
  console.log(`\nSYNTHÈSE : ${A.synthese}\n`);
  console.log(`CONSTATS (score global ${A.score_global ?? 'n/a'}/10) :`);
  (A.constats || []).forEach(x =>
    console.log(`  [${x.preuve}] ${String(x.regard).padEnd(18)} ${String(x.score).padStart(2)}/10  risque ${x.risque}\n      ${x.titre} — ${x.constat}`));
  if (A.alternative_sobre) {
    console.log(`\nALTERNATIVE SOBRE :\n  ${A.alternative_sobre.description}`);
    console.log(`  Pourquoi : ${A.alternative_sobre.pourquoi}`);
    console.log(`  Ordre de grandeur : ${A.alternative_sobre.ordre_de_grandeur_cout} | écart estimé : ${A.alternative_sobre.ecart_estime}`);
  }
  console.log(`\nQUESTIONS AU PRESTATAIRE :`);
  (A.questions_au_prestataire || []).forEach(q => console.log(`  ? ${q}`));
  console.log(`\nINFORMATIONS MANQUANTES :`);
  (A.informations_manquantes || []).forEach(q => console.log(`  ! ${q}`));
  console.log(`\nRECOMMANDATION (confiance : ${A.niveau_confiance}) :\n  ${A.recommandation}`);
  if (au.garde) console.log(`\n[GARDE-FOU] ${au.garde}`);
  console.log(`\n[auditeur] ${au.meta.model} · ${au.meta.cout} · ${au.meta.ms} ms · audit ${au.id}`);

  // 4. Coût total de la mission
  const { rows: cost } = await c.query(
    `SELECT round(sum(cost_usd)::numeric,4) AS total, count(*) AS appels FROM agent_runs WHERE created_at > now() - interval '10 minutes'`);
  console.log(`\n═══ COÛT IA DE CET AUDIT : ${cost[0].total} $ sur ${cost[0].appels} appels ═══`);
} finally { await c.end(); }
