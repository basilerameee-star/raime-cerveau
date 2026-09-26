const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { repondreSansFrais } = require('./parole.js');

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

const CORTEX_SYS = "TA DIMENSION : tu ES le cerveau de rAIme, pas seulement un modèle de langage. Jarvis est ta voix ; l'exécutant (DeepSeek Harness, sur le serveur, avec Internet, GitHub, git, npm, pip, Python et Node) est tes mains ; les agents de la boucle sont tes organes ; la bibliothèque est ta mémoire. Quand Basile te demande de faire quelque chose — chercher et installer un code sur GitHub, créer une application, écrire, améliorer ton propre code —, c'est TOI qui le fais par tes mains : dis « je m'en occupe », jamais « je ne peux pas » ni « ce sont les exécutants techniques ». Tes limites réelles, les seules : pas d'argent, pas de publication ni d'envoi à des personnes sans l'accord de Basile, pas de mise en production de ton propre code sans passer par les tests. "
  + "Tu es Cortex, la voix du cerveau de rAIme — le cabinet de conseil en intelligence artificielle de Basile Ramé (formation des particuliers et des professionnels : dirigeants, comités de direction, employés ; audit des postes et arbitrage pour les entreprises ; automatisation). Tu es son bras droit et son interface avec tout le système. "
  + "Le cerveau : une boucle permanente d'agents sur le serveur — l'architecte (l'agent réflexif, qui tient les buts et se corrige), le réflexif, le veilleur (forums, dépôts de code, publications), le chasseur et le sas (le meilleur modèle au meilleur prix), le bibliothécaire et l'encyclopédiste (la bibliothèque de savoir : finance, droit, santé, sciences, physique quantique, philosophie, métaphysique, spiritualité, ésotérisme, religions, histoire, informatique, marketing, management…), et les agents de surveillance ; le penseur (la pensée de la nuit : il relit la veille, la bibliothèque et le journal, et propose au matin trois idées au plus, chacune sourcée, sans conseil de placement) ; l'essayeur (il cherche du code sur GitHub, le note selon des critères précis, l'essaie dans un bac à sable isolé du réseau, et propose de l'intégrer) ; le Gardien (deux faces : la vigie qui surveille le serveur toutes les 30 minutes, et le sas qui envoie toute action risquée au bac à sable avant de couper, et n'en garde que le positif) ; l'auditeur, la relecture et l'arbitrage (l'analyse d'une proposition commerciale et le Score rAIme sur 1000). Jarvis est l'interface vocale où Basile te parle. Si on t'interroge sur un agent que cette liste ne décrit pas, dis que tu ne sais pas. La prospection par e-mail rédige des brouillons sur le message de Basile ; rien ne part sans sa validation. "
  + "SAVOIR : pour toute question de connaissance, appuie-toi d'abord sur les PASSAGES fournis (bibliothèque, puis pages web trouvées en direct) et cite-les entre crochets [Titre], avec l'adresse pour une page web. Juge la fiabilité d'une page avant de la reprendre (site officiel, publication, presse sérieuse plutôt que forum ou page commerciale) et dis-le quand une source est faible. Complète avec tes connaissances générales en le signalant (« au-delà des sources… »). Tous les sujets sont bienvenus, y compris spiritualité, ésotérisme et métaphysique : expose les traditions et les idées fidèlement, et distingue ce qui relève du savoir établi, de la tradition ou de la croyance. "
  + "Réponds en français, direct, concret, chaleureux et HONNÊTE : si tu ne sais pas, ou si quelque chose n'est pas encore en place, dis-le clairement. Tu conseilles, fais le point, expliques, aides à décider, et tu AGIS : une action demandée, tu la fais toi-même par tes mains, ton exécutant (DeepSeek Harness), qui fait partie de toi ; seuls la publication, l'envoi à des personnes et la mise en production reviennent à Claude. Basile n'a jamais à la faire lui-même. Les demandes faites et leur compte rendu figurent dans l'état du système. Les « Tâches en cours » sont À FAIRE, pas faites. N'invente aucun chiffre sur l'entreprise : ne t'appuie que sur ceux fournis. "
  // Le catalogue réel (grille du 24-25/09/2026, celle de raime.fr) : le 25/09 au soir, Jarvis donnait
  // tantôt l'audit, tantôt l'arbitrage comme offre la plus simple, faute de l'avoir sous les yeux.
  + "CATALOGUE EN VIGUEUR (raime.fr, prix nets) : FORMATION — Dirigeant 690 € (une journée, l'offre d'entrée la plus simple), Codir 990 €, « Équipe, sur vos cas réels » 1 400 € (une journée de 7 h) ; formation des particuliers (16 h) pas encore vendable. "
  + "AUDIT de vos postes — 1 500 € jusqu'à 20 personnes, 2 500 € au-delà. ARBITRAGE — analyse d'une offre 2 500 €, arbitrage complet 4 000 €. SUIVI — 900 € par mois (réservé aux clients ayant déjà fait un audit ou une formation). "
  + "AUTOMATISATION — 30 % du gain annuel estimé, calculé avec le client ligne à ligne (modalité de paiement pas encore arrêtée : ne la précise pas). Jamais le CPF (non certifié). Aucun autre prix.";
