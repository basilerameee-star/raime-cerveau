// LES VITRINES DANS LE COCKPIT — la maquette publique d'un commerçant (/demo/<slug>), sa fiche (quand Basile
// clique dessus dans l'interface), la liste par état, et les gestes de Basile (valider le brouillon, écarter,
// noter une vente). L'agent qui les fabrique et les met en file d'envoi : agents/vitrines.js. Rien n'est envoyé d'ici.
'use strict';

const fs = require('fs');
const path = require('path');
const { lire, lireN8n, lireCoffre } = require('./bases.cjs');
const { normaliser, lisible } = require('./telephone.cjs');
const { annuaires } = require('./sans_site.cjs');

// La maquette premium (point 16) : Hermes la livre dans son dossier de travail, lu ici en lecture seule.
const LIVRABLES = process.env.LIVRABLES_DIR || '/travail';
const fichierPremium = (n) => path.join(LIVRABLES, `demande-${Number(n)}`, 'app', 'index.html');
const COLONNES = 'ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS premium_commande int, ADD COLUMN IF NOT EXISTS premium_le timestamptz, ADD COLUMN IF NOT EXISTS demo_simple text';

// Le lien de paiement du site à 500 € (Stripe, créé par Basile le 01/10/2026), envoyé après l'appel.
const LIEN_PAIEMENT = process.env.VITRINE_PAIEMENT || 'https://buy.stripe.com/28EaEWgGB4E63527OOfw401';

const ACTIONS = { valider: 'valide', ecarter: 'ecarte', client: 'client', pas_interesse: 'pas_interesse' };

