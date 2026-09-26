// LE COCKPIT JARVIS — reconstruit à neuf le 26/09/2026, à la demande de Basile : « supprime le cockpit,
// crée-en un autre entièrement nouveau… comme Jarvis dans Iron Man… oral, texte, dictée… tout effectif ».
// Aucun appel payant, aucun OpenRouter. Le code tourne depuis le dépôt livré sur le serveur et se recharge
// seul à chaque livraison (demarrer.cjs) : ce qui est fusionné sur GitHub est en service dans la minute.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { lire, lireN8n, preparer, lireCoffre, rangerCoffre } = require('./bases.cjs');
const esprit = require('./esprit.cjs');
const relais = require('./relais.cjs');

const ICI = __dirname;
const INTERFACE = path.join(ICI, 'interface');
const VOIX = process.env.VOIX_URL || 'http://voix:9000';
const EXECUTANT = process.env.EXECUTANT_URL || 'http://harness:8201';
const PORT = parseInt(process.env.PORT || '8090', 10);

// La version en service : l'empreinte du code de Jarvis (le Cockpit la montre, l'installateur la vérifie).
function version() {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(ICI).filter((f) => /\.(cjs|json)$/.test(f)).sort()) h.update(fs.readFileSync(path.join(ICI, f)));
  return h.digest('hex').slice(0, 12);
}
const VERSION = version();

function corps(req, max) {
  return new Promise((ok, ko) => {
    const morceaux = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { req.destroy(); ko(new Error('trop long')); } else morceaux.push(c); });
    req.on('end', () => ok(Buffer.concat(morceaux)));
    req.on('error', ko);
  });
}
async function json(req, max = 1e5) { try { return JSON.parse((await corps(req, max)).toString('utf8')); } catch (e) { return {}; } }
function envoyer(res, code, donnees) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(donnees));
}
// Écrire exige un en-tête maison, qu'un autre site ne peut pas envoyer (pas de requête forcée depuis ailleurs).
const autorise = (req) => req.headers['x-jarvis'] === '1';

const TYPES = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.pdf': 'application/pdf', '.md': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };

