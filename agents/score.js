// SCORE rAIme — implementation de reference de la methode publiee.
//
// Document faisant foi : rAIme/07_Score_rAIme/specification-score.html (v1.0).
// Ce fichier N'INTERPRETE PAS la specification : il l'applique. Toute divergence
// entre les deux est un defaut de ce fichier, jamais une liberte prise.
//
// TROIS INTERDITS, qui sont la raison d'etre du module :
//   1. Aucun appel a un modele. Un point est gagne parce qu'une condition est
//      remplie, jamais parce qu'un modele l'a estime. Un score juge par un modele
//      n'est pas une mesure, c'est une opinion couteuse.
//   2. Aucune donnee inventee. Si une grandeur economique manque, l'axe B est
//      declare NON MESURABLE et le score n'est pas rendu. Combler un trou par une
//      valeur plausible transformerait la mesure en devinette presentable.
//   3. Aucun poids ajustable a l'execution. Le bareme est fige dans le code et ne
//      change qu'au passage d'une version majeure. Une methode negociable au cas
//      par cas n'est plus une methode.
//
// Le module est pur : aucune entree/sortie, aucune horloge, aucun aleatoire.
// Les memes entrees donnent le meme score aujourd'hui et dans trois ans.

export const VERSION = '1.0';

// ── Bareme de l'axe A ──────────────────────────────────────────────────────
// Un critere vaut 0 ou son poids plein. Jamais un demi-point : une clause est
// ecrite ou elle ne l'est pas.
export const BAREME = [
  { code: 'A1', poids: 4, libelle: 'La tache visee est nommee precisement' },
  { code: 'A2', poids: 5, libelle: 'Le volume traite est chiffre' },
  { code: 'A3', poids: 6, libelle: 'Le temps actuel par unite est chiffre, et mesure chez le client' },
  { code: 'A4', poids: 6, libelle: "Le temps restant apres automatisation est annonce" },
  { code: 'A5', poids: 5, libelle: 'La reaffectation du temps libere est traitee' },
  { code: 'B1', poids: 3, libelle: 'Mise en route et cout recurrent sont distincts' },
  { code: 'B2', poids: 3, libelle: 'Le cout recurrent est annonce sur douze mois' },
  { code: 'B3', poids: 5, libelle: 'Les declencheurs de hausse de prix sont ecrits' },
  { code: 'B4', poids: 4, libelle: 'Les licences tierces sont chiffrees ou explicitement exclues' },
  { code: 'B5', poids: 4, libelle: 'La maintenance est chiffree, avec son perimetre' },
  { code: 'B6', poids: 5, libelle: 'Le temps des equipes du client est chiffre' },
  { code: 'B7', poids: 7, libelle: 'Un critere de reussite et sa consequence sont ecrits' },
  { code: 'C1', poids: 3, libelle: "La duree d'engagement est ecrite" },
  { code: 'C2', poids: 7, libelle: 'Propriete des donnees et format de recuperation' },
  { code: 'C3', poids: 7, libelle: "Propriete ou droit d'usage de ce qui est construit" },
  { code: 'C4', poids: 7, libelle: 'Cout et delai de sortie' },
  { code: 'C5', poids: 5, libelle: 'Hebergement et juridiction des donnees precises' },
  { code: 'D1', poids: 5, libelle: 'Une reference verifiable dans un metier proche' },
  { code: 'D2', poids: 3, libelle: 'Un delai de mise en service engageant' },
  { code: 'D3', poids: 2, libelle: 'Le nom de qui realisera le travail' },
  { code: 'D4', poids: 2, libelle: 'Ce qui reste a la charge du client, liste' },
  { code: 'D5', poids: 2, libelle: 'Une alternative plus simple est evoquee' },
];

// Les trois clauses qui ne se rattrapent jamais apres signature.
export const REDHIBITOIRES = ['C2', 'C3', 'C4'];
export const PLAFOND_REDHIBITOIRE = 40;

// Part du temps libere reellement reaffectee, quand la proposition ne la
// documente pas. Ce n'est PAS une estimation optimiste : c'est une convention
// affichee, identique pour tous, et le score porte la mention correspondante.
export const REAFFECTATION_PAR_DEFAUT = 0.5;

