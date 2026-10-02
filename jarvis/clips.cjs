// LES CLIPS DE KINGKLIP — le clip farming des campagnes Whop, sans Claude et sans frais (02/10/2026).
//
// Partage des rôles :
//   · Basile colle sur /clips le lien de la vidéo source d'une campagne Whop qu'il a rejointe (et ses consignes) ;
//   · le serveur prend la demande (table clips_demandes) : clippeur/file.py la passe au clippeur (image raime-clippeur),
//     qui découpe, sous-titre et recadre ; les clips arrivent dans CLIPS_DIR/<campagne>/ ;
//   · Basile les regarde sur son téléphone, télécharge, copie la légende, publie sur KinGKlip, puis note ici le lien
//     publié (table clips_publies) : c'est ce lien qu'il déclare à Whop, et que les statistiques suivront.
// Règle : uniquement des vidéos de campagnes rejointes (Whop paie ces clips ; le reste n'est pas à nous).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { lire, lireCoffre, rangerCoffre } = require('./bases.cjs');

const DOSSIER = () => process.env.CLIPS_DIR || '/travail/clips';
const PLATEFORMES = ['tiktok', 'instagram', 'youtube'];
const nomCampagne = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function preparer() {
  await lire(`CREATE TABLE IF NOT EXISTS clips_demandes (id serial PRIMARY KEY, url text NOT NULL, campagne text NOT NULL,
    nombre int NOT NULL DEFAULT 20, consignes text, etat text NOT NULL DEFAULT 'a_faire', message text,
    cree_le timestamptz NOT NULL DEFAULT now(), maj timestamptz NOT NULL DEFAULT now())`);
  await lire(`CREATE TABLE IF NOT EXISTS clips_publies (campagne text NOT NULL, clip text NOT NULL, plateforme text NOT NULL,
    lien text NOT NULL, publie_le timestamptz NOT NULL DEFAULT now(), declare_whop boolean NOT NULL DEFAULT false,
    PRIMARY KEY (campagne, clip, plateforme))`);
}

