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
const { lire } = require('./bases.cjs');

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
async function demander({ url, campagne, nombre, consignes }) {
  await preparer();
  url = String(url || '').trim(); campagne = nomCampagne(campagne);
  if (!/^https?:\/\/\S+$/.test(url)) return { ok: false, message: 'Colle le lien de la vidéo source (https://…).' };
  if (!campagne) return { ok: false, message: 'Donne un nom à la campagne.' };
  const n = Math.max(1, Math.min(40, Number(nombre) || 20));
  const r = await lire(`INSERT INTO clips_demandes (url, campagne, nombre, consignes) VALUES ($1, $2, $3, $4) RETURNING id`,
    [url, campagne, n, String(consignes || '').slice(0, 2000) || null]);
  return { ok: !!r[0], id: r[0] && r[0].id, message: r[0] ? `Demande n°${r[0].id} en file : ${n} clips pour « ${campagne} ».` : 'Demande non enregistrée.' };
}

// Ce qui est prêt : chaque campagne, ses clips, leur légende, et où ils ont été publiés.
async function liste() {
  await preparer();
  const publies = await lire('SELECT campagne, clip, plateforme, lien, declare_whop FROM clips_publies');
  const campagnes = [];
  let noms = [];
  try { noms = fs.readdirSync(DOSSIER()).filter((n) => n !== 'sources' && fs.existsSync(path.join(DOSSIER(), n, 'clips.json'))); } catch (e) { /* dossier absent */ }
  for (const nom of noms) {
    let info; try { info = JSON.parse(fs.readFileSync(path.join(DOSSIER(), nom, 'clips.json'), 'utf8')); } catch (e) { continue; }
    const st = fs.statSync(path.join(DOSSIER(), nom, 'clips.json'));
    campagnes.push({ campagne: nom, le: st.mtime, source: info.source, clips: (info.clips || []).map((c) => {
      let legende = ''; try { legende = fs.readFileSync(path.join(DOSSIER(), nom, c.clip.replace(/\.mp4$/, '.txt')), 'utf8'); } catch (e) { /* sans légende */ }
      return { ...c, legende, duree: Math.round(c.fin - c.debut), fichier: `/clips/f/${encodeURIComponent(nom)}/${encodeURIComponent(c.clip)}`,
        publies: publies.filter((p) => p.campagne === nom && p.clip === c.clip) };
    }) });
  }
  campagnes.sort((a, b) => b.le - a.le);
  const demandes = await lire(`SELECT id, url, campagne, nombre, etat, message, cree_le FROM clips_demandes ORDER BY id DESC LIMIT 10`);
  return { campagnes, demandes };
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
  if (!plage) { res.writeHead(200, { ...entetes, 'Content-Length': taille }); fs.createReadStream(f).pipe(res); return; }
  const debut = plage[1] ? +plage[1] : 0, fin = plage[2] ? Math.min(+plage[2], taille - 1) : taille - 1;
  if (debut >= taille || debut > fin) { res.writeHead(416, { 'Content-Range': `bytes */${taille}` }); res.end(); return; }
  res.writeHead(206, { ...entetes, 'Content-Range': `bytes ${debut}-${fin}/${taille}`, 'Content-Length': fin - debut + 1 });
  fs.createReadStream(f, { start: debut, end: fin }).pipe(res);
}

async function router(req, res, { url, m, envoyer, json, fichierInterface }) {
  if (m === 'GET' && url === '/clips') { fichierInterface(res, 'clips.html'); return true; }
  let c;
  if (m === 'GET' && (c = url.match(/^\/clips\/f\/([\w-]{1,80})\/(clip-\d{2}\.mp4)$/))) { servirVideo(req, res, decodeURIComponent(c[1]), c[2]); return true; }
  if (m === 'GET' && url === '/api/clips') { envoyer(res, 200, await liste()); return true; }
  if (m === 'POST' && url === '/api/clips/demande') { envoyer(res, 200, await demander(await json(req))); return true; }
  if (m === 'POST' && url === '/api/clips/publie') { envoyer(res, 200, await noterPublication(await json(req))); return true; }
  if (m === 'POST' && url === '/api/clips/whop') { envoyer(res, 200, await declarerWhop(await json(req))); return true; }
  return false;
}

module.exports = { router, demander, liste, noterPublication, declarerWhop, nomCampagne, preparer, PLATEFORMES };