// Bareme de l'axe B. Lu du plus court au plus long ; la premiere borne atteinte
// gagne. `null` en borne haute signifie « au-dela », y compris jamais.
export const ECHELLE_ROI = [
  { maxMois: 9, note: 100, lecture: "L'operation se rembourse a l'interieur d'un exercice." },
  { maxMois: 12, note: 90, lecture: 'Solide.' },
  { maxMois: 18, note: 75, lecture: 'Defendable.' },
  { maxMois: 24, note: 55, lecture: "Sans marge d'erreur : 20 % d'optimisme sur un chiffre et l'operation bascule." },
  { maxMois: 36, note: 35, lecture: 'Au-dela de la duree de vie utile de la plupart des automatisations.' },
  { maxMois: 60, note: 15, lecture: 'La mise en route ne sera pas remboursee.' },
  { maxMois: null, note: 0, lecture: 'Le cout recurrent absorbe le gain recurrent.' },
];

export const MENTIONS = [
  { min: 80, mention: 'Signable', suite: "Signer apres avoir obtenu par ecrit les rares points manquants." },
  { min: 60, mention: 'Signable sous conditions', suite: "Le fond tient. Des engagements manquent a l'ecrit." },
  { min: 40, mention: 'A renegocier', suite: 'Un axe est faible. Perimetre, prix de mise en route ou clauses de sortie a revoir.' },
  { min: 20, mention: 'A refaire', suite: "La proposition est a redemander, pas a negocier." },
  { min: 0, mention: 'A refuser', suite: "Signer exposerait l'entreprise a un cout sans contrepartie mesurable." },
];

// Grandeurs economiques indispensables au calcul de l'axe B. L'absence de l'une
// d'elles rend l'axe non mesurable — elle ne se remplace pas.
const GRANDEURS_REQUISES = [
  'volumeMensuel', 'tempsActuelMin', 'tempsResiduelMin', 'coutHoraire',
  'miseEnRoute', 'abonnementMensuel',
];

const nombre = (x) => (typeof x === 'number' && Number.isFinite(x));

/**
 * Axe A — sincerite de la proposition.
 * @param {string[]} presents codes des criteres SATISFAITS (ecrits noir sur blanc)
 */
export function axeA(presents) {
  const vus = new Set(presents || []);
  const inconnus = [...vus].filter((c) => !BAREME.some((b) => b.code === c));
  if (inconnus.length) {
    throw new Error(`score: code(s) de critere inconnu(s) : ${inconnus.join(', ')}`);
  }

  const detail = BAREME.map((b) => ({ ...b, satisfait: vus.has(b.code) }));
  const brut = detail.reduce((s, d) => s + (d.satisfait ? d.poids : 0), 0);

  const manquantsRedhibitoires = REDHIBITOIRES.filter((c) => !vus.has(c));
  const plafonne = manquantsRedhibitoires.length > 0;
  const note = plafonne ? Math.min(brut, PLAFOND_REDHIBITOIRE) : brut;

  return {
    note,
    brut,
    plafonne,
    manquantsRedhibitoires,
    manquants: detail.filter((d) => !d.satisfait).map((d) => ({ code: d.code, poids: d.poids, libelle: d.libelle })),
    detail,
  };
}

/**
 * Axe B — solidite economique. Renvoie { mesurable:false, manquantes:[...] }
 * plutot que d'inventer une valeur absente.
 */