// Une demande de découpe. YouTube bloque l'adresse du serveur : un lien YouTube passe par le PC de Basile.
async function demander({ url, campagne, nombre, consignes, fichier }) {
  await preparer();
  await lire('ALTER TABLE clips_demandes ADD COLUMN IF NOT EXISTS brief_fichier text, ADD COLUMN IF NOT EXISTS brief_nom text');
  // le brief déposé en document (PDF, texte) : le serveur en lira le texte et les liens (file.py), lien de la vidéo compris
  const doc = fichier && fichier.b64 && /\.(pdf|txt|md)$/i.test(fichier.nom || '') ? fichier : null;
  if (doc && doc.b64.length > 15e6) return { ok: false, message: 'Document trop lourd (10 Mo au plus).' };
  url = String(url || '').trim(); campagne = nomCampagne(campagne || (doc && doc.nom.replace(/\.[a-z]+$/i, '')));
  if (!url) {                                        // le lien de la vidéo source est souvent dans le brief : on le prend là
    const liens = String(consignes || '').match(/https?:\/\/[^\s)>\]"']+/g) || [];
    url = liens.find((l) => /youtu\.?be|drive\.google|dropbox|vimeo|twitch|kick\.com|streamable|wetransfer/i.test(l)) || '';
  }
  if (!doc && !/^https?:\/\/\S+$/.test(url)) return { ok: false, message: 'Aucun lien de vidéo trouvé : dépose le brief en document ou colle le lien.' };
  if (!campagne) return { ok: false, message: 'Donne un nom à la campagne.' };
  const n = Math.max(1, Math.min(40, Number(nombre) || 20));
  // le brief entier est gardé (il guide tout le montage) : plus de coupe à 2 000 caractères
  const r = await lire(`INSERT INTO clips_demandes (url, campagne, nombre, consignes, brief_fichier, brief_nom) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [url || 'a-lire-dans-le-brief', campagne, n, String(consignes || '').slice(0, 30000) || null, doc ? doc.b64 : null, doc ? doc.nom : null]);
  return { ok: !!r[0], id: r[0] && r[0].id, message: r[0] ? `Demande n°${r[0].id} en file : ${n} clips pour « ${campagne} ».` : 'Demande non enregistrée.' };
}

// Ce qui est prêt : chaque campagne, ses clips, leur légende, et où ils ont été publiés.
async function liste() {
  await preparer();
  const publies = await lire('SELECT campagne, clip, plateforme, lien, declare_whop FROM clips_publies');
  await preparerBuffer();
  const buf = await lire('SELECT campagne, clip, plateforme, quand, etat, message FROM clips_buffer');
  const campagnes = [];
  let noms = [];
  try { noms = fs.readdirSync(DOSSIER()).filter((n) => n !== 'sources' && fs.existsSync(path.join(DOSSIER(), n, 'clips.json'))); } catch (e) { /* dossier absent */ }
  for (const nom of noms) {
    let info; try { info = JSON.parse(fs.readFileSync(path.join(DOSSIER(), nom, 'clips.json'), 'utf8')); } catch (e) { continue; }
    const st = fs.statSync(path.join(DOSSIER(), nom, 'clips.json'));
    let brief = null; try { brief = JSON.parse(fs.readFileSync(path.join(DOSSIER(), nom, 'brief.json'), 'utf8')); } catch (e) { /* sans brief */ }
    campagnes.push({ campagne: nom, le: st.mtime, source: info.source, brief: brief && { nom: brief.nom, remuneration: brief.remuneration,
      consignes: brief.consignes, regles: brief.regles_humaines, priorite: brief.priorite_plateformes }, clips: (info.clips || []).map((c) => {
      let legende = ''; try { legende = fs.readFileSync(path.join(DOSSIER(), nom, c.clip.replace(/\.mp4$/, '.txt')), 'utf8'); } catch (e) { /* sans légende */ }
      // une légende par plateforme, avec le tag obligatoire de la campagne (clip-01.json), si le brief en impose
      let legendes = null; try { legendes = JSON.parse(fs.readFileSync(path.join(DOSSIER(), nom, c.clip.replace(/\.mp4$/, '.json')), 'utf8')); } catch (e) { /* sans tags */ }
      return { ...c, legende, legendes, duree: Math.round(c.fin - c.debut), fichier: `/clips/f/${encodeURIComponent(nom)}/${encodeURIComponent(c.clip)}`,
        publies: publies.filter((p) => p.campagne === nom && p.clip === c.clip), buffer: buf.filter((b) => b.campagne === nom && b.clip === c.clip) };
    }) });
  }
  campagnes.sort((a, b) => b.le - a.le);
  const demandes = await lire(`SELECT id, url, campagne, nombre, etat, message, cree_le FROM clips_demandes ORDER BY id DESC LIMIT 10`);
  return { campagnes, demandes };
}

// ── PUBLIER SUR INSTAGRAM (KinGKlip) — le bouton de Basile vaut accord, clip par clip.
// Meta va chercher la vidéo lui-même : on lui donne un lien public signé, valable une heure (/pubclip/…, hors mot de passe).
// La clé de signature est créée une fois et rangée au coffre (CLIPS_SIGNATURE) : les liens survivent à un redémarrage.
let SIGNATURE = null;
function cleSignature() {
  if (SIGNATURE) return SIGNATURE;
  let k = (lireCoffre() || {}).CLIPS_SIGNATURE;
  if (!k) { k = crypto.randomBytes(32).toString('hex'); try { rangerCoffre('CLIPS_SIGNATURE', k); } catch (e) { /* banc : coffre absent */ } }
  return (SIGNATURE = Buffer.from(k));
}
const COMPTE_IG = process.env.CLIPS_INSTAGRAM || 'kinggklip';
const GRAPH = 'https://graph.facebook.com/v21.0';
const signer = (exp, campagne, clip) => crypto.createHmac('sha256', cleSignature()).update(`${exp}/${campagne}/${clip}`).digest('hex').slice(0, 32);
function lienPublic(campagne, clip, duree = 3600) {
  const exp = Math.floor(Date.now() / 1000) + duree;
  return `https://cockpit.raime.fr/pubclip/${exp}/${signer(exp, campagne, clip)}/${encodeURIComponent(campagne)}/${clip}`;
}
function lienValide(exp, sig, campagne, clip) {
  if (+exp < Date.now() / 1000) return false;
  const attendu = Buffer.from(signer(exp, campagne, clip)), recu = Buffer.from(String(sig));
  return attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu);
}
async function graph(chemin, cle, corps) {
  const r = await fetch(GRAPH + chemin + (corps ? '' : (chemin.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(cle)),
    corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corps, access_token: cle }) } : {});
  const d = await r.json();
  if (d.error) throw new Error(String(d.error.error_user_msg || d.error.message || 'erreur Meta').split(cle).join('***'));
  return d;
}
async function publierInstagram({ campagne, clip, legende }, attendreMs = 5000, essais = 60) {
  await preparer();
  campagne = nomCampagne(campagne); clip = String(clip || '');
  if (!/^clip-\d{2}\.mp4$/.test(clip) || !fs.existsSync(path.join(DOSSIER(), campagne, clip))) return { ok: false, message: 'Clip introuvable.' };
  const deja = await lire(`SELECT lien FROM clips_publies WHERE campagne = $1 AND clip = $2 AND plateforme = 'instagram'`, [campagne, clip]);
  if (deja[0]) return { ok: false, message: 'Déjà publié sur Instagram : ' + deja[0].lien };
  const cle = lireCoffre().META_SYSTEM_TOKEN;
  if (!cle) return { ok: false, message: 'Clé Meta absente du coffre.' };
  try {
    const pages = await graph('/me/accounts?fields=instagram_business_account{id,username}', cle);
    const ig = (pages.data || []).map((p) => p.instagram_business_account).find((a) => a && a.username === COMPTE_IG);
    if (!ig) return { ok: false, message: `Le compte @${COMPTE_IG} n'est pas visible par cerveau-raime.` };
    const boite = await graph(`/${ig.id}/media`, cle, { media_type: 'REELS', video_url: lienPublic(campagne, clip),
      caption: String(legende || '').slice(0, 2200), share_to_feed: true });
    let etat = '';
    for (let i = 0; i < essais && etat !== 'FINISHED'; i++) {          // Meta télécharge et prépare la vidéo (une à deux minutes)
      await new Promise((ok) => setTimeout(ok, attendreMs));
      etat = (await graph(`/${boite.id}?fields=status_code`, cle)).status_code;
      if (etat === 'ERROR' || etat === 'EXPIRED') return { ok: false, message: 'Meta a refusé la vidéo (' + etat + ').' };
    }
    if (etat !== 'FINISHED') return { ok: false, message: 'Meta prépare encore la vidéo : réessaie dans quelques minutes.' };
    const media = await graph(`/${ig.id}/media_publish`, cle, { creation_id: boite.id });
    const lien = (await graph(`/${media.id}?fields=permalink`, cle)).permalink || `https://www.instagram.com/${COMPTE_IG}/`;
    await noterPublication({ campagne, clip, plateforme: 'instagram', lien });
    return { ok: true, lien, message: 'Publié sur Instagram. Déclare le lien dans la campagne Whop.' };
  } catch (e) { return { ok: false, message: 'Instagram : ' + e.message }; }
}

