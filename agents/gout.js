// LE GOÛT — le contrôle de la justesse des décisions (voulu par Basile le 30/09/2026 : « un agent qui
// contrôle les capacités à prendre les bonnes décisions, un peu comme du goût »).
//
// Avant qu'une décision autonome engage la maison (une question posée à Basile, un plan choisi, une
// idée proposée), le goût la pèse contre le cap (jarvis/cap.cjs) et rend l'un des quatre états de
// l'architecture cible : AUTO (elle passe), REVUE (le gouverneur la reprend), BASILE (son accord),
// BLOQUE (jamais). Deux étages :
//   1. des RÈGLES, en code : l'argent, les identifiants, un envoi ou une publication (Constitution) ;
//   2. JEV, de TypeSafe (agents/decision.js) : des probabilités typées, en une passe, sans prose.
//      Questions en anglais, sa langue la plus sûre ; la situation reste en français.
// Sans clé JEV, ou si JEV ne répond pas : les règles seules, et le doute va à la REVUE.
// Chaque jugement est gardé (table jugements) : sa suite réelle, notée plus tard, apprendra au goût
// à se régler (couche qui évolue par les faits, jamais par une réécriture silencieuse).
import { decider, disponible } from './decision.js';
import { createRequire } from 'node:module';
const { BOUSSOLE, MAISON } = createRequire(import.meta.url)('../jarvis/cap.cjs');

export const PLAFOND_JOUR = Number(process.env.GOUT_PLAFOND_JOUR || 500); // appels JEV par jour (≈ 0,01 $)

// Étage 1 : ce que le code sait trancher seul.
const INTERDIT = /\b(virement|virer de l'argent|payer|paiement|acheter|achat|carte bancaire|iban|mot de passe|password|captcha|pi[eè]ce d'identit[eé])\b/i;
const EXTERIEUR = /\b(envoyer|envoie|publier|publie|poster|post(e|er)? sur|mail(er)? [àa]|e-mail [àa]|écrire [àa] (un|une|des|le|la|les) (client|prospect)|campagne|publicit[eé] payante)\b/i;
export function regles(action) {
  const a = String(action || '');
  if (INTERDIT.test(a)) return { verdict: 'BLOQUE', motif: 'argent, identifiant ou vérification humaine : zone 3 de la Constitution' };
  if (EXTERIEUR.test(a)) return { verdict: 'BASILE', motif: 'un envoi ou une publication : l\'accord de Basile d\'abord' };
  return null;
}

// Étage 2 : les questions posées à JEV.
export const QUESTIONS = {
  aligned: { type: 'noul', instructions: 'Does the proposed action move rAIme toward Goal 1 or Goal 2 of the compass?' },
  within_rules: { type: 'noul', instructions: 'Does the proposed action stay within the rules: no money spent, nothing sent or published, nothing invented, without Basile\'s approval?' },
  simplest: { type: 'noul', instructions: 'Is the proposed action the simplest useful next step, rather than busywork or a duplicate of existing work?' },
  goal: { type: 'choice', instructions: 'Which goal does the proposed action serve?',
    criteria: { media: 'Goal 1, monetizing Basile\'s content', business: 'Goal 2, rAIme consulting revenue', upkeep: 'Keeping the system reliable', none: 'No goal' } },
};

// Des probabilités à l'état, par des seuils écrits ici (réglables à la lumière des jugements gardés).
export function verdict(s) {
  if (s.within_rules < 0.35) return { verdict: 'BASILE', motif: `hors des règles (${s.within_rules.toFixed(2)})` };
  if (s.aligned >= 0.6 && s.simplest >= 0.5) return { verdict: 'AUTO', motif: `servira « ${s.goal} » (${s.aligned.toFixed(2)})` };
  if (s.aligned < 0.3 || s.goal === 'none') return { verdict: 'REVUE', motif: `ne sert aucun objectif (${s.aligned.toFixed(2)})` };
  return { verdict: 'REVUE', motif: `doute (alignement ${s.aligned.toFixed(2)}, simplicité ${s.simplest.toFixed(2)})` };
}

