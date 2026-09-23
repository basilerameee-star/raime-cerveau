// CORDON SANITAIRE — le dernier verrou avant qu'un message parte sous le nom de Basile.
//
// Amy a été désactivée en base et n8n redémarré. Elle s'est quand même exécutée le
// lendemain à 04 h 01 et huit courriels sont partis à 06 h 00, dont six annonçant
// « c'est une intelligence artificielle qui vous écrit ».
//
// La leçon est générale et vaut au-delà d'Amy : DÉSACTIVER N'EST PAS EMPÊCHER.
// Un drapeau en base est une intention ; un contrôle qui s'exécute est une garantie.
// Ce cordon ne fait pas confiance à l'état des workflows : il inspecte ce qui attend
// dans la file, et il annule tout ce qui ne devrait jamais sortir.
import pg from 'pg';

// Motifs rédhibitoires. Chacun correspond à un incident réel, pas à une crainte.
const INTERDITS = [
  { code: 'aveu_machine', motif: /une intelligence artificielle qui (vous )?(écrit|rédige)|je suis une (ia|intelligence artificielle)|écrit par une ia/i,
    pourquoi: "le message annonce qu'une machine l'écrit" },
  { code: 'signature_amy', motif: /\bAmy\b/,
    pourquoi: 'signature Amy, persona abandonnée' },
  { code: 'vend_automatisation', motif: /automatis(er|ation|ées?)\s+(vos|votre|le quotidien|en )/i,
    pourquoi: "vend de l'automatisation, ce que rAIme n'a jamais vendu" },
  { code: 'financement_public', motif: /\bCPF\b|\bOPCO\b|compte personnel de formation|France Travail|Qualiopi/i,
    pourquoi: 'promet un financement indisponible sans Qualiopi' },
  { code: 'objet_ancien', motif: null, sujet: / x IA —/i,
    pourquoi: "objet de l'ancienne campagne" },
];

export async function cordon({ n8n, brain }) {
  const { rows } = await n8n.query(
    `SELECT id, prospect_name, subject, body FROM outreach
     WHERE sent_at IS NULL AND status = 'brouillon'`);

  const annules = [];
  for (const r of rows) {
    for (const i of INTERDITS) {
      const touche = (i.motif && i.motif.test(r.body)) || (i.sujet && i.sujet.test(r.subject));
      if (!touche) continue;
      await n8n.query("UPDATE outreach SET status = 'annule' WHERE id = $1", [r.id]);
      annules.push({ id: r.id, cible: r.prospect_name, code: i.code, pourquoi: i.pourquoi });
      break;
    }
  }

  if (annules.length) {
    const resume = annules.map((a) => `${a.cible} (${a.code})`).join(' ; ').slice(0, 700);
    await brain.query('INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)',
      ['cordon', `${annules.length} brouillon(s) annulé(s) avant envoi`, resume]);
  }

  const { rows: reste } = await n8n.query(
    `SELECT count(*)::int AS n FROM outreach WHERE sent_at IS NULL AND status = 'brouillon'`);
  return { examines: rows.length, annules, file: reste[0].n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect();
  try {
    const r = await cordon({ n8n, brain });
    console.log(`\n╔══ CORDON SANITAIRE ══╗\n`);
    console.log(`  brouillons examinés : ${r.examines}`);
    console.log(`  annulés             : ${r.annules.length}`);
    r.annules.slice(0, 12).forEach((a) =>
      console.log(`     ✗ ${String(a.cible).slice(0, 40).padEnd(42)} ${a.pourquoi}`));
    console.log(`  file restante       : ${r.file}\n`);
  } finally { await brain.end(); await n8n.end(); }
}