// ── PROGRAMMER SUR BUFFER — le clic de Basile vaut accord ; clippeur/buffer.py (cron du serveur) fait le reste.
// Créneaux : 18 h 30 à 21 h 30 à New York (22:30, 23:30, 00:30, 01:30 UTC), un clip par créneau et par plateforme.
const CRENEAUX_UTC = [[22, 30], [23, 30], [0, 30], [1, 30]];
const PLATEFORMES_BUFFER = ['youtube', 'tiktok', 'instagram'];
async function preparerBuffer() {
  await lire(`CREATE TABLE IF NOT EXISTS clips_buffer (id serial PRIMARY KEY, campagne text NOT NULL, clip text NOT NULL,
    plateforme text NOT NULL, quand timestamptz NOT NULL, etat text NOT NULL DEFAULT 'a_faire', post_id text, lien text,
    message text, cree_le timestamptz NOT NULL DEFAULT now(), maj timestamptz NOT NULL DEFAULT now(), UNIQUE (campagne, clip, plateforme))`);
  await lire('ALTER TABLE clips_buffer ADD COLUMN IF NOT EXISTS url text');
}
function prochainCreneau(pris, maintenant = Date.now()) {
  for (let j = 0; j < 60; j++) {
    for (const [h, mn] of CRENEAUX_UTC) {
      const d = new Date(maintenant); d.setUTCDate(d.getUTCDate() + j); d.setUTCHours(h, mn, 0, 0);
      if (d.getTime() > maintenant + 20 * 60000 && !pris.has(d.getTime())) return d;
    }
  }
  return null;
}
async function programmerBuffer({ campagne, clip }) {
  await preparer(); await preparerBuffer();
  campagne = nomCampagne(campagne); clip = String(clip || '');
  if (!/^clip-\d{2}\.mp4$/.test(clip) || !fs.existsSync(path.join(DOSSIER(), campagne, clip))) return { ok: false, message: 'Clip introuvable.' };
  const faits = [];
  for (const pl of PLATEFORMES_BUFFER) {
    const deja = await lire('SELECT 1 FROM clips_buffer WHERE campagne = $1 AND clip = $2 AND plateforme = $3', [campagne, clip, pl]);
    if (deja[0]) continue;
    const pris = new Set((await lire(`SELECT quand FROM clips_buffer WHERE plateforme = $1 AND etat <> 'echec'`, [pl])).map((r) => new Date(r.quand).getTime()));
    const quand = prochainCreneau(pris);
    await lire('INSERT INTO clips_buffer (campagne, clip, plateforme, quand, url) VALUES ($1, $2, $3, $4, $5)',
      [campagne, clip, pl, quand.toISOString(), lienPublic(campagne, clip, 7 * 86400)]);
    faits.push(pl + ' ' + quand.toISOString().slice(5, 16).replace('T', ' ') + ' UTC');
  }
  return { ok: true, message: faits.length ? 'Programmé : ' + faits.join(' · ') : 'Déjà programmé partout.' };
}