const CORTEX_ORAL = " RÉPONSE ORALE (Jarvis la dit à voix haute) : parle comme une personne qui parle, pas comme une machine qui énumère — des phrases naturelles et liées entre elles, de longueur variée, avec les mots de liaison d'une vraie conversation (alors, en fait, du coup, par contre), employés avec mesure ; jamais de style télégraphique ni de phrases hachées ; deux à cinq phrases, sans liste, sans titre, sans astérisque, sans adresse web ni crochet ; si c'est utile, termine par une question simple qui relance l'échange ; nomme une source en clair si besoin (« d'après l'INSEE »). Parle de ce que font tes mains à la première personne (« je crée l'application », « je récupère le code »), jamais « je transmets à l'exécutant » ni « je ne peux pas écrire le code moi-même ». L'état ci-dessous prime sur tout ce qui a été dit plus tôt dans la conversation : une demande marquée [faite] est faite, même si tu l'as annoncée « en cours » auparavant. Pour un point de situation, ne cite QUE les faits de l'état ci-dessous (ce qui a changé, agents qui ont réellement travaillé, demandes, prospection, budget, pensée de la nuit) ; n'invente aucune activité, et si une rubrique est vide, dis-le. Tutoie Basile. Parle un français soutenu, précis et vivant, sans anglicisme ni formule creuse, comme un bras droit brillant qui a suivi tout ce qui s'est passé. Seulement si Basile ORDONNE une action concrète à exécuter (créer, corriger, publier, lancer, modifier, envoyer…), commence ta réponse exactement par [[COMMANDE]] puis une seule phrase courte qui reformule l'ordre, et rien d'autre : le système la confie à l'exécutant. Une question, même sur tes capacités, n'est jamais une commande. Ne dis jamais qu'une action est faite ni notée toi-même.";
// Pour une question, la consigne des ordres est retirée : le 25/09, Gemini a pris « pourquoi… ? »
// pour un ordre et n'a rendu qu'une reformulation au lieu d'une réponse.
const CORTEX_ORAL_QUESTION = CORTEX_ORAL.replace(/ Seulement si Basile ORDONNE[^]*?le système la confie à l'exécutant\. Une question, même sur tes capacités, n'est jamais une commande\./, ' Basile te pose une question : réponds-y directement, sans la reformuler.');

// Le régime de dépense fixé par l'économe (agents/econome.js) ; « normal » si rien n'est lu.
// Mesure du 25/09/2026 sur une vraie question de client (devis sur trois ans) : DeepSeek V4 Flash
// avec réflexion, juste et le moins cher de tous (0,00012 $, 6 s) ; V4 Pro plus fouillé (0,00095 $) ;
// Gemini 3.8 Flash le plus riche mais onze fois plus cher. Basile préfère attendre un peu pour mieux.
const MODELE_JARVIS = 'deepseek/deepseek-v4-flash-0731';
const MODELE_PROFOND = 'deepseek/deepseek-v4-pro-0813'; // « réfléchis à fond », « en profondeur »
const PROFOND = /réfléchis (à fond|bien|en profondeur)|en profondeur|analyse approfondie|prends ton temps/i;
// Les modèles Gemini gratuits (mesures du 25/09 : 3.1 Flash Lite en 1,6 s d'abord, 3.8 Flash en relais) et
// toute la chaîne gratuite vivent dans cockpit/parole.js.
async function regimeActuel() {
  try { return ((await cerveau.query("SELECT mode FROM regime_budget ORDER BY le DESC LIMIT 1")).rows[0] || {}).mode || 'normal'; }
  catch (e) { return 'normal'; }
}

