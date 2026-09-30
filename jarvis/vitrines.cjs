// LES VITRINES DANS LE COCKPIT — la maquette publique d'un commerçant (/demo/<slug>), sa fiche (quand Basile
// clique dessus dans l'interface), la liste par état, et les gestes de Basile (valider le brouillon, écarter,
// noter une vente). L'agent qui les fabrique et les met en file d'envoi : agents/vitrines.js. Rien n'est envoyé d'ici.
'use strict';

const { lire, lireN8n } = require('./bases.cjs');

const ACTIONS = { valider: 'valide', ecarter: 'ecarte', client: 'client', pas_interesse: 'pas_interesse' };

// La maquette, servie à tous (le chemin /demo/ est hors du mot de passe du Cockpit), isolée comme un livrable.
async function servirDemo(slug, res) {
  let r = [];
  if (/^[a-z0-9-]{3,60}$/.test(slug)) r = await lire('SELECT demo_html FROM vitrines WHERE slug = $1 AND demo_html IS NOT NULL', [slug]).catch(() => []);
  if (!r[0]) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Cette page n’existe pas ou plus.'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    'X-Content-Type-Options': 'nosniff' });
  res.end(r[0].demo_html);
}

// La fiche d'un commerce, pour l'interface : tout ce qu'il faut pour décider d'appeler.
function fiche(v, adresse) {
  const jours = v.envoye_le ? Math.floor((Date.now() - new Date(v.envoye_le)) / 86400e3) : null;
  return {
    id: v.id, nom: v.nom, metier: v.metier, ville: v.ville, adresse: v.adresse, telephone: v.telephone,
    email: v.email, email_source: v.email_source, email_message: v.email ? `e-mail trouvé (${v.email_source})` : 'e-mail non trouvé',
    site: { etat: v.site_etat, url: v.site, signaux: v.site_signaux || [] },
    maquette: v.slug ? `${adresse}/demo/${v.slug}` : null, carte: v.carte,
    statut: v.statut, motif: v.motif, envoye_le: v.envoye_le, jours_depuis_envoi: jours, note: v.note,
    brouillon: v.sujet ? { sujet: v.sujet, corps: v.corps } : null, source: v.source === 'google' ? 'Google' : 'OpenStreetMap',
  };
}

async function liste({ statut = null, limite = 50 } = {}, adresse) {
  const rows = await lire(`SELECT * FROM vitrines WHERE nom IS NOT NULL AND ($1::text IS NULL OR statut = $1)
    ORDER BY maj_le DESC LIMIT $2`, [statut, Math.min(200, Number(limite) || 50)]).catch(() => []);
  const compte = await lire('SELECT statut, count(*)::int AS n FROM vitrines GROUP BY statut').catch(() => []);
  return { compteurs: Object.fromEntries(compte.map((c) => [c.statut, c.n])), vitrines: rows.map((v) => fiche(v, adresse)) };
}

async function uneFiche(id, adresse) {
  const r = await lire('SELECT * FROM vitrines WHERE id = $1', [Number(id)]).catch(() => []);
  return r[0] ? fiche(r[0], adresse) : null;
}

// Les gestes de Basile. « valider » met le brouillon dans la file du workflow n8n « Vitrines · Envoi » (agents/vitrines.js,
// synchroniser) : rien ne part d'ici, et le réglage d'envoi (test ou live) reste dans la base n8n.
async function agir(id, { action, note = null } = {}) {
  if (action === 'note') {
    await lire('UPDATE vitrines SET note = $2, maj_le = now() WHERE id = $1', [Number(id), note ? String(note).slice(0, 500) : null]);
    return { ok: true };
  }
  const etat = ACTIONS[action];
  if (!etat) return { ok: false, erreur: `action attendue : ${[...Object.keys(ACTIONS), 'note'].join(', ')}` };
  const r = await lire(`UPDATE vitrines SET statut = $2, note = coalesce($3, note), maj_le = now()
    WHERE id = $1 AND ($2 <> 'valide' OR statut = 'brouillon') RETURNING id`, [Number(id), etat, note ? String(note).slice(0, 500) : null]);
  if (!r.length) return { ok: false, erreur: action === 'valider' ? 'seul un brouillon se valide' : 'commerce introuvable' };
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`, [`Vitrine n°${id} : ${etat}`, note ? String(note).slice(0, 200) : null]);
  return { ok: true };
}

// L'ENVOI (workflow n8n « Vitrines · Envoi », file vitrines_envoi) : le réglage, les chiffres, et le mode que choisit Basile.
// pause : rien ne part ; test : tout part vers son adresse de test ; live : vers les commerçants, au plafond du jour.
const MODES = ['pause', 'test', 'live'];
async function envoi() {
  const [c] = await lireN8n('SELECT mode, plafond_jour FROM vitrines_envoi_config WHERE id = 1');
  if (!c) return { mode: 'absent' };
  const [n] = await lireN8n(`SELECT count(*) FILTER (WHERE statut = 'a_envoyer')::int AS en_file,
    count(*) FILTER (WHERE statut = 'envoye' AND envoye_le >= date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')::int AS envoyes_aujourdhui,
    count(*) FILTER (WHERE statut = 'envoye')::int AS envoyes, count(*) FILTER (WHERE statut = 'teste')::int AS essais,
    count(*) FILTER (WHERE statut = 'erreur')::int AS refuses FROM vitrines_envoi WHERE id > 0`);
  return { mode: c.mode, plafond_jour: c.plafond_jour, ...(n || { en_file: 0, envoyes_aujourdhui: 0, envoyes: 0, essais: 0, refuses: 0 }) };
}
async function changerMode(mode) {
  if (!MODES.includes(mode)) return { ok: false, erreur: `mode attendu : ${MODES.join(', ')}` };
  const r = await lireN8n('UPDATE vitrines_envoi_config SET mode = $1 WHERE id = 1 RETURNING mode', [mode]);
  if (!r.length) return { ok: false, erreur: 'réglage d’envoi absent' };
  // En passant en réel, ce qui n'a été qu'essayé (et lu par Basile) part pour de bon, au plafond du jour.
  if (mode === 'live') await lireN8n("UPDATE vitrines_envoi SET statut = 'a_envoyer', maj_le = now() WHERE statut = 'teste' AND id > 0");
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`, [`Envoi des vitrines : mode ${mode}`, 'choisi dans le Cockpit']);
  return { ok: true, ...(await envoi()) };
}
// Pour Jarvis, à l'oral.
async function phraseEnvoi() {
  const e = await envoi().catch(() => ({ mode: 'absent' }));
  if (e.mode === 'absent') return '';
  const mode = { pause: 'en pause', test: 'en essai (tout part vers la boîte de Basile)', live: 'en réel' }[e.mode];
  return `
Vitrines, envoi ${mode} : ${e.en_file} en file, ${e.envoyes_aujourdhui} parti(s) aujourd'hui (${e.plafond_jour} par jour au plus), `
    + `${e.envoyes} en tout, ${e.essais} essai(s)${e.refuses ? `, ${e.refuses} refusé(s)` : ''}.`;
}

module.exports = { servirDemo, fiche, liste, uneFiche, agir, envoi, changerMode, phraseEnvoi, MODES };
