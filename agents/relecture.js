// RELECTURE — seconde lecture ciblee des criteres juges ABSENTS par l'Auditeur.
//
// Pourquoi : un modele qui lit 27 criteres d'un coup en oublie. Un oubli n'est pas
// neutre : une clause ecrite mais non vue fait chuter une bonne offre (plafond a 40 si
// C2, C3 ou C4 manque). L'essai du 24/09 l'a montre : une offre qui ecrivait la propriete
// des donnees et des regles creees a ete notee 400 au lieu d'environ 900.
//
// Comment, sans ouvrir la porte a l'invention :
//   1. le modele ne revoit QUE les criteres juges absents, et pour chacun il doit citer
//      la phrase EXACTE de la proposition, ou repondre null ;
//   2. le CODE verifie que la citation figure bien dans le texte de la proposition.
//      Une citation introuvable est rejetee : le critere reste absent.
// Meme regle pour les grandeurs economiques absentes : la valeur n'est retenue que si
// sa citation existe ET contient ce nombre.
import { askJson, logRun } from './lib.js';
import { BAREME, BAREME_REALISME } from './score.js';

export const PROMPT_VERSION = 'relecture-v1';
export const CITATION_MIN = 12; // en dessous, une « citation » ne prouve rien

const LIBELLES = Object.fromEntries(
  [...BAREME, ...BAREME_REALISME.filter((b) => b.groupe === 'demarche')].map((b) => [b.code, b.libelle]));

const GRANDEURS = {
  volumeMensuel: 'volume traite par mois (nombre)',
  tempsActuelMin: 'temps actuel par unite, en minutes',
  tempsResiduelMin: 'temps restant par unite apres automatisation, en minutes',
  miseEnRoute: 'prix de mise en route, en euros',
  abonnementMensuel: 'abonnement mensuel, en euros',
  licencesMensuelles: 'licences tierces par mois, en euros (0 si la proposition ecrit qu il n y en a aucune)',
  maintenanceAnnuelle: 'maintenance par an, en euros',
  joursInternes: 'jours de travail demandes aux equipes du client',
  partReaffectee: 'part du temps libere reaffectee (entre 0 et 1)',
};