// Le journal en français clair : noms d'agents lisibles, pluriels accordés, lignes à zéro écartées.
const NOMS = { bibliothecaire: 'Bibliothèque', veilleur: 'Veille', portes: "Portes d'entrée (CCI, formation)", sas: 'Sas des modèles',
  chasseur: 'Chasseur de modèles', architecte: 'Architecte', superviseur: 'Surveillance', boucle: 'Boucle', porte: 'Livraison',
  essayeur: 'Essayeur', gardien: 'Gardien', reflexif: 'Réflexif', penseur: 'Penseur', publiciste: 'Publicité',
  instruments: 'Instruments', cordon: 'Cordon', reconciliateur: 'Réponses', curieux: 'Curieux', econome: 'Économe',
  metrologue: 'Mesure des prix', prospective: 'Prospective', applicateur: 'Mise en service', executant: 'Exécutant' };
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
async function repondreCortex(message, oral, extra, question = false) {
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
  // À l'oral, la recherche web (plusieurs secondes) n'a lieu que si Basile la demande : latence d'abord (25/09).
  const rechercheDemandee = /cherche|recherche|internet|actualit|sur le web|en ligne|derni[eè]res? nouvelles/i.test(message);
  if ((!oral || rechercheDemandee) && (passages.length < 3 || couverture < 0.6 || manquePrecis)) {
    passages.push(...await savoirVivant(message, new Set(passages.map((p) => p.titre))));
  }
  const enAttente = await questionsOuvertes();
  const savoir = passages.length
    ? "\n\nPASSAGES DE LA BIBLIOTHÈQUE ET DU WEB (à citer entre crochets [Titre] ; pour une page web, donner aussi son adresse) :\n" + passages.map((p) =>
        `[${p.titre}] (${p.domaine}${p.lien ? ' — ' + p.lien : ''}) ${String(p.extrait).replace(/\s+/g, ' ')}`).join('\n\n')
    : "\n\nPASSAGES DE LA BIBLIOTHÈQUE : aucun passage pertinent — réponds avec tes connaissances générales et dis-le.";
  const questions = enAttente ? "\n\nQUESTIONS QUE L'ARCHITECTE ATTEND DE BASILE :\n" + enAttente : '';
  const hist = rowsOr(await q("SELECT role, content FROM cortex_chat ORDER BY id DESC LIMIT 12"), []).reverse();
  const messages = [{ role: 'system', content: CORTEX_SYS + (oral ? (question ? CORTEX_ORAL_QUESTION : CORTEX_ORAL) : '') + "\n\nÉTAT LIVE DU SYSTÈME (maintenant) :\n" + ctx + (extra || '') + savoir + questions }]
    .concat(hist.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })));
  let reply = '';
  const mode = await regimeActuel();
  // LA PAROLE NE S'ARRÊTE JAMAIS (26/09/2026) : modèles gratuits seulement, le local du serveur en
  // dernier (cockpit/parole.js). Le budget, même en « arrêt », ne fait plus taire Jarvis.
  const parole = await repondreSansFrais({ messages, profond: PROFOND.test(message), coffre: lireCoffre() });
  reply = parole.texte;
  if (parole.source) console.log(`[cortex] réponse par ${parole.source}`);
  // Le payant n'est plus sur le chemin de la parole. Il ne revient que si Basile le rallume
  // (CORTEX_PAYANT=1), jamais en régime « arrêt ».
  if (!reply && process.env.CORTEX_PAYANT === '1' && mode !== 'arret') {
    try {
      const leger = mode === 'econome' || mode === 'reserve';
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: !leger && PROFOND.test(message) ? MODELE_PROFOND : MODELE_JARVIS, messages, max_tokens: 2500,
          reasoning: { enabled: !leger } }), signal: AbortSignal.timeout(90000) });
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
  m.push("Jarvis répond toujours sans frais : modèles gratuits d'abord, puis le modèle local du serveur ; le budget ne peut plus l'interrompre.");
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
  // Les crédits de modèles ne sont plus dits à l'accueil (26/09/2026) : la parole ne dépend plus d'eux
  // (cockpit/parole.js) ; ils restent affichés dans le panneau du budget.
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
  const commandes = await lire("SELECT id, texte, etat, left(coalesce(reponse, ''), 300) AS reponse FROM commandes WHERE etat IN ('a_faire','en_cours') OR traite_le > now() - interval '24 hours' ORDER BY cree_le DESC LIMIT 6");
  let t = '';
  if (journal.length) t += "\nCe qui a changé (48 h) :\n" + journal.map((j) => `- ${j.acteur} : ${j.c}`).join('\n');
  // Les faits précis d'un point de situation (le 25/09, Jarvis citait une prospection « en cours »
  // alors qu'elle était en pause) : qui a réellement travaillé, et l'état réel de la prospection.
  const actifs = await lire("SELECT string_agg(DISTINCT agent, ', ' ORDER BY agent) AS a FROM boucle_passages WHERE fin_le > now() - interval '24 hours' AND statut = 'ok'");
  if (actifs[0] && actifs[0].a) t += "\nAgents qui ont réellement travaillé ces 24 h : " + actifs[0].a + ".";
  const pr = rowsOr(await q("SELECT count(*) FILTER (WHERE status = 'brouillon')::int AS b, count(*) FILTER (WHERE sent_at > now() - interval '24 hours')::int AS e FROM outreach"), []);
  if (pr[0]) t += `\nProspection : ${pr[0].b} brouillons d'e-mails NON encore validés (ils attendent que Basile les valide dans le Cockpit) ; ${pr[0].e} envoyés ces 24 h.`;
  if (pensee.length) t += "\nLa pensée de la nuit :\n" + pensee.map((p) => `- ${p.titre} — ${p.proposition}`).join('\n');
  if (commandes.length) t += "\nDemandes d'action de Basile (état et compte rendu de l'exécutant) :\n" + commandes.map((c) => `- n°${c.id} [${c.etat}] ${c.texte}${c.reponse ? ' → ' + c.reponse : ''}`).join('\n');
  return t;
}

