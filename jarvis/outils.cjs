// LES UTILITAIRES DE JARVIS (26/09/2026, demande de Basile) : météo, heure, minuteries et rappels, mémoire
// longue, agenda. Tout est gratuit et sans compte : la météo vient d'Open-Meteo (sans clé), l'agenda de
// l'adresse iCal secrète de Google Agenda (lecture seule), la mémoire et les rappels de la base du cerveau.
// Ce qui se calcule se calcule par du code : un modèle ne devine ni l'heure, ni la météo, ni une date.
'use strict';

const { lire, lireCoffre } = require('./bases.cjs');

const ZONE = 'Europe/Paris';
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: ZONE, weekday: 'long', day: 'numeric', month: 'long' });

async function preparer() {
  await lire(`CREATE TABLE IF NOT EXISTS rappels (id serial PRIMARY KEY, texte text NOT NULL, echeance timestamptz NOT NULL,
    cree_le timestamptz NOT NULL DEFAULT now(), annonce_le timestamptz)`);
  await lire(`CREATE TABLE IF NOT EXISTS souvenirs (id serial PRIMARY KEY, texte text NOT NULL, source text NOT NULL DEFAULT 'conversation',
    cree_le timestamptz NOT NULL DEFAULT now(), mots tsvector GENERATED ALWAYS AS (to_tsvector('french', texte)) STORED)`);
  await lire('CREATE INDEX IF NOT EXISTS souvenirs_mots ON souvenirs USING gin(mots)');
}

// ── Météo (Open-Meteo, sans clé) ─────────────────────────────────────────────────────────────
const CODES = { 0: 'ciel dégagé', 1: 'plutôt dégagé', 2: 'partiellement nuageux', 3: 'couvert', 45: 'brouillard', 48: 'brouillard givrant',
  51: 'bruine légère', 53: 'bruine', 55: 'bruine forte', 61: 'pluie faible', 63: 'pluie', 65: 'forte pluie', 71: 'neige faible', 73: 'neige',
  75: 'forte neige', 80: 'averses', 81: 'averses', 82: 'fortes averses', 95: 'orage', 96: 'orage et grêle', 99: 'orage et grêle' };