// Le lien d'un clip publié : à déclarer à Whop, et à suivre pour les vues.
async function noterPublication({ campagne, clip, plateforme, lien }) {
  await preparer();
  if (!PLATEFORMES.includes(plateforme)) return { ok: false, message: 'Plateforme inconnue.' };
  if (!/^https?:\/\/\S+$/.test(String(lien || ''))) return { ok: false, message: 'Colle le lien du clip publié.' };
  await lire(`INSERT INTO clips_publies (campagne, clip, plateforme, lien) VALUES ($1, $2, $3, $4)
    ON CONFLICT (campagne, clip, plateforme) DO UPDATE SET lien = EXCLUDED.lien, publie_le = now()`, [nomCampagne(campagne), String(clip), plateforme, String(lien).trim()]);
  return { ok: true, message: 'Noté. Pense à le déclarer dans la campagne Whop.' };
}
async function declarerWhop({ campagne, clip, plateforme }) {
  await lire('UPDATE clips_publies SET declare_whop = true WHERE campagne = $1 AND clip = $2 AND plateforme = $3', [campagne, clip, plateforme]);
  return { ok: true };
}

// La vidéo, lue par morceaux (Range) : le lecteur du téléphone peut avancer sans tout télécharger.
function servirVideo(req, res, campagne, clip) {
  const racine = path.resolve(DOSSIER());
  const f = path.resolve(racine, campagne, clip);
  if (!f.startsWith(racine + path.sep) || !/\.mp4$/.test(f) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  const taille = fs.statSync(f).size, plage = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const entetes = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    'Content-Disposition': `inline; filename="${clip}"`, 'X-Content-Type-Options': 'nosniff' };
  if (req.method === 'HEAD') { res.writeHead(200, { ...entetes, 'Content-Length': taille }); res.end(); return; }
  if (!plage) { res.writeHead(200, { ...entetes, 'Content-Length': taille }); fs.createReadStream(f).pipe(res); return; }
  const debut = plage[1] ? +plage[1] : 0, fin = plage[2] ? Math.min(+plage[2], taille - 1) : taille - 1;
  if (debut >= taille || debut > fin) { res.writeHead(416, { 'Content-Range': `bytes */${taille}` }); res.end(); return; }
  res.writeHead(206, { ...entetes, 'Content-Range': `bytes ${debut}-${fin}/${taille}`, 'Content-Length': fin - debut + 1 });
  fs.createReadStream(f, { start: debut, end: fin }).pipe(res);
}

