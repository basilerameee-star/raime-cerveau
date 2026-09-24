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

// LE SAVOIR VIVANT — quand la bibliothèque ne suffit pas, Cortex interroge Wikipédia en
// français, en direct, et note le titre : l'encyclopédiste rangera l'article entier dans
// l'heure. La bibliothèque grandit ainsi d'abord de ce que Basile demande vraiment.
const WIKI = 'https://fr.wikipedia.org/w/api.php';
const WIKI_UA = { 'User-Agent': 'rAIme-cortex/1.0 (https://raime.fr; contact@raime.fr)' };

async function wiki(params) {
  const c = new AbortController();
  const minuteur = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(`${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`,
      { headers: WIKI_UA, signal: c.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; } finally { clearTimeout(minuteur); }
}

async function savoirVivant(question, dejaVus) {
  const mots = String(question).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter((m) => m.length > 3).slice(0, 8);
  if (!mots.length) return [];
  const s = await wiki({ action: 'query', list: 'search', srsearch: mots.join(' '), srlimit: '3', srnamespace: '0' });
  const titres = (s?.query?.search || []).map((x) => x.title).filter((t) => !dejaVus.has(t));
  if (!titres.length) return [];
  const d = await wiki({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1',
    exlimit: String(titres.length), redirects: '1', titles: titres.join('|') });
  const pages = (d?.query?.pages || []).filter((p) => p.extract && p.extract.length > 200);
  for (const p of pages) {
    try {
      await cerveau.query(`INSERT INTO savoir_demandes(titre, question) VALUES($1,$2) ON CONFLICT DO NOTHING`,
        [p.title, String(question).slice(0, 300)]);
    } catch (e) { /* la note ne doit jamais bloquer la réponse */ }
  }
  return pages.map((p) => ({ titre: p.title, domaine: 'Wikipédia, en direct', extrait: p.extract.slice(0, 1200) }));
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
  + "Le cerveau : une boucle permanente d'agents sur le serveur — l'architecte (l'agent réflexif, qui tient les buts et se corrige), le réflexif, le veilleur (forums, dépôts de code, publications), le chasseur et le sas (le meilleur modèle au meilleur prix), le bibliothécaire et l'encyclopédiste (la bibliothèque de savoir : finance, droit, santé, sciences, physique quantique, philosophie, métaphysique, spiritualité, ésotérisme, religions, histoire, informatique, marketing, management…), et les agents de surveillance. La prospection par e-mail est en pause. "
  + "SAVOIR : pour toute question de connaissance, appuie-toi d'abord sur les PASSAGES DE LA BIBLIOTHÈQUE fournis et cite-les entre crochets [Titre]. Complète avec tes connaissances générales en le signalant (« au-delà de la bibliothèque… »). Tous les sujets sont bienvenus, y compris spiritualité, ésotérisme et métaphysique : expose les traditions et les idées fidèlement, et distingue ce qui relève du savoir établi, de la tradition ou de la croyance. "
  + "Réponds en français, direct, concret, chaleureux et HONNÊTE : si tu ne sais pas, ou si quelque chose n'est pas encore en place, dis-le clairement. Tu conseilles, fais le point, expliques, aides à décider. Tu n'exécutes pas d'actions toi-même. Les « Tâches en cours » sont À FAIRE, pas faites. N'invente aucun chiffre sur l'entreprise : ne t'appuie que sur ceux fournis.";

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
      await q("INSERT INTO cortex_chat (role, content) VALUES ('user', $1)", [message]);
      const ctx = await buildContext();
      const passages = await bibliotheque(message);
      // D'abord la bibliothèque, puis le monde : moins de trois passages, on va chercher.
      if (passages.length < 3) {
        passages.push(...await savoirVivant(message, new Set(passages.map((p) => p.titre))));
      }
      const enAttente = await questionsOuvertes();
      const savoir = passages.length
        ? "\n\nPASSAGES DE LA BIBLIOTHÈQUE ET DE WIKIPÉDIA EN DIRECT (à citer entre crochets) :\n" + passages.map((p) =>
            `[${p.titre}] (${p.domaine}) ${String(p.extrait).replace(/\s+/g, ' ')}`).join('\n\n')
        : "\n\nPASSAGES DE LA BIBLIOTHÈQUE : aucun passage pertinent — réponds avec tes connaissances générales et dis-le.";
      const questions = enAttente ? "\n\nQUESTIONS QUE L'ARCHITECTE ATTEND DE BASILE :\n" + enAttente : '';
      const hist = rowsOr(await q("SELECT role, content FROM cortex_chat ORDER BY id DESC LIMIT 12"), []).reverse();
      const messages = [{ role: 'system', content: CORTEX_SYS + "\n\nÉTAT LIVE DU SYSTÈME (maintenant) :\n" + ctx + savoir + questions }]
        .concat(hist.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })));
      let reply = '';
      try {
        const r = await fetch('http://n8n:5678/webhook/cortex-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) });
        const d = await r.json();
        reply = (d && d.reply) || '';
      } catch (e) {}
      if (!reply) reply = "(Cortex est indisponible à l'instant — réessaie dans un moment.)";
      await q("INSERT INTO cortex_chat (role, content) VALUES ('assistant', $1)", [reply]);
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
  if (req.url === '/healthz') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(8090, () => console.log('cockpit live on :8090'));
