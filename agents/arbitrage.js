// ARBITRAGE — plusieurs offres, une meme grille publique (Score rAIme v2.0), un rapport ARB-01.
//
// Le modele n'intervient qu'en amont (Analyste, Auditeur) : il CONSTATE ce que chaque
// proposition contient. Tout ce qui suit est du code, sans aucun appel de modele :
// le classement, la recommandation, le cout sur trois ans, les questions a poser.
// Deux offres identiques donnent le meme rapport aujourd'hui et dans trois ans.
//
//   node agents/arbitrage.js --client "Nom" [--secteur ".."] [--taille ".."]
//        [--maturite M1=oui,M2=non,M3=oui,M4=oui] offre1.txt offre2.txt [offre3.txt]
//   node agents/arbitrage.js --client "Nom" --audits <id1>,<id2>   (audits deja faits)
import { BAREME, BAREME_REALISME, REDHIBITOIRES } from './score.js';

// ── La question a poser pour chaque critere manquant ────────────────────────
// Une par code, ecrite pour etre lue telle quelle au prestataire.
export const QUESTIONS = {
  A1: 'Quelle tâche précise sera automatisée ?',
  A2: 'Quel volume est traité chaque mois ?',
  A3: 'Combien de temps prend la tâche aujourd’hui, mesuré chez nous ?',
  A4: 'Combien de temps restera-t-il par tâche après la mise en service ?',
  A5: 'Que feront nos équipes du temps libéré ?',
  B1: 'Quelle part se paie une fois, quelle part chaque mois ?',
  B2: 'Quel est le coût récurrent sur douze mois ?',
  B3: 'Qu’est-ce qui peut faire monter le prix, et de combien ?',
  B4: 'Quelles licences tierces faut-il payer, et combien ?',
  B5: 'Combien coûte la maintenance, et que couvre-t-elle ?',
  B6: 'Combien de jours de nos équipes le projet demande-t-il ?',
  B7: 'Quel résultat mesuré valide le projet, et que se passe-t-il s’il n’est pas atteint ?',
  C1: 'Quelle est la durée d’engagement ?',
  C2: 'À qui appartiennent nos données, et dans quel format les récupère-t-on ?',
  C3: 'À qui appartient ce qui est construit pour nous ?',
  C4: 'Combien coûte la sortie, et en combien de temps ?',
  C5: 'Où sont hébergées nos données, et sous quel droit ?',
  D1: 'Quel client d’un métier proche peut-on appeler ?',
  D2: 'À quelle date la mise en service est-elle garantie ?',
  D3: 'Qui réalisera le travail, nommément ?',
  D4: 'Qu’est-ce qui reste à notre charge ?',
  D5: 'Une solution plus simple a-t-elle été envisagée ?',
  R1: 'Un pilote limité est-il prévu avant le déploiement ?',
  R2: 'Quelles sont les étapes, et où sont les points de décision ?',
  R3: 'Combien coûte l’arrêt à chaque étape ?',
  R4: 'Le déploiement attend-il des résultats mesurés ?',
  R5: 'Comment nos équipes seront-elles formées et accompagnées ?',
};

