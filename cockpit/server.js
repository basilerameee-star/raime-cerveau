const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  user: process.env.PGUSER || 'n8n',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'n8n',
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: 4,
});

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
// Jarvis (25/09/2026) : l'interface unique voulue par Basile — la boule, la voix, l'essentiel sur les côtés.
const JARVIS = fs.existsSync(path.join(__dirname, 'jarvis.html')) ? fs.readFileSync(path.join(__dirname, 'jarvis.html'), 'utf8') : null;

// La bibliothèque du cerveau vit dans la base raime_brain, sur le même serveur Postgres.
const cerveau = new Pool({
  host: process.env.PGHOST || 'postgres',
  user: process.env.PGUSER || 'n8n',
  password: process.env.PGPASSWORD,
  database: 'raime_brain',
  port: parseInt(process.env.PGPORT || '5432', 10),
  max: 2,
});

async function q(sql, params) {
  try { const r = await pool.query(sql, params || []); return r.rows; }
  catch (e) { return { __error: String(e.message || e) }; }
}
const rowsOr = (r, d) => (Array.isArray(r) ? r : d);

// Cherche dans la bibliothèque les passages qui répondent à la question : titre et chemin
// pèsent trois fois plus que le corps, un seul passage par document, la documentation
// technique anglaise reste à l'écart sauf si on la demande.
async function bibliotheque(question) {
  const mots = String(question).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter((m) => m.length > 3).slice(0, 12);
  if (!mots.length) return [];
  const sql = `
    SELECT titre, source, domaine, left(texte, 900) AS extrait,
           ts_rank_cd(mots, q) + 3 * ts_rank_cd(coalesce(mots_titre, ''::tsvector), q) AS poids
    FROM kb_chunks, websearch_to_tsquery('french', $1) AS q
    WHERE (mots @@ q OR coalesce(mots_titre, ''::tsvector) @@ q) AND domaine <> 'harness'
    ORDER BY poids DESC LIMIT 24`;
  try {
    const { rows } = await cerveau.query(sql, [mots.join(' OR ')]);
    const vus = new Set();
    return rows.filter((r) => (vus.has(r.source) ? false : vus.add(r.source))).slice(0, 6);
  } catch (e) { return []; }
}

// LE SAVOIR VIVANT — quand la bibliothèque ne suffit pas, Cortex cherche sur Internet par le
// moteur souverain du serveur (SearXNG : Google, DuckDuckGo, Brave… sans compte ni clé), lit
// les pages trouvées et cite ses sources. Wikipédia est écartée, sur la parole de Basile
// (« un peu du slop »). Ce qui a servi est noté : l'agent curieux le range dans la
// bibliothèque dans l'heure. La bibliothèque grandit d'abord de ce que Basile demande.
const RECHERCHE = process.env.RECHERCHE_URL || 'http://searxng:8080';
const ECARTES = /(^|\.)(wikipedia\.org|wikiwand\.com|wikimedia\.org|youtube\.com|facebook\.com|instagram\.com|tiktok\.com|pinterest\.[a-z.]+)$/;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; rAIme-cortex/1.0; +https://raime.fr)' };

async function chercherTexte(url, ms) {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal, redirect: 'follow' });
    if (!r.ok || !/text\/html|json/.test(r.headers.get('content-type') || '')) return '';
    return (await r.text()).slice(0, 600000);
  } catch (e) { return ''; } finally { clearTimeout(minuteur); }
}

