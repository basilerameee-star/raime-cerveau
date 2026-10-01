// TIKTOK — la connexion du compte de la marque (Login Kit, OAuth 2.0 web) et la lecture de son état.
//
// Basile ouvre /tiktok/connecter (derrière le mot de passe du Cockpit) : TikTok lui demande d'autoriser l'application
// « rAIme », puis renvoie vers /tiktok/retour avec un code. Le code devient un accès (24 h) et un renouvellement
// (365 jours), rangés au coffre ; ils ne sont jamais renvoyés, affichés ni journalisés. Clés de l'application, déposées
// par Basile au coffre : TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET.
// Doc : developers.tiktok.com/doc/login-kit-web, /doc/oauth-user-access-token-management.
'use strict';

const crypto = require('crypto');
const { lireCoffre, rangerCoffre, lire } = require('./bases.cjs');

const AUTORISER = 'https://www.tiktok.com/v2/auth/authorize/';
const JETON = 'https://open.tiktokapis.com/v2/oauth/token/';
const PROFIL = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count';
const PORTEES = 'user.info.basic,user.info.profile,user.info.stats,video.list,video.upload,video.publish';
const RETOUR = (process.env.COCKPIT_ADRESSE || 'https://cockpit.raime.fr') + '/tiktok/retour';

// Les « state » donnés à TikTok (protection contre la falsification de requête) : à usage unique, 10 minutes.
const etats = new Map();
function nouvelEtat(maintenant = Date.now()) {
  for (const [k, t] of etats) if (maintenant - t > 600_000) etats.delete(k);
  const e = crypto.randomBytes(24).toString('hex'); etats.set(e, maintenant); return e;
}
function etatValide(e, maintenant = Date.now()) {
  const t = etats.get(String(e || '')); etats.delete(String(e || ''));
  return !!t && maintenant - t <= 600_000;
}

function cles(coffre = lireCoffre()) {
  return { client: coffre.TIKTOK_CLIENT_KEY || '', secret: coffre.TIKTOK_CLIENT_SECRET || '' };
}

// L'adresse vers laquelle envoyer Basile ; null tant que les clés de l'application ne sont pas au coffre.
function adresseConnexion({ coffre = lireCoffre(), maintenant } = {}) {
  const { client } = cles(coffre);
  if (!client) return null;
  const q = new URLSearchParams({ client_key: client, scope: PORTEES, response_type: 'code', redirect_uri: RETOUR, state: nouvelEtat(maintenant) });
  return `${AUTORISER}?${q}`;
}

function ranger(d, maintenant = Date.now()) {
  rangerCoffre('TIKTOK_ACCESS_TOKEN', d.access_token);
  if (d.refresh_token) rangerCoffre('TIKTOK_REFRESH_TOKEN', d.refresh_token);
  rangerCoffre('TIKTOK_OPEN_ID', d.open_id || '');
  rangerCoffre('TIKTOK_ACCES_JUSQUA', String(maintenant + (Number(d.expires_in) || 86400) * 1000));
  if (d.refresh_expires_in) rangerCoffre('TIKTOK_RENOUVELLEMENT_JUSQUA', String(maintenant + Number(d.refresh_expires_in) * 1000));
  rangerCoffre('TIKTOK_PORTEES', String(d.scope || ''));
}

