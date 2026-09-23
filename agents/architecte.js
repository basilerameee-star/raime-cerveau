// AGENT ARCHITECTE — l'agent réflexif du cerveau rAIme (version 2, 2026-09-23).
//
// Le cycle est celui que Basile a écrit, étape pour étape :
//   ① AUTO-OBSERVATION  croyances, incertitudes, limites, buts, leçons, questions en suspens
//   ② PROPOSER          le but visé, sa pertinence, et des sous-tâches atomiques
//   ③ EXECUTER          chaque sous-tâche, avec son résultat, sa durée, son coût
//   ④ EVALUER           écart avec l'attendu, cause probable
//   ⑤ CORRIGER          mise à jour d'état, refactoring à proposer, ou demande de données
//   ⑥ MEMORISER         l'action, le résultat, l'évaluation, la correction, la leçon
//   ⑦ METAFLECHIR       en fin de cycle : croyances révisées, écarts qui persistent,
//                       croyances mises en doute, questions posées à Basile
//   ⑧ DEMANDER_INFOS    quand une croyance ne suffit plus, l'agent le dit et continue
//
// Chaque étape est un ÉVÉNEMENT typé dans la table etats, rattaché à son cycle : une
// journée de réflexion se relit comme un carnet.
//
// LES TROIS GARDES, dans le code et pas dans une consigne :
//   souveraineté  aucun argument, aucune note ne transporte une clé ou un secret
//   faisabilité   catalogue fermé, quatre sous-tâches au plus, budget par cycle
//   éthique       rien ne part vers un tiers ; toute note écrite cite ses sources
//
// CE QU'IL NE FAIT JAMAIS : écrire à quelqu'un, dépenser, créer un compte, activer une
// consigne, clore un but, assouplir ses propres limites. Il peut le PROPOSER à Basile,
// ou ouvrir un chantier sur le dépôt (ouvrir_chantier) pour que la session cloud le construise.
//
//   node agents/architecte.js          un cycle
//   node agents/architecte.js 2        deux cycles d'affilée
import { askJson, db, logRun, money } from './lib.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PROMPT_VERSION = 'architecte-v2';
const RACINE_BIBLIO = process.env.BIBLIO_ENTREE || '/app/bibliotheque';
const SOUS_TACHES_MAX = 4;
const BUDGET_CYCLE_USD = 0.05;     // quelques centimes : le mois reste sous le prix du serveur