// Le texte lisible d'une page : sans scripts, styles, menus ni pieds de page.
function texteLisible(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// Le passage de la page qui répond le mieux : la fenêtre qui contient le plus de mots de la question.
function meilleurPassage(texte, mots, taille = 1200) {
  if (texte.length <= taille) return texte;
  let meilleur = texte.slice(0, taille), note = -1;
  for (let i = 0; i < texte.length - 200; i += 400) {
    const f = texte.slice(i, i + taille).toLowerCase();
    const n = mots.reduce((s, m) => s + (f.includes(m) ? 1 : 0), 0);
    if (n > note) { note = n; meilleur = texte.slice(i, i + taille); }
  }
  return meilleur;
}

async function savoirVivant(question, dejaVus) {
  const mots = String(question).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter((m) => m.length > 3).slice(0, 10);
  if (!mots.length) return [];
  let resultats = [];
  try {
    const brut = await chercherTexte(`${RECHERCHE}/search?format=json&language=fr&q=${encodeURIComponent(question)}`, 8000);
    resultats = (JSON.parse(brut || '{}').results || []).filter((x) => {
      try { return !ECARTES.test(new URL(x.url).hostname) && !dejaVus.has(x.title); } catch (e) { return false; }
    }).slice(0, 4);
  } catch (e) { return []; }
  const pages = await Promise.all(resultats.map(async (x) => {
    const texte = texteLisible(await chercherTexte(x.url, 6000));
    const extrait = texte.length > 400 ? meilleurPassage(texte, mots) : String(x.content || '');
    let site = ''; try { site = new URL(x.url).hostname.replace(/^www\./, ''); } catch (e) {}
    return { titre: String(x.title || site).slice(0, 140), domaine: `web · ${site}`, extrait, lien: x.url };
  }));
  const utiles = pages.filter((p) => p.extrait.length > 120).slice(0, 3);
  for (const p of utiles) {
    try {
      await cerveau.query(
        `INSERT INTO savoir_web(url, titre, extrait, question) VALUES($1,$2,$3,$4) ON CONFLICT (url) DO NOTHING`,
        [p.lien, p.titre, p.extrait, String(question).slice(0, 300)]);
    } catch (e) { /* la note ne doit jamais bloquer la réponse */ }
  }
  return utiles;
}

// Les questions que l'agent réflexif attend de Basile : Cortex les rappelle au bon moment.
async function questionsOuvertes() {
  try {
    const { rows } = await cerveau.query(
      `SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY bloquant DESC, cree_le LIMIT 5`);
    return rows.map((r) => '- ' + r.question).join('\n');
  } catch (e) { return ''; }
}

const CORTEX_SYS = "Tu es Cortex, la voix du cerveau de rAIme — le cabinet de conseil en intelligence artificielle de Basile Ramé (formation des particuliers et des professionnels : dirigeants, comités de direction, employés ; audit des postes et arbitrage pour les entreprises ; automatisation). Tu es son bras droit et son interface avec tout le système. "
  + "Le cerveau : une boucle permanente d'agents sur le serveur — l'architecte (l'agent réflexif, qui tient les buts et se corrige), le réflexif, le veilleur (forums, dépôts de code, publications), le chasseur et le sas (le meilleur modèle au meilleur prix), le bibliothécaire et l'encyclopédiste (la bibliothèque de savoir : finance, droit, santé, sciences, physique quantique, philosophie, métaphysique, spiritualité, ésotérisme, religions, histoire, informatique, marketing, management…), et les agents de surveillance ; le penseur (la pensée de la nuit : il relit la veille, la bibliothèque et le journal, et propose au matin trois idées au plus, chacune sourcée, sans conseil de placement) ; l'essayeur (il cherche du code sur GitHub, le note selon des critères précis, l'essaie dans un bac à sable isolé du réseau, et propose de l'intégrer) ; le Gardien (deux faces : la vigie qui surveille le serveur toutes les 30 minutes, et le sas qui envoie toute action risquée au bac à sable avant de couper, et n'en garde que le positif) ; l'auditeur, la relecture et l'arbitrage (l'analyse d'une proposition commerciale et le Score rAIme sur 1000). Jarvis est l'interface vocale où Basile te parle. Si on t'interroge sur un agent que cette liste ne décrit pas, dis que tu ne sais pas. La prospection par e-mail est en pause. "
  + "SAVOIR : pour toute question de connaissance, appuie-toi d'abord sur les PASSAGES fournis (bibliothèque, puis pages web trouvées en direct) et cite-les entre crochets [Titre], avec l'adresse pour une page web. Juge la fiabilité d'une page avant de la reprendre (site officiel, publication, presse sérieuse plutôt que forum ou page commerciale) et dis-le quand une source est faible. Complète avec tes connaissances générales en le signalant (« au-delà des sources… »). Tous les sujets sont bienvenus, y compris spiritualité, ésotérisme et métaphysique : expose les traditions et les idées fidèlement, et distingue ce qui relève du savoir établi, de la tradition ou de la croyance. "
  + "Réponds en français, direct, concret, chaleureux et HONNÊTE : si tu ne sais pas, ou si quelque chose n'est pas encore en place, dis-le clairement. Tu conseilles, fais le point, expliques, aides à décider. Tu n'exécutes pas d'actions toi-même : une action demandée est notée pour Claude, qui l'exécute sur le serveur, le site et le code ; Basile n'a jamais à la faire lui-même. Les « Tâches en cours » sont À FAIRE, pas faites. N'invente aucun chiffre sur l'entreprise : ne t'appuie que sur ceux fournis.";
const CORTEX_ORAL = " RÉPONSE ORALE (Jarvis la dit à voix haute) : deux à quatre phrases courtes, sans liste, sans titre, sans astérisque, sans adresse web ni crochet ; nomme une source en clair si besoin (« d'après l'INSEE »). Tutoie Basile. Parle un français soutenu, précis et vivant, sans anglicisme ni formule creuse, comme un bras droit brillant qui a suivi tout ce qui s'est passé. Seulement si Basile ORDONNE une action concrète à exécuter (créer, corriger, publier, lancer, modifier, envoyer…), commence ta réponse exactement par [[COMMANDE]] puis une seule phrase courte qui reformule l'ordre, et rien d'autre : le système la note pour Claude. Une question, même sur tes capacités, n'est jamais une commande. Ne dis jamais qu'une action est faite ni notée toi-même.";

// Le régime de dépense fixé par l'économe (agents/econome.js) ; « normal » si rien n'est lu.
// Mesure du 25/09/2026 sur une vraie question de client (devis sur trois ans) : DeepSeek V4 Flash
// avec réflexion, juste et le moins cher de tous (0,00012 $, 6 s) ; V4 Pro plus fouillé (0,00095 $) ;
// Gemini 3.8 Flash le plus riche mais onze fois plus cher. Basile préfère attendre un peu pour mieux.
const MODELE_JARVIS = 'deepseek/deepseek-v4-flash-0731';
const MODELE_PROFOND = 'deepseek/deepseek-v4-pro-0813'; // « réfléchis à fond », « en profondeur »
const PROFOND = /réfléchis (à fond|bien|en profondeur)|en profondeur|analyse approfondie|prends ton temps/i;
async function regimeActuel() {
  try { return ((await cerveau.query("SELECT mode FROM regime_budget ORDER BY le DESC LIMIT 1")).rows[0] || {}).mode || 'normal'; }
  catch (e) { return 'normal'; }
}

// Le journal en français clair : noms d'agents lisibles, pluriels accordés, lignes à zéro écartées.
const NOMS = { bibliothecaire: 'Bibliothèque', veilleur: 'Veille', portes: "Portes d'entrée (CCI, formation)", sas: 'Sas des modèles',
  chasseur: 'Chasseur de modèles', architecte: 'Architecte', superviseur: 'Surveillance', boucle: 'Boucle', porte: 'Livraison',
  essayeur: 'Essayeur', gardien: 'Gardien', reflexif: 'Réflexif', penseur: 'Penseur', publiciste: 'Publicité',
  instruments: 'Instruments', cordon: 'Cordon', reconciliateur: 'Réponses', curieux: 'Curieux', econome: 'Économe',
  metrologue: 'Mesure des prix', prospective: 'Prospective' };
function enClair(acteur, texte) {
  let t = String(texte)
    .replace(/morceau\(x\)/g, 'passage(s)').replace(/morceaux?/g, (m) => (m.endsWith('x') ? 'passages' : 'passage'))
    .replace(/(\d+)\s+([\p{L}’']+)\(s\)((?:\s+[\p{L}’']+\(s\))*)/gu, (_, n, mot, suite) => {
      const s = +n > 1 ? 's' : '';
      return `${n} ${mot}${s}${suite.replace(/\(s\)/g, s)}`;
    })
    .replace(/\(s\)/g, 's');
  let m = t.match(/^Candidat « (.+?)(?:-\d{4}-\d{2}-\d{2})? » \(prix\) → noté au catalogue.*$/);
  if (m) t = `prix de ${m[1]} noté au catalogue`;
  m = t.match(/^Candidat « (.+?)(?:-\d{4}-\d{2}-\d{2})? » \((\w+)\) → (\w+)$/);
  if (m && m[2] === 'prix') t = `prix de ${m[1]} noté au catalogue`;
  else if (m) t = `${m[1]} : ${{ promu: 'retenu après mesure', refuse: 'écarté après mesure', non_evaluable: 'pas assez mesuré', applique: 'appliqué' }[m[3]] || m[3]}`;
  t = t.replace(/(\d{4,})/g, (n) => Number(n).toLocaleString('fr-FR'));
  return { qui: NOMS[acteur] || acteur, quoi: t };
}
function journalEnClair(rows) {
  const vus = new Set(), out = [];
  for (const r of rows) {
    if (/(^|\s)0 (passage|trouvaille|morceau|porte|candidat)/.test(r.changement)) continue; // rien de neuf : rien à dire
    const e = enClair(r.acteur, r.changement);
    const cle = e.qui + e.quoi.replace(/[\d\s.,]/g, '');
    if (vus.has(cle)) continue; vus.add(cle);
    out.push({ ...e, heure: new Date(r.created_at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) });
    if (out.length >= 4) break;
  }
  return out;
}