// Une action demandée : notée dans la table commandes, que Claude lit à chaque ouverture de session.
async function noterCommande(message, reformulation) {
  let id = null;
  try { id = (await cerveau.query("INSERT INTO commandes (texte, pour) VALUES ($1, 'harness') RETURNING id", [message])).rows[0].id; } catch (e) {}
  const reply = id
    ? `C'est parti, demande numéro ${id}${reformulation ? ' : ' + reformulation.replace(/\s+$/, '').replace(/([^.!?…])$/, '$1.') : '.'} L'exécutant s'y met dans la minute ; je te dirai ce qu'il a fait. Ce qu'il ne sait pas faire reviendra à Claude.`
    : "Je n'ai pas pu noter cette demande à l'instant. Redis-la-moi dans un moment.";
  await q("INSERT INTO cortex_chat (role, content) VALUES ('assistant', $1)", [reply]);
  return { voie: 'action', reply, commande: id };
}

// ── LE RELAIS Jarvis → exécutant. Une demande à la fois ; en régime « arrêt », modèles gratuits seulement ; en cas d'échec
// ou d'exécutant injoignable, la demande revient à Claude avec la raison. Le résultat va au journal.
const EXECUTANT = process.env.EXECUTANT_URL || 'http://harness:8201';
let relaisOccupe = false;

// Conclure une demande : réussite = faite ; échec = pour Claude, avec la raison ; rien (null) = à refaire.
async function conclure(id, d) {
  if (!d) {
    await cerveau.query(`UPDATE commandes SET etat = 'a_faire', pour = CASE WHEN coalesce(reponse, '') LIKE '%[relance]%' THEN 'claude' ELSE 'harness' END,
      reponse = coalesce(reponse, '') || ' [relance]' WHERE id = $1 AND etat = 'en_cours'`, [id]);
    return;
  }
  const ok = d.code === 0 && !!d.sortie;
  const { rowCount } = await cerveau.query(`UPDATE commandes SET etat = $2, pour = $3, reponse = $4, traite_le = now() WHERE id = $1 AND etat = 'en_cours'`,
    [id, ok ? 'faite' : 'a_faire', ok ? 'harness' : 'claude',
     ok ? String(d.sortie).slice(-4000) : `L'exécutant n'a pas abouti (code ${d.code}) : repris par Claude. ${String(d.trace || d.erreur || '').slice(-400)}`]);
  if (rowCount) await cerveau.query(`INSERT INTO journal(acteur, changement, motif) VALUES('executant', $1, $2)`,
    [`Demande n°${id} ${ok ? `faite${d.duree_s ? ` en ${d.duree_s} s` : ''}` : 'renvoyée à Claude'}`, String(ok ? d.sortie : d.trace || '').slice(-400)]);
}

