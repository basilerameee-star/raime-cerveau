// SAS DE MÉTAMORPHOSE BORNÉE — la porte par laquelle une nouveauté entre en production.
//
// Le Radar détecte en permanence des modèles, des outils, des sources. Sans porte,
// deux issues également mauvaises : soit rien n'entre jamais et le cabinet se périme,
// soit tout entre et la maison dérive sans qu'on sache quand elle a cessé d'être juste.
//
// La règle qui gouverne tout ce fichier :
//
//   UN FAIT s'applique seul. UN JUGEMENT passe par l'évaluation.
//   ET CE QUI N'EST PAS MESURABLE N'EST JAMAIS PROMU.
//
// Cette troisième clause est la plus importante, et c'est celle qu'on oublie. Un sas qui
// promeut par défaut ce qu'il ne sait pas mesurer n'est pas un sas : c'est une porte
// ouverte avec un panneau dessus.
import pg from 'pg';
import { execSync } from 'node:child_process';

// ── Ce qui relève du FAIT : vérifiable sans jugement, donc appliqué directement ──
const FAITS = new Set(['prix', 'disponibilite_source', 'contexte_modele', 'catalogue']);

// ── Ce qui relève du JUGEMENT : ne passe qu'avec une mesure favorable ───────────
const JUGEMENTS = new Set(['modele_routage', 'prompt', 'critere_audit', 'source_veille', 'offre']);

// Les batteries de non-régression disponibles aujourd'hui, par domaine.
// Un domaine absent de cette table n'est pas évaluable — donc pas promouvable.
// Une consigne se juge sur le travail de SON agent : faire passer au Héraut l'examen
// de l'Auditeur, ce serait lui faire réciter une leçon qui n'est pas la sienne.
const BATTERIES_AGENT = {
  heraut: ['tests/cas_figes_heraut.mjs'],
};
const BATTERIES = {
  prompt: ['tests/cas_figes.mjs', 'tests/cas_figes_audit.mjs'],
  critere_audit: ['tests/cas_figes_audit.mjs'],
  // modele_routage : évalué par la métrologie, pas par des cas figés — voir evaluerModele().
};

// Un passage ne prouve rien : les fournisseurs varient même à température zéro.
// Notre propre modèle d'extraction a oscillé entre 63 et 75 sur cinq passages.
const PASSAGES_MINIMUM = 3;

/**
 * Évalue un modèle candidat à partir du registre de métrologie accumulé.
 * Trois conditions cumulatives, toutes mesurées :
 *   ① au moins PASSAGES_MINIMUM relevés complets
 *   ② score moyen au moins égal au titulaire
 *   ③ coût moyen strictement inférieur
 */
async function evaluerModele(brain, identifiant, titulaire) {
  const stat = async (m) => {
    const { rows } = await brain.query(`
      SELECT (SELECT min(n) FROM (SELECT count(*) AS n FROM metrologie WHERE modele = $1 GROUP BY tache) z)::int AS passages,
             count(*) FILTER (WHERE note IS NULL)::int AS non_mesurees,
             round(avg(note) FILTER (WHERE note IS NOT NULL))::int AS score,
             min(note) FILTER (WHERE note IS NOT NULL)::int AS pire,
             round(sum(cout_usd)::numeric, 6) AS cout_cumule,
             count(*)::int AS lignes
      FROM metrologie WHERE modele = $1`, [m]);
    return rows[0];
  };

  const c = await stat(identifiant);
  const t = await stat(titulaire);

  if (!c.lignes || c.passages < PASSAGES_MINIMUM)
    return { passe: false, motif: `Échantillon insuffisant : ${c.passages || 0} passage(s) mesuré(s), ${PASSAGES_MINIMUM} exigés. Un seul relevé ne distingue pas la capacité de la chance.`, mesure: { candidat: c, titulaire: t } };

  if (c.non_mesurees > 0)
    return { passe: false, motif: `${c.non_mesurees} tâche(s) non mesurée(s) — indisponibilité du fournisseur. On ne bascule pas sur un modèle qu'on n'a pas pu joindre.`, mesure: { candidat: c, titulaire: t } };

  const coutMoyenC = Number(c.cout_cumule) / c.passages;
  const coutMoyenT = Number(t.cout_cumule) / Math.max(1, t.passages);

  if (c.score < t.score)
    return { passe: false, motif: `Qualité inférieure au titulaire : ${c.score}/100 contre ${t.score}/100 sur ${c.passages} passages.`, mesure: { candidat: c, titulaire: t } };

  if (coutMoyenC >= coutMoyenT)
    return { passe: false, motif: `Qualité équivalente (${c.score} contre ${t.score}) mais sans gain de coût. Changer sans bénéfice mesuré est un risque gratuit.`, mesure: { candidat: c, titulaire: t } };

  const gain = Math.round(100 * (1 - coutMoyenC / coutMoyenT));
  return {
    passe: true,
    motif: `${c.score}/100 contre ${t.score}/100 pour le titulaire, sur ${c.passages} passages, au moins une tâche systématiquement ratée (note minimale ${c.pire}). Coût inférieur de ${gain} %.`,
    mesure: { candidat: c, titulaire: t, gain_pct: gain },
  };
}

