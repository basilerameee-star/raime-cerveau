// AGENT CHASSEUR — la veille qui ne s'arrête jamais : le meilleur modèle au meilleur prix.
//
// La chaîne existait déjà, avec un maillon manquant au milieu :
//   catalogue (503 modèles, synchronisé chaque nuit)
//     → sas : repère les candidats moins chers que nos titulaires
//     → ??? : PERSONNE ne les mesurait, donc ils restaient « non évaluable » pour toujours
//     → sas : promeut seulement ce qui est mesuré
//
// Le chasseur est ce maillon. Chaque jour il prend les candidats en attente, les fait
// passer à la batterie du métrologue (notée par du code, jamais par un modèle juge),
// puis rouvre le sas pour qu'il tranche. Il ne promeut rien lui-même.
//
// RÈGLE DE DÉPENSE : une batterie coûte quelques centimes. Le plafond du cerveau est le
// prix du serveur ; le chasseur mesure donc peu de candidats à la fois, tous les jours,
// plutôt que beaucoup d'un coup.
import { ROUTER } from './lib.js';
import { mesurer } from './metrologue.js';
import { balayer, soumettre } from './sas.js';

const CANDIDATS_PAR_PASSAGE = 2;   // combien de modèles neufs par jour
const PASSAGES = 3;                // le sas exige 3 relevés : un seul ne distingue pas la chance

// Ce que le routage utilise aujourd'hui, tâche par tâche.
const titulaires = () => [...new Set(Object.values(ROUTER).map((r) => r.model))];

// Les candidats que le sas a repérés et que personne n'a encore mesurés, les moins chers d'abord.
async function enAttente(brain, combien) {
  // DISTINCT ON : le catalogue peut porter deux lignes pour un même identifiant OpenRouter.
  const { rows } = await brain.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (c.identifiant)
             c.identifiant, m.price_in, m.price_out, m.context_tokens
      FROM candidats c
      JOIN models m ON m.openrouter_id = c.identifiant
      WHERE c.domaine = 'modele_routage'
        AND c.verdict = 'non_evaluable'
        AND coalesce(m.price_in, 0) > 0
        -- les variantes « batch » répondent en différé : la batterie les compte non mesurées
        AND c.identifiant NOT LIKE '%:batch%'
        -- assez d'essais : un modèle déjà passé trois fois sans convaincre cesse de coûter
        AND (SELECT count(*) FROM metrologie m2 WHERE m2.modele = c.identifiant) < 24
      ORDER BY c.identifiant, m.price_in ASC
    ) z
    ORDER BY (z.price_in + z.price_out) ASC
    LIMIT $1`, [combien]);
  return rows;
}

// Le classement qui compte : la note obtenue, et ce que coûtent mille tâches.
// Deux chiffres lisibles par un client comme par nous : « cette tâche coûte X, et vaut Y sur 100 ».
async function classement(brain) {
  const { rows } = await brain.query(`
    SELECT modele,
           count(*)::int                                         AS releves,
           round(avg(note) FILTER (WHERE note IS NOT NULL))::int  AS note,
           round((avg(cout_usd) * 1000)::numeric, 3)              AS cout_1000_taches
    FROM metrologie
    WHERE releve_le > now() - interval '90 days'
    GROUP BY modele
    HAVING count(*) FILTER (WHERE note IS NOT NULL) > 0
    ORDER BY note DESC NULLS LAST, cout_1000_taches ASC`);
  return rows;
}

export async function chasser({ brain }) {
  const encours = titulaires();
  const neufs = await enAttente(brain, CANDIDATS_PAR_PASSAGE);

  if (!neufs.length) {
    await brain.query(
      `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['chasseur', 'Aucun candidat à mesurer',
       `Le catalogue ne propose rien de moins cher que les titulaires (${encours.join(', ')}) qui reste à mesurer.`]);
    console.log('[chasseur] rien à mesurer aujourd’hui — les titulaires tiennent.');
    return { mesures: [], classement: await classement(brain) };
  }

  const aMesurer = neufs.map((n) => n.identifiant);
  console.log(`[chasseur] ${aMesurer.length} candidat(s) à la batterie, ${PASSAGES} passages : ${aMesurer.join(', ')}`);

  for (let p = 1; p <= PASSAGES; p++) {
    try {
      await mesurer({ brain, modeles: aMesurer });
    } catch (e) {
      console.error(`[chasseur] passage ${p} interrompu : ${e.message}`);
      break;
    }
  }

  // Le sas tranche, candidat par candidat, face au TITULAIRE DU JOUR — jamais face à un
  // ancien nom resté dans le code. Promu seulement si la note tient et que le coût baisse.
  const titulaire = ROUTER.extraction.model;
  const verdicts = [];
  for (const n of neufs) {
    verdicts.push(await soumettre(brain, {
      domaine: 'modele_routage',
      identifiant: n.identifiant,
      titre: `Mesuré par le chasseur face à ${titulaire}`,
      source: 'chasseur',
      donnees: { price_in: n.price_in, price_out: n.price_out, contexte: n.context_tokens, titulaire },
    }));
  }
  // Puis le balayage habituel du catalogue.
  verdicts.push(...(await balayer({ brain })) || []);
  const promus = verdicts.filter((v) => v && v.verdict === 'promu').map((v) => v.identifiant);

  const tableau = await classement(brain);
  const tete = tableau.slice(0, 3)
    .map((r) => `${r.modele} ${r.note}/100 pour ${r.cout_1000_taches} $ les mille tâches`).join(' · ');

  await brain.query(
    `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['chasseur',
     `Batterie passée sur ${aMesurer.join(', ')}${promus.length ? ` — promu : ${promus.join(', ')}` : ''}`,
     `Meilleur rapport qualité-prix mesuré : ${tete}. Titulaires du jour : ${encours.join(', ')}.`]);

  return { mesures: aMesurer, promus, classement: tableau };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  const r = await chasser({ brain });
  console.log('\n╔══ NOTE ET PRIX DE MILLE TÂCHES ══╗\n');
  for (const l of r.classement.slice(0, 8)) {
    console.log(`  ${String(l.modele).padEnd(34)} ${String(l.note ?? '—').padStart(3)}/100 · ${String(l.releves).padStart(3)} relevés · ${l.cout_1000_taches} $ / 1000 tâches`);
  }
  await brain.end();
}