// ── Ce que lit le client : libelles accentues ───────────────────────────────
// score.js reste en ASCII (c'est la reference de calcul, recalculable par un tiers) ;
// ces textes n'en changent que l'affichage. Un code absent d'ici garde son libelle d'origine.
export const LIBELLES = {
  A1: 'La tâche visée est nommée précisément',
  A2: 'Le volume traité est chiffré',
  A3: 'Le temps actuel par unité est chiffré, et mesuré chez le client',
  A4: 'Le temps restant après automatisation est annoncé',
  A5: 'La réaffectation du temps libéré est traitée',
  B1: 'Mise en route et coût récurrent sont distincts',
  B2: 'Le coût récurrent est annoncé sur douze mois',
  B3: 'Les déclencheurs de hausse de prix sont écrits',
  B4: 'Les licences tierces sont chiffrées ou explicitement exclues',
  B5: 'La maintenance est chiffrée, avec son périmètre',
  B6: 'Le temps des équipes du client est chiffré',
  B7: 'Un critère de réussite et sa conséquence sont écrits',
  C1: 'La durée d’engagement est écrite',
  C2: 'Propriété des données et format de récupération',
  C3: 'Propriété ou droit d’usage de ce qui est construit',
  C4: 'Coût et délai de sortie',
  C5: 'Hébergement et juridiction des données précisés',
  D1: 'Une référence vérifiable dans un métier proche',
  D2: 'Un délai de mise en service engageant',
  D3: 'Le nom de qui réalisera le travail',
  D4: 'Ce qui reste à la charge du client, listé',
  D5: 'Une alternative plus simple est évoquée',
  R1: 'Un pilote limité est prévu avant le déploiement',
  R2: 'Le projet est découpé en étapes, avec un point de décision à chaque étape',
  R3: 'Chaque étape peut s’arrêter à un coût connu',
  R4: 'Le déploiement suit des résultats mesurés',
  R5: 'La formation et l’accompagnement des équipes sont prévus',
  M1: 'Les données nécessaires existent et sont accessibles',
  M2: 'Les tâches visées sont décrites (procédure ou exemples)',
  M3: 'Une personne porte le projet en interne',
  M4: 'Les équipes ont du temps prévu pour l’adoption',
};
export const MENTIONS_AFFICHEES = {
  'Signable': { mention: 'Signable', suite: 'Signer après avoir obtenu par écrit les rares points manquants.' },
  'Signable sous conditions': { mention: 'Signable sous conditions', suite: 'Le fond tient. Des engagements manquent à l’écrit.' },
  'A renegocier': { mention: 'À renégocier', suite: 'Un axe est faible. Périmètre, prix de mise en route ou clauses de sortie à revoir.' },
  'A refaire': { mention: 'À refaire', suite: 'La proposition est à redemander, pas à négocier.' },
  'A refuser': { mention: 'À refuser', suite: 'Signer exposerait l’entreprise à un coût sans contrepartie mesurable.' },
};
export const libelle = (code, defaut = '') => LIBELLES[code] || defaut;
export const mentionAffichee = (s) => MENTIONS_AFFICHEES[s?.mention] || { mention: s?.mention || '', suite: s?.suite || '' };

// Ce qui manque pour noter, dit en mots : le client ne lit ni « M3 » ni « miseEnRoute ».
const GRANDEURS = {
  volumeMensuel: 'le volume traité chaque mois',
  tempsActuelMin: 'le temps actuel par tâche',
  tempsResiduelMin: 'le temps restant après la mise en service',
  coutHoraire: 'le coût horaire des équipes',
  miseEnRoute: 'le prix de mise en route',
  abonnementMensuel: 'l’abonnement mensuel',
};
export function enClair(aObtenir = []) {
  const eco = aObtenir.filter((x) => GRANDEURS[x]).map((x) => GRANDEURS[x]);
  const m = aObtenir.filter((x) => /^M\d$/.test(x));
  const autres = aObtenir.filter((x) => !GRANDEURS[x] && !/^M\d$/.test(x));
  const morceaux = [];
  if (eco.length) morceaux.push(`dans la proposition : ${eco.join(', ')}`);
  if (m.length) morceaux.push(`chez vous, la maturité du projet (${m.map((x) => libelle(x, x).toLowerCase()).join(' ; ')})`);
  if (autres.length) morceaux.push(autres.join(', '));
  return morceaux.join(' · ');
}

/** Les reserves du score, reecrites depuis ses donnees (pas depuis son texte ASCII). */
export function reservesAffichees(s) {
  const r = [];
  if (s?.axeA?.plafonne) {
    r.push(`Axe A plafonné à 40 : clause(s) rédhibitoire(s) absente(s) — ${s.axeA.manquantsRedhibitoires.join(', ')}.`);
  }
  if (s?.axeB?.mesurable && !s.axeB.reaffectationDocumentee) {
    r.push('Réaffectation du temps libéré non documentée : la valeur conventionnelle de 50 % est appliquée.');
  }
  return r;
}