function fichierInterface(res, nom) {
  const chemin = path.join(INTERFACE, nom);
  if (!chemin.startsWith(INTERFACE + path.sep) || !fs.existsSync(chemin)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  fs.createReadStream(chemin).pipe(res);
}

// Les livrables d'Hermes, en lecture seule : /livrables et /livrables/demande-12/app/index.html
function livrables(req, res) {
  const racine = path.resolve(relais.LIVRABLES);
  let rel; try { rel = decodeURIComponent(req.url.replace(/^\/livrables\/?/, '').split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; }
  const chemin = path.resolve(racine, rel);
  if (chemin !== racine && !chemin.startsWith(racine + path.sep)) { res.writeHead(403); res.end(); return; }
  let st; try { st = fs.statSync(chemin); } catch (e) { res.writeHead(404); res.end('Introuvable'); return; }
  if (st.isDirectory()) {
    if (fs.existsSync(path.join(chemin, 'index.html')) && req.url.endsWith('/')) { req.url += 'index.html'; return livrables(req, res); }
    const echap = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const noms = fs.readdirSync(chemin).filter((n) => !n.startsWith('.')).sort().reverse();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Livrables</title>`
      + `<style>body{background:#02060b;color:#d8f6ff;font:15px Inter,system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 16px}a{color:#5ee7ff;text-decoration:none}li{margin:10px 0}h1{font-weight:500;letter-spacing:.04em}</style>`
      + `<h1>Livrables${rel ? ' · ' + echap(rel) : ''}</h1><p><a href="/">← Jarvis</a></p><ul>`
      + (noms.map((n) => `<li><a href="/livrables/${encodeURI(path.posix.join(rel, n))}${fs.statSync(path.join(chemin, n)).isDirectory() ? '/' : ''}">${echap(n)}</a></li>`).join('') || '<li>Rien encore.</li>') + '</ul>');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin).toLowerCase()] || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(chemin).pipe(res);
}

// ── Le tableau de bord : tout ce que Jarvis affiche autour de lui, en une lecture ───────────────
const NOMS = { bibliothecaire: 'Bibliothèque', veilleur: 'Veille', portes: "Portes d'entrée", sas: 'Sas des modèles', chasseur: 'Chasseur de modèles',
  architecte: 'Architecte', superviseur: 'Surveillance', porte: 'Livraison', essayeur: 'Essayeur', gardien: 'Gardien', reflexif: 'Réflexif',
  penseur: 'Penseur', publiciste: 'Publicité', reconciliateur: 'Réponses', curieux: 'Curieux', econome: 'Économe', metrologue: 'Mesure des prix',
  prospective: 'Prospective', applicateur: 'Mise en service', executant: 'Hermes', heraut: 'Héraut' };
async function etat() {
  const [ordres, journal, pensee, questions, agents, biblio, veille, prospection, revenus, mains, encaisse] = await Promise.all([
    lire(`SELECT id, texte, etat, pour, round(extract(epoch FROM now() - cree_le) / 60)::int AS minutes, left(coalesce(reponse, ''), 600) AS reponse
      FROM commandes WHERE etat IN ('a_faire','en_cours') OR traite_le > now() - interval '72 hours' ORDER BY cree_le DESC LIMIT 12`),
    lire("SELECT acteur, left(changement, 200) AS changement, created_at FROM journal WHERE created_at > now() - interval '48 hours' ORDER BY created_at DESC LIMIT 12"),
    lire("SELECT titre, proposition FROM pensees WHERE nuit = (SELECT max(nuit) FROM pensees) ORDER BY rang LIMIT 3"),
    lire("SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY bloquant DESC, cree_le DESC LIMIT 4"),
    lire("SELECT count(DISTINCT agent)::int AS n FROM boucle_passages WHERE fin_le > now() - interval '24 hours' AND statut = 'ok'"),
    lire("SELECT count(*)::int AS n FROM kb_chunks"),
    lire("SELECT count(*)::int AS n FROM veille WHERE vu_le > now() - interval '24 hours'"),
    lireN8n("SELECT count(*) FILTER (WHERE status = 'brouillon')::int AS brouillons, count(*) FILTER (WHERE sent_at > now() - interval '7 days')::int AS envoyes FROM outreach"),
    esprit.revenusDuMois(),
    fetch(EXECUTANT + '/sante', { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => null),
    lire("SELECT le, montant_eur::float AS montant, source FROM revenus ORDER BY le DESC LIMIT 5"),
  ]);
  const coffre = lireCoffre();
  return {
    version: VERSION,
    ordres: ordres.map((o) => ({ ...o, bloque: o.etat === 'a_faire' && o.pour === 'claude',
      lien: fs.existsSync(path.join(relais.LIVRABLES, `demande-${o.id}`)) ? `/livrables/demande-${o.id}/` : null })),
    journal: journal.map((j) => ({ qui: NOMS[j.acteur] || j.acteur, quoi: j.changement,
      heure: new Date(j.created_at).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }) })),
    pensee, questions: questions.map((x) => x.question),
    compteurs: { agents: agents[0] ? agents[0].n : 0, bibliotheque: biblio[0] ? biblio[0].n : 0, veille: veille[0] ? veille[0].n : 0,
      brouillons: prospection[0] ? prospection[0].brouillons : 0, envoyes: prospection[0] ? prospection[0].envoyes : 0 },
    objectif: { ...revenus, derniers: encaisse },
    mains: mains ? { etat: mains.etat || 'inconnu' } : { etat: 'injoignable' },
    parole: coffre.GEMINI_API_KEY ? 'Gemini gratuit, puis modèle local' : 'modèle local du serveur (ajoute une clé Gemini gratuite au coffre pour plus de vivacité)',
  };
}