// ── LES PHOTOS D'EXEMPLE DES MAQUETTES (Pixabay, libres de droits, clé PIXABAY_API_KEY au coffre) ──
// Pixabay demande d'héberger soi-même ses images : à la première demande d'un métier, ses 9 photos (en-tête, trois
// rubriques, galerie) sont cherchées, téléchargées et gardées en base ; ensuite, servies d'ici à toutes les maquettes.
const PHOTOS = require('./vitrines_photos.json');
const enCours = new Map();
async function remplirPhotos(metier, { fetch = globalThis.fetch } = {}) {
  const cle = (lireCoffre() || {}).PIXABAY_API_KEY;
  const q = PHOTOS[metier];
  if (!cle || !q) return 0;
  await lire(`CREATE TABLE IF NOT EXISTS vitrines_images (metier text NOT NULL, n int NOT NULL, image bytea NOT NULL, type text NOT NULL,
    source text, pixabay_id int, cree_le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (metier, n))`);
  const chercher = async (recherche) => {
    const u = `https://pixabay.com/api/?key=${encodeURIComponent(cle)}&q=${encodeURIComponent(recherche)}&image_type=photo&orientation=horizontal&safesearch=true&order=popular&min_width=1600&per_page=30`;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    return r.ok ? ((await r.json()).hits || []) : [];
  };
  const pris = new Set(), plan = [];
  const garder = (hits, combien) => {
    for (const h of hits) { if (combien <= 0) break; if (!pris.has(h.id)) { pris.add(h.id); plan.push(h); combien--; } }
  };
  garder(await chercher(q.entete), 1);
  for (const r of q.rubriques) garder(await chercher(r), 1);
  garder(await chercher(q.galerie), 5);
  let n = 0;
  for (const h of plan.slice(0, 9)) {
    try {
      const r = await fetch(h.largeImageURL, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) continue;
      n++;
      await lire(`INSERT INTO vitrines_images (metier, n, image, type, source, pixabay_id) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (metier, n) DO UPDATE SET image = EXCLUDED.image, type = EXCLUDED.type, source = EXCLUDED.source, pixabay_id = EXCLUDED.pixabay_id`,
      [metier, n, Buffer.from(await r.arrayBuffer()), r.headers.get('content-type') || 'image/jpeg', h.pageURL, h.id]);
    } catch { /* la suivante */ }
  }
  return n;
}
async function servirImage(metier, n, res, o = {}) {
  const pasLa = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Image introuvable.'); };
  if (!PHOTOS[metier] || metier.startsWith('_') || !(n >= 1 && n <= 9)) return pasLa();
  const lireImage = () => lire('SELECT image, type FROM vitrines_images WHERE metier = $1 AND n = $2', [metier, n]);
  let r = await lireImage();
  if (!r[0]) {
    if (!enCours.has(metier)) enCours.set(metier, remplirPhotos(metier, o).finally(() => enCours.delete(metier)));
    await enCours.get(metier);
    r = await lireImage();
  }
  if (!r[0]) return pasLa();
  res.writeHead(200, { 'Content-Type': r[0].type, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
  res.end(r[0].image);
}

// ── LA CARTE DES MAQUETTES (tuiles OpenStreetMap) ──
// Le 01/10/2026, chez Basile, les tuiles chargées directement affichaient « 403 Access blocked » : une maquette isolée
// (sandbox, origine opaque) n'envoie pas de Referer, ce que la règle d'usage d'OpenStreetMap exige. Le Cockpit les
// demande donc lui-même, avec un User-Agent qui le nomme, et les garde 30 jours en base : chaque tuile n'est
// téléchargée qu'une fois pour toutes les maquettes d'un quartier.
const TUILE_UA = 'raime-cerveau/1.0 (+https://raime.fr; maquettes de sites vitrines)';
async function servirTuile(z, x, y, res, { fetch = globalThis.fetch } = {}) {
  const pasLa = () => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Tuile introuvable.'); };
  if (z !== 16 || !(x >= 0 && x < 2 ** z) || !(y >= 0 && y < 2 ** z)) return pasLa();
  await lire(`CREATE TABLE IF NOT EXISTS vitrines_tuiles (z int NOT NULL, x int NOT NULL, y int NOT NULL, image bytea NOT NULL,
    le timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (z, x, y))`);
  let r = await lire(`SELECT image FROM vitrines_tuiles WHERE z = $1 AND x = $2 AND y = $3 AND le > now() - interval '30 days'`, [z, x, y]);
  if (!r[0]) {
    try {
      const t = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
        { headers: { 'User-Agent': TUILE_UA, Referer: 'https://cockpit.raime.fr/' }, signal: AbortSignal.timeout(15000) });
      if (!t.ok || !/image\/png/.test(t.headers.get('content-type') || '')) return pasLa();
      const image = Buffer.from(await t.arrayBuffer());
      await lire(`INSERT INTO vitrines_tuiles (z, x, y, image) VALUES ($1, $2, $3, $4)
        ON CONFLICT (z, x, y) DO UPDATE SET image = EXCLUDED.image, le = now()`, [z, x, y, image]);
      r = [{ image }];
    } catch { return pasLa(); }
  }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
  res.end(r[0].image);
}

// La maquette, servie à tous (le chemin /demo/ est hors du mot de passe du Cockpit), isolée comme un livrable.
// La simple n'a aucun script. La premium peut animer (scripts en ligne), mais dans une origine opaque (sandbox sans
// allow-same-origin) et sans aucun accès au réseau : elle ne lit rien du Cockpit et ne charge rien dehors.
const IMAGES = "img-src data: https://cockpit.raime.fr";
const POLICES = "font-src https://cockpit.raime.fr";   // polices hébergées par le Cockpit (héros v3, 07/10/2026)
const CSP_SIMPLE = `sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; ${IMAGES}; ${POLICES}`;
const CSP_PREMIUM = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline'; "
  + `style-src 'unsafe-inline'; ${IMAGES}; font-src data: https://cockpit.raime.fr; media-src data:`;
// Le SITE COMPLET (validé par Basile le 15/10/2026 : « c'est exactement ça ») : pour un métier qui a son gabarit
// (jarvis/maquette_site.mjs), /demo/<slug> montre le site refait à la volée depuis la fiche, donc toujours à jour ;
// sinon la maquette enregistrée (demo_html). Une maquette premium garde la sienne. Le site anime ses apparitions : son
// script tourne dans une origine opaque (sandbox sans allow-same-origin), sans accès au réseau.
const CSP_SITE = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; script-src 'unsafe-inline'; "
  + `style-src 'unsafe-inline'; ${IMAGES}; ${POLICES}`;
let gabaritSite = null;
const chargerSite = () => gabaritSite || (gabaritSite = import(require('url').pathToFileURL(path.join(__dirname, 'maquette_site.mjs')).href));
async function siteComplet(v) {
  if (!v || v.premium_le) return null;
  const { maquetteSite } = await chargerSite();
  return maquetteSite(v, { site: 'https://cockpit.raime.fr' });
}
async function servirDemo(slug, res) {
  let r = [];
  if (/^[a-z0-9-]{3,60}$/.test(slug)) {
    r = await lire('SELECT * FROM vitrines v WHERE slug = $1 AND demo_html IS NOT NULL', [slug]).catch(() => []);
  }
  if (!r[0]) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Cette page n’existe pas ou plus.'); return; }
  const site = await siteComplet(r[0]).catch(() => null);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': site ? CSP_SITE : (r[0].premium_le ? CSP_PREMIUM : CSP_SIMPLE), 'X-Content-Type-Options': 'nosniff' });
  res.end(site || r[0].demo_html);
}

// Les photos du site complet : trois par métier (héros, métier, fin), choisies à la main sur Pixabay et rangées dans le
// dépôt (jarvis/interface/photos/<métier>/, provenance dans sources.json) ; servies d'ici comme les polices.
const DOSSIER_PHOTOS = path.join(__dirname, 'interface', 'photos');
function servirPhoto(dossier, nom, res) {
  const f = path.join(DOSSIER_PHOTOS, dossier, nom);
  if (!/^[a-z0-9-]+$/.test(dossier) || !/^[a-z0-9]+\.webp$/.test(nom) || !fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Image introuvable.'); return; }
  res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(f).pipe(res);
}

// L'E-MAIL APRÈS L'APPEL (Basile, 15/10/2026) : dans Jarvis, il voit l'e-mail et la maquette, corrige s'il veut, clique
// « Envoyer » ; l'e-mail part tout de suite (flux n8n « Vitrines · Envoi après l'appel », webhook interne), hors plafond
// et hors file : c'est le commerçant qui l'attend. Chaque envoi est gardé dans vitrines_apres_appel (base n8n).
const TABLE_APRES = `CREATE TABLE IF NOT EXISTS vitrines_apres_appel (id serial PRIMARY KEY, vitrine_id int NOT NULL, to_email text NOT NULL,
  sujet text NOT NULL, corps text NOT NULL, statut text NOT NULL DEFAULT 'a_envoyer', resend_id text, erreur text,
  cree_le timestamptz NOT NULL DEFAULT now(), envoye_le timestamptz)`;
const EMAIL_OK = /^[^\s@<>",;]+@[^\s@<>",;]+\.[a-z]{2,}$/i;
function emailApresAppel(v) {
  const lien = `https://cockpit.raime.fr/demo/${v.slug}`;
  const donnees = [v.adresse && 'votre adresse', v.horaires && 'vos horaires', v.telephone && 'votre numéro'].filter(Boolean);
  const avec = donnees.length ? `, avec ${donnees.length > 1 ? `${donnees.slice(0, -1).join(', ')} et ${donnees[donnees.length - 1]}` : donnees[0]}` : '';
  // 21/10/2026 (Basile) : jamais « suite à notre appel » ; on se présente, puis ce qu'on a vu
  return { a: v.email || '', lien, sujet: `${v.nom} : la maquette de votre site`,
    corps: `Bonjour,

Je suis Basile Ramé, de rAIme. J'ai vu que ${v.nom} n'a pas de site web : je vous en ai préparé un, le voici :
${lien}

`
      + `Elle est déjà prête${avec}. Il ne reste qu’à la mettre en ligne : sous 7 jours, pour 500 €, hébergement inclus.

`
      + `Si elle vous plaît, répondez simplement à ce message.

Bonne journée,
Basile Ramé
rAIme` };
}
async function apresAppel(id, d = {}, { fetch = globalThis.fetch, webhook = process.env.N8N_APRES_APPEL || 'http://n8n:5678/webhook/vitrine-apres-appel' } = {}) {
  const [v] = await lire('SELECT id, nom, slug, email, adresse, horaires, telephone FROM vitrines WHERE id = $1 AND slug IS NOT NULL', [Number(id)]);
  if (!v) return { ok: false, message: 'Commerce introuvable.' };
  const modele = emailApresAppel(v);
  if (d.etape !== 'envoyer') return { ok: true, ...modele };
  const a = String(d.a || '').trim(), sujet = String(d.sujet || '').trim().slice(0, 200), corps = String(d.corps || '').trim().slice(0, 6000);
  if (!EMAIL_OK.test(a)) return { ok: false, message: 'Adresse e-mail incomplète.' };
  if (!sujet || !corps) return { ok: false, message: 'Il manque l’objet ou le texte.' };
  if (!corps.includes(modele.lien)) return { ok: false, message: 'Le lien de la maquette a disparu du texte : remets-le avant d’envoyer.' };
  const r = await envoyerTout({ vitrineId: v.id, a, sujet, corps }, { fetch, webhook });
  if (r.ok && !v.email) await lire('UPDATE vitrines SET email = $2, email_source = $3 WHERE id = $1 AND email IS NULL', [v.id, a, 'appel']).catch(() => {});
  return r;
}

// L'envoi commun (maquette ou pré-audit) : la ligne en base, le webhook n8n, puis le statut relu en base.
async function envoyerTout({ vitrineId, a, sujet, corps }, { fetch, webhook }) {
  await lireN8n(TABLE_APRES);
  const [stop] = await lireN8n('SELECT 1 AS x FROM suppression WHERE lower(email) = lower($1) LIMIT 1', [a]);
  if (stop) return { ok: false, message: 'Cette adresse s’est désinscrite : rien n’est envoyé.' };
  const [deja] = await lireN8n(`SELECT to_char(envoye_le AT TIME ZONE 'Europe/Paris', 'HH24 "h" MI') AS h FROM vitrines_apres_appel
    WHERE lower(to_email) = lower($1) AND sujet = $2 AND statut = 'envoye' AND envoye_le > now() - interval '30 minutes' LIMIT 1`, [a, sujet]);
  if (deja) return { ok: false, statut: 'deja', message: `Déjà parti à ${a} à ${deja.h} : rien n’est renvoyé.` };
  const [l] = await lireN8n('INSERT INTO vitrines_apres_appel (vitrine_id, to_email, sujet, corps) VALUES ($1, $2, $3, $4) RETURNING id', [vitrineId, a, sujet, corps]);
  try {
    await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }), signal: AbortSignal.timeout(45000) });
  } catch (e) { /* le résultat se lit en base : un délai dépassé reste « inconnu », jamais « parti » */ }
  const [f] = await lireN8n('SELECT statut, erreur FROM vitrines_apres_appel WHERE id = $1', [l.id]);
  if (f && f.statut === 'envoye') return { ok: true, statut: 'envoye', message: `E-mail parti à ${a}.` };
  if (f && f.statut === 'erreur') return { ok: false, statut: 'erreur', message: `Resend a refusé l’e-mail : ${f.erreur || 'raison inconnue'}.` };
  return { ok: false, statut: 'inconnu', message: 'Pas de réponse de l’envoi : vérifie dans un instant avant de renvoyer.' };
}