// Seuils de la recommandation, lus sur l'echelle publique (sur 1000).
export const SEUIL_SIGNABLE = 800;
export const SEUIL_CONDITIONS = 600;
export const SEUIL_RENEGOCIER = 400;

const CODES_M = BAREME_REALISME.filter((b) => b.groupe === 'maturite').map((b) => b.code);
const OUI = new Set(['oui', 'o', 'yes', 'y', 'vrai', 'true', '1']);
const NON = new Set(['non', 'n', 'no', 'faux', 'false', '0']);
const nombre = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * « M1=oui,M2=non,M3=oui,M4=oui » -> { M1:true, M2:false, ... }.
 * Un code ou une valeur inconnus arretent tout : une maturite mal saisie ne doit pas
 * passer pour un constat.
 */
export function lireMaturite(texte) {
  if (!texte || !String(texte).trim()) return null;
  const m = {};
  for (const morceau of String(texte).split(/[,;\s]+/).filter(Boolean)) {
    const [code, valeur = ''] = morceau.split('=');
    const c = code.trim().toUpperCase();
    const v = valeur.trim().toLowerCase();
    if (!CODES_M.includes(c)) throw new Error(`maturite : code inconnu « ${code} » (attendus : ${CODES_M.join(', ')})`);
    if (OUI.has(v)) m[c] = true;
    else if (NON.has(v)) m[c] = false;
    else throw new Error(`maturite : valeur illisible pour ${c} : « ${valeur} » (oui ou non)`);
  }
  return m;
}

/**
 * Cout complet sur 36 mois, a partir des grandeurs relevees dans la proposition.
 * Une grandeur absente n'est jamais comptee zero en silence : elle est listee dans
 * `nonChiffre`, et le total devient un minimum (« au moins »).
 */
export function coutTroisAns(eco = {}) {
  const postes = {
    miseEnRoute: nombre(eco.miseEnRoute) ? eco.miseEnRoute : null,
    abonnements: nombre(eco.abonnementMensuel)
      ? (eco.abonnementMensuel + (nombre(eco.licencesMensuelles) ? eco.licencesMensuelles : 0)) * 36
      : null,
    maintenance: nombre(eco.maintenanceAnnuelle) ? eco.maintenanceAnnuelle * 3 : null,
    tempsEquipes: nombre(eco.joursInternes) && nombre(eco.coutJour) ? eco.joursInternes * eco.coutJour : null,
  };
  const nonChiffre = [];
  if (postes.miseEnRoute === null) nonChiffre.push('mise en route');
  if (postes.abonnements === null) nonChiffre.push('abonnement');
  else if (!nombre(eco.licencesMensuelles)) nonChiffre.push('licences');
  if (postes.maintenance === null) nonChiffre.push('maintenance');
  if (postes.tempsEquipes === null) nonChiffre.push('temps de vos équipes');
  const connus = Object.values(postes).filter((v) => v !== null);
  const total = connus.length ? Math.round(connus.reduce((s, v) => s + v, 0)) : null;
  return { ...postes, total, complet: nonChiffre.length === 0, nonChiffre };
}

/**
 * Les points a obtenir par ecrit d'un prestataire : criteres A et R absents,
 * les clauses redhibitoires (C2, C3, C4) d'abord, puis par poids decroissant.
 * La maturite (M) n'y figure pas : elle se travaille chez le client, pas chez le prestataire.
 */