async function meteo(message, { fetch = globalThis.fetch, coffre = lireCoffre() } = {}) {
  const m = String(message).match(/(?:à|a|sur|pour)\s+([A-ZÉÈ][\p{L}' -]{1,40})\s*\??$/u);
  const ville = (m && m[1].trim()) || coffre.METEO_VILLE || 'Paris';
  const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ville)}&count=1&language=fr`,
    { signal: AbortSignal.timeout(8000) })).json();
  const lieu = geo.results && geo.results[0];
  if (!lieu) return `Je ne trouve pas la ville « ${ville} ».`;
  const demain = /demain/i.test(message);
  const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}`
    + '&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + `&timezone=${encodeURIComponent(ZONE)}&forecast_days=2`, { signal: AbortSignal.timeout(8000) })).json();
  const j = demain ? 1 : 0, dl = d.daily;
  const ciel = CODES[dl.weather_code[j]] || 'temps variable', pluie = dl.precipitation_probability_max[j];
  if (demain) return `Demain à ${lieu.name} : ${ciel}, de ${Math.round(dl.temperature_2m_min[1])} à ${Math.round(dl.temperature_2m_max[1])} degrés, ${pluie} % de risque de pluie.`;
  return `À ${lieu.name}, il fait ${Math.round(d.current.temperature_2m)} degrés, ${CODES[d.current.weather_code] || ciel}. `
    + `Aujourd'hui : de ${Math.round(dl.temperature_2m_min[0])} à ${Math.round(dl.temperature_2m_max[0])} degrés, ${pluie} % de risque de pluie.`;
}

// ── Minuteries et rappels ─────────────────────────────────────────────────────────────────────
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50 };
const nombre = (x) => (/^\d+$/.test(x) ? +x : NOMBRES[x.toLowerCase()] || null);
// Rend { echeance, texte } ou null. « minuterie de 5 minutes », « rappelle-moi dans 2 heures d'appeler Claire »,
// « rappelle-moi à 18h30 de… », « rappelle-moi demain à 9h de… ».
function comprendreRappel(message, maintenant = new Date()) {
  const t = String(message).trim();
  if (!/\b(minuteur|minuterie|timer|rappelle[- ]moi|rappel)\b/i.test(t)) return null;
  // Le texte du rappel : ce qui suit « de / d' / pour… », mais jamais la durée elle-même (« minuterie de 5 minutes »).
  const NB = '(?:\\d|un\\b|une\\b|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente|quarante|cinquante)';
  const texte = (t.match(new RegExp(`(?:\\bde\\s+|\\bd'|\\bqu'il faut\\s+|\\bque je dois\\s+|\\bpour\\s+)(?!${NB})(.+)$`, 'i')) || [])[1];
  const duree = t.match(/(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente|quarante|cinquante)\s*(secondes?|minutes?|heures?|min|s|h)\b(?:\s*(\d+))?/i);
  const a = t.match(/(?:^|\s)à\s*(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?/i);
  if (duree && !a) {
    const n = nombre(duree[1]), u = duree[2].toLowerCase();
    if (n) {
      const ms = u.startsWith('s') ? n * 1e3 : u.startsWith('h') ? n * 3600e3 + (duree[3] ? +duree[3] * 60e3 : 0) : n * 60e3;
      return { echeance: new Date(maintenant.getTime() + ms), texte: /minut|timer/i.test(t) && !texte ? `Minuterie de ${duree[1]} ${duree[2]} terminée.` : (texte || 'Rappel.') };
    }
  }
  if (a) {
    // L'heure dite est celle de Paris : on prend le jour à Paris, puis on retire le décalage de Paris ce jour-là.
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(maintenant).map((x) => [x.type, +x.value]));
    const aParis = (jourPlus) => {
      const naif = Date.UTC(p.year, p.month - 1, p.day + jourPlus, +a[1], a[2] ? +a[2] : 0);
      const d = new Date(naif);
      const decalage = Date.parse(d.toLocaleString('en-US', { timeZone: ZONE })) - Date.parse(d.toLocaleString('en-US', { timeZone: 'UTC' }));
      return new Date(naif - decalage);
    };
    let echeance = aParis(/demain/i.test(t) ? 1 : 0);
    if (echeance <= maintenant) echeance = aParis(/demain/i.test(t) ? 2 : 1);
    return { echeance, texte: texte || 'Rappel.' };
  }
  return null;
}
// Une écriture qui échoue (table absente) : les tables sont recréées, puis on réessaie une fois.
async function ecrire(sql, params) {
  let x = (await lire(sql, params))[0];
  if (!x) { await preparer(); x = (await lire(sql, params))[0]; }
  return x ? x.id : null;
}
async function noterRappel(r) {
  return ecrire('INSERT INTO rappels (texte, echeance) VALUES ($1, $2) RETURNING id', [r.texte.slice(0, 300), r.echeance]);
}
// Les rappels arrivés à échéance, annoncés une seule fois (l'écran de Jarvis les dit à voix haute).
async function rappelsEchus() {
  return lire(`UPDATE rappels SET annonce_le = now() WHERE annonce_le IS NULL AND echeance <= now() RETURNING id, texte, echeance`);
}
async function rappelsAVenir() {
  return lire(`SELECT id, texte, echeance FROM rappels WHERE annonce_le IS NULL AND echeance > now() ORDER BY echeance LIMIT 6`);
}