async function demanderJeton(corps, { fetch = globalThis.fetch } = {}) {
  const r = await fetch(JETON, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams(corps).toString(), signal: AbortSignal.timeout(20000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(d.error_description || d.error || `TikTok a répondu ${r.status}`);
  return d;
}

// Le retour de TikTok : vérifie l'état, échange le code, range l'accès. Rend un message pour la page.
async function retour({ code, state, error, error_description: description }, { fetch, maintenant = Date.now() } = {}) {
  if (error) return { ok: false, message: `TikTok a refusé la connexion : ${description || error}.` };
  if (!etatValide(state, maintenant)) return { ok: false, message: 'Lien expiré ou déjà utilisé : recommence depuis le Cockpit.' };
  const { client, secret } = cles();
  if (!client || !secret) return { ok: false, message: 'Les clés de l’application TikTok manquent au coffre.' };
  try {
    const d = await demanderJeton({ client_key: client, client_secret: secret, code: String(code || ''), grant_type: 'authorization_code', redirect_uri: RETOUR }, { fetch });
    ranger(d, maintenant);
    await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', 'TikTok connecté au Cockpit', $1)`, [`portées : ${d.scope || '?'}`]);
    return { ok: true, message: 'Le compte TikTok est connecté au cerveau.' };
  } catch (e) { return { ok: false, message: `Échange refusé par TikTok : ${e.message}` }; }
}

// Un accès valide (renouvelé s'il expire dans l'heure) ; null si le compte n'est pas connecté.
async function acces({ fetch, maintenant = Date.now() } = {}) {
  const c = lireCoffre();
  if (!c.TIKTOK_ACCESS_TOKEN) return null;
  if (Number(c.TIKTOK_ACCES_JUSQUA || 0) - maintenant > 3600_000) return c.TIKTOK_ACCESS_TOKEN;
  const { client, secret } = cles(c);
  if (!c.TIKTOK_REFRESH_TOKEN || !client || !secret) return null;
  const d = await demanderJeton({ client_key: client, client_secret: secret, grant_type: 'refresh_token', refresh_token: c.TIKTOK_REFRESH_TOKEN }, { fetch });
  ranger(d, maintenant);
  return d.access_token;
}

// L'état pour l'interface : rien de secret, seulement présent ou absent, les portées et les dates.
async function etat({ fetch, maintenant = Date.now(), profil = true } = {}) {
  const c = lireCoffre();
  const e = { application: !!(c.TIKTOK_CLIENT_KEY && c.TIKTOK_CLIENT_SECRET), connecte: !!c.TIKTOK_ACCESS_TOKEN, redirection: RETOUR,
    portees: (c.TIKTOK_PORTEES || '').split(',').filter(Boolean),
    renouvellement_jusqua: c.TIKTOK_RENOUVELLEMENT_JUSQUA ? new Date(Number(c.TIKTOK_RENOUVELLEMENT_JUSQUA)).toISOString() : null };
  if (e.connecte && profil) {
    try {
      const jeton = await acces({ fetch, maintenant });
      const r = await (fetch || globalThis.fetch)(PROFIL, { headers: { Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      e.profil = d && d.data && d.data.user ? d.data.user : null;
      if (!e.profil) e.erreur = (d.error && d.error.message) || `TikTok a répondu ${r.status}`;
    } catch (err) { e.erreur = err.message; }
  }
  return e;
}

// ── PUBLIER (Content Posting API, publication directe) ─────────────────────────────────────
// Doc : developers.tiktok.com/doc/content-posting-api-reference-direct-post. Tant que TikTok n'a pas audité
// l'application, seule la confidentialité SELF_ONLY (privée) est acceptée.
const API = 'https://open.tiktokapis.com/v2';
const fs = require('fs');
const path = require('path');
const MEDIAS = process.env.TIKTOK_MEDIAS || '/travail/tiktok';

async function appeler(chemin, corps, { fetch = globalThis.fetch, maintenant } = {}) {
  const jeton = await acces({ fetch, maintenant });
  if (!jeton) throw new Error('compte TikTok non connecté');
  const r = await fetch(API + chemin, { method: 'POST', headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(corps || {}), signal: AbortSignal.timeout(30000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.error && d.error.code && d.error.code !== 'ok')) throw new Error((d.error && d.error.message) || `TikTok a répondu ${r.status}`);
  return d.data || {};
}

// Ce que TikTok autorise pour ce créateur (pseudo, avatar, niveaux de confidentialité, interactions permises).
const creatorInfo = (o) => appeler('/post/publish/creator_info/query/', {}, o);

// Les vidéos du compte, avec leurs vues (video.list).
async function videos(o = {}) {
  const d = await appeler('/video/list/?fields=id,title,view_count,like_count,comment_count,create_time,share_url', { max_count: 10 }, o);
  return d.videos || [];
}

// Les vidéos prêtes à publier : les fichiers mp4 du dossier des médias (aucun chemin venu de dehors).
function medias() {
  try { return fs.readdirSync(MEDIAS).filter((f) => /^[\w.-]+\.mp4$/i.test(f)); } catch { return []; }
}

// Publier un fichier : init, envoi en un morceau (moins de 64 Mo), puis l'identifiant à suivre.
async function publier({ fichier, titre, confidentialite, commentaires = false, duo = false, collage = false, marquePropre = false, contenuDeMarque = false }, o = {}) {
  const f = path.join(MEDIAS, path.basename(String(fichier || '')));
  if (!medias().includes(path.basename(String(fichier || '')))) throw new Error('vidéo inconnue');
  const info = await creatorInfo(o);
  if (!(info.privacy_level_options || []).includes(confidentialite)) throw new Error('confidentialité non proposée par TikTok pour ce compte');
  const taille = fs.statSync(f).size;
  if (taille > 64 * 1024 * 1024) throw new Error('vidéo trop lourde pour un envoi en un morceau');
  const init = await appeler('/post/publish/video/init/', {
    post_info: { title: String(titre || '').slice(0, 2200), privacy_level: confidentialite,
      disable_comment: !commentaires || !!info.comment_disabled, disable_duet: !duo || !!info.duet_disabled, disable_stitch: !collage || !!info.stitch_disabled,
      video_cover_timestamp_ms: 1000, brand_content_toggle: !!contenuDeMarque, brand_organic_toggle: !!marquePropre },
    source_info: { source: 'FILE_UPLOAD', video_size: taille, chunk_size: taille, total_chunk_count: 1 },
  }, o);
  const r = await (o.fetch || globalThis.fetch)(init.upload_url, { method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(taille), 'Content-Range': `bytes 0-${taille - 1}/${taille}` },
    body: fs.readFileSync(f), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`envoi du fichier refusé (${r.status})`);
  await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', 'TikTok : vidéo publiée depuis le Cockpit', $1)`, [`${path.basename(f)} · ${confidentialite}`]);
  return { publish_id: init.publish_id };
}

const statut = (publishId, o) => appeler('/post/publish/status/fetch/', { publish_id: String(publishId) }, o);

module.exports = { adresseConnexion, retour, acces, etat, creatorInfo, videos, medias, publier, statut, PORTEES, RETOUR, _etats: etats };
