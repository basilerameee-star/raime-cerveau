// LE PENSEUR — la pensée de la nuit (demande de Basile, 25/09/2026).
//
// « Je veux qu'il réfléchisse seul, et qu'il m'envoie un mail le matin : j'ai pensé à ça, ça
//   pourrait être pertinent de faire ça, parce que j'ai vu ça dans la nuit. »
//
// Chaque nuit : il rassemble ce qu'il a vu (veille, recherches web, journal, expériences, buts,
// croyances, questions en attente), un modèle fort en tire AU PLUS TROIS idées, et le CODE vérifie :
//   - chaque idée cite au moins une source réellement vue cette nuit (sinon elle est retirée) ;
//   - une prédiction porte une date et une probabilité entre 5 et 95 % : jamais une certitude ;
//   - aucune idée ne propose de placer, acheter ou vendre de l'argent (Constitution, limite 2) ;
//   - la confiance est un nombre, pas un adjectif.
// Le texte du matin est rédigé par le code, à partir des idées vérifiées.
//
//   node agents/penseur.js            une nuit, affichée (rien n'est écrit en base)
//   node agents/penseur.js --garder   une nuit, gardée dans les tables pensees et predictions
import { askJson, logRun } from './lib.js';

export const PROMPT_VERSION = 'penseur-v1';
export const MAX_PENSEES = 3;
const PLACEMENT = /\b(ach[eè]te|vend[sre]?|investi[sr]|place[rz]?|placement|shorte?r?|parie[rz]?|acheter|vendre)\b[^.]{0,40}\b(action|actions|obligation|crypto|bitcoin|ether|titre|etf|or|devise|indice|bourse)s?\b/i;

/** Ce qu'il a vu : des faits numérotés, chacun avec son origine. */
export async function rassembler(brain, heures = 48) {
  const q = async (sql, params = []) => (await brain.query(sql, params)).rows;
  const depuis = `now() - interval '${Number(heures)} hours'`;
  const faits = [];
  const ajouter = (prefixe, liste, texte, lien = () => null) =>
    liste.forEach((x, i) => faits.push({ id: `${prefixe}${i + 1}`, texte: texte(x).replace(/\s+/g, ' ').slice(0, 400), lien: lien(x) }));
  ajouter('V', await q(`SELECT source, titre, lien, left(coalesce(detail,''),240) AS detail FROM veille WHERE vu_le > ${depuis} ORDER BY score DESC NULLS LAST LIMIT 25`),
    (x) => `[veille ${x.source}] ${x.titre} — ${x.detail}`, (x) => x.lien);
  ajouter('W', await q(`SELECT url, titre, left(coalesce(extrait,''),240) AS extrait, question FROM savoir_web WHERE vu_le > ${depuis} ORDER BY vu_le DESC LIMIT 10`),
    (x) => `[web, pour « ${x.question} »] ${x.titre} — ${x.extrait}`, (x) => x.url);
  ajouter('J', await q(`SELECT acteur, changement, left(coalesce(motif,''),160) AS motif FROM journal WHERE created_at > ${depuis} ORDER BY created_at DESC LIMIT 15`),
    (x) => `[journal ${x.acteur}] ${x.changement} — ${x.motif}`);
  ajouter('E', await q(`SELECT agent, action, succes, left(coalesce(resultat::text,''),160) AS resultat FROM experiences WHERE cree_le > ${depuis} ORDER BY cree_le DESC LIMIT 12`),
    (x) => `[expérience ${x.agent}] ${x.action} — ${x.succes ? 'réussie' : 'échec'} — ${x.resultat}`);
  const buts = await q(`SELECT horizon, enonce FROM buts WHERE etat = 'ouvert' ORDER BY horizon`);
  const croyances = await q(`SELECT sujet, enonce, confiance FROM croyances ORDER BY maj_le DESC LIMIT 12`);
  const questions = await q(`SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY cree_le DESC LIMIT 5`);
  return { faits, buts, croyances, questions };
}