export function axeB(eco = {}) {
  const manquantes = GRANDEURS_REQUISES.filter((g) => !nombre(eco[g]));
  if (manquantes.length) return { mesurable: false, manquantes, note: null };

  const reaffectationFournie = nombre(eco.partReaffectee);
  const part = reaffectationFournie
    ? Math.min(Math.max(eco.partReaffectee, 0), 1)
    : REAFFECTATION_PAR_DEFAUT;

  // Le temps residuel ne peut pas depasser le temps actuel : une automatisation
  // qui ferait perdre du temps ne serait pas une automatisation.
  const residuel = Math.min(eco.tempsResiduelMin, eco.tempsActuelMin);
  const heuresLiberees = (eco.volumeMensuel * 12 * (eco.tempsActuelMin - residuel)) / 60;
  const gainBrut = heuresLiberees * eco.coutHoraire;
  const gainNet = gainBrut * part;

  const coutUnique = eco.miseEnRoute + (eco.joursInternes || 0) * (eco.coutJour || 0);
  const coutRecurrent = (eco.abonnementMensuel + (eco.licencesMensuelles || 0)) * 12
    + (eco.maintenanceAnnuelle || 0);

  const margeMensuelle = (gainNet - coutRecurrent) / 12;
  const roiMois = margeMensuelle > 0 ? Math.ceil(coutUnique / margeMensuelle) : null;

  const palier = ECHELLE_ROI.find((p) => p.maxMois === null || (roiMois !== null && roiMois <= p.maxMois));

  return {
    mesurable: true,
    note: palier.note,
    lecture: palier.lecture,
    roiMois,
    gainBrut: Math.round(gainBrut),
    gainNet: Math.round(gainNet),
    coutUnique: Math.round(coutUnique),
    coutRecurrent: Math.round(coutRecurrent),
    partReaffectee: part,
    reaffectationDocumentee: reaffectationFournie,
  };
}

/**
 * Score rAIme = le plus bas des deux axes. Jamais la moyenne.
 * Une proposition ne vaut pas mieux que son maillon faible.
 */
export function scoreRaime({ presents, economie } = {}) {
  const a = axeA(presents);
  const b = axeB(economie);

  if (!b.mesurable) {
    return {
      version: VERSION,
      rendu: false,
      motif: 'axe B non mesurable',
      donneesManquantes: b.manquantes,
      axeA: a,
      axeB: b,
      // Rappel de doctrine, destine a l'agent qui consommerait ce resultat :
      // ne PAS rendre un score partiel, ne pas presenter l'axe A seul comme
      // « le score ». Un demi-score se cite comme un score entier.
      aObtenir: b.manquantes,
    };
  }

  const score = Math.min(a.note, b.note);
  const m = MENTIONS.find((x) => score >= x.min);
  const axeFaible = a.note <= b.note ? 'A' : 'B';

  const reserves = [];
  if (a.plafonne) {
    reserves.push(`Axe A plafonne a ${PLAFOND_REDHIBITOIRE} : clause(s) redhibitoire(s) absente(s) — ${a.manquantsRedhibitoires.join(', ')}.`);
  }
  if (!b.reaffectationDocumentee) {
    reserves.push(`Reaffectation non documentee : valeur conventionnelle de ${REAFFECTATION_PAR_DEFAUT * 100} % appliquee.`);
  }

  return {
    version: VERSION,
    rendu: true,
    score,
    mention: m.mention,
    suite: m.suite,
    axeFaible,
    axeA: a,
    axeB: b,
    reserves,
  };
}

/**
 * Passerelle entre ce qu'un modele a EXTRAIT d'une proposition et le score.
 * C'est ici que la doctrine s'applique concretement :
 *   - un code hors bareme est ignore, pas devine — et l'anomalie est tracee ;
 *   - une grandeur a null n'est pas transmise, pour que l'axe B la voie ABSENTE
 *     et se declare non mesurable, au lieu de la lire comme un zero. Confondre
 *     « pas de mise en route » et « mise en route inconnue » rendrait rentables
 *     des propositions dont on ignore le prix.
 */
export function depuisExtraction(entrees = {}) {
  const connus = new Set(BAREME.map((b) => b.code));
  const bruts = Array.isArray(entrees.criteres_satisfaits) ? entrees.criteres_satisfaits : [];
  const presents = [...new Set(bruts.filter((x) => connus.has(x)))];
  const inventes = bruts.filter((x) => !connus.has(x));

  const eco = {};
  for (const [k, v] of Object.entries(entrees.economie || {})) {
    if (typeof v === 'number' && Number.isFinite(v)) eco[k] = v;
  }

  const r = scoreRaime({ presents, economie: eco });
  r.justifications = entrees.justifications || {};
  if (inventes.length) r.anomalie_extraction = `codes hors bareme ignores : ${inventes.join(', ')}`;
  return r;
}