async function router(req, res, { url, m, envoyer, json, fichierInterface }) {
  if (m === 'GET' && url === '/clips') { fichierInterface(res, 'clips.html'); return true; }
  let c;
  if ((m === 'GET' || m === 'HEAD') && (c = url.match(/^\/pubclip\/(\d{10})\/([0-9a-f]{32})\/([\w-]{1,80})\/(clip-\d{2}\.mp4)$/))) {
    if (!lienValide(c[1], c[2], c[3], c[4])) { res.writeHead(403); res.end(); return true; }
    servirVideo(req, res, c[3], c[4]); return true;
  }
  if (m === 'POST' && url === '/api/clips/buffer') { envoyer(res, 200, await programmerBuffer(await json(req))); return true; }
  if (m === 'POST' && url === '/api/clips/instagram') { envoyer(res, 200, await publierInstagram(await json(req))); return true; }
  if (m === 'GET' && (c = url.match(/^\/clips\/f\/([\w-]{1,80})\/(clip-\d{2}\.mp4)$/))) { servirVideo(req, res, decodeURIComponent(c[1]), c[2]); return true; }
  if (m === 'GET' && url === '/api/clips') { envoyer(res, 200, await liste()); return true; }
  if (m === 'POST' && url === '/api/clips/demande') { envoyer(res, 200, await demander(await json(req, 2e7))); return true; }
  if (m === 'POST' && url === '/api/clips/publie') { envoyer(res, 200, await noterPublication(await json(req))); return true; }
  if (m === 'POST' && url === '/api/clips/whop') { envoyer(res, 200, await declarerWhop(await json(req))); return true; }
  return false;
}

// Ce que Jarvis sait du clip farming (02/10/2026) : la routine décidée avec Basile, les règles, et l'état du jour.
const ROUTINE = `
Clip farming KinGKlip (routine décidée avec Basile le 02/10/2026) :
- Basile choisit une campagne Whop Content Rewards (grille : prix pour 1 000 vues, approbation ≥ 30 %, validation ≤ 48 h), la rejoint, puis dépose le brief (document PDF ou texte collé) sur cockpit.raime.fr/clips. Le lien de la vidéo est lu dans le brief.
- Le serveur lit tout le brief (il est primordial), télécharge la meilleure qualité (vidéo YouTube : par le PC de Basile, allumé), découpe sans jamais grossir l'image, sous-titres gros (mot prononcé en jaune, reste en blanc), sans bandeau de titre, fin sur une fin de phrase, sans blancs, 18 à 40 s ; puis tout part dans Buffer (TikTok bahethora0, Instagram kinggklip ; YouTube KinGKlip en pause tant que Whop ne relie pas la chaîne), 4 publications par jour et par chaîne.
- Chaque lien publié part à Basile par e-mail (liens bruts, un par ligne) : il le soumet dans « Submit clip » de SA campagne dans les 30 minutes (règle Whop). Un clip ne va que dans sa propre campagne. Aucune vue achetée ni promotion payante.
- Paiement : Whop compte les vues 7 jours après validation, puis 3 jours de blocage ; retrait depuis Earnings.
- À venir (après recharge des crédits Claude) : agent qui soumet seul les liens dans Whop (n°52), agent Analytics (n°53).`;
async function phrase() {
  try {
    await preparer(); await preparerBuffer();
    const d = await lire(`SELECT campagne, etat FROM clips_demandes ORDER BY id DESC LIMIT 3`);
    const b = await lire(`SELECT plateforme, etat, count(*)::int AS n FROM clips_buffer GROUP BY 1, 2 ORDER BY 1, 2`);
    const p = await lire(`SELECT count(*) FILTER (WHERE NOT declare_whop)::int AS a FROM clips_publies`);
    return ROUTINE + `\nÉtat des clips : dernières demandes ${d.map((x) => x.campagne + ' (' + x.etat + ')').join(', ') || 'aucune'} ; Buffer ${b.map((x) => `${x.plateforme} ${x.etat} ${x.n}`).join(', ') || 'vide'} ; liens publiés non déclarés à Whop : ${p[0] ? p[0].a : 0}.`;
  } catch (e) { return ROUTINE; }
}

module.exports = { phrase, router, programmerBuffer, prochainCreneau, publierInstagram, lienPublic, lienValide, demander, liste, noterPublication, declarerWhop, nomCampagne, preparer, PLATEFORMES };