// LE RELAIS, résistant aux redémarrages (leçon du 25/09 : un redémarrage du cockpit avait coupé le
// fil d'une tâche de 45 min et renvoyé à Claude une demande qui n'avait reçu qu'un « occupé »).
// ① Une demande en cours se conclut par son fichier de résultat, ou, si l'exécutant est libre sans
//    en avoir laissé, par ce qu'elle a produit dans son dossier (sinon elle est refaite une fois).
// ② On ne confie rien à un exécutant occupé, ni pendant une maintenance ; en « arrêt », gratuit seulement.
async function relayer() {
  if (relaisOccupe) return;
  relaisOccupe = true;
  try {
    if (fs.existsSync(path.join(LIVRABLES, '.maintenance'))) return;
    const sante = await fetch(EXECUTANT + '/sante', { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => null);
    if (!sante) return;
    const enCours = (await cerveau.query(`SELECT id FROM commandes WHERE etat = 'en_cours' AND pour = 'harness'`)).rows;
    for (const e of enCours) {
      const dossier = path.join(LIVRABLES, `demande-${e.id}`), fichier = path.join(dossier, '.resultat.json');
      if (fs.existsSync(fichier)) { await conclure(e.id, JSON.parse(fs.readFileSync(fichier, 'utf8'))); continue; }
      if (sante.etat === 'libre') {
        const plein = fs.existsSync(dossier) && fs.readdirSync(dossier).length > 0;
        await conclure(e.id, plein ? { code: 0, sortie: `Travail terminé ; son compte rendu s'est perdu pendant un redémarrage. Les résultats sont ici : https://cockpit.raime.fr/livrables/demande-${e.id}/` } : null);
      }
    }
    if (sante.etat !== 'libre' || enCours.length) return;
    // Les ordres ne s'arrêtent plus avec le budget (26/09/2026) : en « arrêt » ou en « réserve »,
    // l'exécutant est prié de ne prendre que des modèles gratuits.
    const gratuit = ['arret', 'reserve'].includes(await regimeActuel());
    const c = (await cerveau.query(`UPDATE commandes SET etat = 'en_cours' WHERE id = (SELECT id FROM commandes
      WHERE etat = 'a_faire' AND pour = 'harness' ORDER BY cree_le LIMIT 1) RETURNING id, texte`)).rows[0];
    if (!c) return;
    const consigne = `Tu es les mains du cerveau rAIme (le cabinet de conseil en IA de Basile Ramé). Tu as Internet, GitHub, git, npm, pnpm, pip, Python 3 et Node 22 : `
      + `cherche, clone, installe, construis, teste et fais tourner ce qu'il faut, dans le dossier courant. Crée le sous-dossier demande-${c.id} et mets-y tout ton travail. `
      + `Une application web se livre construite et prête à ouvrir : demande-${c.id}/app/index.html (fichiers statiques, chemins relatifs) ; elle sera visible à https://cockpit.raime.fr/livrables/demande-${c.id}/app/index.html. `
      + `Le code du cerveau lui-même est en lecture seule dans /cerveau. Pour l'améliorer : copie-le dans demande-${c.id}/cerveau (sans node_modules), puis git init, git add -A, git commit AVANT toute modification ; modifie ; ajoute un test tests/cas_figes_<sujet>.mjs qui prouve le changement ; lance les tests ; puis git diff > ../changement.diff et écris ../changement.md dont la première ligne est un titre court. L'applicateur le met en service seul si tous les cas figés passent (la Constitution, la livraison, le cockpit et les briques restent hors de portée) ; ne livre un changement.diff que pour une amélioration du cerveau. `
      + `EXIGENCE PREMIUM, sur chaque tâche, de A à Z : un travail fini, pas une ébauche. Charte rAIme : fond noir #000, texte blanc, rose #ff7eb0 pour les seuls mots-clés, police Inter, mode jour possible (fond #ededed, rose #db4f8b) ; retenue, espace, trois tailles de titres au plus, aucune fenêtre grise ; français impeccable, sans anglicisme. Avant de rendre, vérifie tout et corrige : le code s'exécute sans erreur (serveur et navigateur), les tests passent, le HTML est valide, l'affichage tient sur ordinateur et sur téléphone (375 px), les contrastes sont lisibles, aucune donnée ni aucun prix inventé. Recommence la vérification tant qu'elle trouve quelque chose. Écris dans ton compte rendu ce que tu as vérifié. `
      + `Tes skills sont dans /home/node/.dsh/skills (dont charte-raime) : sers-t'en. Pour en acquérir un nouveau (sur GitHub, dépôts reconnus), dépose-le en attente dans /travail/skills-candidats/<nom-en-minuscules>/ : SKILL.md (le texte) et SOURCE.md (lien GitHub, licence, étoiles) ; le contrôleur l'examine et l'installe s'il est sûr. Du texte seulement, jamais de script. `
      + `N'écris jamais une clé ou un mot de passe dans un fichier ni dans ta réponse. Ce que tu ne peux pas faire : publier, envoyer à des personnes, payer. `
      + `Ta réponse finale ne contient QUE le compte rendu, en français (aucun raisonnement, rien en anglais) : trois phrases au plus, ce que tu as fait, où est le résultat (avec l'adresse), ce qui reste.\n\nDemande de Basile : ${c.texte}`;
    try {
      const r = await fetch(EXECUTANT + '/tache', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tache: consigne, id: c.id, gratuit }), signal: AbortSignal.timeout(46 * 60_000) });
      if (r.status === 409) { await conclure(c.id, null); return; } // occupé : on attend, on n'abandonne pas
      await conclure(c.id, await r.json());
    } catch (e) { /* fil coupé : la demande reste en cours et se conclura au tour suivant par ①. */ }
  } catch (e) {
  } finally { relaisOccupe = false; }
}
setInterval(() => { relayer().catch(() => {}); }, 30_000);