/** Texte ramene a une forme comparable : casse, accents, apostrophes, espaces. */
export function normaliser(t) {
  return String(t ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'").replace(/[«»“”"]/g, '"')
    .replace(/[  ]/g, ' ')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Vrai si la citation figure dans le texte. Une citation coupee par « … » ou « ... »
 * est acceptee si chacun de ses morceaux utiles figure, dans l'ordre.
 */
export function citationTrouvee(citation, texte) {
  const c = normaliser(citation).replace(/^["']|["']$/g, '');
  if (c.length < CITATION_MIN) return false;
  const t = normaliser(texte);
  const morceaux = c.split(/\s*(?:…|\.\.\.)\s*/).filter((m) => m.length >= 6);
  if (!morceaux.length) return false;
  let depuis = 0;
  for (const m of morceaux) {
    const i = t.indexOf(m, depuis);
    if (i < 0) return false;
    depuis = i + m.length;
  }
  return true;
}

/** Vrai si le nombre annonce apparait dans la citation (1 450, 1450, 1.450, 0,6 ...). */
export function nombreDansCitation(valeur, citation) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return false;
  const nombres = (normaliser(citation).match(/\d[\d\s.]*(?:,\d+)?/g) || [])
    .map((n) => Number(n.replace(/\s|\.(?=\d{3}\b)/g, '').replace(',', '.')));
  if (valeur === 0) return /\b(aucun|aucune|sans|inclus|compris|0)\b/.test(normaliser(citation));
  return nombres.some((n) => Math.abs(n - valeur) < 1e-9 || Math.abs(n / 100 - valeur) < 1e-9);
}

/**
 * Applique la reponse du modele au releve, en ne gardant que ce que le code a verifie.
 * Pur : memes entrees, meme resultat. Renvoie le releve complete et le journal des decisions.
 */
export function appliquerRelecture(entrees, reponse, texte) {
  const criteres = new Set(entrees.criteres_satisfaits || []);
  const justifications = { ...(entrees.justifications || {}) };
  const economie = { ...(entrees.economie || {}) };
  const journal = { ajoutes: [], rejetes: [], grandeurs: [], grandeursRejetees: [] };

  for (const [code, citation] of Object.entries(reponse?.criteres || {})) {
    if (!LIBELLES[code] || criteres.has(code) || citation == null) continue;
    if (citationTrouvee(citation, texte)) {
      criteres.add(code);
      justifications[code] = String(citation);
      journal.ajoutes.push(code);
    } else {
      journal.rejetes.push(code);
    }
  }
  for (const [cle, v] of Object.entries(reponse?.economie || {})) {
    if (!GRANDEURS[cle] || (typeof economie[cle] === 'number') || !v || v.valeur == null) continue;
    const valeur = Number(v.valeur);
    if (citationTrouvee(v.citation, texte) && nombreDansCitation(valeur, v.citation)) {
      economie[cle] = valeur;
      journal.grandeurs.push(cle);
    } else {
      journal.grandeursRejetees.push(cle);
    }
  }
  return {
    entrees: { ...entrees, criteres_satisfaits: [...criteres], justifications, economie },
    journal,
  };
}

const SYSTEM = `Tu relis une proposition commerciale pour un cabinet indépendant, du côté du client.
Une première lecture a jugé certains critères ABSENTS. Tu vérifies chacun, un par un.
Règle absolue : un critère n'est présent que s'il est ÉCRIT dans la proposition. Pour chaque critère,
recopie MOT POUR MOT la phrase de la proposition qui le satisfait (au moins 5 mots, sans la reformuler),
ou mets null. Une citation reformulée sera rejetée automatiquement.
Pour chaque grandeur économique demandée : la valeur numérique ÉCRITE et la phrase exacte qui la contient,
ou null. N'estime rien, ne déduis rien.
Réponds UNIQUEMENT en JSON :
{"criteres": {"CODE": "citation exacte" | null}, "economie": {"cle": {"valeur": nombre, "citation": "phrase exacte"} | null}}`;

/**
 * Seconde lecture. `texte` = la proposition brute ; `entrees` = le releve de l'Auditeur.
 * Un echec du modele laisse le releve intact (la relecture ne peut qu'ajouter du verifie).
 */
export async function relire({ texte, entrees, client, ref = null }) {
  const absents = Object.keys(LIBELLES).filter((c) => !(entrees.criteres_satisfaits || []).includes(c));
  const ecoAbsente = Object.keys(GRANDEURS).filter((k) => typeof entrees.economie?.[k] !== 'number');
  if (!texte || (!absents.length && !ecoAbsente.length)) {
    return { entrees, journal: { ajoutes: [], rejetes: [], grandeurs: [], grandeursRejetees: [] }, meta: null };
  }
  const user = `## CRITÈRES JUGÉS ABSENTS
${absents.map((c) => `- ${c} : ${LIBELLES[c]}`).join('\n')}

## GRANDEURS ÉCONOMIQUES ABSENTES
${ecoAbsente.map((k) => `- ${k} : ${GRANDEURS[k]}`).join('\n')}

## LA PROPOSITION
"""
${texte}
"""`;
  const res = await askJson({ task: 'extraction', system: SYSTEM, user, maxTokens: 4000, temperature: 0 });
  if (client && res.meta) {
    const r = res.meta;
    await logRun(client, { agent: 'relecture', task: 'extraction', model: r.model, tokensIn: r.tokensIn,
      tokensOut: r.tokensOut, costUsd: r.costUsd, ms: r.ms, status: res.status, ref, promptVersion: PROMPT_VERSION });
  }
  if (res.status !== 'ok') {
    return { entrees, journal: { ajoutes: [], rejetes: [], grandeurs: [], grandeursRejetees: [], echec: res.status }, meta: res.meta };
  }
  const { entrees: completees, journal } = appliquerRelecture(entrees, res.data, texte);
  return { entrees: completees, journal, meta: res.meta };
}