/** Rendu texte court, pour un rapport ou un courriel. */
export function formuler(r) {
  if (!r.rendu) {
    return `Score rAIme non rendu (methode v${r.version}) — axe economique non mesurable.\n`
      + `Donnees a obtenir : ${r.donneesManquantes.join(', ')}.`;
  }
  const l = [
    `Score rAIme ${r.score}/100 — ${r.mention}   (methode v${r.version})`,
    `  axe A sincerite ....... ${r.axeA.note}/100${r.axeA.plafonne ? ' (plafonne)' : ''}`,
    `  axe B economie ........ ${r.axeB.note}/100  retour ${r.axeB.roiMois === null ? 'jamais' : r.axeB.roiMois + ' mois'}`,
    `  maillon faible ........ axe ${r.axeFaible}`,
  ];
  for (const x of r.reserves) l.push(`  reserve : ${x}`);
  return l.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
// SCORE rAIme v2.0 (2026-09-13, validé par Basile) — trois axes, affiché sur 1000.
//
// Ajout de l'axe C « Réalisme », que l'on retrouve chez les cabinets de conseil :
//   - la DÉMARCHE proposée (lue dans la proposition, comme l'axe A : écrite ou non) ;
//   - la MATURITÉ du client (constatée chez lui, pendant l'audit ou l'arbitrage).
// Score v2 = le plus bas des trois axes (sur 100), multiplié par 10 : un affichage
// sur 1000, la même précision (des pas de 10). Toujours le maillon faible, jamais la moyenne.
// La v1 ci-dessus reste intacte : un score v1 rendu reste lisible et recalculable.
// ════════════════════════════════════════════════════════════════════════════

export const VERSION_2 = '2.0';

export const BAREME_REALISME = [
  // la démarche proposée — lue dans la proposition
  { code: 'R1', poids: 15, groupe: 'demarche', libelle: 'Un pilote limite est prevu avant le deploiement' },
  { code: 'R2', poids: 15, groupe: 'demarche', libelle: 'Le projet est decoupe en etapes, avec un point de decision a chaque etape' },
  { code: 'R3', poids: 10, groupe: 'demarche', libelle: "Chaque etape peut s'arreter a un cout connu" },
  { code: 'R4', poids: 10, groupe: 'demarche', libelle: 'Le deploiement suit des resultats mesures' },
  { code: 'R5', poids: 10, groupe: 'demarche', libelle: "La formation et l'accompagnement des equipes sont prevus" },
  // la maturité du client — constatée chez lui
  { code: 'M1', poids: 10, groupe: 'maturite', libelle: 'Les donnees necessaires existent et sont accessibles' },
  { code: 'M2', poids: 10, groupe: 'maturite', libelle: 'Les taches visees sont decrites (procedure ou exemples)' },
  { code: 'M3', poids: 10, groupe: 'maturite', libelle: 'Une personne porte le projet en interne' },
  { code: 'M4', poids: 10, groupe: 'maturite', libelle: "Les equipes ont du temps prevu pour l'adoption" },
];

/**
 * Axe C — réalisme. La démarche se lit dans la proposition (codes R présents).
 * La maturité se CONSTATE chez le client : {M1:true|false, ...}. Une maturité non
 * constatée (clé absente) rend l'axe NON MESURABLE — elle ne se devine pas.
 */
export function axeC({ demarche = [], maturite } = {}) {
  const codesR = new Set(BAREME_REALISME.filter((b) => b.groupe === 'demarche').map((b) => b.code));
  const codesM = BAREME_REALISME.filter((b) => b.groupe === 'maturite').map((b) => b.code);
  const inconnus = (demarche || []).filter((c) => !codesR.has(c));
  if (inconnus.length) throw new Error(`score v2: code(s) de demarche inconnu(s) : ${inconnus.join(', ')}`);
  const nonConstates = codesM.filter((c) => !maturite || typeof maturite[c] !== 'boolean');
  if (nonConstates.length) return { mesurable: false, nonConstates, note: null };

  const vus = new Set(demarche);
  const detail = BAREME_REALISME.map((b) => ({ ...b, satisfait: b.groupe === 'demarche' ? vus.has(b.code) : maturite[b.code] }));
  const note = detail.reduce((s, d) => s + (d.satisfait ? d.poids : 0), 0);
  return {
    mesurable: true,
    note,
    manquants: detail.filter((d) => !d.satisfait).map((d) => ({ code: d.code, poids: d.poids, groupe: d.groupe, libelle: d.libelle })),
    detail,
  };
}

/** Score rAIme v2 = min(A, B, C) × 10, sur 1000. */
export function scoreRaimeV2({ presents, economie, realisme } = {}) {
  const a = axeA(presents);
  const b = axeB(economie);
  const c = axeC(realisme);
  const aObtenir = [...(b.mesurable ? [] : b.manquantes), ...(c.mesurable ? [] : c.nonConstates)];
  if (aObtenir.length) {
    return { version: VERSION_2, rendu: false, motif: 'axe non mesurable', aObtenir, axeA: a, axeB: b, axeC: c };
  }
  const notes = { A: a.note, B: b.note, C: c.note };
  const axeFaible = Object.keys(notes).reduce((f, k) => (notes[k] < notes[f] ? k : f), 'A');
  const sur100 = notes[axeFaible];
  const m = MENTIONS.find((x) => sur100 >= x.min);
  const reserves = [];
  if (a.plafonne) reserves.push(`Axe A plafonne a ${PLAFOND_REDHIBITOIRE} : clause(s) redhibitoire(s) absente(s) — ${a.manquantsRedhibitoires.join(', ')}.`);
  if (!b.reaffectationDocumentee) reserves.push(`Reaffectation non documentee : valeur conventionnelle de ${REAFFECTATION_PAR_DEFAUT * 100} % appliquee.`);
  return { version: VERSION_2, rendu: true, score: sur100 * 10, sur: 1000, mention: m.mention, suite: m.suite, axeFaible, axeA: a, axeB: b, axeC: c, reserves };
}

/** Passerelle v2 : codes A et R extraits de la proposition, maturité constatée chez le client. */
export function depuisExtractionV2(entrees = {}) {
  const codesA = new Set(BAREME.map((b) => b.code));
  const codesR = new Set(BAREME_REALISME.filter((b) => b.groupe === 'demarche').map((b) => b.code));
  const bruts = Array.isArray(entrees.criteres_satisfaits) ? entrees.criteres_satisfaits : [];
  const presents = [...new Set(bruts.filter((x) => codesA.has(x)))];
  const demarche = [...new Set(bruts.filter((x) => codesR.has(x)))];
  const inventes = bruts.filter((x) => !codesA.has(x) && !codesR.has(x));
  const eco = {};
  for (const [k, v] of Object.entries(entrees.economie || {})) if (typeof v === 'number' && Number.isFinite(v)) eco[k] = v;
  const r = scoreRaimeV2({ presents, economie: eco, realisme: { demarche, maturite: entrees.maturite } });
  r.justifications = entrees.justifications || {};
  if (inventes.length) r.anomalie_extraction = `codes hors bareme ignores : ${inventes.join(', ')}`;
  return r;
}

export function formulerV2(r) {
  if (!r.rendu) return `Score rAIme non rendu (methode v${r.version}) — a obtenir : ${r.aObtenir.join(', ')}.`;
  const l = [
    `Score rAIme ${r.score}/1000 — ${r.mention}   (methode v${r.version})`,
    `  axe A sincerite ....... ${r.axeA.note}/100${r.axeA.plafonne ? ' (plafonne)' : ''}`,
    `  axe B economie ........ ${r.axeB.note}/100  retour ${r.axeB.roiMois === null ? 'jamais' : r.axeB.roiMois + ' mois'}`,
    `  axe C realisme ........ ${r.axeC.note}/100`,
    `  maillon faible ........ axe ${r.axeFaible}`,
  ];
  for (const x of r.reserves) l.push(`  reserve : ${x}`);
  return l.join('\n');
}