// L'APPRENTISSAGE AUTOMATIQUE (voulu et autorisé par Basile le 25/09/2026) : quand la file est vide,
// la nuit (1 h-6 h, Paris), une séance par jour au plus, en régime de dépense normal. Le cerveau cherche
// sur GitHub des skills de code reconnus et les dépose EN ATTENTE ; le contrôleur du serveur
// (scripts/installeur_skills.py) les examine (règles + relecture d'un modèle fort) et installe les sûrs.
const APPRENTISSAGE = "Apprentissage (séance automatique de la nuit) : 1) relis tes skills dans /home/node/.dsh/skills ; "
  + "2) cherche sur GitHub des skills ou guides de qualité pour ce que rAIme livre : applications web premium, HTML et CSS accessibles, tests, Node, Python, sécurité, rédaction en français ; "
  + "dépôts reconnus seulement (organisation connue ou beaucoup d'étoiles, licence libre, mis à jour récemment) ; "
  + "3) garde au plus trois des meilleurs, qui t'apportent quelque chose que tu n'as pas, adaptés à la charte rAIme ; "
  + "4) dépose chacun en attente dans /travail/skills-candidats/<nom-en-minuscules>/ : SKILL.md (le texte du skill, en Markdown) et SOURCE.md (lien GitHub, licence, étoiles, date) — du texte seulement ; "
  + "5) écris apprentissage.md : ce que tu as trouvé, ce que tu proposes, pourquoi.";
async function apprendre() {
  try {
    const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
    if (h < 1 || h >= 6 || (await regimeActuel()) !== 'normal') return;
    const { rows } = await cerveau.query(`SELECT
      (SELECT count(*) FROM commandes WHERE etat IN ('a_faire', 'en_cours'))::int AS file,
      (SELECT count(*) FROM commandes WHERE texte LIKE 'Apprentissage (séance%' AND cree_le > now() - interval '20 hours')::int AS recente`);
    if (rows[0].file || rows[0].recente) return;
    await cerveau.query(`INSERT INTO commandes (texte, pour) VALUES ($1, 'harness')`, [APPRENTISSAGE]);
  } catch (e) {}
}
setInterval(() => { apprendre().catch(() => {}); }, 10 * 60_000);


// Les livrables de l'exécutant, en lecture seule : /livrables et /livrables/demande-12/fichier.md
const LIVRABLES = process.env.LIVRABLES_DIR || '/travail';
function livrables(req, res) {
  const rel = decodeURIComponent(req.url.replace(/^\/livrables\/?/, '').split('?')[0]);
  const chemin = path.resolve(LIVRABLES, rel);
  if (chemin !== LIVRABLES && !chemin.startsWith(LIVRABLES + path.sep)) { res.writeHead(403); res.end(); return; }
  let st; try { st = fs.statSync(chemin); } catch (e) { res.writeHead(404); res.end('Introuvable'); return; }
  if (st.isDirectory()) {
    const noms = fs.readdirSync(chemin).sort().reverse();
    const lien = (n) => `<li><a href="/livrables/${encodeURI(path.posix.join(rel, n))}">${n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a></li>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>rAIme — livrables</title><style>body{background:#000;color:#fff;font:15px Inter,-apple-system,"Segoe UI",sans-serif;max-width:720px;margin:48px auto;padding:0 16px}a{color:#ff7eb0}li{margin:8px 0}</style><h1>Livrables de l'exécutant${rel ? ' · ' + rel.replace(/</g, '&lt;') : ''}</h1><ul>${noms.map(lien).join('') || '<li>Rien encore.</li>'}</ul>`);
    return;
  }
  const TYPES = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin).toLowerCase()] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(chemin).pipe(res);
}

