// AGENT MÉTROLOGUE — l'instrument qui manquait au cabinet.
//
// Il rejoue une batterie de tâches figées contre plusieurs modèles et mesure trois
// choses pour chacun : le COÛT réel, la DURÉE, et la QUALITÉ notée par du code.
//
// Ce qu'il débloque, et c'est le meilleur rapport de tout le plan :
//   ① au client — « faire cette tâche coûtait X en janvier, Y aujourd'hui ». Une courbe,
//      pas une intuition. Personne d'autre ne peut la produire pour son métier.
//   ② chez nous — les 5 candidats bloqués par le sas en « non évaluable » deviennent
//      évaluables. La métamorphose se débloque sur son axe le plus rentable.
//
// Aucun modèle juge : chaque tâche se vérifie par du code. Noter la qualité avec un LLM
// reviendrait à remplacer une mesure par une opinion — le travers qu'on audite chez les autres.
import { db } from './lib.js';
import { TACHES } from '../metrologie/taches.js';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS metrologie (
      id         bigserial PRIMARY KEY,
      modele     text NOT NULL,
      tache      text NOT NULL,
      famille    text NOT NULL,
      note       int,            -- NULL = non mesure (indisponibilite), 0 = mauvaise reponse
      tokens_in  int, tokens_out int,
      cout_usd   numeric, duree_ms int,
      sortie     text,
      releve_le  timestamptz NOT NULL DEFAULT now()
    )`);
  await brain.query('CREATE INDEX IF NOT EXISTS metro_modele_date ON metrologie(modele, releve_le DESC)');
}

// Prix réels du catalogue : on ne recalcule jamais un coût sur une valeur figée dans le code.
async function prix(brain, modeles) {
  const { rows } = await brain.query(
    'SELECT openrouter_id, price_in, price_out FROM models WHERE openrouter_id = ANY($1::text[])', [modeles]);
  return Object.fromEntries(rows.map((r) => [r.openrouter_id, { in: Number(r.price_in), out: Number(r.price_out) }]));
}

async function executer(modele, tache, tarif) {
  const t0 = Date.now();
  const r = await fetch(OR_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modele,
      messages: [{ role: 'system', content: tache.systeme }, { role: 'user', content: tache.invite }],
      max_tokens: tache.maxTokens,
      temperature: 0,   // on mesure la capacité, pas la chance
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  const d = await r.json();
  const texte = d.choices?.[0]?.message?.content ?? '';
  const u = d.usage || {};
  const ti = u.prompt_tokens || 0, to = u.completion_tokens || 0;
  return {
    texte, tokensIn: ti, tokensOut: to, ms: Date.now() - t0,
    cout: tarif ? (ti * tarif.in + to * tarif.out) / 1e6 : null,
  };
}

export async function mesurer({ brain, modeles }) {
  await schema(brain);
  const tarifs = await prix(brain, modeles);
  const resultats = [];

  for (const modele of modeles) {
    const ligne = { modele, notes: [], cout: 0, ms: 0, echecs: 0 };
    for (const tache of TACHES) {
      try {
        const r = await executer(modele, tache, tarifs[modele]);
        const note = tache.verifier(r.texte);
        await brain.query(
          `INSERT INTO metrologie(modele, tache, famille, note, tokens_in, tokens_out, cout_usd, duree_ms, sortie)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [modele, tache.id, tache.famille, note, r.tokensIn, r.tokensOut, r.cout, r.ms, String(r.texte).slice(0, 900)]);
        ligne.notes.push({ tache: tache.id, note });
        ligne.cout += r.cout || 0;
        ligne.ms += r.ms;
      } catch (e) {
        // Un 429 ou un 404 ne dit RIEN de la qualite du modele : il dit qu'on n'a pas pu
        // mesurer. Noter zero reviendrait a condamner definitivement un modele peut-etre bon.
        ligne.echecs++;
        ligne.notes.push({ tache: tache.id, note: null, erreur: String(e.message).slice(0, 90) });
        await brain.query(
          `INSERT INTO metrologie(modele, tache, famille, note, cout_usd, duree_ms, sortie)
           VALUES($1,$2,$3,NULL,0,0,$4)`,
          [modele, tache.id, tache.famille, `NON MESURE ${String(e.message).slice(0, 200)}`]);
      }
    }
    const mesurees = ligne.notes.filter((n) => n.note !== null);
    ligne.couverture = Math.round(100 * mesurees.length / TACHES.length);
    ligne.score = mesurees.length
      ? Math.round(mesurees.reduce((s, n) => s + n.note, 0) / mesurees.length)
      : null;
    // Le seul chiffre qui décide vraiment : combien coûte un point de qualité.
    ligne.cout_par_point = ligne.score > 0 ? ligne.cout / ligne.score : null;
    // Un modele mesure a moitie ne se compare pas a un modele mesure entierement.
    resultats.push(ligne);
  }

  resultats.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (a.cout - b.cout));
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['metrologue', `Batterie rejouée sur ${modeles.length} modèle(s), ${TACHES.length} tâches`,
     resultats.map((r) => `${r.modele} : ${r.score}/100 pour ${r.cout.toFixed(5)} $`).join(' | ').slice(0, 900)]);

  return resultats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = db(); await brain.connect();
  try {
    // Par défaut : notre routage actuel face aux candidats que le sas a bloqués.
    const arg = process.argv.slice(2).filter((a) => a.includes('/'));
    let modeles = arg;
    if (!modeles.length) {
      const { rows } = await brain.query(
        `SELECT identifiant FROM candidats WHERE domaine='modele_routage' AND verdict='non_evaluable' LIMIT 4`);
      modeles = ['deepseek/deepseek-v4-flash-0731', ...rows.map((r) => r.identifiant)];
    }
    console.log(`\n╔══ MÉTROLOGUE ══╗\n`);
    console.log(`  ${TACHES.length} tâches figées · ${modeles.length} modèles · notation par code, aucun juge\n`);

    const r = await mesurer({ brain, modeles });
    console.log('  modèle                              score   couvert      coût $    durée');
    r.forEach((x) => console.log(
      `  ${x.modele.slice(0, 34).padEnd(35)}${String(x.score === null ? 'n.m.' : x.score + '/100').padStart(8)}`
      + `${String(x.couverture + '%').padStart(10)}`
      + `${x.cout.toFixed(5).padStart(12)}`
      + `${(Math.round(x.ms / 1000) + 's').padStart(9)}`
      + (x.echecs ? `   ${x.echecs} tâche(s) non mesurée(s)` : '')));

    const ref = r.find((x) => x.modele === 'deepseek/deepseek-v4-flash-0731');
    // On ne bascule jamais sur un modele mesure partiellement.
    const mieux = r.filter((x) => ref && x.modele !== ref.modele && x.couverture === 100 && x.score >= ref.score && x.cout < ref.cout);
    console.log('');
    if (mieux.length) {
      console.log(`  ${mieux.length} candidat(s) au moins aussi bon(s) et moins cher(s) que notre modèle d'extraction :`);
      mieux.forEach((x) => console.log(`    · ${x.modele} — ${x.score}/100 pour ${((1 - x.cout / ref.cout) * 100).toFixed(0)} % de moins`));
      console.log(`  → le sas peut désormais trancher : la mesure existe.`);
    } else {
      console.log(`  Aucun candidat ne fait mieux à moindre coût. Notre routage reste justifié.`);
    }
    console.log('');
  } finally { await brain.end(); }
}