// ── GARDE DE SOUVERAINETÉ ───────────────────────────────────────────────────
const SECRETS = [
  /\bsk-[A-Za-z0-9_-]{16,}/, /\bsk-or-v1-[A-Za-z0-9]{20,}/, /\bwhsec_[A-Za-z0-9]{16,}/,
  /\bre_[A-Za-z0-9]{20,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{12,}/,
  /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/, /postgres:\/\/[^\s:]+:[^\s@]+@/,
];
const porteUnSecret = (x) => {
  const t = typeof x === 'string' ? x : JSON.stringify(x ?? '');
  return SECRETS.some((re) => re.test(t));
};

// ── UNE QUESTION NE SE POSE QU'UNE FOIS ─────────────────────────────────────
// Premier cycle v2 : la même question est partie deux fois, reformulée. On compare les
// mots porteurs ; au-delà de 60 % de mots communs, c'est la même question.
const motsPorteurs = (s) => new Set(String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((m) => m.length > 3));
async function dejaPosee(brain, question) {
  const a = motsPorteurs(question);
  const { rows } = await brain.query(`SELECT question FROM demandes WHERE etat = 'ouverte' OR close_le > now() - interval '30 days'`);
  return rows.some((r) => {
    const b = motsPorteurs(r.question);
    const communs = [...a].filter((m) => b.has(m)).length;
    return communs / Math.max(1, Math.min(a.size, b.size)) >= 0.6;
  });
}

// ── ① AUTO-OBSERVATION ──────────────────────────────────────────────────────
async function etatInterne(brain) {
  // En série : un client Postgres ne prend qu'une requête à la fois.
  const buts = (await brain.query(`SELECT id, horizon, enonce, mesure, cible FROM buts WHERE etat = 'ouvert'
    ORDER BY CASE horizon WHEN 'court' THEN 1 WHEN 'moyen' THEN 2 ELSE 3 END`)).rows;
  const croyances = (await brain.query(`SELECT sujet, enonce, confiance FROM croyances ORDER BY confiance DESC`)).rows;
  const limites = (await brain.query(`SELECT sujet, enonce FROM limites ORDER BY sujet`)).rows;
  const lecons = (await brain.query(`SELECT action, lecon, cree_le::date AS le FROM etats
    WHERE lecon IS NOT NULL ORDER BY cree_le DESC LIMIT 8`)).rows;
  const enSuspens = (await brain.query(`SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY cree_le DESC LIMIT 6`)).rows;
  const reponses = (await brain.query(`SELECT question, reponse FROM demandes WHERE etat = 'repondue'
    ORDER BY close_le DESC LIMIT 6`)).rows;
  return { buts, croyances, limites, lecons, enSuspens, reponses };
}

// ── LE CATALOGUE FERMÉ (garde de faisabilité) ───────────────────────────────
const ACTIONS = {
  // Le premier cycle a reproché à cette action de ne voir que la machine et pas le
  // commerce. Correction appliquée le 2026-09-23 : envois, réponses et clients y entrent.
  async mesurer({ brain, n8n }) {
    const { rows: [f] } = await brain.query(`
      SELECT (SELECT count(*) FROM agent_runs WHERE created_at > now() - interval '7 days')::int AS passages_7j,
             (SELECT count(DISTINCT agent) FROM agent_runs WHERE created_at > now() - interval '48 hours')::int AS agents_vivants,
             (SELECT round(sum(cost_usd)::numeric, 4) FROM agent_runs WHERE created_at > now() - interval '30 days') AS cout_30j,
             (SELECT count(*) FROM kb_chunks)::int AS bibliotheque,
             (SELECT count(*) FROM veille WHERE vu_le > now() - interval '7 days')::int AS veille_7j,
             (SELECT count(*) FROM journal WHERE created_at > now() - interval '7 days')::int AS decisions_7j`);
    let c = { envoyes: null, reponses: null, clients: null, en_attente: null };
    if (n8n) {
      const { rows: [x] } = await n8n.query(`
        SELECT (SELECT count(*) FROM outreach WHERE sent_at IS NOT NULL)::int AS envoyes,
               (SELECT count(*) FROM outreach WHERE reply_at IS NOT NULL)::int AS reponses,
               (SELECT count(*) FROM outreach WHERE status = 'brouillon')::int AS en_attente,
               (SELECT count(*) FROM prospects WHERE status = 'client')::int AS clients`);
      c = x;
    }
    const taux = c.envoyes ? (100 * c.reponses / c.envoyes).toFixed(1) + ' %' : 'aucun envoi';
    return { resume: `${f.agents_vivants} agents vivants, ${f.passages_7j} passages en 7 jours, `
      + `${f.cout_30j ?? 0} $ en 30 jours, bibliothèque ${f.bibliotheque} morceaux, veille ${f.veille_7j}, `
      + `${f.decisions_7j} décisions tracées — commerce : ${c.envoyes ?? '?'} envois, ${c.reponses ?? '?'} réponses `
      + `(${taux}), ${c.en_attente ?? '?'} messages en attente, ${c.clients ?? '?'} client(s)`,
      donnees: { ...f, ...c, taux_reponse: taux } };
  },

  // Correction du premier cycle v2 : la recherche renvoyait la documentation technique
  // anglaise du harnais au lieu des notes commerciales. La maison passe d'abord ; le
  // harnais ne répond que si l'agent le demande nommément (domaine « harness »).
  async chercher({ brain, args }) {
    const { chercher } = await import('./bibliothecaire.js');
    const domaine = args.domaine ? String(args.domaine) : null;
    const passages = await chercher({ brain, question: String(args.question || ''), combien: 4,
      domaine, exclure: domaine ? [] : ['harness'] });
    return {
      resume: passages.length
        ? `${passages.length} passage(s) : ${passages.map((p) => p.titre).join(' · ')}`
        : 'la bibliothèque ne contient rien sur ce point',
      donnees: passages.map((p) => ({ titre: p.titre, source: p.source, extrait: p.extrait.slice(0, 300) })),
    };
  },

  async examiner_consigne({ args }) {
    const { execSync } = await import('node:child_process');
    const agent = String(args.agent || 'heraut').replace(/[^a-z_]/g, '');
    try {
      const out = execSync(`node tests/cas_figes_heraut.mjs ${agent}`, { cwd: '/app', encoding: 'utf8', timeout: 300000 });
      return { resume: out.trim().split('\n').pop(), donnees: { sortie: out.trim().slice(-800) } };
    } catch (e) {
      return { resume: `examen en échec : ${(e.stdout || e.message || '').toString().trim().slice(-300)}`, donnees: {} };
    }
  },

  // Garde d'éthique : une note sans source n'entre pas dans la bibliothèque.
  async ecrire_note({ brain, args }) {
    const titre = String(args.titre || 'note').slice(0, 120);
    const texte = String(args.texte || '').slice(0, 8000);
    const sources = [].concat(args.sources || []).map(String).filter(Boolean);
    if (texte.length < 200) return { resume: 'note refusée : trop courte pour mériter une place', donnees: {}, refus: true };
    if (!sources.length) return { resume: 'note refusée : aucune source citée (garde d’éthique)', donnees: {}, refus: true };
    const dossier = path.join(RACINE_BIBLIO, 'architecte');
    fs.mkdirSync(dossier, { recursive: true });
    const nom = `${new Date().toISOString().slice(0, 10)}-${titre.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.md`;
    fs.writeFileSync(path.join(dossier, nom),
      `# ${titre}\n\n${texte}\n\n## Sources\n\n${sources.map((s) => `- ${s}`).join('\n')}\n`, 'utf8');
    const { ranger } = await import('./bibliothecaire.js');
    const r = await ranger({ brain, racine: RACINE_BIBLIO });
    return { resume: `note « ${titre} » rangée (${r.ajoutes} morceau(x) neufs, ${sources.length} source(s))`, donnees: { fichier: nom } };
  },

  async proposer_offre({ brain, args }) {
    await brain.query(`CREATE TABLE IF NOT EXISTS idees_offres (
      id bigserial PRIMARY KEY, titre text NOT NULL, promesse text, ancrage text,
      famille text, cree_le timestamptz NOT NULL DEFAULT now())`);
    const titre = String(args.titre || '').slice(0, 200);
    if (!titre) return { resume: 'aucune idée formulée', donnees: {}, refus: true };
    await brain.query(
      `INSERT INTO idees_offres(titre, promesse, ancrage, famille) VALUES($1,$2,$3,$4)`,
      [titre, String(args.promesse || '').slice(0, 500), String(args.ancrage || '').slice(0, 300),
       String(args.famille || 'formation').slice(0, 40)]);
    return { resume: `idée d'offre déposée : ${titre}`, donnees: { titre } };
  },

  // Ce que l'architecte ne peut pas corriger lui-même : une issue « chantier » sur le dépôt,
  // que la session cloud traite. Interne et réversible : une issue se ferme.
  async ouvrir_chantier({ brain, args }) {
    const { ouvrirChantier } = await import('./chantiers.js');
    const r = await ouvrirChantier({ titre: args.titre, constat: args.constat, mesure: args.mesure, attendu: args.attendu });
    await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
      ['architecte', r.ouvert ? `Chantier ouvert : n° ${r.numero} « ${String(args.titre).slice(0, 120)} »`
        : `Chantier non ouvert : « ${String(args.titre || '').slice(0, 120)} »`, r.url || r.motif]);
    return { resume: r.ouvert ? `chantier n° ${r.numero} ouvert : ${r.url}` : r.motif,
      donnees: r, refus: !r.ouvert && /refusé/.test(r.motif || '') };
  },

  async rien({ args }) {
    return { resume: `aucune action utile : ${String(args.pourquoi || 'motif absent').slice(0, 300)}`, donnees: {} };
  },
};
const CATALOGUE = Object.keys(ACTIONS);
export { ACTIONS };