async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS candidats (
      id          bigserial PRIMARY KEY,
      domaine     text NOT NULL,
      identifiant text NOT NULL,
      titre       text,
      source      text,
      donnees     jsonb NOT NULL DEFAULT '{}'::jsonb,
      nature      text CHECK (nature IN ('fait','jugement','hors_perimetre')),
      verdict     text CHECK (verdict IN ('applique','promu','refuse','non_evaluable','en_attente')),
      motif       text,
      mesure      jsonb,
      vu_le       timestamptz NOT NULL DEFAULT now(),
      tranche_le  timestamptz,
      UNIQUE(domaine, identifiant)
    )`);
}

/** Rejoue une batterie de cas figés dans le conteneur. Renvoie {passe, sortie}. */
function rejouer(fichiers, args = '') {
  const sorties = [];
  for (const f of fichiers) {
    try {
      // 5 minutes : l'examen du Héraut fait rédiger trois messages par un modèle.
      const out = execSync(`node ${f} ${args}`.trim(), { cwd: '/app', encoding: 'utf8', timeout: 300000 });
      sorties.push(out.trim());
    } catch (e) {
      return { passe: false, sortie: `${f} : ${(e.stdout || e.message || '').toString().trim().slice(0, 400)}` };
    }
  }
  return { passe: true, sortie: sorties.join(' | ') };
}

/**
 * Soumet un candidat au sas.
 * @param {{domaine:string, identifiant:string, titre?:string, source?:string, donnees?:object}} c
 */
export async function soumettre(brain, c) {
  await schema(brain);

  const nature = FAITS.has(c.domaine) ? 'fait'
    : JUGEMENTS.has(c.domaine) ? 'jugement'
      : 'hors_perimetre';

  let verdict, motif, mesure = null;

  if (nature === 'hors_perimetre') {
    verdict = 'refuse';
    motif = `Domaine « ${c.domaine} » hors périmètre du sas : ni fait vérifiable, ni jugement évaluable.`;

  } else if (nature === 'fait') {
    // Un fait ne se discute pas : il s'applique et se trace. C'est ce qui a manqué
    // le jour où le prix du modèle de raisonnement a monté de 69 % sans que rien ne bouge.
    verdict = 'applique';
    motif = 'Fait vérifiable : appliqué directement, sans évaluation.';

  } else {
    // Le routage de modèle a son propre instrument : la métrologie.
    if (c.domaine === 'modele_routage') {
      const e = await evaluerModele(brain, c.identifiant, c.donnees?.titulaire || 'deepseek/deepseek-v4-flash-0731');
      mesure = e.mesure;
      verdict = e.passe ? 'promu' : (/Échantillon insuffisant/.test(e.motif) ? 'non_evaluable' : 'refuse');
      motif = e.motif;
      const { rows: ins } = await brain.query(
        `INSERT INTO candidats(domaine, identifiant, titre, source, donnees, nature, verdict, motif, mesure, tranche_le)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (domaine, identifiant) DO UPDATE
           SET verdict = EXCLUDED.verdict, motif = EXCLUDED.motif, mesure = EXCLUDED.mesure, tranche_le = now()
         RETURNING id`,
        [c.domaine, c.identifiant, c.titre || null, c.source || null, JSON.stringify(c.donnees || {}),
         nature, verdict, motif, JSON.stringify(mesure)]);
      await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
        ['sas', `Candidat « ${c.identifiant} » (${c.domaine}) → ${verdict}`, motif.slice(0, 500)]);
      return { id: ins[0].id, nature, verdict, motif, mesure };
    }

    const agentVise = c.donnees?.agent || null;
    const batterie = (c.domaine === 'prompt' && agentVise && BATTERIES_AGENT[agentVise]) || BATTERIES[c.domaine];
    if (!batterie || !batterie.length) {
      // LA CLAUSE QUI PROTÈGE LA MAISON.
      verdict = 'non_evaluable';
      motif = `Aucune batterie de non-régression ne couvre « ${c.domaine} ». `
        + `Une promotion serait un pari, pas une décision. Le candidat reste en attente `
        + `jusqu'à ce qu'un instrument de mesure existe.`;
    } else {
      const args = c.domaine === 'prompt' && agentVise ? `${agentVise} ${c.donnees?.version ?? ''}`.trim() : '';
      const r = rejouer(batterie, args);
      mesure = { batteries: batterie, sortie: r.sortie };
      verdict = r.passe ? 'promu' : 'refuse';
      motif = r.passe
        ? `Toutes les batteries passent : ${r.sortie}`
        : `Non-régression échouée : ${r.sortie}`;
      // Une consigne promue reste INACTIVE : l'examen dit qu'elle tient, il ne dit pas
      // qu'elle doit écrire à de vrais prospects dès ce soir. La mise en service se
      // demande à Basile — une ligne, et un retour arrière d'une ligne aussi.
      if (r.passe && c.domaine === 'prompt' && agentVise && c.donnees?.version) {
        motif += ` — consigne ${agentVise} v${c.donnees.version} prête à être mise en service.`;
      }
    }
  }

  const { rows } = await brain.query(
    `INSERT INTO candidats(domaine, identifiant, titre, source, donnees, nature, verdict, motif, mesure, tranche_le)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (domaine, identifiant) DO UPDATE
       SET verdict = EXCLUDED.verdict, motif = EXCLUDED.motif,
           mesure = EXCLUDED.mesure, tranche_le = now()
     RETURNING id`,
    [c.domaine, c.identifiant, c.titre || null, c.source || null,
     JSON.stringify(c.donnees || {}), nature, verdict, motif,
     mesure ? JSON.stringify(mesure) : null]);

  await brain.query(
    `INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['sas', `Candidat « ${c.identifiant} » (${c.domaine}) → ${verdict}`, motif.slice(0, 500)]);

  return { id: rows[0].id, nature, verdict, motif, mesure };
}