async function garder(brain, j) {
  try {
    await brain.query(`CREATE TABLE IF NOT EXISTS jugements (id serial PRIMARY KEY, le timestamptz NOT NULL DEFAULT now(),
      source text NOT NULL, action text NOT NULL, verdict text NOT NULL, motif text, scores jsonb, modele text,
      cout_usd numeric(12,8) DEFAULT 0, suite text, suite_le timestamptz)`);
    const { rows } = await brain.query(`INSERT INTO jugements (source, action, verdict, motif, scores, modele, cout_usd)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [j.source, j.action.slice(0, 1000), j.verdict, j.motif, j.scores ? JSON.stringify(j.scores) : null, j.modele, j.coutUsd || 0]);
    return rows[0].id;
  } catch { return null; }
}

async function appelsDuJour(brain) {
  try {
    return (await brain.query(`SELECT count(*)::int AS n FROM jugements WHERE modele LIKE 'jev%'
      AND le >= date_trunc('day', now())`)).rows[0].n;
  } catch { return 0; }
}

// Pèse une décision. source : qui décide (« architecte », « penseur »…) ; action : ce qui serait fait ;
// contexte : la situation, en quelques lignes. Rend { verdict, motif, scores, id }.
export async function juger({ brain, source, action, contexte = '', decide = decider }) {
  const r = regles(action);
  if (r) return { ...r, scores: null, id: await garder(brain, { source, action, ...r, modele: 'regles' }) };
  if (!disponible() || (await appelsDuJour(brain)) >= PLAFOND_JOUR) {
    const j = { verdict: 'REVUE', motif: disponible() ? 'plafond du jour de JEV atteint' : 'JEV absent : les règles seules', modele: 'regles' };
    return { ...j, scores: null, id: await garder(brain, { source, action, ...j }) };
  }
  try {
    const d = await decide({ etat: `${BOUSSOLE}\nSITUATION: ${String(contexte).slice(0, 3000)}\nPROPOSED ACTION (${source}): ${String(action).slice(0, 1500)}`,
      questions: QUESTIONS });
    const rep = d.reponses;
    const s = { aligned: rep.aligned.probabilite, within_rules: rep.within_rules.probabilite, simplest: rep.simplest.probabilite,
      goal: rep.goal.valeur, confiance: rep.goal.confiance };
    const v = verdict(s);
    return { ...v, scores: s, id: await garder(brain, { source, action, ...v, scores: s, modele: d.modele, coutUsd: d.costUsd }) };
  } catch (e) {
    const j = { verdict: 'REVUE', motif: `JEV indisponible : ${String(e.message).slice(0, 120)}`, modele: 'regles' };
    return { ...j, scores: null, id: await garder(brain, { source, action, ...j }) };
  }
}

// UNE QUESTION POUR BASILE mérite-t-elle son temps ? Le 30/09/2026, dix questions de l'architecte
// attendaient, dont plusieurs confuses ou trouvables dans le dépôt. Seule passe celle que Basile seul
// peut trancher, qui débloque un objectif, et qui se répond en une phrase. Sans JEV : elle passe, comme
// avant (le goût ne retire rien qu'il ne sait pas juger).
export const QUESTIONS_BASILE = {
  only_basile: { type: 'noul', instructions: 'Is this a question only Basile can answer or decide, given what the system already has?' },
  unblocks: { type: 'noul', instructions: 'Would the answer unblock concrete progress toward Goal 1 or Goal 2?' },
  clear: { type: 'noul', instructions: 'Is the question clear, specific and answerable in one sentence?' },
};
export function verdictQuestion(s) {
  const seuils = { only_basile: 0.6, unblocks: 0.5, clear: 0.5 };
  const bas = Object.entries(s).filter(([k, p]) => p < (seuils[k] ?? 0.5)).map(([k, p]) => `${k} ${p.toFixed(2)}`);
  return bas.length ? { verdict: 'REVUE', motif: `question retenue : ${bas.join(', ')}` }
    : { verdict: 'AUTO', motif: 'question utile' };
}

// Le code d'abord : ce que la maison décide seule (créer une note, un dossier…) ou trouve seule (ses notes,
// son site, sa charte) n'est jamais une question pour Basile. Mesuré le 30/09/2026 sur les 16 questions
// en attente : ces deux règles en retiennent 12 ; JEV juge les autres.
const QUESTION_INTERNE = /^(veux-tu|voulez-vous|autorises-tu|faut-il|dois-je|puis-je)\b.*\b(cr[ée]|r[ée]dig|note|r[ée]pertoire|dossier|fichier|script)/i;
const QUESTION_TROUVABLE = /(existe-t-il|existent-elles|as-tu des notes|y a-t-il des notes|l'url du site|le chemin des pages|charte graphique|catalogue d'actions|comment puis-je acc[ée]der)/i;
export function reglesQuestion(question) {
  const q = String(question || '').trim();
  if (QUESTION_INTERNE.test(q)) return { verdict: 'REVUE', motif: 'décision interne et réversible : la maison la prend seule' };
  if (QUESTION_TROUVABLE.test(q)) return { verdict: 'REVUE', motif: 'la réponse est dans les notes, le site ou le dépôt' };
  return null;
}

export async function jugerQuestion({ brain, source, question, contexte = '', decide = decider }) {
  const action = `Ask Basile: ${question}`;
  const r = reglesQuestion(question);
  if (r) return { ...r, scores: null, id: await garder(brain, { source, action, ...r, modele: 'regles' }) };
  if (!disponible() || (await appelsDuJour(brain)) >= PLAFOND_JOUR) return { verdict: 'AUTO', motif: 'sans JEV : la question passe', id: null };
  try {
    const d = await decide({ etat: `${BOUSSOLE}\n${MAISON}\nSITUATION: ${String(contexte).slice(0, 2000)}\nQUESTION FROM ${source} TO BASILE: ${String(question).slice(0, 800)}`,
      questions: QUESTIONS_BASILE });
    const s = Object.fromEntries(Object.entries(d.reponses).map(([k, v]) => [k, v.probabilite]));
    const v = verdictQuestion(s);
    return { ...v, scores: s, id: await garder(brain, { source, action, ...v, scores: s, modele: d.modele, coutUsd: d.costUsd }) };
  } catch (e) {
    return { verdict: 'AUTO', motif: 'JEV indisponible : la question passe', id: null };
  }
}

// La suite réelle d'un jugement (réussite, échec, refus de Basile) : la matière du réglage des seuils.
export async function noterSuite({ brain, id, suite }) {
  if (!id) return;
  try { await brain.query('UPDATE jugements SET suite = $2, suite_le = now() WHERE id = $1', [id, String(suite).slice(0, 300)]); } catch {}
}