// La réponse de Cortex : bibliothèque d'abord, puis le web si elle ne couvre pas la question.
// oral = la réponse sera dite à voix haute par Jarvis ; extra = ce que Jarvis sait de plus.
async function repondreCortex(message, oral, extra) {
  await q("INSERT INTO cortex_chat (role, content) VALUES ('user', $1)", [message]);
  const ctx = await buildContext();
  const passages = await bibliotheque(message);
  // D'abord la bibliothèque, puis le monde. LE DÉCLENCHEUR « JE NE SAIS PAS » : moins de
  // trois passages, OU des passages qui ne couvrent pas les mots importants de la question
  // (un nom, un code, un chiffre absents de ce que la bibliothèque a rendu). Le 25/09, trois
  // passages vagues ont suffi à retenir la recherche, et Cortex a inventé le certificateur
  // de la RS6776 : un nombre de passages ne dit pas qu'on sait.
  const motsQuestion = message.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((m) => m.length > 3 || /\d/.test(m));
  const lu = passages.map((p) => `${p.titre} ${p.extrait}`).join(' ').toLowerCase();
  const couverture = motsQuestion.length
    ? motsQuestion.filter((m) => lu.includes(m)).length / motsQuestion.length : 1;
  const precis = motsQuestion.filter((m) => /\d/.test(m) || m.length > 8);
  const manquePrecis = precis.some((m) => !lu.includes(m));
  if (passages.length < 3 || couverture < 0.6 || manquePrecis) {
    passages.push(...await savoirVivant(message, new Set(passages.map((p) => p.titre))));
  }
  const enAttente = await questionsOuvertes();
  const savoir = passages.length
    ? "\n\nPASSAGES DE LA BIBLIOTHÈQUE ET DU WEB (à citer entre crochets [Titre] ; pour une page web, donner aussi son adresse) :\n" + passages.map((p) =>
        `[${p.titre}] (${p.domaine}${p.lien ? ' — ' + p.lien : ''}) ${String(p.extrait).replace(/\s+/g, ' ')}`).join('\n\n')
    : "\n\nPASSAGES DE LA BIBLIOTHÈQUE : aucun passage pertinent — réponds avec tes connaissances générales et dis-le.";
  const questions = enAttente ? "\n\nQUESTIONS QUE L'ARCHITECTE ATTEND DE BASILE :\n" + enAttente : '';
  const hist = rowsOr(await q("SELECT role, content FROM cortex_chat ORDER BY id DESC LIMIT 12"), []).reverse();
  const messages = [{ role: 'system', content: CORTEX_SYS + (oral ? CORTEX_ORAL : '') + "\n\nÉTAT LIVE DU SYSTÈME (maintenant) :\n" + ctx + (extra || '') + savoir + questions }]
    .concat(hist.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })));
  let reply = '';
  const mode = await regimeActuel();
  if (mode === 'arret') {
    reply = "Le budget de modèles du mois est épuisé : je ne réponds plus qu'au budget, et je note tes demandes pour Claude jusqu'au 1er du mois ou jusqu'à une recharge.";
  } else {
    // Gemini, appelé directement (mesure du 25/09/2026 : 1,6 s, 0,00024 $ la réponse courte,
    // six fois moins cher que gpt-4.1 et un français plus soutenu). Le régime économe prend
    // la version encore plus légère.
    const leger = mode === 'econome' || mode === 'reserve';
    const MODELE = !leger && PROFOND.test(message) ? MODELE_PROFOND : MODELE_JARVIS;
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        // la réflexion compte dans max_tokens ; en régime économe, il répond sans réfléchir
        body: JSON.stringify({ model: MODELE, messages, max_tokens: 2500, reasoning: { enabled: !leger } }), signal: AbortSignal.timeout(90000) });
      const d = await r.json();
      reply = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    } catch (e) {}
  }
  if (!reply && mode !== 'arret') { // repli : une seconde chance sur V4 Pro (l'ancien chemin par n8n et gpt-4.1 coûtait dix fois plus)
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELE_PROFOND, messages, max_tokens: 2500 }), signal: AbortSignal.timeout(90000) });
      const d = await r.json();
      reply = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
    } catch (e) {}
  }
  reply = (reply || "").trim();
  if (!reply) reply = "(Cortex est indisponible à l'instant — réessaie dans un moment.)";
  await q("INSERT INTO cortex_chat (role, content) VALUES ('assistant', $1)", [reply]);
  return reply;
}