/**
 * Balaie le radar : tout modèle nouvellement apparu au catalogue devient un candidat.
 * Le sas ne le promeut pas — il l'inscrit et dit franchement pourquoi il ne peut pas trancher.
 */
export async function balayer({ brain }) {
  await schema(brain);
  const resultats = [];

  // Les modèles moins chers que notre routage actuel, à contexte au moins équivalent.
  const { rows: mieux } = await brain.query(`
    SELECT m.openrouter_id, m.price_in, m.price_out, m.context_tokens
    FROM models m
    WHERE m.price_in > 0 AND m.price_in < 0.065 AND m.context_tokens >= 200000
    ORDER BY m.price_in LIMIT 5`);

  for (const m of mieux) {
    resultats.push(await soumettre(brain, {
      domaine: 'modele_routage',
      identifiant: m.openrouter_id,
      titre: `Moins cher que notre modèle d'extraction (${m.price_in} contre 0.065)`,
      source: 'catalogue OpenRouter',
      donnees: { price_in: m.price_in, price_out: m.price_out, contexte: m.context_tokens },
    }));
  }

  // Les changements de prix : ce sont des faits, ils s'appliquent seuls.
  const { rows: prix } = await brain.query(`
    SELECT title, payload FROM radar_events
    WHERE kind = 'price_change' AND seen_at > now() - interval '24 hours' LIMIT 10`);
  for (const p of prix) {
    resultats.push(await soumettre(brain, {
      domaine: 'prix',
      identifiant: `${p.title}-${new Date().toISOString().slice(0, 10)}`,
      titre: `Changement de prix : ${p.title}`,
      source: 'synchronisation catalogue',
      donnees: p.payload || {},
    }));
  }

  return resultats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try {
    const r = await balayer({ brain });
    console.log(`\n╔══ SAS DE MÉTAMORPHOSE ══╗\n`);
    const par = {};
    r.forEach((x) => { par[x.verdict] = (par[x.verdict] || 0) + 1; });
    console.log(`  ${r.length} candidat(s) examiné(s) : ` +
      Object.entries(par).map(([k, v]) => `${v} ${k}`).join(' · ') + '\n');
    const { rows } = await brain.query(
      `SELECT domaine, identifiant, nature, verdict, motif FROM candidats ORDER BY tranche_le DESC LIMIT 8`);
    rows.forEach((x) => {
      console.log(`  [${x.verdict.toUpperCase()}] ${x.identifiant}`);
      console.log(`      ${x.nature} · ${x.domaine}`);
      console.log(`      ${x.motif.slice(0, 150)}`);
    });
    console.log('');
  } finally { await brain.end(); }
}