// Les polices des maquettes (Inter, Instrument Serif : licences OFL dans jarvis/interface/polices/), servies d'ici pour
// qu'aucun visiteur d'une maquette ne soit envoyé chez Google. La page est « sandbox » (origine nulle) : CORS ouvert.
const DOSSIER_POLICES = path.join(__dirname, 'interface', 'polices');
function servirPolice(nom, res) {
  const f = path.join(DOSSIER_POLICES, nom);
  if (!/^[A-Za-z-]+\.woff2$/.test(nom) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=31536000, immutable',
    'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(f).pipe(res);
}

// L'APERÇU du héros v3 (07/10/2026) : la maquette d'un commerce refaite à la volée avec le nouveau gabarit, à l'adresse
// /demo/v3/<slug>, SANS toucher à la maquette en ligne (demo_html) que le commerçant a reçue. Basile valide, puis on bascule.
// 15/10/2026 : le héros v4 (quatre éléments, une photo choisie par métier) à /demo/v4/<slug>, de la même façon.
async function servirApercu(slug, res, version = 'v3') {
  const r = /^[a-z0-9-]{3,60}$/.test(slug) ? await lire('SELECT * FROM vitrines WHERE slug = $1 AND demo_html IS NOT NULL', [slug]).catch(() => []) : [];
  if (!r[0]) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Cette page n’existe pas ou plus.'); return; }
  const { maquettePremium, maquetteV4 } = await import(require('url').pathToFileURL(path.join(__dirname, 'maquette_premium.mjs')).href);
  const html = version === 'v4' ? maquetteV4(r[0], { site: 'https://cockpit.raime.fr' })
    : maquettePremium(r[0], { images: 'https://cockpit.raime.fr/demo/img', v3: true });
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': CSP_SIMPLE, 'X-Content-Type-Options': 'nosniff' });
  res.end(html);
}

// Les photos des héros v4 (15/10/2026) : une par métier, choisie à la main (sans marque ni écriture visible) et rangée
// dans le dépôt, provenance dans interface/heros/SOURCES.md ; servies d'ici comme les polices, sans base ni recherche.
const DOSSIER_HEROS = path.join(__dirname, 'interface', 'heros');
function servirHeros(nom, res) {
  const f = path.join(DOSSIER_HEROS, nom);
  if (!/^[a-z0-9-]+\.jpg$/.test(nom) || !fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Image introuvable.'); return; }
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(f).pipe(res);
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
    pays: v.pays || 'FR', region: v.departement || null,
    brouillon: v.sujet ? { sujet: v.sujet, corps: v.corps } : null, paiement: LIEN_PAIEMENT,
    // 08/10/2026 : les entreprises sans site viennent du registre public des entreprises (agents/sans_site.js)
    source: v.source === 'google' ? 'Google' : v.source === 'sirene' ? 'Registre des entreprises' : 'OpenStreetMap',
    telephone_source: v.telephone_source || null,
    // où Basile lit lui-même le numéro : la page trouvée sur le portail de la profession, l'annuaire officiel, Pages Jaunes
    annuaires: [...(v.site_etat === 'portail' && v.site ? [{ nom: 'Sa page sur le portail de la profession (trouvée par la recherche)', url: v.site }] : []), ...annuaires(v)],
    premium: v.premium_commande ? { commande: v.premium_commande, prete: fs.existsSync(fichierPremium(v.premium_commande)),
      apercu: `${adresse}/livrables/demande-${v.premium_commande}/app/index.html`, publiee_le: v.premium_le || null } : null,
  };
}

// Triées par région (département, ou GE pour le canton de Genève), puis par métier (Basile, 01/10/2026).
async function liste({ statut = null, region = null, metier = null, limite = 50 } = {}, adresse) {
  const rows = await lire(`SELECT * FROM vitrines WHERE nom IS NOT NULL AND ($1::text IS NULL OR statut = $1)
    AND ($3::text IS NULL OR departement = $3) AND ($4::text IS NULL OR metier = $4)
    ORDER BY array_position(ARRAY['74','GE','01','73','38']::text[], departement) NULLS LAST, departement NULLS LAST, metier, maj_le DESC LIMIT $2`,
  [statut, Math.min(200, Number(limite) || 50), region, metier]).catch(() => []);
  const compte = await lire('SELECT statut, count(*)::int AS n FROM vitrines GROUP BY statut').catch(() => []);
  return { compteurs: Object.fromEntries(compte.map((c) => [c.statut, c.n])), vitrines: rows.map((v) => fiche(v, adresse)) };
}

async function uneFiche(id, adresse) {
  const r = await lire('SELECT * FROM vitrines WHERE id = $1', [Number(id)]).catch(() => []);
  return r[0] ? fiche(r[0], adresse) : null;
}

// Les gestes de Basile. « valider » met le brouillon dans la file du workflow n8n « Vitrines · Envoi » (agents/vitrines.js,
// synchroniser) : rien ne part d'ici, et le réglage d'envoi (test ou live) reste dans la base n8n.
async function agir(id, { action, note = null, numero = null } = {}) {
  // La maquette premium remplace la simple sur la même adresse publique (le commerçant garde son lien) ; la simple est gardée.
  if (action === 'publier_premium' || action === 'retablir_simple') {
    await lire(COLONNES);
    const [v] = await lire('SELECT premium_commande, demo_simple FROM vitrines WHERE id = $1', [Number(id)]);
    if (!v) return { ok: false, erreur: 'commerce introuvable' };
    if (action === 'retablir_simple') {
      if (!v.demo_simple) return { ok: false, erreur: 'la maquette simple est déjà en ligne' };
      await lire('UPDATE vitrines SET demo_html = demo_simple, premium_le = NULL, maj_le = now() WHERE id = $1', [Number(id)]);
    } else {
      if (!v.premium_commande) return { ok: false, erreur: 'aucune maquette premium commandée' };
      let html;
      try {
        const f = fichierPremium(v.premium_commande);
        if (fs.statSync(f).size > 3e6) return { ok: false, erreur: 'maquette premium trop lourde (plus de 3 Mo)' };
        html = fs.readFileSync(f, 'utf8');
      } catch { return { ok: false, erreur: 'maquette premium pas encore prête' }; }
      await lire(`UPDATE vitrines SET demo_simple = coalesce(demo_simple, demo_html), demo_html = $2, premium_le = now(), maj_le = now()
        WHERE id = $1`, [Number(id), html]);
    }
    await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, NULL)`,
      [`Vitrine n°${id} : ${action === 'publier_premium' ? 'maquette premium publiée' : 'maquette simple rétablie'}`]);
    return { ok: true };
  }
  if (action === 'note') {
    await lire('UPDATE vitrines SET note = $2, maj_le = now() WHERE id = $1', [Number(id), note ? String(note).slice(0, 500) : null]);
    return { ok: true };
  }
  // 08/10/2026 : une fiche « à compléter » (entreprise sans site, sans numéro) reçoit le numéro que Basile a lu dans
  // l'annuaire de la profession ; elle passe dans les appels. Un numéro français seulement (10 chiffres, ni 08, ni gabarit).
  if (action === 'telephone') {
    const n = normaliser(numero);
    if (!n) return { ok: false, erreur: 'numéro français attendu : 10 chiffres (04 50 12 34 56), ni 08 ni numéro de démonstration' };
    await lire('ALTER TABLE vitrines ADD COLUMN IF NOT EXISTS telephone_source text');
    const [v] = await lire(`UPDATE vitrines SET telephone = $2, telephone_source = 'saisi par Basile', statut = 'a_appeler',
      motif = 'numéro lu par Basile dans un annuaire', maj_le = now() WHERE id = $1 AND statut = 'a_completer' RETURNING *`, [Number(id), lisible(n)]);
    if (!v) return { ok: false, erreur: 'seule une fiche « à compléter » reçoit un numéro' };
    // la maquette montre désormais le bouton d'appel (jamais une maquette premium publiée par Basile)
    if (v.demo_html && !v.premium_le) {
      try {
        const { maquettePremium } = await import(require('url').pathToFileURL(path.join(__dirname, 'maquette_premium.mjs')).href);
        await lire('UPDATE vitrines SET demo_html = $2 WHERE id = $1', [v.id, maquettePremium(v, { images: `${process.env.VITRINE_ADRESSE || 'https://cockpit.raime.fr'}/demo/img` })]);
      } catch { /* l'ancienne maquette reste : le numéro est enregistré */ }
    }
    await lire(`INSERT INTO journal(acteur, changement, motif) VALUES('basile', $1, $2)`, [`Vitrine n°${id} : numéro saisi, à appeler`, v.nom]);
    return { ok: true, telephone: v.telephone };
  }
  const etat = ACTIONS[action];
  if (!etat) return { ok: false, erreur: `action attendue : ${[...Object.keys(ACTIONS), 'note', 'telephone', 'publier_premium', 'retablir_simple'].join(', ')}` };
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
  const [v] = await lire("SELECT count(*)::int AS n FROM vitrines WHERE statut = 'brouillon'");
  return { mode: c.mode, plafond_jour: c.plafond_jour, a_valider: v ? v.n : 0,
    ...(n || { en_file: 0, envoyes_aujourdhui: 0, envoyes: 0, essais: 0, refuses: 0 }) };
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

// LE PRÉ-AUDIT APRÈS L'APPEL (15/10/2026) : même geste pour une entreprise (Intégration IA) : son pré-audit de secteur,
// avec l'e-mail « suite à notre conversation » ; vitrine_id = 0 dans vitrines_apres_appel.
function emailAudit(nom, lien, email) {
  return { a: email || '', lien, sujet: `${nom} : votre pré-audit`,
    corps: `Bonjour,

Je suis Basile Ramé, de rAIme. J'ai préparé le pré-audit de ${nom} :
${lien}

Il chiffre, sur une page, ce que l’IA peut faire pour votre métier : les heures libérées chaque mois, ce qu’elles valent, et les sources. Tout élément est modifiable et personnalisable à votre guise : l’audit de vos postes remplace ces estimations par vos chiffres réels.

Si vous souhaitez en parler, répondez simplement à ce message.

Bonne journée,
Basile Ramé
rAIme` };
}
async function auditApresAppel(siren, d = {}, { fetch = globalThis.fetch, webhook = process.env.N8N_APRES_APPEL || 'http://n8n:5678/webhook/vitrine-apres-appel' } = {}) {
  const [p] = await lireN8n('SELECT siren, name, sector, contact_email FROM prospects WHERE siren = $1', [String(siren)]);
  if (!p) return { ok: false, message: 'Entreprise introuvable.' };
  const lien = require('./preaudits.cjs').preaudit(p.sector);
  if (!lien) return { ok: false, message: 'Pas de pré-audit pour ce secteur.' };
  const modele = emailAudit(p.name, lien, p.contact_email);
  if (d.etape !== 'envoyer') return { ok: true, ...modele };
  const a = String(d.a || '').trim(), sujet = String(d.sujet || '').trim().slice(0, 200), corps = String(d.corps || '').trim().slice(0, 6000);
  if (!EMAIL_OK.test(a)) return { ok: false, message: 'Adresse e-mail incomplète.' };
  if (!sujet || !corps) return { ok: false, message: 'Il manque l’objet ou le texte.' };
  if (!corps.includes(lien)) return { ok: false, message: 'Le lien du pré-audit a disparu du texte : remets-le avant d’envoyer.' };
  return envoyerTout({ vitrineId: 0, a, sujet, corps }, { fetch, webhook });
}

module.exports = { LIEN_PAIEMENT, servirDemo, servirPhoto, apresAppel, emailApresAppel, auditApresAppel, servirApercu, servirPolice, servirHeros, servirImage, servirTuile, remplirPhotos, fiche, liste, uneFiche, agir, envoi, changerMode, phraseEnvoi, MODES };