export function aObtenirParEcrit(score) {
  const manquants = [
    ...(score?.axeA?.manquants || []),
    ...((score?.axeC?.manquants || []).filter((m) => m.groupe === 'demarche')),
  ];
  // axe C non mesurable : sa partie demarche se lit quand meme dans la proposition
  if (score?.axeC?.mesurable === false && Array.isArray(score.axeC.demarcheManquante)) {
    manquants.push(...score.axeC.demarcheManquante);
  }
  const rang = (m) => (REDHIBITOIRES.includes(m.code) ? 0 : 1);
  return manquants
    .map((m) => ({ code: m.code, poids: m.poids, libelle: libelle(m.code, m.libelle), question: QUESTIONS[m.code] || '' }))
    .sort((x, y) => rang(x) - rang(y) || y.poids - x.poids || x.code.localeCompare(y.code));
}

/**
 * Classement : les offres notees d'abord, du meilleur score au moins bon ; a score egal,
 * la moins chere sur trois ans passe devant (un total partiel passe apres un total complet).
 * Les offres non notees suivent, avec ce qui manque pour les noter.
 */
export function classer(offres) {
  const avecCout = offres.map((o) => ({ ...o, cout: coutTroisAns(o.economie) }));
  const cle = (o) => [o.cout.complet ? 0 : 1, o.cout.total ?? Infinity];
  const notees = avecCout.filter((o) => o.score?.rendu).sort((x, y) => {
    if (y.score.score !== x.score.score) return y.score.score - x.score.score;
    const [cx, tx] = cle(x); const [cy, ty] = cle(y);
    return cx - cy || tx - ty || x.nom.localeCompare(y.nom);
  });
  const nonNotees = avecCout.filter((o) => !o.score?.rendu).sort((x, y) => x.nom.localeCompare(y.nom));
  return { notees, nonNotees };
}

/** La recommandation, lue sur l'echelle publique. Aucune appreciation libre. */
export function recommander({ notees, nonNotees }) {
  if (!notees.length) {
    const manque = [...new Set(nonNotees.flatMap((o) => o.score?.aObtenir || []))];
    return {
      type: 'obtenir',
      titre: 'Obtenir les données manquantes avant de choisir',
      texte: `Aucune offre ne peut encore être notée. Il manque, ${enClair(manque) || 'la lecture des offres'}.`,
    };
  }
  const tete = notees[0];
  const s = tete.score;
  const second = notees.length > 1 && notees[1].score.score === s.score ? notees[1] : null;
  // A score egal, on ne dit « moins chere » que si les deux couts sont complets et differents.
  const moinsChere = second && tete.cout.complet && second.cout.complet && tete.cout.total < second.cout.total;
  const precision = !second ? ''
    : moinsChere ? ` À score égal avec ${second.nom}, elle passe devant par son coût sur trois ans.`
    : ` À score égal avec ${second.nom} : départager sur les points de la partie 02.`;
  if (s.score >= SEUIL_SIGNABLE) {
    return { type: 'signer', offre: tete.nom, titre: `${tete.nom}`,
      texte: `${s.score} / 1000, signable. Obtenir par écrit les rares points de la partie 02 avant de signer.${precision}` };
  }
  if (s.score >= SEUIL_CONDITIONS) {
    return { type: 'conditions', offre: tete.nom, titre: `${tete.nom}, sous conditions`,
      texte: `${s.score} / 1000. Le fond tient : signer une fois les points de la partie 02 écrits dans la proposition.${precision}` };
  }
  if (s.score >= SEUIL_RENEGOCIER) {
    return { type: 'renegocier', offre: tete.nom, titre: `Renégocier avec ${tete.nom}`,
      texte: `${s.score} / 1000. L’axe le plus faible est ${NOM_AXE[s.axeFaible]} : c’est lui qu’il faut renégocier.${precision}` };
  }
  return { type: 'redemander', titre: 'Redemander une proposition',
    texte: `La meilleure offre obtient ${s.score} / 1000 : aucune n’atteint ${SEUIL_RENEGOCIER}. Les offres sont à redemander, pas à négocier.` };
}