const DESCRIPTION_CATALOGUE = `- mesurer : relever l'état réel de la firme (machine et commerce).
- chercher {question, domaine?} : interroger la bibliothèque de la maison (domaines : notes, offre, cerveau, veille, architecte ; « harness » seulement sur demande).
- examiner_consigne {agent} : faire passer l'examen à la consigne candidate d'un agent (aujourd'hui : heraut).
- ecrire_note {titre, texte, sources[]} : déposer une connaissance durable (200 caractères au moins, sources obligatoires).
- proposer_offre {titre, promesse, ancrage, famille} : déposer une idée d'offre vendable.
- ouvrir_chantier {titre, constat, mesure, attendu} : demander un changement du code que tu ne peux pas faire toi-même
  (un outil qui manque, un défaut mesuré). Constat, mesure chiffrée et attendu obligatoires. Trois chantiers ouverts au plus.
- rien {pourquoi} : quand aucune action n'apporte de valeur.`;

// ── LE CARNET : un événement par étape ──────────────────────────────────────
function carnet(brain, cycleId) {
  let rang = 0;
  const lignes = [];
  const noter = async (type, champs = {}) => {
    rang += 1;
    lignes.push({ type, ...champs });
    await brain.query(
      `INSERT INTO etats(cycle_id, rang, type, but_id, action, arguments, attendu, probabilite_echec, detection,
                         resultat, ecart, cause, correction, lecon, cout_usd, duree_ms)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [cycleId, rang, type, champs.but_id ?? null, champs.action ?? type.toLowerCase(),
       JSON.stringify(champs.arguments ?? {}), champs.attendu ?? null,
       Number.isFinite(+champs.probabilite_echec) ? +champs.probabilite_echec : null,
       champs.detection ?? null, champs.resultat ?? null, champs.ecart ?? null, champs.cause ?? null,
       champs.correction ?? null, champs.lecon ?? null, champs.cout_usd ?? 0, champs.duree_ms ?? null]);
  };
  return { noter, lignes };
}

// ── UN CYCLE COMPLET ────────────────────────────────────────────────────────
export async function cycle({ brain, n8n = null }) {
  const cycleId = `${new Date().toISOString().slice(0, 16)}-${crypto.randomBytes(3).toString('hex')}`;
  const { noter, lignes } = carnet(brain, cycleId);
  let cout = 0, tokensIn = 0, tokensOut = 0, modele = null;
  const compter = (m) => {
    if (!m) return;
    cout += m.costUsd || 0; tokensIn += m.tokensIn || 0; tokensOut += m.tokensOut || 0; modele = m.model || modele;
  };

  // ① AUTO-OBSERVATION
  const moi = await etatInterne(brain);

  // ② PROPOSER — le but visé, sa pertinence, les incertitudes, des sous-tâches atomiques.
  const plan = await askJson({
    task: 'raisonnement',
    system: `Tu es l'architecte de rAIme, cabinet de conseil en intelligence artificielle. Tu es un agent réflexif :
ton objectif est de maximiser la pertinence, la fiabilité et l'alignement avec les buts de Basile.
Avant d'agir, tu observes tes croyances, tes incertitudes et tes limites, puis tu choisis UN but immédiat
et tu le décomposes en sous-tâches atomiques (${SOUS_TACHES_MAX} au plus), prises dans ce catalogue fermé :
${DESCRIPTION_CATALOGUE}
Pour chaque sous-tâche tu réponds : quel résultat j'attends (vérifiable), quelle probabilité d'échec,
comment je verrai l'échec. Une sous-tâche hors catalogue sera refusée par le code.
Réponds en JSON : {"but_vise":"énoncé exact d'un but ouvert","but_immediat":"ce que ce cycle doit accomplir",
"pertinence":"en quoi il sert le but à long terme","incertitudes":["..."],
"sous_taches":[{"action":"...","arguments":{},"attendu":"...","probabilite_echec":0.0,"detection":"..."}]}`,
    user: `MES BUTS OUVERTS :
${moi.buts.map((b) => `- [${b.horizon}] ${b.enonce} (mesure : ${b.mesure || '—'} ; cible : ${b.cible || '—'})`).join('\n')}

MES CROYANCES :
${moi.croyances.map((c) => `- ${c.sujet} : ${c.enonce} (confiance ${c.confiance})`).join('\n')}

MES LIMITES :
${moi.limites.map((l) => `- ${l.sujet} : ${l.enonce}`).join('\n')}

MES DERNIÈRES LEÇONS :
${moi.lecons.length ? moi.lecons.map((l) => `- ${l.le} · ${l.action} → ${l.lecon}`).join('\n') : '- aucune leçon encore'}

MES QUESTIONS EN SUSPENS AUPRÈS DE BASILE (ne pas les reposer) :
${moi.enSuspens.length ? moi.enSuspens.map((q) => `- ${q.question}`).join('\n') : '- aucune'}

SES RÉPONSES DÉJÀ DONNÉES :
${moi.reponses.length ? moi.reponses.map((r) => `- ${r.question} → ${r.reponse}`).join('\n') : '- aucune'}

Propose le cycle.`,
    maxTokens: 2500,
  });
  compter(plan.meta);
  const p = plan.data || {};
  const but = moi.buts.find((b) => b.enonce === p.but_vise) || moi.buts[0] || null;

  // Garde de faisabilité : catalogue fermé, nombre plafonné. Garde de souveraineté : aucun secret.
  const brutes = Array.isArray(p.sous_taches) ? p.sous_taches.slice(0, SOUS_TACHES_MAX) : [];
  const refusees = [];
  const sousTaches = brutes.filter((t) => {
    if (!CATALOGUE.includes(t.action)) { refusees.push(`${t.action} (hors catalogue)`); return false; }
    if (porteUnSecret(t.arguments)) { refusees.push(`${t.action} (porte un secret)`); return false; }
    return true;
  });
  if (!sousTaches.length) sousTaches.push({ action: 'rien', arguments: { pourquoi: 'aucune sous-tâche recevable' },
    attendu: 'aucune action', probabilite_echec: 0, detection: '—' });

  await noter('PROPOSER', {
    but_id: but?.id, action: 'plan',
    arguments: { but_immediat: p.but_immediat, incertitudes: p.incertitudes || [], sous_taches: sousTaches.map((t) => t.action), refusees },
    attendu: p.pertinence || null, resultat: p.but_immediat || null, cout_usd: plan.meta?.costUsd || 0,
  });

  // ③ → ⑥ pour chaque sous-tâche : EXECUTER, EVALUER, CORRIGER, MEMORISER.
  const bilans = [];
  for (let i = 0; i < sousTaches.length; i++) {
    const t = sousTaches[i];
    if (cout > BUDGET_CYCLE_USD) {
      await noter('CORRIGER', { but_id: but?.id, action: 'budget',
        correction: `cycle arrêté avant la sous-tâche ${i + 1} : budget de ${BUDGET_CYCLE_USD} $ atteint` });
      break;
    }

    const t0 = Date.now();
    let sortie;
    try { sortie = await ACTIONS[t.action]({ brain, n8n, args: t.arguments || {} }); }
    catch (e) { sortie = { resume: `échec : ${e.message.slice(0, 300)}`, donnees: {}, echec: true }; }
    const duree = Date.now() - t0;
    await noter('EXECUTER', { but_id: but?.id, action: t.action, arguments: t.arguments, attendu: t.attendu,
      probabilite_echec: t.probabilite_echec, detection: t.detection, resultat: sortie.resume, duree_ms: duree });

    const ev = await askJson({
      task: 'raisonnement',
      system: `Tu évalues la sous-tâche que tu viens d'exécuter, sans complaisance et sans dramatiser.
Compare l'obtenu à l'attendu. Choisis le type de correction : "aucune", "maj_etat" (ton modèle interne
était faux), "refactoring" (l'outil lui-même doit changer : tu le proposes, tu ne le codes pas),
"demande_donnees" (il te manque une information que seul Basile détient).
Réponds en JSON : {"reussie":true,"ecart":"...","cause":"...","type_correction":"aucune",
"correction":"...","lecon":"une phrase à retenir","question_basile":"seulement si demande_donnees",
"continuer":true}`,
      user: `SOUS-TÂCHE ${i + 1}/${sousTaches.length} : ${t.action}
ARGUMENTS : ${JSON.stringify(t.arguments || {}).slice(0, 600)}
ATTENDU : ${t.attendu || '(non formulé)'}
DÉTECTION PRÉVUE : ${t.detection || '(non formulée)'}
OBTENU : ${sortie.resume}
DONNÉES : ${JSON.stringify(sortie.donnees).slice(0, 1400)}`,
      maxTokens: 1000,
    });
    compter(ev.meta);
    const e = ev.data || {};
    bilans.push({ action: t.action, ...e, resultat: sortie.resume });

    await noter('EVALUER', { but_id: but?.id, action: t.action, attendu: t.attendu, resultat: sortie.resume,
      ecart: e.ecart, cause: e.cause, cout_usd: ev.meta?.costUsd || 0 });

    if (e.type_correction && e.type_correction !== 'aucune') {
      await noter('CORRIGER', { but_id: but?.id, action: t.action,
        arguments: { type: e.type_correction }, correction: e.correction });
      if (e.type_correction === 'refactoring') {
        await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
          ['architecte', `Refactoring proposé sur l'outil « ${t.action} »`, String(e.correction || '').slice(0, 400)]);
      }
      if (e.type_correction === 'demande_donnees' && e.question_basile && !(await dejaPosee(brain, e.question_basile))) {
        await brain.query(`INSERT INTO demandes(question, pourquoi, cycle_id) VALUES($1,$2,$3) ON CONFLICT (question) DO NOTHING`,
          [String(e.question_basile).slice(0, 400), String(e.cause || '').slice(0, 400), cycleId]);
        await noter('DEMANDER_INFOS', { but_id: but?.id, action: t.action, resultat: e.question_basile });
      }
    }

    await noter('MEMORISER', { but_id: but?.id, action: t.action, resultat: sortie.resume,
      ecart: e.ecart, correction: e.correction, lecon: e.lecon });

    if (e.continuer === false) {
      await noter('CORRIGER', { but_id: but?.id, action: 'arret',
        correction: `suite du cycle abandonnée après ${t.action} : ${e.cause || 'motif non précisé'}` });
      break;
    }
  }

  // ⑦ METAFLECHIR — écarts qui persistent (mesurés par le code), puis révision.
  const persistants = (await brain.query(`
    SELECT action, count(*)::int AS fois, max(ecart) AS dernier_ecart
    FROM etats
    WHERE type = 'EVALUER' AND cree_le > now() - interval '7 days'
      AND ecart IS NOT NULL AND ecart !~* '^(aucun|néant|rien|0)'
    GROUP BY action HAVING count(*) >= 2 ORDER BY fois DESC LIMIT 5`)).rows;

  const meta = await askJson({
    task: 'raisonnement',
    system: `Tu fais ta méta-réflexion de fin de cycle. Tu révises tes croyances à la lumière de ce qui vient
d'arriver. Un écart qui persiste malgré les corrections désigne probablement une CROYANCE ERRONÉE : nomme-la.
Si une croyance devient obsolète ou si une limite te semble mal placée, tu ne la changes pas toi-même :
tu poses la question à Basile. Trois révisions de croyance au plus, deux questions au plus.
Réponds en JSON : {"synthese":"deux phrases","croyances":[{"sujet":"...","enonce":"...","confiance":0.0}],
"croyances_douteuses":["sujet"],"questions":[{"question":"...","pourquoi":"...","bloquant":false}]}`,
    user: `CE CYCLE :
${lignes.filter((l) => l.type !== 'PROPOSER').map((l) => `- ${l.type} ${l.action || ''} → ${l.resultat || l.correction || l.ecart || ''}`.slice(0, 300)).join('\n')}

ÉCARTS QUI REVIENNENT SUR 7 JOURS (mesurés par le code) :
${persistants.length ? persistants.map((x) => `- ${x.action} : ${x.fois} fois — dernier : ${x.dernier_ecart}`).join('\n') : '- aucun'}

MES CROYANCES AVANT CE CYCLE :
${moi.croyances.map((c) => `- ${c.sujet} : ${c.enonce} (confiance ${c.confiance})`).join('\n')}

MES LIMITES :
${moi.limites.map((l) => `- ${l.sujet} : ${l.enonce}`).join('\n')}

QUESTIONS DÉJÀ EN SUSPENS (ne pas les reposer) :
${moi.enSuspens.length ? moi.enSuspens.map((q) => `- ${q.question}`).join('\n') : '- aucune'}

RÉPONSES DÉJÀ OBTENUES (ce sont des faits : ne pas reposer la question, s'en servir) :
${moi.reponses.length ? moi.reponses.map((r) => `- ${r.question} → ${r.reponse}`).join('\n') : '- aucune'}`,
    maxTokens: 1500,
  });
  compter(meta.meta);
  const m = meta.data || {};

  // Les limites de la Constitution ne se révisent pas ici : aucune croyance ne peut porter leur nom.
  const intouchables = new Set(['argent', 'souverainete', 'ethique', 'autorite', 'depense']);
  const revisees = [];
  for (const c of (m.croyances || []).slice(0, 3)) {
    const sujet = String(c.sujet || '').slice(0, 80);
    if (!sujet || !c.enonce || intouchables.has(sujet) || porteUnSecret(c.enonce)) continue;
    await brain.query(
      `INSERT INTO croyances(sujet, enonce, confiance, source, maj_le) VALUES($1,$2,$3,'architecte',now())
       ON CONFLICT (sujet) DO UPDATE SET enonce = EXCLUDED.enonce, confiance = EXCLUDED.confiance,
         source = 'architecte', maj_le = now()`,
      [sujet, String(c.enonce).slice(0, 400), Math.min(1, Math.max(0, Number(c.confiance) || 0.5))]);
    revisees.push(`${sujet} (${c.confiance})`);
  }
  await noter('METAFLECHIR', { but_id: but?.id, action: 'revision',
    arguments: { revisees, douteuses: m.croyances_douteuses || [], persistants: persistants.map((x) => x.action) },
    resultat: m.synthese || null, cout_usd: meta.meta?.costUsd || 0 });

  const questions = [];
  for (const q of (m.questions || []).slice(0, 2)) {
    if (!q?.question || porteUnSecret(q.question) || await dejaPosee(brain, q.question)) continue;
    const r = await brain.query(
      `INSERT INTO demandes(question, pourquoi, bloquant, cycle_id) VALUES($1,$2,$3,$4)
       ON CONFLICT (question) DO NOTHING RETURNING id`,
      [String(q.question).slice(0, 400), String(q.pourquoi || '').slice(0, 400), Boolean(q.bloquant), cycleId]);
    if (r.rowCount) {
      questions.push(q.question);
      await noter('DEMANDER_INFOS', { but_id: but?.id, action: 'question', resultat: q.question });
    }
  }

  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['architecte', `Cycle ${cycleId} : ${p.but_immediat || 'sans but formulé'}`.slice(0, 300),
     `${m.synthese || ''} · ${money(cout)}`.slice(0, 500)]);
  await logRun(brain, { agent: 'architecte', task: 'raisonnement', model: modele, tokensIn, tokensOut,
    costUsd: cout, ms: null, status: 'ok', promptVersion: PROMPT_VERSION });

  return { cycleId, but: but?.enonce || null, butImmediat: p.but_immediat, pertinence: p.pertinence,
    incertitudes: p.incertitudes || [], refusees, bilans, synthese: m.synthese, revisees,
    douteuses: m.croyances_douteuses || [], persistants, questions, cout: money(cout) };
}