// ── JARVIS : la voix, le budget, le routeur (25/09/2026) ──────────────────────────────────────
const VOIX = process.env.VOIX_URL || 'http://voix:9000';
const PLAFOND_EUR = 16; // Constitution, principe 5 : le prix du serveur, tant que Basile ne le relève pas

function corpsBrut(req, max) {
  return new Promise((ok, ko) => {
    const morceaux = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); ko(new Error('trop long')); } else morceaux.push(c); });
    req.on('end', () => ok(Buffer.concat(morceaux)));
    req.on('error', ko);
  });
}

// Le taux de la BCE (sans clé), relu deux fois par jour : le plafond est en euros, les modèles en dollars.
let taux = null;
async function tauxUsdEur() {
  if (taux && Date.now() - taux.t < 12 * 3600e3) return taux.v;
  try {
    const d = await (await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', { signal: AbortSignal.timeout(4000) })).json();
    if (d && d.rates && d.rates.EUR) taux = { v: d.rates.EUR, t: Date.now() };
  } catch (e) {}
  return taux ? taux.v : null;
}

// Ce qui reste : crédits de modèles (lecture seule chez OpenRouter), dépense du mois face au
// plafond, et la dernière jauge du forfait Claude déposée par Claude lui-même.
let budgetCache = null;
async function budget() {
  if (budgetCache && Date.now() - budgetCache.t < 60000) return budgetCache.b;
  const b = await lireBudget();
  budgetCache = { t: Date.now(), b };
  return b;
}
async function lireBudget() {
  const b = { plafond_eur: PLAFOND_EUR, claude: [] };
  const cle = process.env.OPENROUTER_API_KEY;
  if (cle) {
    const h = { Authorization: 'Bearer ' + cle };
    try {
      const d = ((await (await fetch('https://openrouter.ai/api/v1/credits', { headers: h, signal: AbortSignal.timeout(5000) })).json()) || {}).data || {};
      if (d.total_credits != null) { b.credits_usd = +d.total_credits; b.credits_restants_usd = +(d.total_credits - d.total_usage).toFixed(2); }
    } catch (e) {}
    try {
      const d = ((await (await fetch('https://openrouter.ai/api/v1/key', { headers: h, signal: AbortSignal.timeout(5000) })).json()) || {}).data || {};
      if (d.usage_monthly != null) b.mois_usd = +d.usage_monthly;
    } catch (e) {}
  }
  if (b.mois_usd == null) {
    try { b.mois_usd = +(await cerveau.query("SELECT coalesce(sum(cost_usd), 0) AS d FROM agent_runs WHERE created_at >= date_trunc('month', now())")).rows[0].d; } catch (e) {}
  }
  const t = await tauxUsdEur();
  if (b.mois_usd != null && t) { b.mois_eur = +(b.mois_usd * t).toFixed(2); b.pourcent_plafond = Math.round(100 * b.mois_eur / PLAFOND_EUR); }
  try {
    b.claude = (await cerveau.query(
      "SELECT DISTINCT ON (fenetre) fenetre, pourcent, reinitialise_le, lu_le FROM claude_usage ORDER BY fenetre, lu_le DESC")).rows;
  } catch (e) {}
  try { b.regime = (await cerveau.query("SELECT mode, mesures, chiffres, le FROM regime_budget ORDER BY le DESC LIMIT 1")).rows[0] || null; } catch (e) { b.regime = null; }
  return b;
}

// Le bloc « Budget » de Jarvis : pour chaque réserve, son nom, ce qui reste en %, la valeur réelle.
const REGIMES = { normal: 'Rythme normal', econome: 'Rythme économe', reserve: 'Réserve', arret: 'Arrêt des dépenses' };
function lignesBudget(b) {
  const l = [];
  if (b.mois_eur != null) l.push({ nom: 'Plafond du mois', reste: Math.max(0, 100 - b.pourcent_plafond), valeur: `${virgule(Math.max(0, b.plafond_eur - b.mois_eur))} € sur ${b.plafond_eur} €` });
  if (b.credits_restants_usd != null && b.credits_usd) l.push({ nom: 'Crédits de modèles', reste: Math.round(100 * b.credits_restants_usd / b.credits_usd), valeur: `${virgule(b.credits_restants_usd)} $ sur ${virgule(b.credits_usd).replace(',00', '')} $` });
  const court = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  for (const f of ['semaine', '5 heures']) {
    const c = b.claude.find((x) => x.fenetre === f);
    if (c) l.push({ nom: `Claude · ${f}`, reste: 100 - c.pourcent, valeur: `repart ${court(c.reinitialise_le)}` });
  }
  return l;
}

// Ce que le cerveau met en place : le régime de l'économe, et le rythme que Claude s'impose.
function mesuresBudget(b) {
  const m = b.regime ? [...b.regime.mesures] : ["L'économe n'a pas encore rendu sa première lecture."];
  const sem = b.claude.find((x) => x.fenetre === 'semaine');
  if (sem) {
    const jours = Math.max(0.5, (new Date(sem.reinitialise_le) - Date.now()) / 86400e3);
    const parJour = (100 - sem.pourcent) / jours;
    if (parJour < 100 / 7) m.push(`Claude : ${100 - sem.pourcent} % pour ${Math.round(jours)} jours, environ ${Math.max(1, Math.round(parJour))} % par jour ; il travaille au plus court et laisse les tâches répétitives au cerveau.`);
  }
  return m;
}

const quand = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const virgule = (n) => n.toFixed(2).replace('.', ',');

// Ce qui mérite d'être dit sans qu'on le demande : un réservoir presque vide.
function alerteBudget(b) {
  const a = [];
  if (b.credits_restants_usd != null && b.credits_restants_usd < 2) a.push(`plus que ${virgule(b.credits_restants_usd)} dollars de crédits de modèles`);
  if (b.pourcent_plafond != null && b.pourcent_plafond >= 90) a.push(`${b.pourcent_plafond} % du plafond du mois dépensés`);
  for (const c of b.claude) if (c.pourcent >= 90) a.push(`ton forfait Claude à ${c.pourcent} % sur la fenêtre « ${c.fenetre} »`);
  return a.length ? 'Attention : ' + a.join(', ') + '.' : '';
}

function phraseBudget(b) {
  const p = [];
  const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  if (b.credits_restants_usd != null && b.credits_usd) {
    p.push(`Crédits de modèles : ${virgule(b.credits_restants_usd)} dollars sur ${virgule(b.credits_usd)}, soit ${Math.round(100 * b.credits_restants_usd / b.credits_usd)} % restants.`);
  }
  if (b.mois_eur != null) p.push(`Ce mois-ci : ${virgule(b.mois_eur)} euros dépensés sur ${b.plafond_eur}, il reste ${100 - b.pourcent_plafond} % du plafond.`);
  else if (b.mois_usd != null) p.push(`Ce mois-ci : ${virgule(b.mois_usd)} dollars dépensés.`);
  const cinq = b.claude.find((c) => c.fenetre === '5 heures'), sem = b.claude.find((c) => c.fenetre === 'semaine');
  if (cinq || sem) {
    const r = [cinq && `${100 - cinq.pourcent} % sur 5 heures`, sem && `${100 - sem.pourcent} % sur la semaine`].filter(Boolean).join(' et ');
    const lu = (sem || cinq).lu_le;
    p.push(`Ton forfait Claude : il reste ${r}, relevé ${quand(lu).replace(/ à .*/, '')} à ${heure(lu)}${sem ? ` ; la semaine repart ${quand(sem.reinitialise_le)}` : ''}.`);
  }
  if (!p.length) p.push("Je n'arrive pas à lire le budget à l'instant.");
  p.push(...mesuresBudget(b));
  return p.join(' ');
}

// Le routeur. Le budget se dit avec les chiffres, sans modèle. Une action se note pour Claude
// (Jarvis n'exécute rien lui-même). Tout le reste va à Cortex, avec ce que le cerveau sait.
const INTENTION_BUDGET = /\b(budget|tokens?|jetons?|crédits?|credits?|pourcentage|forfait|combien (il )?(me |te |nous )?reste|reste-t-il|(il )?(me |te |nous )?reste combien|dépensé|limite)\b/i;
const INTENTION_ACTION = /^(?:(?:jarvis|cortex)[, ]+)?(?:(?:est-ce que tu peux|est-ce que tu pourrais|peux-tu|tu peux|pourrais-tu|je veux que tu|il faut que tu|j'aimerais que tu|je voudrais que tu|note que tu dois)\s+)?(?:cré|construi|lanc|met|ajout|modifi|corrig|déploi|publi|envoi|envoy|install|supprim|chang|programm|développ|cod|génér|refai|refass|amélior|répar|automatis|intégr|prépar|fabriqu)[\p{L}]*/iu;

async function etatDuCerveau() {
  const lire = async (sql) => { try { return (await cerveau.query(sql)).rows; } catch (e) { return []; } };
  const journal = await lire("SELECT acteur, left(changement, 160) AS c FROM journal WHERE created_at > now() - interval '48 hours' ORDER BY created_at DESC LIMIT 8");
  const pensee = await lire("SELECT titre, proposition FROM pensees WHERE nuit = (SELECT max(nuit) FROM pensees) ORDER BY rang LIMIT 3");
  const commandes = await lire("SELECT id, texte, etat FROM commandes WHERE etat IN ('a_faire','en_cours') ORDER BY cree_le LIMIT 6");
  let t = '';
  if (journal.length) t += "\nCe qui a changé (48 h) :\n" + journal.map((j) => `- ${j.acteur} : ${j.c}`).join('\n');
  if (pensee.length) t += "\nLa pensée de la nuit :\n" + pensee.map((p) => `- ${p.titre} — ${p.proposition}`).join('\n');
  if (commandes.length) t += "\nCommandes notées pour Claude, pas encore faites :\n" + commandes.map((c) => `- n°${c.id} ${c.texte}`).join('\n');
  return t;
}

// Une action demandée : notée dans la table commandes, que Claude lit à chaque ouverture de session.
async function noterCommande(message, reformulation) {
  let id = null;
  try { id = (await cerveau.query("INSERT INTO commandes (texte) VALUES ($1) RETURNING id", [message])).rows[0].id; } catch (e) {}
  const reply = id
    ? `C'est noté, commande numéro ${id}, pour Claude${reformulation ? ' : ' + reformulation.replace(/\s+$/, '').replace(/([^.!?…])$/, '$1.') : '.'} Il la prend à l'ouverture de sa prochaine session et te rend compte. Elle n'est pas encore faite.`
    : "Je n'ai pas pu noter cette demande à l'instant. Redis-la-moi dans un moment.";
  await q("INSERT INTO cortex_chat (role, content) VALUES ('assistant', $1)", [reply]);
  return { voie: 'action', reply, commande: id };
}

async function jarvisDire(message) {
  if (INTENTION_BUDGET.test(message)) return { voie: 'budget', reply: phraseBudget(await budget()) };
  if (INTENTION_ACTION.test(message)) {
    await q("INSERT INTO cortex_chat (role, content) VALUES ('user', $1)", [message]);
    return noterCommande(message, '');
  }
  const b = await budget();
  const extra = (await etatDuCerveau()) + "\nBudget : " + phraseBudget(b);
  const reply = await repondreCortex(message, true, extra);
  // Le modèle a reconnu une action que le tri rapide n'a pas vue : le serveur la note pour de vrai.
  // Une vraie commande est un ordre, jamais une question, et sa reformulation tient en une phrase.
  // Sinon le marqueur est retiré : pour une question, la ligne de reformulation part aussi.
  if (/^\s*\[\[COMMANDE\]\]/.test(reply)) {
    const reste = reply.replace(/^\s*\[\[COMMANDE\]\]\s*/, '');
    const question = /\?\s*$/.test(message) || /^(qu'est-ce|est-ce que|comment|pourquoi|quel|quelle|combien|où|quand|qui|que |sais-tu|peux-tu me dire)/i.test(message.trim());
    if (!question && reste.length < 260 && !/\n/.test(reste.trim())) return noterCommande(message, reste);
    return { voie: 'cortex', reply: question ? reste.replace(/^[^\n]*\n+/, '') : reste };
  }
  return { voie: 'cortex', reply };
}

async function buildContext() {
  const g = async (sql) => { const r = await q(sql); return (Array.isArray(r) && r[0]) ? Object.values(r[0])[0] : 0; };
  try {
    const prospects = await g("SELECT count(*) FROM prospects");
    const email = await g("SELECT count(*) FROM prospects WHERE contact_email IS NOT NULL");
    const brouillons = await g("SELECT count(*) FROM outreach WHERE status='brouillon'");
    const devis = await g("SELECT count(*) FROM devis");
    const veille24 = await g("SELECT count(*) FROM veille_ia WHERE captured_at > now()-interval '24 hours'");
    const agents = rowsOr(await q("SELECT name FROM workflow_entity WHERE active=true ORDER BY name"), []).map(r => r.name).join(', ');
    const tasks = rowsOr(await q("SELECT title FROM tasks WHERE status<>'fait' ORDER BY priority, id LIMIT 6"), []).map(r => '- ' + r.title).join('\n');
    return `Prospects: ${prospects} (dont ${email} avec email). Brouillons emails: ${brouillons}. Devis chiffrés: ${devis}. Veille IA (24h): ${veille24}.\nAgents actifs: ${agents}.\nTâches en cours:\n${tasks}`;
  } catch (e) { return 'contexte indisponible'; }
}

async function kpi() {
  const out = { ts: new Date().toISOString() };

  // Prospects
  const pTotal = rowsOr(await q('SELECT count(*)::int n FROM prospects'), [{ n: 0 }]);
  const pStatus = rowsOr(await q("SELECT status, count(*)::int n FROM prospects GROUP BY status ORDER BY n DESC"), []);
  const p24 = rowsOr(await q("SELECT count(*)::int n FROM prospects WHERE found_at > now() - interval '24 hours'"), [{ n: 0 }]);
  const p7 = rowsOr(await q("SELECT count(*)::int n FROM prospects WHERE found_at > now() - interval '7 days'"), [{ n: 0 }]);
  const pTop = rowsOr(await q("SELECT siren, name, sector, departement, score, status FROM prospects ORDER BY score DESC NULLS LAST, found_at DESC LIMIT 25"), []);
  const byStatus = {};
  pStatus.forEach(r => { byStatus[r.status || 'nouveau'] = r.n; });
  out.prospects = {
    total: pTotal[0] ? pTotal[0].n : 0,
    new24h: p24[0] ? p24[0].n : 0,
    new7d: p7[0] ? p7[0].n : 0,
    contactes: byStatus['contacté'] || byStatus['contacte'] || 0,
    repondus: byStatus['répondu'] || byStatus['repondu'] || 0,
    clients: byStatus['client'] || 0,
    byStatus,
    top: pTop,
  };

  // Veille IA
  const vTotal = rowsOr(await q('SELECT count(*)::int n FROM veille_ia'), [{ n: 0 }]);
  const v24 = rowsOr(await q("SELECT count(*)::int n FROM veille_ia WHERE captured_at > now() - interval '24 hours'"), [{ n: 0 }]);
  const vTop = rowsOr(await q("SELECT source, title, url, relevance, summary FROM veille_ia WHERE summary IS NOT NULL ORDER BY relevance DESC NULLS LAST, published_at DESC LIMIT 6"), []);
  out.veille = { total: vTotal[0] ? vTotal[0].n : 0, new24h: v24[0] ? v24[0].n : 0, top: vTop };

  // Fil des agents (strategy_notes)
  out.notes = rowsOr(await q("SELECT agent, kind, content, created_at FROM strategy_notes ORDER BY created_at DESC LIMIT 8"), []);

  // Découvertes internes
  const lOpen = rowsOr(await q('SELECT count(*)::int n FROM system_learnings WHERE resolved = false'), [{ n: 0 }]);
  const lRecent = rowsOr(await q("SELECT agent, category, observation, action, resolved, discovered_at FROM system_learnings ORDER BY discovered_at DESC LIMIT 5"), []);
  out.learnings = { open: lOpen[0] ? lOpen[0].n : 0, recent: lRecent };

  // Agents = workflows n8n
  out.workflows = rowsOr(await q("SELECT name, active FROM workflow_entity ORDER BY active DESC, name LIMIT 30"), []);

  // Ciblage + clients/prospects par secteur (boussole: quel secteur convertit)
  out.priorities = rowsOr(await q(
    "SELECT mp.segment, mp.stars, mp.is_prescripteur, " +
    " COALESCE((SELECT count(*) FROM prospects p WHERE p.segment = mp.segment),0)::int AS prospects, " +
    " COALESCE((SELECT count(*) FROM prospects p WHERE p.segment = mp.segment AND p.status='client'),0)::int AS clients " +
    "FROM market_priorities mp ORDER BY mp.rank LIMIT 15"), []);

  // Mes taches
  out.tasks = rowsOr(await q("SELECT source, title, detail, priority, status, due FROM tasks WHERE status <> 'fait' ORDER BY priority, created_at DESC LIMIT 12"), []);

  // Emails prospects (enrichissement + brouillons Amy)
  const pEmail = rowsOr(await q("SELECT count(*)::int n FROM prospects WHERE contact_email IS NOT NULL"), [{ n: 0 }]);
  out.prospects.avec_email = pEmail[0] ? pEmail[0].n : 0;
  const oCount = rowsOr(await q("SELECT status, count(*)::int n FROM outreach GROUP BY status"), []);
  const oBy = {}; oCount.forEach(r => { oBy[r.status || 'brouillon'] = r.n; });
  const oRecent = rowsOr(await q("SELECT id, prospect_name, segment, to_email, subject, body, status FROM outreach ORDER BY created_at DESC LIMIT 25"), []);
  out.outreach = { total: oRecent.length ? (Object.values(oBy).reduce((a, b) => a + b, 0)) : 0, byStatus: oBy, recent: oRecent };

  // SAI : fiches d'audit (Léonard) + grille tarifaire
  out.audits = rowsOr(await q("SELECT entreprise, secteur, taille, contenu, created_at FROM audit_sheets ORDER BY created_at DESC LIMIT 15"), []);
  out.sai_catalog = rowsOr(await q("SELECT categorie, offre, prix_min, prix_max, unite, notes FROM sai_catalog ORDER BY id"), []);
  out.devis = rowsOr(await q("SELECT entreprise, objectif, diagnostic, roi, resultats, lignes, total_ht, deduction_audit, net_ht, maintenance_plan, maintenance_prix, argumentaire, status FROM devis ORDER BY created_at DESC LIMIT 12"), []);
  out.audit = rowsOr(await q("SELECT severity, titre, detail FROM audit_findings ORDER BY created_at DESC LIMIT 6"), []);
  out.sendsToday = (rowsOr(await q("SELECT count(*)::int n FROM outreach WHERE sent_at::date = now()::date"), [{ n: 0 }])[0] || {}).n || 0;
  out.recentSends = rowsOr(await q("SELECT prospect_name, to_email, sent_at FROM outreach WHERE sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 8"), []);

  // Messages LinkedIn (Amy) — à copier-coller
  out.linkedin = rowsOr(await q("SELECT prospect_name, segment, connection_note, message, status FROM linkedin_msgs ORDER BY created_at DESC LIMIT 25"), []);

  // Orchestrateur (Cortex = moi, le manager, hors workflow)
  out.orchestrator = { name: 'Cortex', role: "Chef d'orchestre — pilote les agents + interface de Basile" };

  return out;
}

const server = http.createServer(async (req, res) => {
  // Déclenche Léonard pour préparer des fiches d'audit sur les prospects cochés
  if (req.method === 'POST' && req.url === '/api/prepare-audit') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let sirens = [];
      try { sirens = (JSON.parse(body).sirens) || []; } catch (e) {}
      let n = 0;
      for (const s of sirens.slice(0, 10)) {
        const rows = await q("SELECT name, segment, effectif_label FROM prospects WHERE siren = $1", [s]);
        if (Array.isArray(rows) && rows[0]) {
          const p = rows[0];
          try {
            await fetch('http://n8n:5678/webhook/audit-prep', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entreprise: p.name, secteur: p.segment, taille: p.effectif_label || '' })
            });
            n++;
          } catch (e) {}
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ triggered: n }));
    });
    return;
  }
  // Valider / refuser un brouillon d'email (la porte humaine)
  if (req.method === 'POST' && req.url === '/api/outreach-action') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let id, action;
      try { const j = JSON.parse(body); id = parseInt(j.id); action = j.action; } catch (e) {}
      let ok = false;
      if (id && (action === 'valide' || action === 'refuse')) {
        await q("UPDATE outreach SET status=$1, validated_at=CASE WHEN $1='valide' THEN now() ELSE validated_at END WHERE id=$2 AND status='brouillon'", [action, id]);
        ok = true;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok }));
    });
    return;
  }
  // Désinscription PUBLIQUE (opt-out RGPD) — pas d'auth
  if (req.method === 'GET' && req.url.startsWith('/unsub')) {
    let email = '';
    try { email = (new URL(req.url, 'http://x').searchParams.get('e') || '').trim().toLowerCase(); } catch (e) {}
    if (email) {
      await q("INSERT INTO suppression (email, reason) VALUES ($1,'opt-out') ON CONFLICT (email) DO NOTHING", [email]);
      await q("UPDATE outreach SET status='refuse' WHERE lower(to_email)=$1 AND status IN ('brouillon','valide')", [email]);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#07140e;color:#e9f1ec;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="color:#34d399">C\'est fait &#10003;</h2><p>Vous ne recevrez plus d\'emails de rAIme.</p></div></body>');
    return;
  }
  // Chat avec Cortex
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let message = '';
      try { message = String(JSON.parse(body).message || '').slice(0, 2000).trim(); } catch (e) {}
      if (!message) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ reply: '' })); return; }
      const reply = await repondreCortex(message, false, '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/api/chat-history') {
    const hist = rowsOr(await q("SELECT role, content FROM cortex_chat ORDER BY id DESC LIMIT 40"), []).reverse();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ messages: hist }));
    return;
  }
  if (req.url === '/api/kpi') {
    const data = await kpi();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
    return;
  }
  if (req.url === '/jarvis' && JARVIS) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JARVIS);
    return;
  }
  // La voix de Basile -> texte, par le service « voix » du serveur (rien ne sort d'ici).
  if (req.method === 'POST' && req.url === '/api/jarvis/voix') {
    try {
      const audio = await corpsBrut(req, 8 * 1024 * 1024);
      const r = await fetch(VOIX + '/transcrire', { method: 'POST', body: audio, signal: AbortSignal.timeout(60000) });
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(await r.text());
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erreur: 'la voix du serveur ne répond pas' }));
    }
    return;
  }
  // Le texte -> la voix française de Jarvis.
  if (req.method === 'POST' && req.url === '/api/jarvis/parler') {
    try {
      const corps = await corpsBrut(req, 20000);
      const r = await fetch(VOIX + '/parler', { method: 'POST', body: corps, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('voix');
      const wav = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' });
      res.end(wav);
    } catch (e) { res.writeHead(502); res.end(); }
    return;
  }
  // Ce que Basile dit à Jarvis : le routeur choisit la voie (budget, action notée, Cortex).
  if (req.method === 'POST' && req.url === '/api/jarvis/dire') {
    let message = '';
    try { message = String(JSON.parse((await corpsBrut(req, 1e5)).toString('utf8')).message || '').slice(0, 2000).trim(); } catch (e) {}
    const r = message ? await jarvisDire(message) : { voie: 'vide', reply: '' };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(r));
    return;
  }
  if (req.url === '/api/jarvis') {
    // L'essentiel, lu dans la base du cerveau. Une table absente rend une liste vide, jamais une erreur.
    const lire = async (sql) => { try { return (await cerveau.query(sql)).rows; } catch (e) { return []; } };
    const pensee = await lire("SELECT titre, proposition FROM pensees WHERE nuit = (SELECT max(nuit) FROM pensees) ORDER BY rang LIMIT 3");
    const attente = await lire("SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY bloquant DESC, cree_le DESC LIMIT 3");
    const journal = journalEnClair(await lire("SELECT acteur, left(changement, 200) AS changement, created_at FROM journal WHERE created_at > now() - interval '48 hours' ORDER BY created_at DESC LIMIT 40"));
    const penseurActif = (await lire("SELECT count(*)::int AS n FROM pensees"))[0];
    const bibliotheque = await lire("SELECT count(*)::int AS n FROM kb_chunks");
    const depense = await lire("SELECT coalesce(sum(cost_usd), 0)::float AS d FROM agent_runs WHERE created_at >= date_trunc('month', now())");
    const veille = await lire("SELECT count(*)::int AS n FROM veille WHERE vu_le > now() - interval '24 hours'");
    const agents = await lire("SELECT count(DISTINCT agent)::int AS n FROM boucle_passages WHERE fin_le > now() - interval '24 hours' AND statut = 'ok'");
    const nbQuestions = await lire("SELECT count(*)::int AS n FROM demandes WHERE etat = 'ouverte'");
    const commandes = await lire("SELECT id, texte FROM commandes WHERE etat IN ('a_faire','en_cours') ORDER BY cree_le LIMIT 4");
    const b = await budget();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ pensee, attente, journal, commandes, penseur: !!(penseurActif && penseurActif.n),
      bibliotheque: bibliotheque[0] ? bibliotheque[0].n : null,
      budget_lignes: lignesBudget(b), budget_mesures: mesuresBudget(b), regime: b.regime ? REGIMES[b.regime.mode] || b.regime.mode : null,
      depense: depense[0] ? depense[0].d : null, veille24h: veille[0] ? veille[0].n : null,
      agents: agents[0] ? agents[0].n : null, questions: nbQuestions[0] ? nbQuestions[0].n : null,
      budget: { credits_restants_usd: b.credits_restants_usd ?? null, credits_usd: b.credits_usd ?? null,
        mois_eur: b.mois_eur ?? null, pourcent_plafond: b.pourcent_plafond ?? null, plafond_eur: b.plafond_eur,
        claude: b.claude.map((c) => ({ fenetre: c.fenetre, reste: 100 - c.pourcent, lu_le: c.lu_le })) },
      alerte: alerteBudget(b) }));
    return;
  }
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(8090, () => console.log('cockpit live on :8090'));