const NOM_AXE = { A: 'la sincérité (A)', B: 'la rentabilité (B)', C: 'le réalisme (C)' };
const EUR = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' €');
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const PREUVE = { A: 'vérifié', B: 'déclaré', C: 'à tester' };

/** Le rapport ARB-01, en markdown. Pur : memes offres, meme texte. */
export function rapportArbitrage({ client, objet = null, date, offres, maturite = null }) {
  const cl = classer(offres);
  const reco = recommander(cl);
  const toutes = [...cl.notees, ...cl.nonNotees];
  const L = [];
  const p = (x = '') => L.push(x);

  p('---');
  p(`title: Rapport d'arbitrage — ${esc(client)}`);
  p('ref: ARB-01');
  p('---');
  p('');
  p(`# *Rapport* d'arbitrage`);
  p('');
  p(`**Client :** ${esc(client)}${objet ? ` · ${esc(objet)}` : ''} · **Remis le** ${esc(date)}`);
  p('');
  p('Les offres reçues, lues avec la même grille publique. La décision vous revient.');
  p('');

  // 01 — la decision
  p('## 1. La décision en une page');
  p('');
  p(`> **${esc(reco.titre)}.** ${esc(reco.texte)}`);
  p('');
  p('| Prestataire | Score | Mention | Axe le plus faible | Coût complet 3 ans | Remboursement |');
  p('|---|---|---|---|---|---|');
  for (const o of cl.notees) {
    const s = o.score;
    const rb = s.axeB?.roiMois == null ? 'jamais' : `${s.axeB.roiMois} mois`;
    p(`| **${esc(o.nom)}** | ${s.score} / 1000 | ${esc(mentionAffichee(s).mention)} | ${s.axeFaible} | ${o.cout.complet ? '' : 'au moins '}${EUR(o.cout.total)} | ${rb} |`);
  }
  for (const o of cl.nonNotees) {
    p(`| **${esc(o.nom)}** | non noté | à compléter : ${esc(enClair(o.score?.aObtenir || []))} | — | ${o.cout.total == null ? '—' : (o.cout.complet ? '' : 'au moins ') + EUR(o.cout.total)} | — |`);
  }
  p('');

  // 02 — a obtenir par ecrit
  p('## 2. À obtenir par écrit avant de signer');
  p('');
  p('Les points manquants, dans l’ordre de leur poids. Les clauses C2, C3 et C4 (données, propriété, sortie) passent en premier.');
  p('');
  for (const o of toutes) {
    const manques = aObtenirParEcrit(o.score);
    p(`### ${esc(o.nom)}`);
    p('');
    if (!manques.length) { p('Rien à obtenir : tous les critères sont écrits dans la proposition.'); p(''); continue; }
    p('| Code | Ce qui manque | La question à poser | Poids |');
    p('|---|---|---|---|');
    for (const m of manques) p(`| ${m.code} | ${esc(m.libelle)} | ${esc(m.question)} | ${m.poids} |`);
    p('');
  }

  // 03 — le cout sur trois ans
  p('## 3. Le coût complet sur 3 ans');
  p('');
  p(`| Poste | ${toutes.map((o) => esc(o.nom)).join(' | ')} |`);
  p(`|---|${toutes.map(() => '---').join('|')}|`);
  const ligne = (lib, f) => p(`| ${lib} | ${toutes.map((o) => f(o.cout)).join(' | ')} |`);
  ligne('Mise en route', (c) => EUR(c.miseEnRoute));
  ligne('Abonnement et licences, 36 mois', (c) => EUR(c.abonnements));
  ligne('Maintenance, 3 ans', (c) => EUR(c.maintenance));
  ligne('Temps de vos équipes', (c) => EUR(c.tempsEquipes));
  ligne('**Total**', (c) => `**${c.complet ? '' : 'au moins '}${EUR(c.total)}**`);
  p('');
  const partiels = toutes.filter((o) => !o.cout.complet);
  if (partiels.length) {
    p(`Non chiffré dans la proposition : ${partiels.map((o) => `${esc(o.nom)} (${o.cout.nonChiffre.join(', ')})`).join(' · ')}. Un poste absent n'est jamais compté zéro.`);
    p('');
  }

  // 04 — le detail du score
  p('## 4. Le détail du Score');
  p('');
  p(`| Axe | ${toutes.map((o) => esc(o.nom)).join(' | ')} |`);
  p(`|---|${toutes.map(() => '---').join('|')}|`);
  const axe = (o, k) => {
    const x = o.score?.[k];
    if (!x) return '—';
    if (x.mesurable === false) return 'non mesurable';
    return `${x.note} / 100${k === 'axeA' && x.plafonne ? ' (plafonné)' : ''}`;
  };
  p(`| A · Sincérité (22 critères) | ${toutes.map((o) => axe(o, 'axeA')).join(' | ')} |`);
  p(`| B · Rentabilité | ${toutes.map((o) => axe(o, 'axeB')).join(' | ')} |`);
  p(`| C · Réalisme (démarche et maturité) | ${toutes.map((o) => axe(o, 'axeC')).join(' | ')} |`);
  p(`| **Score = le plus bas × 10** | ${toutes.map((o) => (o.score?.rendu ? `**${o.score.score} / 1000**` : 'non noté')).join(' | ')} |`);
  p('');
  const reserves = toutes.flatMap((o) => reservesAffichees(o.score).map((x) => `${o.nom} — ${x}`));
  if (reserves.length) { p(`Réserves : ${reserves.map(esc).join(' · ')}`); p(''); }
  if (maturite) {
    const lu = BAREME_REALISME.filter((b) => b.groupe === 'maturite')
      .map((b) => `${b.code} ${libelle(b.code, b.libelle).toLowerCase()} : ${maturite[b.code] === true ? 'oui' : maturite[b.code] === false ? 'non' : 'non constaté'}`);
    p(`Maturité constatée chez vous (commune à toutes les offres) : ${lu.join(' · ')}.`);
    p('');
  } else {
    p('Maturité non constatée : l’axe C ne peut pas être noté. Elle se constate chez vous, en entretien (4 questions, M1 à M4).');
    p('');
  }
  p('Méthode complète : Score rAIme v2.0, publique et recalculable.');
  p('');

  // 05 — le registre des preuves
  p('## 5. Le registre des preuves');
  p('');
  p('| Offre | Affirmation du prestataire | Statut | Source |');
  p('|---|---|---|---|');
  let lignes = 0;
  for (const o of toutes) {
    for (const x of (o.constats || []).slice(0, 6)) {
      p(`| ${esc(o.nom)} | ${esc(x.titre || x.constat)} | ${PREUVE[String(x.preuve).toUpperCase()] || 'à tester'} | ${esc(x.source || 'proposition')} |`);
      lignes++;
    }
  }
  if (!lignes) p('| — | — | — | — |');
  p('');
  p('Vérifié : mesuré sur vos données. Déclaré : écrit dans une source datée. À tester : estimé, à confirmer avant de signer.');
  p('');
  p('rAIme ne perçoit aucune commission d’un éditeur ou d’un intégrateur. Si rAIme propose aussi sa propre automatisation, elle figure dans ce tableau, notée avec la même grille.');
  p('');
  return { markdown: L.join('\n'), recommandation: reco, classement: cl };
}