// ── Mémoire longue ────────────────────────────────────────────────────────────────────────────
// « Retiens que… » est rangé tel quel ; les souvenirs utiles à un message sont retrouvés par la recherche
// française de Postgres, plus les cinq plus récents. Jarvis ne s'appuie plus seulement sur ses 12 derniers messages.
function aRetenir(message) {
  const m = String(message).match(/^\s*(?:jarvis[, ]+)?(?:retiens|souviens-toi|n'oublie pas|note)\s+(?:bien\s+)?(?:que|qu'|de|:)?\s*(.{4,})$/i);
  return m ? m[1].trim() : null;
}
async function retenir(texte, source = 'basile') {
  return ecrire('INSERT INTO souvenirs (texte, source) VALUES ($1, $2) RETURNING id', [String(texte).slice(0, 600), source]);
}
async function souvenirsPour(message) {
  const mots = String(message).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((m) => m.length > 3).slice(0, 10);
  const trouves = mots.length ? await lire(`SELECT texte, cree_le FROM souvenirs, websearch_to_tsquery('french', $1) q WHERE mots @@ q
    ORDER BY ts_rank_cd(mots, q) DESC LIMIT 5`, [mots.join(' OR ')]) : [];
  const recents = await lire('SELECT texte, cree_le FROM souvenirs ORDER BY cree_le DESC LIMIT 5');
  const vus = new Set();
  return [...trouves, ...recents].filter((s) => (vus.has(s.texte) ? false : vus.add(s.texte))).slice(0, 8);
}

// La mémoire se nourrit seule : toutes les heures, les nouveaux échanges sont relus et au plus cinq faits
// durables (décisions, préférences, projets de Basile) sont retenus. Le contenu d'un e-mail n'y entre jamais.
async function memoriser({ repondreSansFrais = require('./parole.cjs').repondreSansFrais, lireN8n = require('./bases.cjs').lireN8n } = {}) {
  await lire('CREATE TABLE IF NOT EXISTS memoire_curseur (id int PRIMARY KEY DEFAULT 1, dernier bigint NOT NULL DEFAULT 0)');
  await lire('INSERT INTO memoire_curseur (id, dernier) VALUES (1, 0) ON CONFLICT DO NOTHING');
  const dernier = +((await lire('SELECT dernier FROM memoire_curseur WHERE id = 1'))[0] || { dernier: 0 }).dernier;
  const msgs = await lireN8n('SELECT id, role, content FROM cortex_chat WHERE id > $1 ORDER BY id LIMIT 60', [dernier]);
  if (msgs.length < 6) return 0;
  const r = await repondreSansFrais({ json: true, temperature: 0, maxTokens: 800, coffre: lireCoffre(), messages: [
    { role: 'system', content: "Tu tiens la mémoire longue de Jarvis. Dans cette conversation entre Basile et Jarvis, relève AU PLUS cinq faits durables "
      + "sur Basile : ses décisions, ses préférences, ses projets, ses contacts importants. Rien de passager, rien que Jarvis a dit de lui-même, aucun secret "
      + '(mot de passe, clé). Chaque fait en une phrase courte, en français. Réponds en JSON : {"faits":["…"]}' },
    { role: 'user', content: msgs.map((m) => `${m.role === 'user' ? 'Basile' : 'Jarvis'} : ${String(m.content).slice(0, 500)}`).join('\n') }] });
  let faits = [];
  try { faits = (JSON.parse(r.texte).faits || []).filter((f) => typeof f === 'string' && f.length > 8 && !/mot de passe|password|clé api|api key/i.test(f)).slice(0, 5); } catch (e) {}
  for (const f of faits) await retenir(f, 'conversation');
  if (r.texte) await lire('UPDATE memoire_curseur SET dernier = $1 WHERE id = 1', [msgs[msgs.length - 1].id]);
  return faits.length;
}

