// DÉCISION TYPÉE — JEV, de TypeSafe (« System One »).
//
// Un modèle de langue écrit de la prose et peut se tromper avec assurance. JEV, lui,
// répond par un TYPE : oui/non avec sa probabilité, un choix parmi des options, une note
// sur une échelle — avec la confiance qui va avec. Il ne peut produire ni hallucination
// ni erreur de type, il répond en une passe, et il coûte 0,042 $ le million de jetons
// d'entrée, sortie gratuite.
//
// À QUOI IL SERT ICI : partout où la maison décide plutôt qu'elle n'écrit — trier un
// prospect, dire si un message respecte les règles avant l'envoi, orienter une demande,
// noter la maturité d'une entreprise. La rédaction reste aux modèles de langue.
//
// PRUDENCE MESURÉE : TypeSafe annonce une précision moindre hors anglais, et nos textes
// sont en français. Rien n'entre en production avant un passage à la batterie.
//
//   node agents/decision.js            un essai sur un cas réel de la maison
const URL = 'https://api.typesafe.ai/v1/systemone';
const MODELE = process.env.TYPESAFE_MODEL || 'jev-latest';
const PRIX_IN = 0.042;   // $ par million de jetons d'entrée ; sortie gratuite

// La clé : TYPESAFE_API_KEY, ou JEV (le nom choisi par Basile au coffre le 30/09/2026).
const cleJev = () => process.env.TYPESAFE_API_KEY || process.env.JEV || '';
export const disponible = () => Boolean(cleJev());

// Les trois formes de question, pour éviter de recopier la structure à chaque appel.
export const oui = (instructions, vrai, faux) =>
  ({ type: 'noul', instructions, criteria: { true: vrai, false: faux } });
export const choix = (instructions, options) =>
  ({ type: 'choice', instructions, criteria: options });
export const echelle = (instructions, niveaux) =>
  ({ type: 'score', instructions, criteria: niveaux });

export async function decider({ etat, questions, modele = MODELE }) {
  const cle = cleJev();
  if (!cle) throw new Error('clé JEV manquante (TYPESAFE_API_KEY ou JEV) : la décision typée reste hors service.');

  const t0 = Date.now();
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), 30000);
  let r;
  try {
    r = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: etat, model: modele, questions }),
      signal: c.signal,
    });
  } finally { clearTimeout(minuteur); }

  if (!r.ok) throw new Error(`TypeSafe ${r.status} : ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const entree = d.usage?.input_tokens || 0;

  // On rend les réponses telles quelles, plus une lecture simple pour le code appelant.
  const lu = {};
  for (const [nom, a] of Object.entries(d.answers || {})) {
    lu[nom] = a.type === 'noul' ? { valeur: a.noul >= 0.5, probabilite: a.noul }
            : a.type === 'choice' ? { valeur: a.choice, probabilites: a.probabilities, confiance: a.confidence }
            : { valeur: a.score, legende: a.legend, probabilites: a.probabilities, confiance: a.confidence };
  }
  return {
    modele: d.model, reponses: lu, brut: d.answers,
    tokensIn: entree, costUsd: entree * PRIX_IN / 1e6, ms: Date.now() - t0,
  };
}

// Un cas de la maison, prêt à l'emploi : faut-il appeler cette entreprise, et pour quoi ?
export const QUALIFIER = {
  appel_utile: oui('Cette entreprise gagnerait-elle du temps avec de l’automatisation ou de la formation à l’IA ?',
    'Des tâches répétitives et du travail de bureau apparaissent', 'Rien ne laisse voir un tel besoin'),
  service: choix('Quel service lui conviendrait en premier ?', {
    formation: 'Des équipes à mettre à niveau sur les outils',
    audit: 'Des postes à examiner pour savoir où l’IA rapporte',
    arbitrage: 'Une proposition reçue, à faire analyser',
    automatisation: 'Des tâches répétitives à confier à une chaîne',
  }),
  maturite: echelle('Où en est cette entreprise avec l’IA ?', ['Découverte', 'Premiers essais', 'Usage installé']),
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!disponible()) {
    console.log('[decision] clé JEV absente : la ranger au coffre (cockpit.raime.fr/coffre), nom JEV.');
    process.exit(0);
  }
  const etat = process.argv.slice(2).join(' ') ||
    'Cabinet comptable de 25 personnes à Annecy. Saisie de factures, relances clients, ' +
    'rapprochements bancaires faits à la main. Aucun outil d’IA en place. Le dirigeant ' +
    'cherche à gagner du temps sur la production, sans licencier.';
  const r = await decider({ etat, questions: QUALIFIER });
  console.log(`\n╔══ ${r.modele} · ${r.tokensIn} jetons · ${r.costUsd.toFixed(6)} $ · ${r.ms} ms ══╗\n`);
  for (const [nom, a] of Object.entries(r.reponses)) {
    console.log(`  ${nom.padEnd(14)} ${JSON.stringify(a.valeur)}` +
      (a.confiance != null ? `  (confiance ${Math.round(a.confiance * 100)} %)` : '') +
      (a.probabilite != null ? `  (probabilité ${Math.round(a.probabilite * 100)} %)` : ''));
  }
}