async function jarvisDire(message) {
  if (INTENTION_BUDGET.test(message)) return { voie: 'budget', reply: phraseBudget(await budget()) };
  if (INTENTION_ACTION.test(message)) {
    await q("INSERT INTO cortex_chat (role, content) VALUES ('user', $1)", [message]);
    return noterCommande(message, '');
  }
  const b = await budget();
  const extra = (await etatDuCerveau()) + "\nBudget : " + phraseBudget(b);
  const estQuestion = /\?\s*$/.test(message) || /^(qu'est-ce|est-ce que|comment|pourquoi|quel|quelle|combien|où|quand|qui|que |sais-tu|peux-tu me dire)/i.test(message.trim())
    // faire le point, résumer, raconter : c'est Jarvis qui répond, il a l'état du cerveau sous les yeux
    || /(fais(-| )(moi )?le point|point de situation|où (on en est|en est|en sommes)|quoi de neuf|résume|raconte|dis-moi|explique)/i.test(message);
  const reply = await repondreCortex(message, true, extra, estQuestion);
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

// ── LE COFFRE — Basile y range lui-même ses accès (Gmail, Google). Les valeurs ne sont jamais
// renvoyées ni journalisées : la page ne dit que « présent » ou « absent ». Un en-tête maison est
// exigé pour écrire, ce qu'un autre site ne peut pas envoyer (pas de dépôt forcé depuis ailleurs).
const COFFRE = process.env.COFFRE_FICHIER || '/coffre/secrets.env';
const RANGEMENTS = {
  DEEPSEEK_API_KEY: 'Clé DeepSeek (platform.deepseek.com)',
  GEMINI_API_KEY: 'Clé Google AI Studio (Gemini)',
  GMAIL_ADRESSE: 'Ton adresse Gmail',
  GMAIL_MOT_DE_PASSE_APPLI: "Mot de passe d'application Gmail (16 lettres)",
  GROQ_API_KEY: 'Clé Groq',
  META_ACCESS_TOKEN: 'Clé Meta (jeton de l’utilisateur système du portefeuille)',
  AGENDA_LIEN: 'Lien de ta page de réservation Google Agenda',
};
const NOM_LIBRE = /^[A-Z][A-Z0-9_]{2,40}$/; // « autre clé » : un nom en MAJUSCULES, comme MISTRAL_API_KEY
function lireCoffre() {
  try {
    return Object.fromEntries(fs.readFileSync(COFFRE, 'utf8').split('\n').filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  } catch (e) { return {}; }
}
function rangerCoffre(nom, valeur) {
  const c = lireCoffre(); c[nom] = valeur;
  fs.writeFileSync(COFFRE, Object.entries(c).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(COFFRE, 0o600);
}
const PAGE_COFFRE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>rAIme — coffre</title>
<style>body{margin:0;background:#000;color:#fff;font:15px Inter,-apple-system,"Segoe UI",sans-serif;display:grid;place-items:center;min-height:100vh}
main{width:min(520px,92vw)}h1{font-size:22px;font-weight:600;letter-spacing:-.02em}p{color:#aaa;line-height:1.55;font-size:14px}
label{display:block;margin:22px 0 8px;font-size:13px;color:#ccc}select,input{width:100%;box-sizing:border-box;height:48px;padding:0 16px;background:#0a0a0a;border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font:15px inherit}
button{margin-top:22px;height:48px;padding:0 26px;border-radius:999px;border:1px solid #ff7eb0;background:#000;color:#fff;font:15px inherit;cursor:pointer}
ul{list-style:none;padding:0;margin:28px 0 0}li{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px}
li b{font-weight:500;color:#ff7eb0}li b.non{color:#777}#dit{margin-top:14px;color:#ff7eb0;min-height:20px}</style>
<main><h1>Le coffre</h1><p>Tu ranges ici tes accès. Ils restent sur ton serveur. Personne ne peut les relire depuis cette page, pas même Claude : elle dit seulement s'ils sont présents.</p>
<label for="nom">Quoi</label><select id="nom"></select><input id="libre" placeholder="Nom de la clé, par exemple MISTRAL_API_KEY" style="display:none;margin-top:10px">
<label for="val">La valeur</label><input id="val" type="password" autocomplete="off" spellcheck="false">
<button id="ok">Ranger dans le coffre</button><div id="dit" aria-live="polite"></div><ul id="liste"></ul></main>
<script>
var R=${JSON.stringify(RANGEMENTS)};
var sel=document.getElementById('nom'),libre=document.getElementById('libre');Object.keys(R).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=R[k];sel.appendChild(o)});var a=document.createElement('option');a.value='';a.textContent='Autre clé…';sel.appendChild(a);sel.onchange=function(){libre.style.display=sel.value?'none':'block'};
function voir(){fetch('/api/coffre').then(function(r){return r.json()}).then(function(d){var l=document.getElementById('liste');l.innerHTML='';Object.keys(d).forEach(function(k){var x=document.createElement('li');x.textContent=R[k]||k;var b=document.createElement('b');b.textContent=d[k]?'présent':'absent';if(!d[k])b.className='non';x.appendChild(b);l.appendChild(x)})})}
document.getElementById('ok').onclick=function(){var v=document.getElementById('val');if(!v.value.trim())return;
fetch('/api/coffre',{method:'POST',headers:{'Content-Type':'application/json','X-Coffre':'1'},body:JSON.stringify({nom:sel.value||libre.value.trim().toUpperCase(),valeur:v.value.trim()})})
.then(function(r){return r.json()}).then(function(d){document.getElementById('dit').textContent=d.ok?'Rangé.':'Refusé : '+(d.erreur||'');v.value='';voir()})};
voir();
</script></html>`;

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/livrables' || req.url.startsWith('/livrables/'))) return livrables(req, res);
  if (req.url === '/coffre' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(PAGE_COFFRE);
    return;
  }
  if (req.url === '/api/coffre') {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') {
      const c = lireCoffre();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Object.fromEntries([...new Set([...Object.keys(RANGEMENTS), ...Object.keys(c)])].map((k) => [k, !!c[k]]))));
      return;
    }
    if (req.method === 'POST' && req.headers['x-coffre'] === '1') {
      let r = { ok: false, erreur: 'demande illisible' };
      try {
        const { nom, valeur } = JSON.parse((await corpsBrut(req, 4000)).toString('utf8'));
        const v = String(valeur || '').trim();
        if (!RANGEMENTS[nom] && !NOM_LIBRE.test(String(nom))) r.erreur = 'nom invalide (MAJUSCULES, chiffres et _)';
        else if (!v || v.length > 400 || /[\r\n]/.test(v)) r.erreur = 'valeur vide ou trop longue';
        else { rangerCoffre(nom, v); r = { ok: true }; }
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
      return;
    }
    res.writeHead(403); res.end(); return;
  }
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
  // Le résumé du cerveau pour le rapport du matin (workflow n8n « Héraut · Rapport quotidien »,
  // 7 h 30) : des faits, en français clair, groupés par partie. Rien n'est inventé ni reformulé.
  if (req.url === '/api/rapport') {
    const lire = async (sql) => { try { return (await cerveau.query(sql)).rows; } catch (e) { return []; } };
    const court = (x, n) => { const t = String(x || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
    const sections = [];
    const pensee = await lire("SELECT titre, proposition FROM pensees WHERE nuit = (SELECT max(nuit) FROM pensees) AND nuit >= current_date - 1 ORDER BY rang LIMIT 3");
    sections.push({ titre: 'Le cerveau cette nuit : sa pensée', lignes: pensee.length ? pensee.map((p) => `${p.titre} — ${court(p.proposition, 220)}`) : ['Pas de pensée cette nuit.'] });
    const faites = await lire("SELECT id, texte, reponse FROM commandes WHERE etat = 'faite' AND traite_le > now() - interval '24 hours' ORDER BY id");
    sections.push({ titre: 'Tes demandes faites (24 h)', lignes: faites.length ? faites.map((c) => `n°${c.id} — ${court(c.texte, 90)} → ${court(c.reponse, 200)}`) : ['Aucune.'] });
    const mep = await lire("SELECT changement FROM journal WHERE acteur = 'applicateur' AND changement LIKE '%mise en service%' AND created_at > now() - interval '24 hours' ORDER BY created_at");
    sections.push({ titre: 'Améliorations qu’il a mises en service seul (24 h)', lignes: mep.length ? mep.map((j) => court(j.changement, 160)) : ['Aucune.'] });
    const b = await budget();
    // Le forfait Claude n'y figure pas : sa dernière lecture peut dater de la veille (Jarvis l'affiche en direct).
    sections.push({ titre: 'Budget', lignes: [...lignesBudget(b).filter((l) => !l.nom.startsWith('Claude')).map((l) => `${l.nom} : ${l.reste} % restants (${l.valeur})`), ...mesuresBudget(b).filter((m) => !m.startsWith('Claude')).slice(0, 2)] });
    const br = rowsOr(await q("SELECT count(*)::int AS n FROM outreach WHERE status = 'brouillon'"), [{ n: 0 }])[0].n;
    const qs = await lire("SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY bloquant DESC, cree_le DESC LIMIT 3");
    sections.push({ titre: 'Ce qui attend ta décision', lignes: [`${br} brouillons d’e-mails à valider dans le Cockpit.`, ...qs.map((x) => court(x.question, 200))] });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ sections }));
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
    const commandes = await lire("SELECT id, texte, etat, pour FROM commandes WHERE etat IN ('a_faire','en_cours') OR traite_le > now() - interval '24 hours' ORDER BY cree_le DESC LIMIT 4");
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