// Le résumé du rapport du matin (workflow n8n « Héraut », 7 h 30) : des faits, groupés par partie.
async function rapport() {
  const court = (x, n) => { const t = String(x || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const pensee = await lire("SELECT titre, proposition FROM pensees WHERE nuit = (SELECT max(nuit) FROM pensees) AND nuit >= current_date - 1 ORDER BY rang LIMIT 3");
  const faites = await lire("SELECT id, texte, reponse FROM commandes WHERE etat = 'faite' AND traite_le > now() - interval '24 hours' ORDER BY id");
  const mep = await lire("SELECT changement FROM journal WHERE acteur = 'applicateur' AND changement LIKE '%mise en service%' AND created_at > now() - interval '24 hours' ORDER BY created_at");
  const rev = await esprit.revenusDuMois();
  const br = (await lireN8n("SELECT count(*)::int AS n FROM outreach WHERE status = 'brouillon'"))[0];
  const qs = await lire("SELECT question FROM demandes WHERE etat = 'ouverte' ORDER BY bloquant DESC, cree_le DESC LIMIT 3");
  return { sections: [
    { titre: 'Le cerveau cette nuit : sa pensée', lignes: pensee.length ? pensee.map((p) => `${p.titre} — ${court(p.proposition, 220)}`) : ['Pas de pensée cette nuit.'] },
    { titre: 'Tes ordres faits (24 h)', lignes: faites.length ? faites.map((c) => `n°${c.id} — ${court(c.texte, 90)} → ${court(c.reponse, 200)}`) : ['Aucun.'] },
    { titre: 'Améliorations mises en service seul (24 h)', lignes: mep.length ? mep.map((j) => court(j.changement, 160)) : ['Aucune.'] },
    { titre: 'Objectif du mois', lignes: [`${rev.mois} € encaissés sur ${rev.objectif} €.`] },
    { titre: 'Ce qui attend ta décision', lignes: [`${br ? br.n : 0} brouillons d’e-mails à valider dans le Cockpit.`, ...qs.map((x) => court(x.question, 200))] },
  ] };
}

// ── Le coffre ───────────────────────────────────────────────────────────────────────────────
const RANGEMENTS = {
  GEMINI_API_KEY: 'Clé Google AI Studio (Gemini, gratuite)', GROQ_API_KEY: 'Clé Groq (gratuite)', MISTRAL_API_KEY: 'Clé Mistral',
  CEREBRAS_API_KEY: 'Clé Cerebras (gratuite)', GMAIL_ADRESSE: 'Ton adresse Gmail', GMAIL_MOT_DE_PASSE_APPLI: "Mot de passe d'application Gmail",
  META_ACCESS_TOKEN: 'Clé Meta', AGENDA_LIEN: 'Lien de ta page de réservation',
};
const NOM_LIBRE = /^[A-Z][A-Z0-9_]{2,40}$/;

// ── Les routes ──────────────────────────────────────────────────────────────────────────────
async function router(req, res) {
  const url = req.url.split('?')[0];
  const m = req.method;
  if (url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok ' + VERSION); return; }
  if (m === 'GET' && (url === '/' || url === '/jarvis' || url === '/index.html')) return fichierInterface(res, 'index.html');
  if (m === 'GET' && /^\/(visage\.js|coffre\.html|manifest\.webmanifest|icone\.svg)$/.test(url)) return fichierInterface(res, url.slice(1));
  if (m === 'GET' && url === '/coffre') return fichierInterface(res, 'coffre.html');
  if (m === 'GET' && (url === '/livrables' || url.startsWith('/livrables/'))) return livrables(req, res);

  // Parler à Jarvis (texte, dictée ou conversation orale : même chemin).
  if (m === 'POST' && (url === '/api/dire' || url === '/api/jarvis/dire' || url === '/api/chat')) {
    const d = await json(req);
    const message = String(d.message || '').slice(0, 4000).trim();
    if (!message) return envoyer(res, 200, { voie: 'vide', reply: '' });
    const r = await esprit.dire(message, { oral: url === '/api/chat' ? false : d.oral !== false });
    return envoyer(res, 200, r);
  }
  if (m === 'GET' && url === '/api/conversation') {
    return envoyer(res, 200, { messages: (await lireN8n("SELECT role, content FROM cortex_chat ORDER BY id DESC LIMIT 40")).reverse() });
  }
  if (m === 'GET' && url === '/api/etat') return envoyer(res, 200, await etat());
  if (m === 'GET' && url === '/api/rapport') return envoyer(res, 200, await rapport());

  let r;
  if (m === 'POST' && (r = url.match(/^\/api\/ordres\/(\d+)\/relancer$/))) {
    if (!autorise(req)) return envoyer(res, 403, { ok: false });
    return envoyer(res, 200, { ok: await relais.relancer(+r[1]) });
  }
  if (m === 'POST' && url === '/api/revenus') {
    if (!autorise(req)) return envoyer(res, 403, { ok: false });
    const d = await json(req, 4000);
    const montant = Math.round(Number(String(d.montant).replace(',', '.')) * 100) / 100;
    const source = String(d.source || '').trim().slice(0, 120);
    if (!(montant > 0 && montant < 1e6) || !source) return envoyer(res, 200, { ok: false, erreur: 'montant ou source manquant' });
    await lire('INSERT INTO revenus (montant_eur, source, note) VALUES ($1, $2, $3)', [montant, source, String(d.note || '').slice(0, 300) || null]);
    return envoyer(res, 200, { ok: true });
  }

  // La prospection : Basile valide ou refuse chaque brouillon (rien ne part sans lui).
  if (m === 'GET' && url === '/api/prospection') {
    return envoyer(res, 200, { brouillons: await lireN8n("SELECT id, prospect_name, segment, to_email, subject, body FROM outreach WHERE status = 'brouillon' ORDER BY created_at DESC LIMIT 30") });
  }
  if (m === 'POST' && (r = url.match(/^\/api\/prospection\/(\d+)$/))) {
    if (!autorise(req)) return envoyer(res, 403, { ok: false });
    const { action } = await json(req, 2000);
    if (action !== 'valide' && action !== 'refuse') return envoyer(res, 200, { ok: false });
    await lireN8n("UPDATE outreach SET status = $1, validated_at = CASE WHEN $1 = 'valide' THEN now() ELSE validated_at END WHERE id = $2 AND status = 'brouillon'", [action, +r[1]]);
    return envoyer(res, 200, { ok: true });
  }

  // La voix du serveur : la parole de Basile en texte, et le texte en voix française (rien ne sort du serveur).
  if (m === 'POST' && (url === '/api/voix/transcrire' || url === '/api/jarvis/voix')) {
    try {
      const audio = await corps(req, 12 * 1024 * 1024);
      const v = await fetch(VOIX + '/transcrire', { method: 'POST', body: audio, signal: AbortSignal.timeout(60000) });
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(await v.text());
    } catch (e) { envoyer(res, 502, { erreur: 'la voix du serveur ne répond pas' }); }
    return;
  }
  if (m === 'POST' && (url === '/api/voix/parler' || url === '/api/jarvis/parler')) {
    try {
      const texte = await corps(req, 20000);
      const v = await fetch(VOIX + '/parler', { method: 'POST', body: texte, signal: AbortSignal.timeout(30000) });
      if (!v.ok) throw new Error('voix');
      const wav = Buffer.from(await v.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' }); res.end(wav);
    } catch (e) { res.writeHead(502); res.end(); }
    return;
  }

  // Le coffre : la page ne dit que « présent » ou « absent ».
  if (url === '/api/coffre') {
    if (m === 'GET') {
      const c = lireCoffre();
      return envoyer(res, 200, { libelles: RANGEMENTS, presents: Object.fromEntries([...new Set([...Object.keys(RANGEMENTS), ...Object.keys(c)])].map((k) => [k, !!c[k]])) });
    }
    if (m === 'POST' && (autorise(req) || req.headers['x-coffre'] === '1')) {
      const { nom, valeur } = await json(req, 4000);
      const v = String(valeur || '').trim();
      if (!RANGEMENTS[nom] && !NOM_LIBRE.test(String(nom))) return envoyer(res, 200, { ok: false, erreur: 'nom invalide (MAJUSCULES, chiffres et _)' });
      if (!v || v.length > 400 || /[\r\n]/.test(v)) return envoyer(res, 200, { ok: false, erreur: 'valeur vide ou trop longue' });
      try { rangerCoffre(nom, v); } catch (e) { return envoyer(res, 200, { ok: false, erreur: 'coffre non accessible' }); }
      return envoyer(res, 200, { ok: true });
    }
    res.writeHead(403); res.end(); return;
  }

  // Préparer des fiches d'audit (Léonard, n8n) sur des prospects choisis.
  if (m === 'POST' && url === '/api/prepare-audit') {
    const { sirens = [] } = await json(req);
    let n = 0;
    for (const s of [].concat(sirens).slice(0, 10)) {
      const p = (await lireN8n('SELECT name, segment, effectif_label FROM prospects WHERE siren = $1', [String(s)]))[0];
      if (!p) continue;
      try {
        await fetch('http://n8n:5678/webhook/audit-prep', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entreprise: p.name, secteur: p.segment, taille: p.effectif_label || '' }), signal: AbortSignal.timeout(10000) });
        n++;
      } catch (e) {}
    }
    return envoyer(res, 200, { triggered: n });
  }

  // Désinscription PUBLIQUE (opt-out RGPD), hors mot de passe.
  if (m === 'GET' && url.startsWith('/unsub')) {
    let email = '';
    try { email = (new URL(req.url, 'http://x').searchParams.get('e') || '').trim().toLowerCase(); } catch (e) {}
    if (email) {
      await lireN8n("INSERT INTO suppression (email, reason) VALUES ($1,'opt-out') ON CONFLICT (email) DO NOTHING", [email]);
      await lireN8n("UPDATE outreach SET status='refuse' WHERE lower(to_email)=$1 AND status IN ('brouillon','valide')", [email]);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>C\'est fait.</h2><p>Vous ne recevrez plus d\'e-mails de rAIme.</p></div></body>');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Introuvable');
}

const serveur = http.createServer((req, res) => {
  router(req, res).catch((e) => { console.error('[jarvis]', e.message); if (!res.headersSent) envoyer(res, 500, { erreur: 'erreur interne' }); else res.end(); });
});

if (require.main === module) {
  preparer().finally(() => {
    serveur.listen(PORT, () => console.log(`[jarvis] en service sur :${PORT}, version ${VERSION}`));
    if (process.env.RELAIS !== '0') relais.demarrer();
  });
}

module.exports = { serveur, etat, rapport, version };