export function consigne({ faits, buts, croyances, questions }, aujourdhui) {
  const system = `Tu es le cerveau de rAIme, l'entreprise de conseil en IA de Basile. C'est la nuit : tu relis ce que tu as vu
et tu réfléchis SEUL, pour Basile. Ta mission a deux faces : faire gagner de l'argent à rAIme en vendant des services
d'IA (formation, audit, arbitrage, automatisation, suivi), et comprendre le monde pour anticiper (IA, économie, santé).

Tu écris AU PLUS ${MAX_PENSEES} idées, les meilleures, pas plus. Chaque idée :
- part de faits précis de la liste (cite leurs numéros, ex. V3, W1) : rien d'autre ne compte comme source ;
- dit ce que tu as vu, ce que tu en conclus, et ce que tu proposes à Basile de faire (concret, faisable cette semaine) ;
- porte ta confiance entre 0 et 1 ;
- peut porter une prédiction vérifiable : un énoncé précis, une date d'échéance (AAAA-MM-JJ) et une probabilité entre 0.05 et 0.95.
Jamais de conseil de placement, d'achat ou de vente d'actifs financiers. Jamais d'invention : sans fait, pas d'idée.
Tu tutoies Basile, en français simple.

Réponds UNIQUEMENT en JSON :
{"pensees":[{"titre":"...","type":"vente|savoir|prediction|risque|interne","vu":"...","conclusion":"...",
"proposition":"...","sources":["V1"],"confiance":0.6,
"prediction":{"enonce":"...","domaine":"ia|economie|sante|formation|autre","echeance":"AAAA-MM-JJ","probabilite":0.4} ou null}]}`;
  const user = `Nous sommes le ${aujourdhui}.

## Les buts de Basile
${buts.map((b) => `- [${b.horizon}] ${b.enonce}`).join('\n') || '- (aucun)'}

## Tes croyances actuelles
${croyances.map((c) => `- ${c.sujet} : ${c.enonce} (confiance ${c.confiance})`).join('\n') || '- (aucune)'}

## Les questions en attente de Basile
${questions.map((x) => `- ${x.question}`).join('\n') || '- (aucune)'}

## Ce que tu as vu (les seules sources admises)
${faits.map((f) => `${f.id}. ${f.texte}${f.lien ? ` <${f.lien}>` : ''}`).join('\n') || '(rien)'}`;
  return { system, user };
}

/** Le code garde ce qui est vérifiable, retire le reste, et dit pourquoi. */
export function verifier(reponse, faits, aujourdhui) {
  const ids = new Map(faits.map((f) => [f.id, f]));
  const jour = new Date(`${aujourdhui}T00:00:00Z`).getTime();
  const gardees = [], retirees = [];
  for (const p of (reponse?.pensees || []).slice(0, MAX_PENSEES + 2)) {
    const sources = [...new Set((p.sources || []).map(String))].filter((s) => ids.has(s));
    if (!sources.length) { retirees.push({ titre: p.titre, motif: 'aucune source réellement vue' }); continue; }
    if (PLACEMENT.test(`${p.proposition} ${p.conclusion}`)) { retirees.push({ titre: p.titre, motif: 'conseil de placement (Constitution, limite 2)' }); continue; }
    const confiance = Math.min(1, Math.max(0, Number(p.confiance)));
    let prediction = null;
    if (p.prediction && p.prediction.enonce) {
      const e = new Date(`${p.prediction.echeance}T00:00:00Z`).getTime();
      const proba = Number(p.prediction.probabilite);
      const jours = (e - jour) / 86_400_000;
      if (Number.isFinite(jours) && jours >= 7 && jours <= 366 && proba >= 0.05 && proba <= 0.95) {
        prediction = { enonce: String(p.prediction.enonce).slice(0, 300), domaine: p.prediction.domaine || 'autre',
          echeance: p.prediction.echeance, probabilite: Math.round(proba * 100) / 100 };
      }
    }
    gardees.push({ titre: String(p.titre || '').slice(0, 120), type: p.type || 'savoir', vu: p.vu, conclusion: p.conclusion,
      proposition: p.proposition, confiance: Number.isFinite(confiance) ? confiance : 0.5,
      sources: sources.map((s) => ({ id: s, texte: ids.get(s).texte.slice(0, 140), lien: ids.get(s).lien })), prediction });
    if (gardees.length === MAX_PENSEES) break;
  }
  return { gardees, retirees };
}