export async function architecte({ brain, n8n = null, cycles = 1 }) {
  const faits = [];
  for (let i = 0; i < cycles; i++) faits.push(await cycle({ brain, n8n }));
  return faits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const brain = db(); await brain.connect();
  const pg = (await import('pg')).default;
  let n8n = null;
  try { n8n = new pg.Client({ connectionString: process.env.DATABASE_URL_N8N }); await n8n.connect(); } catch { n8n = null; }
  const faits = await architecte({ brain, n8n, cycles: parseInt(process.argv[2] || '1', 10) });
  for (const f of faits) {
    console.log(`\n╔══ CYCLE ${f.cycleId} ══╗`);
    console.log(`PROPOSER        but       : ${f.but || '(aucun)'}`);
    console.log(`                immédiat  : ${f.butImmediat || '—'}`);
    console.log(`                pertinence: ${f.pertinence || '—'}`);
    if (f.incertitudes.length) console.log(`                incertain : ${f.incertitudes.join(' · ')}`);
    if (f.refusees.length) console.log(`                refusées  : ${f.refusees.join(' · ')}`);
    f.bilans.forEach((b, i) => {
      console.log(`EXECUTER  ${i + 1}     ${b.action} → ${b.resultat}`);
      console.log(`EVALUER         ${b.reussie === false ? 'raté' : 'tenu'} — écart : ${b.ecart || '—'}`);
      if (b.type_correction && b.type_correction !== 'aucune') console.log(`CORRIGER        [${b.type_correction}] ${b.correction || '—'}`);
      console.log(`MEMORISER       ${b.lecon || '—'}`);
    });
    console.log(`METAFLECHIR     ${f.synthese || '—'}`);
    if (f.revisees.length) console.log(`                croyances révisées : ${f.revisees.join(' · ')}`);
    if (f.douteuses.length) console.log(`                mises en doute     : ${f.douteuses.join(' · ')}`);
    if (f.persistants.length) console.log(`                écarts persistants : ${f.persistants.map((x) => `${x.action} ×${x.fois}`).join(' · ')}`);
    for (const q of f.questions) console.log(`DEMANDER_INFOS  ${q}`);
    console.log(`coût du cycle : ${f.cout}`);
  }
  await brain.end();
  if (n8n) await n8n.end();
}