// ── Agenda (adresse iCal secrète de Google Agenda : lecture seule) ─────────────────────────────
function lireIcs(ics) {
  const lignes = String(ics).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const evts = []; let e = null;
  const date = (v) => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
    if (!m) return null;
    if (!m[4]) return { d: new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`), journee: true };
    return { d: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`), journee: false };
  };
  for (const l of lignes) {
    if (l === 'BEGIN:VEVENT') e = {};
    else if (l === 'END:VEVENT') { if (e && e.debut) evts.push(e); e = null; }
    else if (e) {
      const i = l.indexOf(':'); if (i < 0) continue;
      const cle = l.slice(0, i).split(';')[0], v = l.slice(i + 1);
      if (cle === 'DTSTART') { const x = date(v); if (x) { e.debut = x.d; e.journee = x.journee; } }
      else if (cle === 'SUMMARY') e.titre = v.replace(/\\,/g, ',').replace(/\\n/g, ' ');
      else if (cle === 'LOCATION') e.lieu = v.replace(/\\,/g, ',');
    }
  }
  return evts;
}
let agendaCache = { t: 0, v: [] };
async function agenda({ fetch = globalThis.fetch, coffre = lireCoffre(), jours = 7, maintenant = new Date() } = {}) {
  const url = coffre.AGENDA_ICAL;
  if (!url || !/^https:\/\//.test(url)) return null;
  if (Date.now() - agendaCache.t < 10 * 60e3) return agendaCache.v;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const fin = maintenant.getTime() + jours * 86400e3;
  const v = lireIcs(await r.text()).filter((e) => e.debut.getTime() >= maintenant.getTime() - 3600e3 && e.debut.getTime() <= fin)
    .sort((a, b) => a.debut - b.debut).slice(0, 15);
  agendaCache = { t: Date.now(), v };
  return v;
}
const phraseAgenda = (evts) => (!evts ? "Ton agenda n'est pas encore relié : range son adresse iCal secrète dans le coffre."
  : !evts.length ? 'Rien à ton agenda ces sept prochains jours.'
    : evts.map((e) => `${jour(e.debut)}${e.journee ? '' : ' à ' + heure(e.debut)} : ${e.titre || '(sans titre)'}${e.lieu ? ', ' + e.lieu : ''}`).join(' ; ') + '.');

// ── Le tri : une demande utilitaire reçoit sa réponse sans modèle ─────────────────────────────
const INTENTION_METEO = /\b(météo|meteo|quel temps|va-t-il pleuvoir|il pleut|température dehors)\b/i;
const INTENTION_HEURE = /^\s*(?:jarvis[, ]+)?(?:quelle heure|il est quelle heure|on est quel jour|quel jour sommes-nous|quelle date)/i;
const INTENTION_AGENDA = /\b(agenda|rendez-vous|mes rdv|planning)\b/i;

async function repondre(message, options = {}) {
  if (INTENTION_HEURE.test(message)) return `Il est ${heure(new Date())}, nous sommes ${jour(new Date())}.`;
  const rappel = comprendreRappel(message);
  if (rappel) {
    const id = await noterRappel(rappel);
    return id ? `C'est noté : ${rappel.texte.replace(/\.$/, '')}, ${jour(rappel.echeance)} à ${heure(rappel.echeance)}. Je te le dirai à l'heure.` : "Je n'ai pas pu noter ce rappel.";
  }
  const souvenir = aRetenir(message);
  if (souvenir) return (await retenir(souvenir)) ? `Retenu : ${souvenir}` : "Je n'ai pas pu le retenir à l'instant.";
  if (INTENTION_METEO.test(message)) { try { return await meteo(message, options); } catch (e) { return 'La météo ne répond pas à l’instant.'; } }
  if (INTENTION_AGENDA.test(message) && /\b(mon|mes|ma|j'ai|ai-je|quoi|qu'est-ce)\b/i.test(message)) {
    try { return phraseAgenda(await agenda(options)); } catch (e) { return "Je n'arrive pas à lire ton agenda à l'instant."; }
  }
  return null;
}

module.exports = { preparer, repondre, memoriser, meteo, comprendreRappel, noterRappel, rappelsEchus, rappelsAVenir, aRetenir, retenir, souvenirsPour,
  agenda, lireIcs, phraseAgenda };