// ── Branchement sur la base : des audits deja faits vers le rapport ─────────
export async function arbitrer({ auditIds, client, maturite = null, objet = null }) {
  const { rows } = await client.query(
    `SELECT a.id, a.findings, a.cost_model, p.vendor, p.parsed, co.name AS client_nom
     FROM audits a JOIN proposals p ON p.id = a.proposal_id
     LEFT JOIN companies co ON co.id = a.company_id
     WHERE a.id = ANY($1::uuid[])`, [auditIds]);
  if (rows.length !== auditIds.length) throw new Error(`arbitrage : ${auditIds.length - rows.length} audit(s) introuvable(s)`);
  const vus = new Map();
  const offres = rows.map((r, i) => {
    let nom = r.vendor || r.parsed?.fournisseur || `Offre ${i + 1}`;
    vus.set(nom, (vus.get(nom) || 0) + 1);
    if (vus.get(nom) > 1) nom = `${nom} (${vus.get(nom)})`;
    const cm = r.cost_model || {};
    return { nom, auditId: r.id, score: cm.score_raime || null,
             economie: cm.entrees_score?.economie || {}, constats: Array.isArray(r.findings) ? r.findings : [] };
  });
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return rapportArbitrage({ client: rows[0].client_nom || 'Client', objet, date, offres, maturite });
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { db } = await import('./lib.js');
  const { analyser } = await import('./analyste.js');
  const { auditer } = await import('./auditeur.js');
  const { contredire } = await import('./contradicteur.js');

  const args = process.argv.slice(2);
  const opt = (nom) => { const i = args.indexOf(`--${nom}`); return i > -1 ? args[i + 1] : null; };
  const avecValeur = new Set(['client', 'secteur', 'taille', 'maturite', 'audits', 'objet']);
  const fichiers = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && avecValeur.has(args[i - 1].slice(2))));
  const nomClient = opt('client');
  if (!nomClient || (!fichiers.length && !opt('audits'))) {
    console.error('Usage: node agents/arbitrage.js --client "Nom" [--maturite M1=oui,...] offre1.txt offre2.txt | --audits id1,id2');
    process.exit(1);
  }
  let maturite = lireMaturite(opt('maturite'));

  const c = db();
  await c.connect();
  try {
    let { rows } = await c.query('SELECT id, profile FROM companies WHERE name=$1', [nomClient]);
    if (!rows.length) {
      rows = (await c.query('INSERT INTO companies(name,sector,size,profile) VALUES($1,$2,$3,$4) RETURNING id, profile',
        [nomClient, opt('secteur'), opt('taille'), JSON.stringify({ saisi_le: new Date().toISOString() })])).rows;
    }
    const companyId = rows[0].id;
    // La maturite constatee est gardee sur la fiche du client : elle vaut pour toutes ses offres.
    if (maturite) {
      await c.query(`UPDATE companies SET profile = coalesce(profile,'{}'::jsonb) || jsonb_build_object('maturite', $2::jsonb) WHERE id=$1`,
        [companyId, JSON.stringify(maturite)]);
    } else {
      maturite = rows[0].profile?.maturite || null;
    }

    let auditIds = opt('audits') ? opt('audits').split(',').map((s) => s.trim()) : [];
    for (const f of fichiers) {
      process.stdout.write(`▸ ${f} : lecture… `);
      const an = await analyser({ texte: readFileSync(f, 'utf8'), companyId, client: c });
      process.stdout.write('audit… ');
      const au = await auditer({ proposalId: an.id, companyId, maturite, client: c });
      if (au.meta.status !== 'ok') throw new Error(`Auditeur en échec sur ${f} : ${au.meta.status}`);
      process.stdout.write('revue… ');
      await contredire({ auditId: au.id, client: c });
      const s = au.audit.score_raime;
      console.log(s?.rendu ? `${s.score}/1000 ${s.mention}` : `non noté (${(s?.aObtenir || []).join(', ')})`);
      auditIds.push(au.id);
    }

    const r = await arbitrer({ auditIds, client: c, maturite, objet: opt('objet') });
    mkdirSync('out', { recursive: true });
    const slug = nomClient.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const sortie = `out/arbitrage-${slug}-${new Date().toISOString().slice(0, 10)}.md`;
    writeFileSync(sortie, r.markdown, 'utf8');
    console.log(`\nRECOMMANDATION : ${r.recommandation.titre} — ${r.recommandation.texte}`);
    console.log(`RAPPORT : ${sortie}`);
  } finally { await c.end(); }
}