/** Le texte du matin, écrit par le code à partir des idées vérifiées. */
export function formuler(gardees, aujourdhui) {
  if (!gardees.length) return `Bonjour Basile,\n\nCette nuit, rien ne m'a paru assez solide pour te déranger. Je continue de lire.\n`;
  const date = new Date(`${aujourdhui}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const L = [`Bonjour Basile,`, '', `Cette nuit (${date}), j'ai pensé à ${gardees.length === 1 ? 'une chose' : `${gardees.length} choses`}.`, ''];
  gardees.forEach((p, i) => {
    L.push(`${i + 1}. ${p.titre}`, `   J'ai vu : ${p.vu}`, `   J'en conclus : ${p.conclusion}`, `   Je te propose : ${p.proposition}`,
      `   Ma confiance : ${Math.round(p.confiance * 100)} %.`);
    if (p.prediction) {
      const e = new Date(`${p.prediction.echeance}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
      L.push(`   Ma prédiction : ${p.prediction.enonce} (probabilité ${Math.round(p.prediction.probabilite * 100)} %, vérifiée le ${e}).`);
    }
    L.push(`   Mes sources : ${p.sources.map((s) => s.lien ? `${s.texte} <${s.lien}>` : s.texte).join(' · ')}`, '');
  });
  L.push('Je note chaque prédiction : à son échéance, tu sauras si je voyais juste.');
  return L.join('\n');
}

async function schema(brain) {
  await brain.query(`CREATE TABLE IF NOT EXISTS pensees (
    id bigserial PRIMARY KEY, nuit date NOT NULL, rang int NOT NULL, type text, titre text, vu text, conclusion text,
    proposition text, confiance real, sources jsonb, cree_le timestamptz NOT NULL DEFAULT now())`);
  await brain.query(`CREATE TABLE IF NOT EXISTS predictions (
    id bigserial PRIMARY KEY, pensee_id bigint REFERENCES pensees(id), enonce text NOT NULL, domaine text,
    probabilite real NOT NULL, echeance date NOT NULL,
    etat text NOT NULL DEFAULT 'ouverte' CHECK (etat IN ('ouverte','juste','fausse','indecidable')),
    notee_le timestamptz, cree_le timestamptz NOT NULL DEFAULT now())`);
}

export async function penser({ brain, garder = false, aujourdhui = new Date().toISOString().slice(0, 10) }) {
  const vu = await rassembler(brain);
  const { system, user } = consigne(vu, aujourdhui);
  const res = await askJson({ task: 'raisonnement', system, user, maxTokens: 6000, temperature: 0.4 });
  const { gardees, retirees } = res.status === 'ok' ? verifier(res.data, vu.faits, aujourdhui) : { gardees: [], retirees: [] };
  const texte = formuler(gardees, aujourdhui);
  if (garder) {
    await schema(brain);
    for (const [i, p] of gardees.entries()) {
      const { rows } = await brain.query(`INSERT INTO pensees(nuit, rang, type, titre, vu, conclusion, proposition, confiance, sources)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [aujourdhui, i + 1, p.type, p.titre, p.vu, p.conclusion, p.proposition, p.confiance, JSON.stringify(p.sources)]);
      if (p.prediction) await brain.query(`INSERT INTO predictions(pensee_id, enonce, domaine, probabilite, echeance) VALUES($1,$2,$3,$4,$5)`,
        [rows[0].id, p.prediction.enonce, p.prediction.domaine, p.prediction.probabilite, p.prediction.echeance]);
    }
    const r = res.meta;
    if (r) await logRun(brain, { agent: 'penseur', task: 'raisonnement', model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut,
      costUsd: r.costUsd, ms: r.ms, status: res.status, promptVersion: PROMPT_VERSION });
  }
  return { texte, gardees, retirees, faits: vu.faits.length, cout: res.meta?.costUsd ?? null, statut: res.status };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./lib.js');
  const brain = db(); await brain.connect();
  try {
    const r = await penser({ brain, garder: process.argv.includes('--garder') });
    console.log(r.texte);
    console.log(`\n[penseur] ${r.faits} faits lus · ${r.gardees.length} idée(s) gardée(s) · ${r.retirees.length} retirée(s)`
      + `${r.retirees.length ? ` (${r.retirees.map((x) => x.motif).join(' ; ')})` : ''} · ${r.cout != null ? r.cout.toFixed(4) + ' $' : '—'} · ${r.statut}`);
  } finally { await brain.end(); }
}
