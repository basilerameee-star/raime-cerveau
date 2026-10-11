// Le seul code évolutif de cette première boucle : une expression arithmétique pure.
// Ni eval, ni JavaScript dynamique. Le parseur fermé ne connaît que six nombres et min/max.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { ouvrirChantier } from './chantiers.js';
export const CHEMIN = 'agents/ameliorables/classement.expr';
const VARIABLES = ['securite', 'adequation', 'fiabilite', 'licence', 'fraicheur', 'cout'];
export const formuleActuelle = () => fs.readFileSync(new URL('./ameliorables/classement.expr', import.meta.url), 'utf8');
export const empreinte = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function compiler(texte) {
  if (typeof texte !== 'string' || texte.length > 2000) throw new Error('formule absente ou trop longue');
  const jetons = texte.match(/\d+(?:\.\d+)?|[a-z]+|[()+*\/,\-]/g) || [];
  if (jetons.join('') !== texte.replace(/\s/g, '') || jetons.length > 250) throw new Error('syntaxe interdite');
  let i = 0, profondeur = 0;
  const lire = () => jetons[i++];
  function primaire() {
    if (++profondeur > 25) throw new Error('formule trop imbriquée');
    const t = lire(); let n;
    if (t === '(') { n = expression(); if (lire() !== ')') throw new Error('parenthèse manquante'); }
    else if (/^\d+(\.\d+)?$/.test(t || '')) { n = { valeur: Number(t) }; if (n.valeur > 1000) throw new Error('constante excessive'); }
    else if (VARIABLES.includes(t)) n = { variable: t };
    else if (t === 'min' || t === 'max') {
      if (lire() !== '(') throw new Error('appel invalide');
      const gauche = expression(); if (lire() !== ',') throw new Error('deux arguments exigés');
      const droite = expression(); if (lire() !== ')') throw new Error('parenthèse manquante');
      n = { op: t, gauche, droite };
    } else throw new Error('variable ou opération interdite');
    profondeur--; return n;
  }
  function produit() {
    let n = primaire();
    while (['*', '/'].includes(jetons[i])) n = { op: lire(), gauche: n, droite: primaire() };
    return n;
  }
  function expression() {
    let n = produit();
    while (['+', '-'].includes(jetons[i])) n = { op: lire(), gauche: n, droite: produit() };
    return n;
  }
  const arbre = expression();
  if (i !== jetons.length) throw new Error('texte après la formule');
  function calculer(n, notes) {
    if ('valeur' in n) return n.valeur;
    if (n.variable) {
      const v = notes[n.variable];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new Error('note invalide');
      return v;
    }
    const g = calculer(n.gauche, notes), d = calculer(n.droite, notes);
    return n.op === '+' ? g + d : n.op === '-' ? g - d : n.op === '*' ? g * d : n.op === '/' ? g / d
      : n.op === 'min' ? Math.min(g, d) : Math.max(g, d);
  }
  return (notes) => {
    const score = calculer(arbre, notes);
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('score hors de [0,1]');
    return score;
  };
}

const ancien = (n) => (3*n.securite + 3*n.adequation + 2*n.fiabilite + 2*n.licence + n.fraicheur + n.cout) / 12;
let calcul;
export function score(notes) {
  // Échec fermé : formule invalide = ancien calcul, sans modifier le refus de sécurité de l'installeur.
  try { calcul ||= compiler(formuleActuelle()); return calcul(notes); } catch { return ancien(notes); }
}

// Cas figés indépendants d'Hermes. Le gain est la qualité du classement, pas une promesse de revenus.
const n = (adequation, fiabilite, licence = 1, fraicheur = 1, cout = 1) => ({ securite: 1, adequation, fiabilite, licence, fraicheur, cout });
export const CAS = [
  { nom: 'pertinence avant popularité', bonne: n(1, .4, .6, .5), autre: n(.6, .8) },
  { nom: 'documentation officielle', bonne: n(1, .9), autre: n(1, .4) },
  { nom: 'solution adaptée', bonne: n(1, .6), autre: n(.2, .9) },
  { nom: 'licence libre', bonne: n(1, .6, 1), autre: n(1, .6, .2) },
  { nom: 'coût gratuit', bonne: n(1, .6, 1, 1, 1), autre: n(1, .6, 1, 1, .3) },
  { nom: 'solution entretenue', bonne: n(1, .6, 1, 1), autre: n(1, .6, 1, 0) },
];
export function mesurer(formule) {
  const f = compiler(formule);
  // Aux bornes, chaque critère doit garder un effet positif. Un secret ne peut pas devenir une piste sûre :
  // ce refus reste dans rechercheur/installeur, hors de la surface modifiable.
  for (let bits = 0; bits < 64; bits++) {
    const notes = Object.fromEntries(VARIABLES.map((v, j) => [v, (bits >> j) & 1]));
    const bas = f(notes);
    for (const v of VARIABLES) if (!notes[v] && f({ ...notes, [v]: 1 }) <= bas) throw new Error(`critère abandonné : ${v}`);
  }
  const cas = CAS.map((c) => ({ nom: c.nom, ok: f(c.bonne) > f(c.autre) }));
  return { reussis: cas.filter((c) => c.ok).length, total: cas.length, cas };
}
export function comparer(avant, apres) {
  const a = mesurer(avant), b = mesurer(apres);
  if (a.cas.some((c, i) => c.ok && !b.cas[i].ok)) throw new Error('régression sur un cas figé');
  if (b.reussis <= a.reussis) throw new Error('aucun gain mesuré');
  return { avant: a.reussis, apres: b.reussis, total: b.total, cas: b.cas };
}
export function validerProposition(p, actuelle = formuleActuelle()) {
  const attendus = ['version', 'titre', 'besoin', 'mesure', 'empreinte', 'formule'];
  if (!p || Array.isArray(p) || typeof p !== 'object' || Object.keys(p).sort().join() !== attendus.sort().join() || p.version !== 1)
    throw new Error('proposition hors schéma');
  for (const k of ['titre', 'besoin', 'mesure']) if (typeof p[k] !== 'string' || p[k].trim().length < 10 || p[k].length > 500)
    throw new Error(`champ ${k} invalide`);
  if (!/\d/.test(p.mesure)) throw new Error('mesure sans chiffre');
  if (p.empreinte !== empreinte(actuelle)) throw new Error('proposition périmée');
  return comparer(actuelle, p.formule);
}
export async function proposer(p, { brain = null } = {}) {
  const preuve = validerProposition(p);
  return ouvrirChantier({ titre: `[auto] ${p.titre}`, constat: p.besoin, mesure: p.mesure,
    attendu: `Classement : ${preuve.avant}/${preuve.total} → ${preuve.apres}/${preuve.total}, sans régression.`,
    piste: '```raime-amelioration-v1\n' + JSON.stringify(p) + '\n```', source: 'hermes' }, { brain });
}
export function ordreAmelioration() {
  const actuelle = formuleActuelle(), m = mesurer(actuelle);
  if (m.reussis === m.total) return null;
  return `Amélioration interne demandée par le Directeur : le classement des pistes de recherche réussit ${m.reussis}/${m.total} cas figés. `
    + `Lis agents/amelioration.js et ${CHEMIN} dans /cerveau. Le besoin : ${m.cas.filter(c => !c.ok).map(c => c.nom).join(', ')}. `
    + `Cherche une formule arithmétique meilleure, avec les six critères, dans ton dossier de travail. Ne touche aucun fichier de /cerveau. `
    + `Mesure avec comparer(ancienne, candidate), copie l'expression exacte. Puis utilise l'outil MCP amelioration_proposer avec proposition `
    + `contenant le JSON strict {version:1,titre,besoin,mesure,empreinte:"${empreinte(actuelle)}",formule}. `
    + `Aucun import, script, secret, dépendance ni changement de garde-fou. Une proposition sera retestée en sandbox puis livrée automatiquement si elle gagne.`;
}
